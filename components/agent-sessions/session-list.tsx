"use client";

/**
 * The Worldview canvas: registered sessions grouped by project ("islands"),
 * shown as avatar tokens with live presence layered on top.
 *
 * Connects directly to forge-gateway's WebSocket endpoint (not through
 * Forge's own server -- see docs/WORLDVIEW.md §5.4), using a short-lived
 * viewer token fetched from /api/worldview/viewer-token. A session shows
 * "docked" (offline look, no pulse) until the gateway actually reports it
 * online, which may be never (a manually registered session, or one whose
 * agent hasn't connected yet) -- that's the honest state, not a loading
 * placeholder.
 */

import { useEffect, useRef, useState } from "react";

import { revokeAgentSessionAction } from "@/lib/data/actions";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import { personColorStyle } from "@/lib/color";
import type { DisplaySession, SelectableProject } from "@/lib/data/types";
import { EmptyState, SectionCard } from "@/components/ui/page";
import { ProviderIcon } from "@/components/agent-sessions/provider-icon";

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
  viewerId,
  viewerWorkspaceId,
}: {
  sessions: DisplaySession[];
  projects: SelectableProject[];
  gatewayUrl?: string;
  /**
   * Who can revoke what (docs/WORLDVIEW.md §13a): a session's own owner, or
   * whoever owns the workspace it's registered in. Sessions on this page no
   * longer all belong to the viewer once shared projects are mixed in, so
   * the Revoke control can't just always be shown -- offering it for a
   * session neither check passes would silently no-op
   * (revokeAgentSession's UPDATE matches zero rows) while the page still
   * redirects as if it worked.
   */
  viewerId: string;
  viewerWorkspaceId: string;
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

  if (sessions.length === 0) {
    return (
      <SectionCard title="The board is empty">
        <EmptyState
          title="No sessions registered yet"
          description="Connect a real agent or register one by hand below to see it here."
        />
      </SectionCard>
    );
  }

  const groups = groupByProject(sessions, projects);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <SectionCard key={group.projectId ?? "unassigned"} title={group.projectName}>
          <div className="flex flex-wrap gap-x-5 gap-y-4">
            {group.sessions.map((session) => (
              <AvatarToken
                key={session.id}
                session={session}
                live={presence.get(session.sessionRef)}
                canRevoke={session.ownerId === viewerId || session.workspaceId === viewerWorkspaceId}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function groupByProject(
  sessions: DisplaySession[],
  projects: SelectableProject[],
): { projectId?: string; projectName: string; sessions: DisplaySession[] }[] {
  const byId = new Map<string, DisplaySession[]>();
  const unassigned: DisplaySession[] = [];

  for (const session of sessions) {
    if (!session.projectId) {
      unassigned.push(session);
      continue;
    }
    const bucket = byId.get(session.projectId) ?? [];
    bucket.push(session);
    byId.set(session.projectId, bucket);
  }

  const groups: { projectId?: string; projectName: string; sessions: DisplaySession[] }[] = [
    ...byId.entries(),
  ].map(([projectId, group]) => ({
    projectId,
    projectName: projects.find((p) => p.id === projectId)?.name ?? "Unknown project",
    sessions: group,
  }));

  if (unassigned.length > 0) {
    groups.push({ projectId: undefined, projectName: "No project", sessions: unassigned });
  }

  return groups;
}

function AvatarToken({
  session,
  live,
  canRevoke,
}: {
  session: DisplaySession;
  live?: PresenceEntry;
  canRevoke: boolean;
}) {
  const online = live?.state === "online";
  const docked = live?.state === "offline";
  const displayName = session.label || agentProviderLabel(session.provider);
  const initial = displayName.slice(0, 1).toUpperCase();

  let statusText: string;
  let caption: string;
  if (online) {
    statusText = live?.activity ?? "Online";
    caption = "Online";
  } else if (docked) {
    statusText = "Docked -- offline";
    caption = "Docked";
  } else {
    statusText = "Registered -- never connected";
    caption = relativeTime(session.createdAt);
  }

  return (
    <div className="flex w-20 flex-col items-center gap-1.5 text-center">
      <div
        className={`worldview-avatar person-color-bg ${online ? "worldview-avatar--online" : "worldview-avatar--offline"}`}
        style={personColorStyle(session.color)}
        title={`${displayName} · ${statusText}`}
      >
        {initial}
        <span className="worldview-avatar-badge" aria-hidden="true">
          <ProviderIcon provider={session.provider} size={13} />
        </span>
      </div>
      <p className="w-full truncate text-[0.78rem] font-medium">{displayName}</p>
      <p className="w-full truncate text-[0.7rem] text-muted">{caption}</p>
      {canRevoke ? (
        <form action={revokeAgentSessionAction}>
          <input type="hidden" name="sessionId" value={session.id} />
          <button type="submit" className="text-[0.7rem] text-faint hover:text-error hover:underline">
            Revoke
          </button>
        </form>
      ) : null}
    </div>
  );
}
