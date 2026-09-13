"use client";

/**
 * Worldview itself: not a page of sections, but a canvas of "islands" -- one
 * per project, holding that project's agent-session avatar tokens, plus one
 * permanent empty island with a "+" for connecting a new project/agent.
 * Everything else (pairing a real agent, registering one by hand) lives
 * behind that "+", in a modal, rather than always on screen.
 *
 * Owns the same forge-gateway WebSocket connection session-list.tsx used to
 * own -- moved here since this is now the thing rendering presence.
 */

import { useEffect, useRef, useState } from "react";

import { revokeAgentSessionAction } from "@/lib/data/actions";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import { personColorStyle } from "@/lib/color";
import type { DisplaySession, SelectableProject } from "@/lib/data/types";
import { PlusIcon, CloseIcon } from "@/components/ui/icons";
import { ProviderIcon } from "@/components/agent-sessions/provider-icon";
import { PairSessionForm } from "@/components/agent-sessions/pair-session-form";
import { RegisterSessionForm } from "@/components/agent-sessions/register-session-form";

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

export function WorldCanvas({
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
   * whoever owns the workspace it's registered in.
   */
  viewerId: string;
  viewerWorkspaceId: string;
}) {
  const [presence, setPresence] = useState<Map<string, PresenceEntry>>(new Map());
  const [addOpen, setAddOpen] = useState(false);
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
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
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

  const groups = groupByProject(sessions, projects);

  return (
    <div className="world-canvas">
      <div className="world-islands">
        {groups.map((group) => (
          <Island key={group.projectId ?? "unassigned"} name={group.projectName}>
            {group.sessions.map((session) => (
              <AvatarToken
                key={session.id}
                session={session}
                live={presence.get(session.sessionRef)}
                canRevoke={session.ownerId === viewerId || session.workspaceId === viewerWorkspaceId}
              />
            ))}
          </Island>
        ))}

        <button
          type="button"
          className="world-island world-island--empty"
          onClick={() => setAddOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="world-island-plus">
            <PlusIcon size={22} />
          </span>
          <span className="world-island-add-label">Add a project</span>
        </button>
      </div>

      {addOpen ? (
        <AddAgentModal projects={projects} gatewayUrl={gatewayUrl} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}

function AddAgentModal({
  projects,
  gatewayUrl,
  onClose,
}: {
  projects: SelectableProject[];
  gatewayUrl?: string;
  onClose: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="world-modal"
      aria-label="Connect a project and agent"
      onClose={onClose}
      onClick={(event) => {
        // A click that lands on the <dialog> element itself (its backdrop
        // padding area), not on anything inside the content wrapper below,
        // is a backdrop click -- close, same as clicking outside a normal
        // modal would.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="world-modal-content">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="title-lg">Connect an agent</h2>
            <p className="mt-1 text-sm text-muted">
              Mint a token, add it to the agent&rsquo;s hook config, and it shows up here.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm !rounded-full !p-2"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <PairSessionForm projects={projects} gatewayUrl={gatewayUrl} />

        <div className="mt-5 border-t border-border pt-4">
          {advanced ? (
            <>
              <p className="mb-3 text-[0.8rem] text-muted">
                Register a session by hand, without wiring up a hook. Mostly for testing.
              </p>
              <RegisterSessionForm projects={projects} />
            </>
          ) : (
            <button
              type="button"
              className="text-[0.82rem] text-muted underline-offset-2 hover:text-text hover:underline"
              onClick={() => setAdvanced(true)}
            >
              Register a session by hand instead
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Island({ name, children }: { name: string; children: React.ReactNode }) {
  const hasSessions = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="world-island">
      <p className="world-island-name">{name}</p>
      {hasSessions ? (
        <div className="world-island-tokens">{children}</div>
      ) : (
        <p className="world-island-empty-note">No sessions yet</p>
      )}
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

  // Every project shows as an island even with zero sessions registered to
  // it yet -- otherwise a freshly created project never appears until
  // someone pairs an agent to it, which is backwards for "the world shows
  // what exists."
  for (const project of projects) {
    if (!byId.has(project.id)) {
      groups.push({ projectId: project.id, projectName: project.name, sessions: [] });
    }
  }

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
