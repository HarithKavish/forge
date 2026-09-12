import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import {
  getMemberColor,
  listAgentSessions,
  listAgentSessionsForProjects,
  listProjectRecords,
  listSharedProjects,
} from "@/lib/data/queries";
import { env } from "@/lib/env";
import { personColor } from "@/lib/color";
import type { AgentSession, DisplaySession, SelectableProject } from "@/lib/data/types";
import { PageHeader, SectionCard } from "@/components/ui/page";
import { RegisterSessionForm } from "@/components/agent-sessions/register-session-form";
import { PairSessionForm } from "@/components/agent-sessions/pair-session-form";
import { SessionList } from "@/components/agent-sessions/session-list";

export const metadata: Metadata = {
  title: "Worldview",
};

/**
 * Every session's Worldview color, resolved server-side. Sessions on this
 * page no longer all belong to the viewer once shared projects are mixed
 * in (docs/WORLDVIEW.md §13a), so this looks a color up per distinct
 * (workspaceId, ownerId) pair rather than assuming one color for the whole
 * page. A collaborator with no color set in the *project's* workspace (the
 * normal case -- they were never a member of it to set one there) falls
 * back to their deterministic color, exactly as intended by the per-
 * workspace color scoping docs/WORLDVIEW.md §9 chose.
 */
async function resolveSessionColors(
  sessions: AgentSession[],
): Promise<Map<string, { light: string; dark: string }>> {
  const pairs = new Map<string, { workspaceId: string; ownerId: string }>();
  for (const s of sessions) {
    pairs.set(`${s.workspaceId}:${s.ownerId}`, { workspaceId: s.workspaceId, ownerId: s.ownerId });
  }

  const entries = await Promise.all(
    [...pairs.entries()].map(async ([key, { workspaceId, ownerId }]) => {
      const stored = await getMemberColor(workspaceId, ownerId);
      return [key, personColor(ownerId, stored)] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Worldview — the agent-session presence map (docs/WORLDVIEW.md).
 *
 * SessionList is the world itself: projects as islands, sessions as
 * avatar tokens, colored per person, badged with their provider, pulsing
 * while online and grayscale-docked while not. It connects to
 * forge-gateway's WebSocket endpoint client-side (build order step 4) to
 * layer that live presence on top of what this page fetches server-side.
 *
 * Shows two kinds of projects (docs/WORLDVIEW.md §13a): this workspace's
 * own, and any shared into it as a collaborator on someone else's project
 * -- those sessions live in that project's real workspace, not the
 * viewer's own, which is why they're fetched by project id rather than
 * workspace id and why colors are resolved per session, not once for the
 * whole page.
 *
 * Two ways to get a session onto the board, below the board itself:
 *  - "Connect a real agent" mints a pairing token (build-order step 3) that
 *    a real hook exchanges, through forge-gateway, for an actual
 *    registration.
 *  - "Register a session by hand" (step 1) still exists for testing without
 *    wiring up a hook at all.
 */
export default async function WorldviewPage() {
  const session = await requireSession();
  const [ownSessions, ownProjects, sharedProjects] = await Promise.all([
    listAgentSessions(session.workspaceId),
    listProjectRecords(session.workspaceId),
    listSharedProjects(session.userId),
  ]);

  const sharedProjectIds = sharedProjects.map((p) => p.projectId);
  const sharedSessions =
    sharedProjectIds.length > 0 ? await listAgentSessionsForProjects(sharedProjectIds) : [];

  const allSessions = [...ownSessions, ...sharedSessions].filter((s) => s.status === "active");
  const colors = await resolveSessionColors(allSessions);

  const displaySessions: DisplaySession[] = allSessions.map((s) => ({
    ...s,
    color: colors.get(`${s.workspaceId}:${s.ownerId}`) ?? personColor(s.ownerId, null),
  }));

  const selectableProjects: SelectableProject[] = [
    ...ownProjects.map((p) => ({ id: p.id, name: p.name })),
    ...sharedProjects.map((p) => ({ id: p.projectId, name: p.projectName, shared: true })),
  ];

  const gatewayUrl = env().GATEWAY_URL;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Worldview"
        description="Which coding-agent sessions are registered, and whether they're online right now."
      />

      <SessionList sessions={displaySessions} projects={selectableProjects} gatewayUrl={gatewayUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Connect a real agent"
          description="Mints a short-lived token a hook exchanges for a real registration through forge-gateway."
        >
          <PairSessionForm projects={selectableProjects} gatewayUrl={gatewayUrl} />
        </SectionCard>

        <SectionCard
          title="Register a session by hand"
          description="For testing, without wiring up a hook."
        >
          <RegisterSessionForm projects={selectableProjects} />
        </SectionCard>
      </div>
    </div>
  );
}
