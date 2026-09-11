import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { listAgentSessions, listProjectRecords } from "@/lib/data/queries";
import { revokeAgentSessionAction } from "@/lib/data/actions";
import { agentProviderLabel, relativeTime } from "@/lib/format";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui/page";
import { RegisterSessionForm } from "@/components/agent-sessions/register-session-form";

export const metadata: Metadata = {
  title: "Worldview",
};

/**
 * Worldview — the agent-session presence map (docs/WORLDVIEW.md).
 *
 * This is step 1 of the build order in docs/WORLDVIEW.md §12: a manual
 * registration form and a list of what's registered, with no gateway and no
 * live presence yet. Every session here shows as "Registered" because that is
 * genuinely all Forge knows about it today — online/offline arrives with the
 * gateway in a later step, and is never stored here even then.
 */
export default async function WorldviewPage() {
  const session = await requireSession();
  const [sessions, projects] = await Promise.all([
    listAgentSessions(session.workspaceId),
    listProjectRecords(session.workspaceId),
  ]);

  const projectName = (projectId?: string) =>
    projects.find((p) => p.id === projectId)?.name;

  const active = sessions.filter((s) => s.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Worldview"
        description="Which coding-agent sessions are registered, and to what. No presence yet — that arrives with the gateway in docs/WORLDVIEW.md §5."
      />

      <SectionCard title="Register a session">
        <RegisterSessionForm projects={projects} />
      </SectionCard>

      <SectionCard title="Registered sessions">
        {active.length === 0 ? (
          <EmptyState
            title="No sessions registered yet"
            description="Register one above to see it here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {active.map((agentSession) => (
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
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="pill pill--neutral">Registered</span>
                  <form action={revokeAgentSessionAction}>
                    <input type="hidden" name="sessionId" value={agentSession.id} />
                    <button type="submit" className="btn btn--sm btn--ghost">
                      Revoke
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
