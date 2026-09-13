"use client";

/**
 * Worldview itself: a 3D world (world-scene.tsx) with one glowing platform
 * per real Forge project -- Worldview never creates or manages projects
 * itself, so every project a workspace already has just shows up as its
 * own island (docs/BRIDGE.md "Projects are not managed here"). Clicking a
 * project island opens its side panel (project-panel.tsx): project name,
 * linked resources, linked agent sessions, and the only place "Link agent
 * session" lives.
 *
 * The old "+" platform for connecting a project/agent by hand still exists
 * in world-scene.tsx (`SHOW_ADD_PLATFORM`) and its modal below, but is not
 * rendered -- kept rather than deleted, not reachable from the UI.
 *
 * This component owns the forge-gateway WebSocket connection and the
 * project/session grouping; the actual 3D rendering is dynamically
 * imported with ssr:false since three.js touches `window`/`self` at module
 * load and cannot run during server rendering.
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { DisplaySession, SelectableProject } from "@/lib/data/types";
import { CloseIcon } from "@/components/ui/icons";
import { PairSessionForm } from "@/components/agent-sessions/pair-session-form";
import { RegisterSessionForm } from "@/components/agent-sessions/register-session-form";
import { LocalBridgePanel } from "@/components/agent-sessions/local-bridge-panel";
import { ProjectPanel } from "@/components/agent-sessions/project-panel";
import type { PresenceEntry, WorldGroup } from "@/components/agent-sessions/world-scene";

const WorldScene = dynamic(
  () => import("@/components/agent-sessions/world-scene").then((m) => m.WorldScene),
  { ssr: false, loading: () => <div className="world-scene-loading">Loading the world…</div> },
);

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
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
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
      <WorldScene
        groups={groups}
        presence={presence}
        viewerId={viewerId}
        viewerWorkspaceId={viewerWorkspaceId}
        onAddClick={() => setAddOpen(true)}
        onProjectClick={(projectId) => setOpenProjectId(projectId)}
      />

      {addOpen ? (
        <AddAgentModal projects={projects} gatewayUrl={gatewayUrl} onClose={() => setAddOpen(false)} />
      ) : null}

      {openProjectId ? (
        <ProjectPanel projectId={openProjectId} presence={presence} onClose={() => setOpenProjectId(null)} />
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
            <h2 className="title-lg">Local Claude Code</h2>
            <p className="mt-1 text-sm text-muted">
              Discovers sessions already running on this machine — no per-session setup.
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

        <LocalBridgePanel />

        <div className="mt-5 border-t border-border pt-4">
          {advanced ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-[0.8rem] font-medium">Connect a remote agent</p>
                <p className="mb-3 text-[0.8rem] text-muted">
                  For a machine Forge can&rsquo;t reach a local bridge on. Mints a token to paste into that
                  machine&rsquo;s hook config.
                </p>
                <PairSessionForm projects={projects} gatewayUrl={gatewayUrl} />
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-[0.8rem] text-muted">
                  Register a session by hand, without wiring up a hook. Mostly for testing.
                </p>
                <RegisterSessionForm projects={projects} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-[0.82rem] text-muted underline-offset-2 hover:text-text hover:underline"
              onClick={() => setAdvanced(true)}
            >
              Connect a remote agent instead
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * One island per real Forge project, nothing else (docs/BRIDGE.md
 * "Projects are not managed here") -- a session with no projectId (e.g.
 * one registered through the still-hidden advanced forms without picking
 * a project) has nothing to render as its own island for; it simply
 * doesn't appear here until it's linked to a project. There is
 * deliberately no synthetic "no project" grouping.
 */
function groupByProject(sessions: DisplaySession[], projects: SelectableProject[]): WorldGroup[] {
  const byId = new Map<string, DisplaySession[]>();

  for (const session of sessions) {
    if (!session.projectId) continue;
    const bucket = byId.get(session.projectId) ?? [];
    bucket.push(session);
    byId.set(session.projectId, bucket);
  }

  const groups: WorldGroup[] = [...byId.entries()].map(([projectId, group]) => ({
    projectId,
    projectName: projects.find((p) => p.id === projectId)?.name ?? "Unknown project",
    sessions: group,
  }));

  // Every project shows as a platform even with zero sessions linked to it
  // yet -- otherwise a freshly created project never appears until
  // someone links a session, which is backwards for "the world shows what
  // exists."
  for (const project of projects) {
    if (!byId.has(project.id)) {
      groups.push({ projectId: project.id, projectName: project.name, sessions: [] });
    }
  }

  return groups;
}
