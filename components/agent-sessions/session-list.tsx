"use client";

/**
 * The registered-sessions list, with live presence layered on top.
 *
 * Connects directly to forge-gateway's WebSocket endpoint (not through
 * Forge's own server -- see docs/WORLDVIEW.md §5.4), using a short-lived
 * viewer token fetched from /api/worldview/viewer-token. A session shows
 * "Registered" until the gateway actually reports presence for it, which
 * may be never (a manually registered session, or one whose agent hasn't
 * connected yet) -- that's the honest state, not a loading placeholder.
 */

import { useEffect, useRef, useState } from "react";

import { revokeAgentSessionAction } from "@/lib/data/actions";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import type { AgentSession, Project } from "@/lib/data/types";
import { EmptyState } from "@/components/ui/page";

type PresenceState = "online" | "offline";
interface PresenceEntry {
  sessionRef: string;
  state: PresenceState;
  activity?: string;
  lastEventAt: number;
}

const RECONNECT_DELAY_MS = 4_000;
/** Reconnect before the 10-minute viewer token actually expires. */
const PROACTIVE_RECONNECT_MS = 8 * 60 * 1000;

function wsUrl(gatewayUrl: string, token: string): string {
  const url = new URL("/ws", gatewayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

export function SessionList({
  sessions,
  projects,
  gatewayUrl,
}: {
  sessions: AgentSession[];
  projects: Project[];
  gatewayUrl?: string;
}) {
  const [presence, setPresence] = useState<Map<string, PresenceEntry>>(new Map());
  const stopped = useRef(false);

  useEffect(() => {
    if (!gatewayUrl) return;
    stopped.current = false;

    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let proactiveTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (stopped.current) return;

      // A previous connection's proactive-refresh timer would otherwise
      // outlive it and later close whatever socket happens to be current --
      // clear it before this attempt schedules its own.
      clearTimeout(proactiveTimer);

      let token: string;
      try {
        const response = await fetch("/api/worldview/viewer-token");
        if (!response.ok) throw new Error("viewer token request failed");
        ({ token } = await response.json());
      } catch {
        scheduleReconnect();
        return;
      }
      if (stopped.current) return;

      socket = new WebSocket(wsUrl(gatewayUrl!, token));

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "snapshot") {
          setPresence(new Map(message.sessions.map((s: PresenceEntry) => [s.sessionRef, s])));
        } else if (message.type === "update") {
          setPresence((prev) => new Map(prev).set(message.session.sessionRef, message.session));
        }
      });

      socket.addEventListener("close", () => {
        if (!stopped.current) scheduleReconnect();
      });

      proactiveTimer = setTimeout(() => socket?.close(), PROACTIVE_RECONNECT_MS);
    }

    function scheduleReconnect() {
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      stopped.current = true;
      clearTimeout(reconnectTimer);
      clearTimeout(proactiveTimer);
      socket?.close();
    };
  }, [gatewayUrl]);

  const projectName = (projectId?: string) => projects.find((p) => p.id === projectId)?.name;

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions registered yet"
        description="Register one above to see it here."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {sessions.map((agentSession) => {
        const live = presence.get(agentSession.sessionRef);

        return (
          <li
            key={agentSession.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {agentSession.label || agentProviderLabel(agentSession.provider)}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {agentProviderLabel(agentSession.provider)}
                {" · "}
                {projectName(agentSession.projectId) ?? "No project"}
                {" · "}
                Registered {relativeTime(agentSession.createdAt)}
                {live?.activity ? ` · ${live.activity}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  live?.state === "online"
                    ? "pill pill--healthy"
                    : live?.state === "offline"
                      ? "pill pill--unknown"
                      : "pill pill--neutral"
                }
              >
                {live?.state === "online" ? "Online" : live?.state === "offline" ? "Offline" : "Registered"}
              </span>
              <form action={revokeAgentSessionAction}>
                <input type="hidden" name="sessionId" value={agentSession.id} />
                <button type="submit" className="btn btn--sm btn--ghost">
                  Revoke
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
