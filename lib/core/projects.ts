/**
 * Projects, services and environments.
 *
 * Workspace-scoped like everything else in lib/core/.
 */

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { environments, projects, services } from "@/lib/db/schema";
import { unassignResourcesForProject } from "./resources";

export type ProjectRow = typeof projects.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type EnvironmentRow = typeof environments.$inferSelect;

export async function listProjectRows(workspaceId: string): Promise<ProjectRow[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.name));
}

export async function getProjectRow(
  workspaceId: string,
  projectId: string,
): Promise<ProjectRow | undefined> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  return row;
}

/** Slugs are unique per workspace, so a clash gets a numeric suffix. */
async function uniqueSlug(workspaceId: string, base: string): Promise<string> {
  const existing = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));
  const taken = new Set(existing.map((p) => p.slug));

  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createProject(
  workspaceId: string,
  input: { name: string; description?: string },
): Promise<ProjectRow> {
  const base =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";

  const [row] = await db
    .insert(projects)
    .values({
      workspaceId,
      name: input.name,
      slug: await uniqueSlug(workspaceId, base),
      description: input.description || null,
      status: "active",
      // A new project has nothing to report on. "Unknown" is the honest answer,
      // not an optimistic "healthy".
      healthStatus: "unknown",
    })
    .returning();

  if (!row) throw new Error("Failed to create the project");
  return row;
}

/**
 * Deletes a project and releases its resources back to unassociated.
 *
 * The resources themselves are never touched at the provider — removing a
 * Forge project is an organisational act, not an infrastructure one.
 */
export async function deleteProject(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  await unassignResourcesForProject(workspaceId, projectId);
  await db
    .delete(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)));
}

export async function listServiceRows(
  workspaceId: string,
  projectId?: string,
): Promise<ServiceRow[]> {
  const where = projectId
    ? and(eq(services.workspaceId, workspaceId), eq(services.projectId, projectId))
    : eq(services.workspaceId, workspaceId);
  return db.select().from(services).where(where).orderBy(asc(services.name));
}

export async function listEnvironmentRows(
  workspaceId: string,
  projectId?: string,
): Promise<EnvironmentRow[]> {
  const where = projectId
    ? and(eq(environments.workspaceId, workspaceId), eq(environments.projectId, projectId))
    : eq(environments.workspaceId, workspaceId);
  return db.select().from(environments).where(where).orderBy(asc(environments.name));
}

export async function createService(
  workspaceId: string,
  input: { projectId: string; name: string; description?: string },
): Promise<ServiceRow> {
  const [row] = await db
    .insert(services)
    .values({
      workspaceId,
      projectId: input.projectId,
      name: input.name,
      description: input.description || null,
      healthStatus: "unknown",
    })
    .returning();
  if (!row) throw new Error("Failed to create the service");
  return row;
}

export async function createEnvironment(
  workspaceId: string,
  input: { projectId: string; name: string; kind: EnvironmentRow["kind"] },
): Promise<EnvironmentRow> {
  const [row] = await db
    .insert(environments)
    .values({
      workspaceId,
      projectId: input.projectId,
      name: input.name,
      kind: input.kind,
    })
    .returning();
  if (!row) throw new Error("Failed to create the environment");
  return row;
}
