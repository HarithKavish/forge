/**
 * Registered agent sessions, for Worldview (docs/WORLDVIEW.md).
 *
 * Workspace-scoped like everything else in lib/core/. This is registration
 * only: who a session belongs to, which project it's tagged to, which
 * provider it is. Presence (online/offline, activity) is never stored here —
 * see docs/WORLDVIEW.md §4 for why that split is load-bearing.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { agentSessions } from "@/lib/db/schema";

export type AgentSessionRow = typeof agentSessions.$inferSelect;

export async function listAgentSessionRows(workspaceId: string): Promise<AgentSessionRow[]> {
  return db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.workspaceId, workspaceId))
    .orderBy(desc(agentSessions.createdAt));
}

/**
 * Sessions on a set of projects, not scoped by a single workspaceId --
 * used for a collaborator's shared projects (docs/WORLDVIEW.md §13a), which
 * live in a workspace the caller isn't a member of. Safe only because the
 * caller resolves `projectIds` from `listSharedProjects`/
 * `resolveProjectAccess` first, which already checked access; this
 * function trusts whatever project ids it's given, the same way
 * `listAgentSessionRows` trusts whatever workspaceId it's given.
 */
export async function listAgentSessionRowsForProjects(
  projectIds: string[],
): Promise<AgentSessionRow[]> {
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(agentSessions)
    .where(inArray(agentSessions.projectId, projectIds))
    .orderBy(desc(agentSessions.createdAt));
}

/** Manual registration ("Register a session by hand" on /worldview) -- a random opaque ref. */
export async function createAgentSession(
  workspaceId: string,
  ownerId: string,
  input: {
    provider: AgentSessionRow["provider"];
    projectId?: string | null;
    label?: string | null;
  },
): Promise<AgentSessionRow> {
  const [row] = await db
    .insert(agentSessions)
    .values({
      workspaceId,
      ownerId,
      projectId: input.projectId || null,
      provider: input.provider,
      label: input.label || null,
      sessionRef: `sr_${randomUUID()}`,
      status: "active",
    })
    .returning();
  if (!row) throw new Error("Failed to register the agent session");
  return row;
}

/**
 * Registration via forge-gateway's pairing-token callback
 * (app/api/gateway/sessions/route.ts). `sessionRef` is passed in rather than
 * generated here -- it's deterministically derived from the pairing token
 * (lib/gateway/pairing.ts `deriveSessionRef`), the same value forge-gateway
 * already computed and started recording presence under before this call
 * ever happens.
 *
 * Idempotent: forge-gateway confirms once per session by its own accounting,
 * but that accounting resets on a Durable Object eviction, so this can see
 * the same sessionRef again. onConflictDoNothing makes a repeat confirm a
 * no-op rather than a unique-constraint error.
 */
export async function registerGatewaySession(
  workspaceId: string,
  ownerId: string,
  sessionRef: string,
  input: {
    provider: AgentSessionRow["provider"];
    projectId?: string | null;
    label?: string | null;
    /** The provider's own session id and cwd, when the caller is the
     *  bridge rather than the old per-session pairing flow (which has
     *  neither — a pairing token identified one session by construction,
     *  so there was nothing else to pass). */
    providerSessionId?: string | null;
    workingDirectory?: string | null;
  },
): Promise<AgentSessionRow> {
  await db
    .insert(agentSessions)
    .values({
      workspaceId,
      ownerId,
      projectId: input.projectId || null,
      provider: input.provider,
      label: input.label || null,
      sessionRef,
      providerSessionId: input.providerSessionId || null,
      workingDirectory: input.workingDirectory || null,
      status: "active",
    })
    .onConflictDoNothing({ target: agentSessions.sessionRef });

  const [row] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.sessionRef, sessionRef))
    .limit(1);
  if (!row) throw new Error("Failed to register the agent session");
  return row;
}

/**
 * Flips a registration to revoked. The row stays — see docs/WORLDVIEW.md §8.
 *
 * Two ways to be allowed to: the workspace it lives in is yours (revoking
 * anyone's session there), or you're the session's own `ownerId` (revoking
 * your own, even one registered on a project you only collaborate on and
 * that therefore lives in someone else's workspace — docs/WORLDVIEW.md
 * §13a). Cross-collaborator revoke (one collaborator revoking another's
 * session on a shared project) is explicitly not decided yet, so it isn't
 * granted here either.
 */
export async function revokeAgentSession(
  callerWorkspaceId: string,
  callerUserId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(agentSessions)
    .set({ status: "revoked" })
    .where(
      and(
        eq(agentSessions.id, sessionId),
        or(eq(agentSessions.workspaceId, callerWorkspaceId), eq(agentSessions.ownerId, callerUserId)),
      ),
    );
}

/**
 * What forge-gateway's periodic revocation check calls
 * (app/api/gateway/sessions/status/route.ts) to close the gap docs/
 * WORLDVIEW.md §8 describes: the gateway verifies a pairing token locally
 * and never re-checks Forge per event, so "Revoke" alone doesn't stop it
 * from accepting one. This is that re-check, run on an interval instead.
 *
 * A `sessionRef` with no row at all comes back "revoked" too -- not found
 * is not a safe default to treat as active.
 */
export async function getSessionStatuses(
  workspaceId: string,
  sessionRefs: string[],
): Promise<Record<string, "active" | "revoked">> {
  if (sessionRefs.length === 0) return {};

  const rows = await db
    .select({ sessionRef: agentSessions.sessionRef, status: agentSessions.status })
    .from(agentSessions)
    .where(
      and(eq(agentSessions.workspaceId, workspaceId), inArray(agentSessions.sessionRef, sessionRefs)),
    );

  const found = new Map(rows.map((row) => [row.sessionRef, row.status]));
  const result: Record<string, "active" | "revoked"> = {};
  for (const ref of sessionRefs) {
    result[ref] = found.get(ref) === "active" ? "active" : "revoked";
  }
  return result;
}
