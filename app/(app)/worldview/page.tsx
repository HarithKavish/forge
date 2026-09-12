import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { getMemberColor, listAgentSessions, listProjectRecords } from "@/lib/data/queries";
import { env } from "@/lib/env";
import { personColor } from "@/lib/color";
import { PageHeader, SectionCard } from "@/components/ui/page";
import { RegisterSessionForm } from "@/components/agent-sessions/register-session-form";
import { PairSessionForm } from "@/components/agent-sessions/pair-session-form";
import { SessionList } from "@/components/agent-sessions/session-list";

export const metadata: Metadata = {
  title: "Worldview",
};

/**
 * Worldview — the agent-session presence map (docs/WORLDVIEW.md).
 *
 * SessionList is the world itself: projects as islands, sessions as
 * avatar tokens, colored per person (Settings → Workspace), badged with
 * their provider, pulsing while online and grayscale-docked while not. It
 * connects to forge-gateway's WebSocket endpoint client-side (build order
 * step 4) to layer that live presence on top of what this page fetches
 * server-side. A session with no live presence yet reads "docked" or shows
 * how long ago it was registered -- an honest state (a manual registration,
 * or an agent that hasn't connected), never a loading placeholder.
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
  const [sessions, projects, storedColor] = await Promise.all([
    listAgentSessions(session.workspaceId),
    listProjectRecords(session.workspaceId),
    getMemberColor(session.workspaceId, session.userId),
  ]);

  const active = sessions.filter((s) => s.status === "active");
  const gatewayUrl = env().GATEWAY_URL;
  const myColor = personColor(session.userId, storedColor);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Worldview"
        description="Which coding-agent sessions are registered, and whether they're online right now."
      />

      <SessionList sessions={active} projects={projects} gatewayUrl={gatewayUrl} myColor={myColor} />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Connect a real agent"
          description="Mints a short-lived token a hook exchanges for a real registration through forge-gateway."
        >
          <PairSessionForm projects={projects} gatewayUrl={gatewayUrl} />
        </SectionCard>

        <SectionCard
          title="Register a session by hand"
          description="For testing, without wiring up a hook."
        >
          <RegisterSessionForm projects={projects} />
        </SectionCard>
      </div>
    </div>
  );
}
