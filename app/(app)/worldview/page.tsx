import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { listAgentSessions, listProjectRecords } from "@/lib/data/queries";
import { env } from "@/lib/env";
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
 * Two ways to get a session onto this page:
 *  - "Connect a real agent" mints a pairing token (build-order step 3) that a
 *    real hook exchanges, through forge-gateway, for an actual registration.
 *  - "Register a session by hand" (step 1) still exists for testing without
 *    wiring up a hook at all.
 *
 * SessionList connects to forge-gateway's WebSocket endpoint client-side
 * (step 4) to layer live presence on top of the registrations this page
 * fetches server-side. A session with no live presence yet shows
 * "Registered" -- that's an honest state (a manual registration, or an
 * agent that hasn't connected), not a loading placeholder.
 */
export default async function WorldviewPage() {
  const session = await requireSession();
  const [sessions, projects] = await Promise.all([
    listAgentSessions(session.workspaceId),
    listProjectRecords(session.workspaceId),
  ]);

  const active = sessions.filter((s) => s.status === "active");
  const gatewayUrl = env().GATEWAY_URL;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Worldview"
        description="Which coding-agent sessions are registered, and whether they're online right now."
      />

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

      <SectionCard title="Registered sessions">
        <SessionList sessions={active} projects={projects} gatewayUrl={gatewayUrl} />
      </SectionCard>
    </div>
  );
}
