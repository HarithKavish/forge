"use client";

/**
 * The primary local Claude Code workflow (docs/BRIDGE.md): no per-session
 * pairing, no hand-edited settings.json. The browser talks directly to a
 * bridge running on http://127.0.0.1 -- never through Forge's own server --
 * for anything content-bearing (session list, history, live streaming, a
 * resumed prompt). Forge's server is only ever asked for one thing here:
 * minting the one pairing token that links the bridge to this workspace,
 * which is exactly what the old per-session pairing flow already did, just
 * once now instead of once per session.
 *
 * Linking flow: the bridge prints a one-time URL
 * (https://forge.../worldview?connectBridge=1&bridgeToken=...&bridgePort=...)
 * when it starts. Opening it lets this component capture the bridge's
 * local credential, store it (localStorage, this origin only), mint a
 * pairing token server-side, and hand that token to the bridge directly --
 * fully automatic from there.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { mintBridgePairingTokenAction } from "@/lib/data/actions";
import type { NormalizedPart } from "./local-bridge-types";

const STORAGE_KEY = "forge.localBridge";

interface BridgeLink {
  bridgeToken: string;
  bridgePort: number;
}

interface BridgeStatus {
  connected: true;
  linked: boolean;
  linkedWorkspaceId?: string;
}

interface DiscoveredSession {
  providerSessionId: string;
  summary: string;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  lastModified: number;
  status: {
    source: "bridge" | "hook" | "none";
    live: boolean;
    state?: string;
    activity?: string;
    controlledByBridge: boolean;
  };
}

interface HistoryMessage {
  uuid: string;
  role: "user" | "assistant";
  parts: NormalizedPart[];
}

function loadLink(): BridgeLink | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BridgeLink) : null;
  } catch {
    return null;
  }
}

function saveLink(link: BridgeLink): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {
    // Private browsing / storage disabled -- the panel just re-prompts to link next time.
  }
}

function bridgeUrl(link: BridgeLink, path: string): string {
  return `http://127.0.0.1:${link.bridgePort}${path}`;
}

async function bridgeFetch(link: BridgeLink, path: string, init?: RequestInit): Promise<Response> {
  return fetch(bridgeUrl(link, path), {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${link.bridgeToken}` },
  });
}

type PanelState =
  | { phase: "checking" }
  | { phase: "not_connected" }
  | { phase: "connected_unlinked" }
  | { phase: "connected_linked"; sessions: DiscoveredSession[] };

export function LocalBridgePanel() {
  const [link, setLink] = useState<BridgeLink | null>(null);
  const [state, setState] = useState<PanelState>({ phase: "checking" });
  const [linking, setLinking] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const refreshStatus = useCallback(async (activeLink: BridgeLink) => {
    try {
      const res = await bridgeFetch(activeLink, "/status");
      if (!res.ok) throw new Error("unauthorized");
      const status = (await res.json()) as BridgeStatus;
      if (!status.linked) {
        setState({ phase: "connected_unlinked" });
        return;
      }
      const sessionsRes = await bridgeFetch(activeLink, "/sessions");
      const sessions = sessionsRes.ok ? ((await sessionsRes.json()) as DiscoveredSession[]) : [];
      setState({ phase: "connected_linked", sessions });
    } catch {
      setState({ phase: "not_connected" });
    }
  }, []);

  // One-time connect link capture.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("connectBridge") !== "1") return;
    const bridgeToken = url.searchParams.get("bridgeToken");
    const bridgePort = Number(url.searchParams.get("bridgePort"));
    if (bridgeToken && bridgePort) {
      const captured: BridgeLink = { bridgeToken, bridgePort };
      saveLink(captured);
      setLink(captured);
    }
    url.searchParams.delete("connectBridge");
    url.searchParams.delete("bridgeToken");
    url.searchParams.delete("bridgePort");
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    if (!link) {
      const existing = loadLink();
      if (existing) setLink(existing);
      else setState({ phase: "not_connected" });
      return;
    }
    void refreshStatus(link);
  }, [link, refreshStatus]);

  // Real-time status via the bridge's own /live WebSocket -- immediate
  // updates rather than waiting out a poll interval.
  useEffect(() => {
    if (!link || state.phase !== "connected_linked") return;
    const ws = new WebSocket(`ws://127.0.0.1:${link.bridgePort}/live?token=${link.bridgeToken}`);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; providerSessionId?: string; status?: DiscoveredSession["status"] };
      if (message.type !== "status" || !message.providerSessionId || !message.status) return;
      const providerSessionId = message.providerSessionId;
      const status = message.status;
      setState((prev) =>
        prev.phase === "connected_linked"
          ? {
              ...prev,
              sessions: prev.sessions.map((s) => (s.providerSessionId === providerSessionId ? { ...s, status } : s)),
            }
          : prev,
      );
    };
    return () => ws.close();
  }, [link, state.phase]);

  // Occasional resync, independent of the WebSocket -- catches a session
  // that started/finished (a genuinely new/removed list entry, which the
  // live feed's per-session status pushes can't surface) or a WS that
  // silently dropped.
  useEffect(() => {
    if (!link || state.phase !== "connected_linked") return;
    const interval = setInterval(() => void refreshStatus(link), 30000);
    return () => clearInterval(interval);
  }, [link, state.phase, refreshStatus]);

  async function handleLink() {
    if (!link) return;
    setLinking(true);
    try {
      const result = await mintBridgePairingTokenAction();
      if ("error" in result) throw new Error(result.error);
      const res = await bridgeFetch(link, "/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingToken: result.token }),
      });
      if (!res.ok) throw new Error("The bridge rejected the pairing token.");
      await refreshStatus(link);
    } catch (error) {
      console.error("Failed to link local bridge:", error);
    } finally {
      setLinking(false);
    }
  }

  if (state.phase === "checking") {
    return <p className="text-sm text-muted">Looking for a local bridge…</p>;
  }

  if (state.phase === "not_connected") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          No local bridge detected. In your Forge checkout, run:
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.82rem]">
          cd bridge{"\n"}npm install{"\n"}npm run install-hooks{"\n"}npm run bridge
        </pre>
        <p className="text-sm text-muted">
          Then open the link it prints in this terminal — it connects automatically.
        </p>
      </div>
    );
  }

  if (state.phase === "connected_unlinked") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Bridge detected on this machine, not yet linked to a workspace.</p>
        <button type="button" className="btn btn--primary self-start" onClick={handleLink} disabled={linking}>
          {linking ? "Linking…" : "Link this bridge"}
        </button>
      </div>
    );
  }

  const openSession = state.sessions.find((s) => s.providerSessionId === openSessionId);

  return (
    <div className="flex flex-col gap-3">
      {state.sessions.length === 0 ? (
        <p className="text-sm text-muted">No Claude Code sessions found on this machine yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.sessions.map((session) => (
            <li key={session.providerSessionId}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-inner)] border border-border px-3 py-2 text-left hover:bg-surface-soft"
                onClick={() => setOpenSessionId(session.providerSessionId)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {session.customTitle || session.summary || "Untitled session"}
                  </span>
                  <StatusDot status={session.status} />
                </span>
                <span className="truncate text-[0.78rem] text-muted">{session.cwd ?? "Unknown directory"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {link && openSession ? (
        <ConversationView link={link} session={openSession} onClose={() => setOpenSessionId(null)} />
      ) : null}
    </div>
  );
}

function StatusDot({ status }: { status: DiscoveredSession["status"] }) {
  let label: string;
  let color: string;
  if (status.controlledByBridge) {
    label = status.activity ?? "Working";
    color = "#5ad8ff";
  } else if (status.live) {
    label = status.activity ?? "Online";
    color = "#3fbf6f";
  } else if (status.source === "hook") {
    label = "Docked";
    color = "#8fb9c9";
  } else {
    label = "No live signal";
    color = "#6f8590";
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[0.72rem] text-muted" title={label}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ConversationView({
  link,
  session,
  onClose,
}: {
  link: BridgeLink;
  session: DiscoveredSession;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [streamParts, setStreamParts] = useState<NormalizedPart[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bridgeFetch(link, `/sessions/${encodeURIComponent(session.providerSessionId)}/messages?limit=50`)
      .then((res) => (res.ok ? (res.json() as Promise<HistoryMessage[]>) : []))
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [link, session.providerSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamParts]);

  async function handleSend() {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    setStreamParts([]);
    setMessages((prev) => [...prev, { uuid: `local-${Date.now()}`, role: "user", parts: [{ type: "text", text }] }]);
    setPrompt("");

    try {
      const res = await bridgeFetch(link, `/sessions/${encodeURIComponent(session.providerSessionId)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      // The bridge returns a plain JSON error body (never text/event-stream)
      // for anything that fails before the resume actually starts (session
      // gone, bad request) -- a Response always has a non-null body
      // regardless of status, so this check has to come before treating it
      // as an SSE stream, not be inferred from body presence.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Bridge returned ${res.status}`);
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const collected: NormalizedPart[] = [];
      let doneError: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice("data: ".length)) as {
            type: string;
            text?: string;
            toolUseId?: string;
            name?: string;
            isError?: boolean;
            ok?: boolean;
            error?: string;
          };
          if (event.type === "text" && event.text) {
            const last = collected[collected.length - 1];
            if (last?.type === "text") last.text += event.text;
            else collected.push({ type: "text", text: event.text });
            setStreamParts([...collected]);
          } else if (event.type === "tool_call" && event.toolUseId && event.name) {
            collected.push({ type: "tool_call", toolUseId: event.toolUseId, name: event.name, input: undefined });
            setStreamParts([...collected]);
          } else if (event.type === "tool_result" && event.toolUseId) {
            collected.push({ type: "tool_result", toolUseId: event.toolUseId, text: event.text ?? "", isError: event.isError });
            setStreamParts([...collected]);
          } else if (event.type === "done" && !event.ok) {
            doneError = event.error || "The session could not continue.";
          }
        }
      }

      if (collected.length > 0) {
        setMessages((prev) => [...prev, { uuid: `local-reply-${Date.now()}`, role: "assistant", parts: collected }]);
      }
      setStreamParts([]);
      if (doneError) setSendError(doneError);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to continue this session.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-inner)] border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{session.customTitle || session.summary}</p>
        <button type="button" className="text-[0.78rem] text-muted hover:text-text" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-muted">Loading history…</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.uuid} message={message} />)
        )}
        {streamParts.length > 0 ? (
          <MessageBubble message={{ uuid: "streaming", role: "assistant", parts: streamParts }} />
        ) : null}
        <div ref={bottomRef} />
      </div>

      {sendError ? <p className="text-[0.78rem] text-error">{sendError}</p> : null}

      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="Continue this session…"
          value={prompt}
          disabled={sending}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button type="button" className="btn btn--primary" onClick={handleSend} disabled={sending || !prompt.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: HistoryMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-faint">
        {message.role === "user" ? "You" : "Claude"}
      </p>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <p key={i} className="whitespace-pre-wrap text-sm">
              {part.text}
            </p>
          );
        }
        if (part.type === "tool_call") {
          return (
            <p key={i} className="text-[0.78rem] text-muted">
              Ran <span className="font-medium">{part.name}</span>
            </p>
          );
        }
        if (part.type === "tool_result") {
          return (
            <p key={i} className={`text-[0.78rem] ${part.isError ? "text-error" : "text-muted"}`}>
              {part.isError ? "Tool error: " : "Result: "}
              {part.text.slice(0, 200)}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
