"use client";

/**
 * The full conversation for one linked local session -- what the "Open"
 * panel (project-panel.tsx) stacks above the project panel. Extracted out
 * of the old always-open LocalBridgePanel session list (docs/BRIDGE.md):
 * same history-fetch + SSE-streaming send-prompt logic, just parameterized
 * on a providerSessionId instead of a locally-held DiscoveredSession, since
 * this now opens from a linked-session row rather than a live discovery list.
 */

import { useEffect, useRef, useState } from "react";

import type { HistoryMessage } from "@/lib/hooks/use-local-bridge";
import { useLocalBridge } from "@/lib/hooks/use-local-bridge";
import type { NormalizedPart } from "./local-bridge-types";

export function SessionConversation({ providerSessionId, title }: { providerSessionId: string; title: string }) {
  const { getMessages, sendMessage } = useLocalBridge();
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
    getMessages(providerSessionId, 50).then((data) => {
      if (!cancelled) {
        setMessages(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [providerSessionId, getMessages]);

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
      const res = await sendMessage(providerSessionId, text);
      // A Response body is never null regardless of status, so the ok check
      // has to come before treating this as an SSE stream, not be inferred
      // from body presence -- the bridge returns plain JSON for anything
      // that fails before the resume actually starts.
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
    <div className="flex h-full flex-col gap-3">
      <p className="truncate text-sm font-semibold">{title}</p>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
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
        {message.role === "user" ? "You" : "Agent"}
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
