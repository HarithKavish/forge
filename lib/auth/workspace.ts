/**
 * Workspace provisioning.
 *
 * Every Forge user owns exactly one personal workspace, and the workspace — not
 * the user — is the tenant every query is scoped to. This runs on sign-in and
 * must therefore be safe to call on every single sign-in, forever.
 *
 * Idempotency is structural rather than checked-then-written: the slug is
 * derived deterministically from the Forge user id, so a repeat call collides
 * with the unique index and does nothing. That holds even if two sign-ins race,
 * which a read-then-insert would not. It matters because the Neon HTTP driver
 * has no interactive transactions to fall back on.
 */

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";

export interface ProvisionedWorkspace {
  id: string;
  name: string;
}

/** "Ada Lovelace" -> "Ada". Falls back to something neutral, never to an email. */
function personalWorkspaceName(displayName: string | null | undefined): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? `${first}'s workspace` : "Personal workspace";
}

/**
 * Returns the user's personal workspace, creating it on first sign-in.
 *
 * Never creates a second workspace for a user who already has one.
 */
export async function ensureWorkspaceForUser(
  userId: string,
  displayName?: string | null,
): Promise<ProvisionedWorkspace> {
  // Already a member of something? Then the workspace exists; use it.
  const membership = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  if (membership[0]) return membership[0];

  // Deterministic from the user id, so a concurrent duplicate is impossible
  // rather than merely unlikely.
  const slug = `ws-${userId.replace(/-/g, "").slice(0, 16)}`;
  const name = personalWorkspaceName(displayName);

  await db
    .insert(workspaces)
    .values({ name, slug, personal: true })
    .onConflictDoNothing({ target: workspaces.slug });

  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!workspace) {
    throw new Error(`Failed to provision a workspace for user ${userId}`);
  }

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId, role: "owner" })
    .onConflictDoNothing();

  return workspace;
}
