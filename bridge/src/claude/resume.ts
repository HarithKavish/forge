import { query } from "@anthropic-ai/claude-agent-sdk";

import { clearBridgeControl, isControlledByBridge, recordBridgeControl } from "../liveState.js";
import type { NormalizedPart } from "./sdk.js";

/**
 * Continuing an existing session for real: `query({ options: { resume } })`
 * loads that session's own history and appends to its own transcript file
 * -- confirmed against the installed SDK's own sdk.d.ts, not assumed. This
 * is the only thing in this whole feature that *cannot* be done any other
 * way (docs/BRIDGE.md Part 2): there is no remote-resume API, so this must
 * run on the same machine that already has the session's transcript, which
 * is exactly where the bridge lives.
 *
 * One concurrency lock per session, enforced here: a session already under
 * this bridge's control refuses a second concurrent `resume` rather than
 * racing two writers into one transcript file. It does NOT know about (and
 * cannot detect) a *different* process -- a terminal someone has that
 * session open in -- racing it from outside the bridge entirely; the SDK
 * gives no "is another writer attached" signal (confirmed in the research
 * pass), so that case fails at the CLI/session-file level, not here.
 */
export class SessionAlreadyControlledError extends Error {
  constructor(providerSessionId: string) {
    super(`Session ${providerSessionId} is already being driven by this bridge.`);
    this.name = "SessionAlreadyControlledError";
  }
}

export type ResumeStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolUseId: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; text: string; isError?: boolean }
  | { type: "state"; state: "working" | "waiting_for_input" }
  | { type: "done"; ok: boolean; error?: string };

function partsFromContent(content: unknown): NormalizedPart[] {
  if (!Array.isArray(content)) return [];
  const parts: NormalizedPart[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push({ type: "text", text: b.text });
    } else if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
      parts.push({ type: "tool_call", toolUseId: b.id, name: b.name, input: b.input });
    } else if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
      const raw = b.content;
      const text = typeof raw === "string" ? raw : Array.isArray(raw) ? "[tool result]" : "";
      parts.push({ type: "tool_result", toolUseId: b.tool_use_id, text, isError: b.is_error === true });
    }
    // thinking/redacted_thinking deliberately dropped, same as history.ts
  }
  return parts;
}

/**
 * Streams normalized events for one resumed turn. The caller (the HTTP/SSE
 * route) is responsible for relaying these to the browser; this function
 * only ever emits category-level, already-normalized data -- callers never
 * see a raw SDKMessage.
 */
export async function* resumeAndStream(input: {
  providerSessionId: string;
  cwd?: string;
  prompt: string;
}): AsyncGenerator<ResumeStreamEvent> {
  if (isControlledByBridge(input.providerSessionId)) {
    throw new SessionAlreadyControlledError(input.providerSessionId);
  }

  recordBridgeControl(input.providerSessionId, "working", "Sending your prompt");
  try {
    const stream = query({
      prompt: input.prompt,
      options: { resume: input.providerSessionId, cwd: input.cwd },
    });

    for await (const message of stream) {
      switch (message.type) {
        case "assistant": {
          const parts = partsFromContent((message.message as { content?: unknown }).content);
          for (const part of parts) {
            if (part.type === "text") {
              recordBridgeControl(input.providerSessionId, "working", "Replying");
              yield { type: "text", text: part.text };
            } else if (part.type === "tool_call") {
              recordBridgeControl(input.providerSessionId, "working", `Running ${part.name}`);
              yield part;
            } else if (part.type === "tool_result") {
              yield part;
            }
          }
          break;
        }
        case "system": {
          // SDKSessionStateChangedMessage is one of several `type: "system"`
          // variants (subtype-discriminated) -- 'idle' is the authoritative
          // turn-over signal per the SDK's own doc comment on that type.
          if (message.subtype === "session_state_changed") {
            if (message.state === "idle") {
              recordBridgeControl(input.providerSessionId, "waiting_for_input", "Waiting for input");
              yield { type: "state", state: "waiting_for_input" };
            } else if (message.state === "running") {
              recordBridgeControl(input.providerSessionId, "working", "Working");
              yield { type: "state", state: "working" };
            }
          }
          break;
        }
        case "result": {
          const ok = message.subtype === "success";
          yield { type: "done", ok, error: ok ? undefined : message.subtype };
          break;
        }
        default:
          // Every other SDKMessage variant (status, hook echoes, hook
          // progress, hook responses, etc.) is deliberately not surfaced --
          // this stream is "what did Claude say and do," not a debug feed.
          break;
      }
    }
  } catch (error) {
    yield { type: "done", ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearBridgeControl(input.providerSessionId);
  }
}
