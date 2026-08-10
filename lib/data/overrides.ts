/**
 * User edits layered over the demo inventory.
 *
 * The seed data is static, but assigning a resource to a project is the core
 * loop of the product — a button that only explained what it *would* do would
 * make the demo untestable. So edits are stored in a cookie and applied over
 * the fixtures on read.
 *
 * This is the demo stand-in for an `UPDATE resources SET project_id = ...`.
 * When the database lands, the actions below become writes and
 * `applyOverrides` disappears entirely.
 */

import { cookies } from "next/headers";

import { decodeCookieValue, encodeCookieValue } from "@/lib/auth/cookies";
import type { Resource } from "./types";

const OVERRIDES_COOKIE = "forge.overrides";
const MAX_AGE = 60 * 60 * 24 * 30;

export interface ResourceOverride {
  projectId?: string | null;
  environmentId?: string | null;
  serviceId?: string | null;
  ignored?: boolean;
  archived?: boolean;
}

export type OverrideMap = Record<string, ResourceOverride>;

export async function getOverrides(): Promise<OverrideMap> {
  const store = await cookies();
  const value = decodeCookieValue<OverrideMap>(store.get(OVERRIDES_COOKIE)?.value);
  return value && typeof value === "object" ? value : {};
}

async function writeOverrides(overrides: OverrideMap): Promise<void> {
  const store = await cookies();
  store.set(OVERRIDES_COOKIE, encodeCookieValue(overrides), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function mergeOverride(
  resourceId: string,
  patch: ResourceOverride,
): Promise<void> {
  const overrides = await getOverrides();
  const next = { ...(overrides[resourceId] ?? {}), ...patch };

  // Drop entries that no longer differ from the seed, so the cookie stays small.
  const meaningful = Object.entries(next).filter(([, value]) => value !== undefined);
  if (meaningful.length === 0) {
    delete overrides[resourceId];
  } else {
    overrides[resourceId] = Object.fromEntries(meaningful) as ResourceOverride;
  }

  await writeOverrides(overrides);
}

export async function clearOverrides(): Promise<void> {
  const store = await cookies();
  store.delete(OVERRIDES_COOKIE);
  store.delete(CREATED_PROJECTS_COOKIE);
}

/* -------------------------------------------------------------------------- */
/* Projects created during the demo                                            */
/* -------------------------------------------------------------------------- */

const CREATED_PROJECTS_COOKIE = "forge.projects";

/** Kept small deliberately — cookies cap at about 4KB. */
const MAX_CREATED_PROJECTS = 12;

export interface CreatedProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

export async function getCreatedProjects(): Promise<CreatedProject[]> {
  const store = await cookies();
  const value = decodeCookieValue<CreatedProject[]>(
    store.get(CREATED_PROJECTS_COOKIE)?.value,
  );
  return Array.isArray(value) ? value : [];
}

export async function addCreatedProject(project: CreatedProject): Promise<void> {
  const store = await cookies();
  const existing = await getCreatedProjects();
  const next = [project, ...existing].slice(0, MAX_CREATED_PROJECTS);

  store.set(CREATED_PROJECTS_COOKIE, encodeCookieValue(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Applies stored edits to a fixture row. */
export function applyOverride(resource: Resource, override?: ResourceOverride): Resource {
  if (!override) return resource;

  const next: Resource = { ...resource };

  if (override.projectId !== undefined) {
    next.projectId = override.projectId ?? undefined;
    // Environment and service belong to the old project; dropping them keeps
    // the row internally consistent rather than pointing at a foreign project.
    next.environmentId = undefined;
    next.serviceId = undefined;
  }
  if (override.environmentId !== undefined) {
    next.environmentId = override.environmentId ?? undefined;
  }
  if (override.serviceId !== undefined) {
    next.serviceId = override.serviceId ?? undefined;
  }
  if (override.archived) {
    next.presence = "archived";
  }

  return next;
}

export function isIgnored(override: ResourceOverride | undefined): boolean {
  return override?.ignored === true;
}
