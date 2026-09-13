import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  query,
  type SDKSessionInfo,
  type SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Thin wrappers over the real Agent SDK -- confirmed against the actually
 * installed package's own sdk.d.ts (@anthropic-ai/claude-agent-sdk@0.3.270),
 * not assumed from docs. `listSessions`/`getSessionInfo`/`getSessionMessages`
 * and `query({ options: { resume } })` are the SDK's own documented,
 * supported surface for exactly this: no JSONL parsing here except as a
 * last-resort fallback nowhere in this file (deliberately -- the SDK says
 * its own JSONL format is not a stable API).
 */

export interface DiscoveredSession {
  providerSessionId: string;
  summary: string;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  tag?: string;
  createdAt?: number;
  lastModified: number;
}

function toDiscoveredSession(info: SDKSessionInfo): DiscoveredSession {
  return {
    providerSessionId: info.sessionId,
    summary: info.summary,
    customTitle: info.customTitle,
    firstPrompt: info.firstPrompt,
    gitBranch: info.gitBranch,
    cwd: info.cwd,
    tag: info.tag,
    createdAt: info.createdAt,
    lastModified: info.lastModified,
  };
}

/**
 * Every session across every project directory -- Worldview's whole point
 * is "what exists on this machine," not just the bridge's own cwd.
 * `includeProgrammatic: false` matches terminal `/resume`'s own picker
 * (per the SDK's doc comment on this option) -- an interactive-session
 * list, not every SDK-driven background job too.
 */
export async function discoverSessions(): Promise<DiscoveredSession[]> {
  const sessions = await listSessions({ includeProgrammatic: false, includeWorktrees: true });
  return sessions.map(toDiscoveredSession).sort((a, b) => b.lastModified - a.lastModified);
}

export async function getSession(providerSessionId: string): Promise<DiscoveredSession | undefined> {
  const info = await getSessionInfo(providerSessionId);
  return info ? toDiscoveredSession(info) : undefined;
}

export type NormalizedRole = "user" | "assistant";

export interface NormalizedTextPart {
  type: "text";
  text: string;
}
export interface NormalizedToolCallPart {
  type: "tool_call";
  toolUseId: string;
  name: string;
  input: unknown;
}
export interface NormalizedToolResultPart {
  type: "tool_result";
  toolUseId: string;
  /** Best-effort text extraction; non-text results (e.g. images) are
   *  summarized rather than included raw. */
  text: string;
  isError?: boolean;
}
export type NormalizedPart = NormalizedTextPart | NormalizedToolCallPart | NormalizedToolResultPart;

export interface NormalizedMessage {
  uuid: string;
  role: NormalizedRole;
  parts: NormalizedPart[];
}

/**
 * Anthropic Messages-API content blocks, read defensively (SessionMessage's
 * own `message` field is typed `unknown` by the SDK -- there is no exported
 * type for the inner shape to import instead). `thinking` /
 * `redacted_thinking` blocks are dropped deliberately and always -- never
 * expose a session's private reasoning, regardless of what else changes here.
 */
function normalizeContentBlock(block: unknown): NormalizedPart | undefined {
  if (!block || typeof block !== "object") return undefined;
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case "text":
      return typeof b.text === "string" ? { type: "text", text: b.text } : undefined;
    case "tool_use":
      return typeof b.id === "string" && typeof b.name === "string"
        ? { type: "tool_call", toolUseId: b.id, name: b.name, input: b.input }
        : undefined;
    case "tool_result": {
      const raw = b.content;
      let text = "";
      if (typeof raw === "string") {
        text = raw;
      } else if (Array.isArray(raw)) {
        text = raw
          .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "[non-text content]"))
          .join("\n");
      }
      return typeof b.tool_use_id === "string" ? { type: "tool_result", toolUseId: b.tool_use_id, text, isError: b.is_error === true } : undefined;
    }
    case "thinking":
    case "redacted_thinking":
      return undefined;
    default:
      return undefined;
  }
}

function normalizeMessage(raw: SessionMessage): NormalizedMessage | undefined {
  if (raw.type !== "user" && raw.type !== "assistant") return undefined;
  const message = raw.message as { role?: string; content?: unknown } | undefined;
  if (!message) return undefined;

  const parts: NormalizedPart[] = [];
  if (typeof message.content === "string") {
    if (message.content.trim()) parts.push({ type: "text", text: message.content });
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      const part = normalizeContentBlock(block);
      if (part) parts.push(part);
    }
  }
  if (parts.length === 0) return undefined;

  return { uuid: raw.uuid, role: raw.type, parts };
}

export async function getHistory(
  providerSessionId: string,
  options: { dir?: string; limit?: number; offset?: number } = {},
): Promise<NormalizedMessage[]> {
  const messages = await getSessionMessages(providerSessionId, {
    dir: options.dir,
    limit: options.limit,
    offset: options.offset,
    includeSystemMessages: false,
  });
  const normalized: NormalizedMessage[] = [];
  for (const message of messages) {
    const n = normalizeMessage(message);
    if (n) normalized.push(n);
  }
  return normalized;
}

export { query };
