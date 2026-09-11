/**
 * Registered agent sessions, for Worldview (docs/WORLDVIEW.md).
 *
 * Workspace-scoped like everything else in lib/core/. This is registration
 * only: who a session belongs to, which project it's tagged to, which
 * provider it is. Presence (online/offline, activity) is never stored here —
 * see docs/WORLDVIEW.md §4 for why that split is load-bearing.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

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
      // Opaque, and eventually gateway-issued (docs/WORLDVIEW.md §5). Minted
      // here for now since there is no gateway yet — a manually registered
      // session is still a real, addressable registration.
      sessionRef: `sr_${randomUUID()}`,
      status: "active",
    })
    .returning();
  if (!row) throw new Error("Failed to register the agent session");
  return row;
}

/** Flips a registration to revoked. The row stays — see docs/WORLDVIEW.md §8. */
export async function revokeAgentSession(workspaceId: string, sessionId: string): Promise<void> {
  await db
    .update(agentSessions)
    .set({ status: "revoked" })
    .where(and(eq(agentSessions.workspaceId, workspaceId), eq(agentSessions.id, sessionId)));
}
