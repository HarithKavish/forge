/**
 * Project-level Worldview collaborators (docs/WORLDVIEW.md §13a) — the
 * sharing primitive. A grant lets someone outside a workspace view and
 * register their own agent sessions on exactly one project in it; nothing
 * about the workspace's resources, billing, or other projects.
 *
 * This is the one file in lib/core/ that deliberately resolves a project
 * without a workspaceId already in hand: a collaborator crosses a
 * workspace boundary by definition, so there is no workspaceId to scope by
 * until `resolveProjectAccess` figures one out. Every function here that
 * takes a workspaceId already trusts it (the project's real owner
 * workspace, resolved first) rather than inferring one from whatever a
 * caller happened to supply.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectCollaborators, projects, users, workspaceMembers } from "@/lib/db/schema";

export type ProjectCollaboratorRow = typeof projectCollaborators.$inferSelect;

export interface CollaboratorWithUser {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

/** The project's real workspace, with no assumption the caller already knows it. */
export async function getProjectWorkspaceId(projectId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.workspaceId;
}

export async function listCollaborators(
  workspaceId: string,
  projectId: string,
): Promise<CollaboratorWithUser[]> {
  return db
    .select({
      id: projectCollaborators.id,
      userId: projectCollaborators.userId,
      email: users.email,
      name: users.name,
      createdAt: projectCollaborators.createdAt,
    })
    .from(projectCollaborators)
    .innerJoin(users, eq(users.id, projectCollaborators.userId))
    .where(
      and(
        eq(projectCollaborators.workspaceId, workspaceId),
        eq(projectCollaborators.projectId, projectId),
      ),
    );
}

/**
 * Grants access by email rather than user id -- the inviter names a person,
 * not an internal identifier. Requires that person to already have a Forge
 * account (docs/WORLDVIEW.md §13a leaves an account-less invite flow for
 * later); throws a message meant to be shown directly, not swallowed.
 */
export async function addCollaboratorByEmail(
  workspaceId: string,
  projectId: string,
  invitedBy: string,
  email: string,
): Promise<CollaboratorWithUser> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`No Forge account found for ${email}. They need to sign in once first.`);
  }

  await db
    .insert(projectCollaborators)
    .values({ workspaceId, projectId, userId: user.id, invitedBy })
    .onConflictDoNothing({
      target: [projectCollaborators.projectId, projectCollaborators.userId],
    });

  const [row] = await db
    .select()
    .from(projectCollaborators)
    .where(
      and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, user.id)),
    )
    .limit(1);
  if (!row) throw new Error("Failed to add collaborator");

  return { id: row.id, userId: user.id, email: user.email, name: user.name, createdAt: row.createdAt };
}

export async function removeCollaborator(
  workspaceId: string,
  projectId: string,
  collaboratorId: string,
): Promise<void> {
  await db
    .delete(projectCollaborators)
    .where(
      and(
        eq(projectCollaborators.workspaceId, workspaceId),
        eq(projectCollaborators.projectId, projectId),
        eq(projectCollaborators.id, collaboratorId),
      ),
    );
}

/** Projects shared with this user, from workspaces they hold no membership in. */
export async function listSharedProjects(
  userId: string,
): Promise<{ projectId: string; projectName: string; workspaceId: string }[]> {
  return db
    .select({ projectId: projects.id, projectName: projects.name, workspaceId: projects.workspaceId })
    .from(projectCollaborators)
    .innerJoin(projects, eq(projects.id, projectCollaborators.projectId))
    .where(eq(projectCollaborators.userId, userId));
}

/**
 * Whether userId may view/register agent sessions on projectId, and which
 * workspace that project actually lives in. Two ways in: owning the
 * workspace (a workspace_members row), or holding a collaborator grant.
 * Returns null for either "no such project" or "not authorized" --
 * deliberately not distinguished, so a caller can't probe for a project's
 * existence by testing access to it.
 */
export async function resolveProjectAccess(
  userId: string,
  projectId: string,
): Promise<{ workspaceId: string } | null> {
  const workspaceId = await getProjectWorkspaceId(projectId);
  if (!workspaceId) return null;

  const [membership] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (membership) return { workspaceId };

  const [collaborator] = await db
    .select({ userId: projectCollaborators.userId })
    .from(projectCollaborators)
    .where(and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId)))
    .limit(1);
  if (collaborator) return { workspaceId };

  return null;
}
