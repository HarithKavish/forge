"use client";

/**
 * The project side panel (docs/BRIDGE.md "Project panel"): project name,
 * linked resources, linked agent sessions -- and, only here, the "Link
 * agent session" action. Opens when a project island in the 3D world is
 * clicked (world-canvas.tsx); the 3D platform itself shows only the
 * project's title, so this panel (and the robots' own visual state) is
 * where everything else about a project's agent sessions actually lives.
 *
 * "Linked" is a Forge-DB relationship, independent of whether the local
 * bridge reporting that session is currently reachable -- a session stays
 * listed, and its status still resolves from `presence`, even when its
 * machine is completely offline (docs/BRIDGE.md "Cloud vs local data").
 */

import { useCallback, useEffect, useState } from "react";

import { getProjectPanelDataAction, linkAgentSessionsAction, unlinkAgentSessionAction, type ProjectPanelData } from "@/lib/data/actions";
import type { AgentProvider } from "@/lib/data/types";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import { CloseIcon } from "@/components/ui/icons";
import { ProviderIcon } from "@/components/agent-sessions/provider-icon";
import { SessionConversation } from "@/components/agent-sessions/session-conversation";
import { useLocalBridge, type DiscoveredSession } from "@/lib/hooks/use-local-bridge";
import type { PresenceEntry } from "@/components/agent-sessions/world-scene";

export function ProjectPanel({
  projectId,
  presence,
  onClose,
}: {
  projectId: string;
  presence: Map<string, PresenceEntry>;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectPanelData | { error: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [openSession, setOpenSession] = useState<{ providerSessionId: string; title: string } | null>(null);

  const refresh = useCallback(async () => {
    setData(await getProjectPanelDataAction(projectId));
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="world-side-panel-wrap">
      <div className="world-side-panel">
        <div className="flex items-start justify-between gap-3">
          <h2 className="title-lg truncate">{data && !("error" in data) ? data.project.name : "Loading…"}</h2>
          <button type="button" className="btn btn--ghost btn--sm !rounded-full !p-2" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        {!data ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : "error" in data ? (
          <p className="text-sm text-error">{data.error}</p>
        ) : linking ? (
          <LinkSessionView
            projectId={projectId}
            alreadyLinked={data.agentSessions}
            onDone={() => {
              setLinking(false);
              void refresh();
            }}
            onCancel={() => setLinking(false)}
          />
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Linked Resources</h3>
              {data.resources.length === 0 ? (
                <p className="text-sm text-muted">No resources linked yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.resources.map((resource) => (
                    <li key={resource.id} className="world-session-row">
                      <span className="world-session-row-title">
                        <span className="truncate text-sm font-medium">{resource.name}</span>
                        <span className="truncate text-[0.75rem] text-muted">{resource.resourceType}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Agent Sessions</h3>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setLinking(true)}>
                  Link agent session
                </button>
              </div>
              {data.agentSessions.length === 0 ? (
                <p className="text-sm text-muted">No agent sessions linked yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.agentSessions.map((session) => {
                    const online = presence.get(session.sessionRef)?.state === "online";
                    return (
                      <li key={session.id} className="world-session-row">
                        <ProviderIcon provider={session.provider} size={16} />
                        <span className="world-session-row-title">
                          <span className="truncate text-sm font-medium">
                            {session.label || agentProviderLabel(session.provider)}
                          </span>
                          <span className="truncate text-[0.75rem] text-muted">
                            Status: {online ? "Online" : "Offline"} · Linked {relativeTime(session.createdAt)}
                          </span>
                        </span>
                        {session.providerSessionId ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() =>
                              setOpenSession({
                                providerSessionId: session.providerSessionId!,
                                title: session.label || agentProviderLabel(session.provider),
                              })
                            }
                          >
                            Open
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void unlinkAgentSessionAction(session.id).then(refresh)}
                        >
                          Unlink
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {openSession ? (
        <div className="world-side-panel">
          <button type="button" className="btn btn--ghost btn--sm self-start" onClick={() => setOpenSession(null)}>
            ← Back
          </button>
          <SessionConversation providerSessionId={openSession.providerSessionId} title={openSession.title} />
        </div>
      ) : null}
    </div>
  );
}

function LinkSessionView({
  projectId,
  alreadyLinked,
  onDone,
  onCancel,
}: {
  projectId: string;
  alreadyLinked: ProjectPanelData["agentSessions"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { connection, linking: bridgeLinking, linkNow, listSessions } = useLocalBridge();
  const [sessions, setSessions] = useState<DiscoveredSession[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const linkedIds = new Set(alreadyLinked.map((s) => s.providerSessionId).filter(Boolean));

  useEffect(() => {
    if (connection.phase !== "linked") return;
    let cancelled = false;
    void listSessions().then((all) => {
      if (!cancelled) setSessions(all.filter((s) => !linkedIds.has(s.providerSessionId)));
    });
    return () => {
      cancelled = true;
    };
    // linkedIds is derived fresh each render from a stable prop; recomputing it isn't a dependency change worth tracking here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.phase, listSessions]);

  async function handleLinkSessions() {
    if (!sessions || selected.size === 0) return;
    setSubmitting(true);
    try {
      await linkAgentSessionsAction(
        projectId,
        sessions
          .filter((s) => selected.has(s.providerSessionId))
          .map((s) => ({
            provider: "claude" as AgentProvider,
            providerSessionId: s.providerSessionId,
            workingDirectory: s.cwd,
            label: s.customTitle || s.summary,
          })),
      );
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-wide text-faint">Link agent session</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {connection.phase === "checking" ? (
        <p className="text-sm text-muted">Looking for a local bridge…</p>
      ) : connection.phase === "not_found" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">No local bridge detected on this machine. In your Forge checkout, run:</p>
          <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.82rem]">
            cd bridge{"\n"}npm install{"\n"}npm run install-hooks{"\n"}npm run bridge
          </pre>
        </div>
      ) : connection.phase === "unlinked" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Bridge detected on this machine, not yet linked to this workspace.</p>
          <button type="button" className="btn btn--primary self-start" onClick={linkNow} disabled={bridgeLinking}>
            {bridgeLinking ? "Linking…" : "Link this bridge"}
          </button>
        </div>
      ) : sessions === null ? (
        <p className="text-sm text-muted">Loading local sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted">Every session on this machine is already linked to this project.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li key={s.providerSessionId} className="world-session-row">
                <input
                  type="checkbox"
                  checked={selected.has(s.providerSessionId)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.providerSessionId);
                      else next.delete(s.providerSessionId);
                      return next;
                    })
                  }
                />
                <ProviderIcon provider="claude" size={16} />
                <span className="world-session-row-title">
                  <span className="truncate text-sm font-medium">{s.customTitle || s.summary || "Untitled session"}</span>
                  <span className="truncate text-[0.75rem] text-muted">{s.cwd ?? "Unknown directory"}</span>
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn--primary self-start"
            disabled={selected.size === 0 || submitting}
            onClick={handleLinkSessions}
          >
            {submitting ? "Linking…" : `Link sessions (${selected.size})`}
          </button>
        </>
      )}
    </div>
  );
}
