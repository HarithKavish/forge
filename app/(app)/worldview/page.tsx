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
import { WorldCanvas } from "@/components/agent-sessions/world-canvas";

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
 * There is no page here, deliberately -- WorldCanvas *is* Worldview: projects
 * as islands, sessions as avatar tokens, colored per person, badged with
 * their provider, pulsing while online and grayscale-docked while not, plus
 * one permanent "+" island for connecting something new. It connects to
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
 * The two ways to get a session onto the board -- minting a real pairing
 * token, or registering one by hand for testing -- live behind the "+"
 * island's modal now, not always on screen.
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
    <WorldCanvas
      sessions={displaySessions}
      projects={selectableProjects}
      gatewayUrl={gatewayUrl}
      viewerId={session.userId}
      viewerWorkspaceId={session.workspaceId}
    />
  );
}
