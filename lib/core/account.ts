/**
 * Account deletion.
 *
 * Exists because the privacy policy says deletion is available, and a policy
 * that promises something the product cannot do is worse than one that admits
 * the gap.
 *
 * Deletes in dependency order and relies on the schema's cascades for the rest:
 * removing a workspace takes its projects, services, environments, resources,
 * connected accounts and their encrypted credentials with it; removing the user
 * takes their sign-in identities, sessions and memberships.
 *
 * Nothing is touched at any provider. Disconnecting Forge does not delete a
 * repository, and revoking Forge's access is done at the provider itself.
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";

export interface DeletionSummary {
  workspacesDeleted: number;
  userDeleted: boolean;
}

export async function deleteAccountAndData(userId: string): Promise<DeletionSummary> {
  // Every workspace this user belongs to. Today that is exactly one; when
  // sharing exists this must only take workspaces they solely own, which is
  // why the role is checked rather than assumed.
  const owned = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  const workspaceIds = owned.map((row) => row.workspaceId);

  if (workspaceIds.length > 0) {
    // Cascades through projects, resources, connected accounts and credentials.
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  }

  // Cascades through accounts, sessions and any remaining memberships.
  const removed = await db.delete(users).where(eq(users.id, userId)).returning({
    id: users.id,
  });

  return {
    workspacesDeleted: workspaceIds.length,
    userDeleted: removed.length > 0,
  };
}
