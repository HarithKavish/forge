/**
 * Workspace member records -- currently just the Worldview presence color
 * (docs/WORLDVIEW.md §9). Workspace-scoped like everything else in
 * lib/core/, keyed by the (workspaceId, userId) composite primary key.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";

export async function getMemberColor(
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ color: workspaceMembers.color })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.color ?? null;
}

export async function setMemberColor(
  workspaceId: string,
  userId: string,
  color: string | null,
): Promise<void> {
  await db
    .update(workspaceMembers)
    .set({ color })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
}
