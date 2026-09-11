"use server";

/**
 * Inventory and integration actions.
 *
 * Limited to organising what Forge already knows about — assign, ignore,
 * archive, create, disconnect. Nothing here changes anything at a provider.
 * Forge does not stop, delete or reconfigure infrastructure; the only route to
 * a destructive action is the link out to the platform's own console.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  createAgentSession,
  revokeAgentSession,
} from "@/lib/core/agent-sessions";
import {
  deleteConnectedAccount,
  getConnectedAccount,
} from "@/lib/core/connected-accounts";
import { createProject, getProjectRow } from "@/lib/core/projects";
import {
  assignResource,
  assignResourcesToProject,
  setResourceIgnored,
  setResourcePresence,
} from "@/lib/core/resources";
import { runDiscovery } from "@/lib/sync/discover";

export interface ProjectFormState {
  error?: string;
}

export interface AgentSessionFormState {
  error?: string;
}

const AGENT_PROVIDERS = ["claude", "codex", "gemini", "other"] as const;

/** Refresh every view that shows inventory counts. */
function revalidateInventory(): void {
  revalidatePath("/home");
  revalidatePath("/projects");
  revalidatePath("/resources");
  revalidatePath("/alerts");
  revalidatePath("/integrations");
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

export async function assignResourceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  const value = (key: string) => {
    const raw = String(formData.get(key) ?? "");
    // Empty string is the "not set" option, stored as null.
    return raw === "" ? null : raw;
  };

  await assignResource(session.workspaceId, resourceId, {
    projectId: value("projectId"),
    environmentId: value("environmentId"),
    serviceId: value("serviceId"),
  });

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

/**
 * Assigns everything ticked in the inventory to one project.
 *
 * Exists because assigning fifty repositories one detail page at a time is not
 * a workflow. Plain checkboxes in a form, so it works without client JavaScript.
 */
export async function assignSelectedAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const resourceIds = formData
    .getAll("resourceIds")
    .map((v) => String(v))
    .filter(Boolean);

  const rawProject = String(formData.get("projectId") ?? "");
  const projectId = rawProject === "" ? null : rawProject;
  const returnTo = String(formData.get("returnTo") ?? "/resources");

  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/resources";

  if (resourceIds.length === 0) {
    redirect(safeReturn + (safeReturn.includes("?") ? "&" : "?") + "assigned=none");
  }

  const count = await assignResourcesToProject(session.workspaceId, resourceIds, projectId);

  revalidateInventory();
  redirect(safeReturn + (safeReturn.includes("?") ? "&" : "?") + "assigned=" + count);
}

export async function setIgnoredAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  await setResourceIgnored(
    session.workspaceId,
    resourceId,
    String(formData.get("ignored") ?? "") === "true",
  );

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

/** Marks a resource retired in Forge. It is never touched at the provider. */
export async function setArchivedAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  const archived = String(formData.get("archived") ?? "") === "true";
  await setResourcePresence(session.workspaceId, resourceId, archived ? "archived" : "live");

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2) return { error: "Give the project a name of at least 2 characters." };
  if (name.length > 60) return { error: "Project names are limited to 60 characters." };

  const project = await createProject(session.workspaceId, { name, description });

  revalidateInventory();
  redirect(`/projects/${project.id}`);
}

/* -------------------------------------------------------------------------- */
/* Worldview — agent sessions (docs/WORLDVIEW.md)                             */
/* -------------------------------------------------------------------------- */

/**
 * Manual registration — the gateway from docs/WORLDVIEW.md §5 doesn't exist
 * yet, so this is the only way a session gets a row today. It proves the same
 * registration path the gateway will eventually drive automatically.
 */
export async function registerAgentSessionAction(
  _prev: AgentSessionFormState,
  formData: FormData,
): Promise<AgentSessionFormState> {
  const session = await requireSession();
  const provider = String(formData.get("provider") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim();

  if (!AGENT_PROVIDERS.includes(provider as (typeof AGENT_PROVIDERS)[number])) {
    return { error: "Choose which agent provider this session is." };
  }
  if (label.length > 60) {
    return { error: "Labels are limited to 60 characters." };
  }
  // The <select> only ever offers this workspace's own projects, but the
  // action can't assume that held -- confirm the id is actually one of ours
  // before it goes anywhere near the insert.
  if (projectId && !(await getProjectRow(session.workspaceId, projectId))) {
    return { error: "That project could not be found in this workspace." };
  }

  await createAgentSession(session.workspaceId, session.userId, {
    provider: provider as (typeof AGENT_PROVIDERS)[number],
    projectId,
    label,
  });

  revalidatePath("/worldview");
  redirect("/worldview");
}

export async function revokeAgentSessionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) redirect("/worldview");

  await revokeAgentSession(session.workspaceId, sessionId);
  revalidatePath("/worldview");
  redirect("/worldview");
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

/** Re-runs discovery for one connected account, on demand. */
export async function syncAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const accountId = String(formData.get("accountId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!accountId) redirect("/integrations");

  const account = await getConnectedAccount(session.workspaceId, accountId);
  if (account) {
    await runDiscovery(session.workspaceId, {
      id: account.id,
      provider: account.provider,
      settings: account.settings,
    });
  }

  revalidateInventory();
  redirect(`/integrations/${provider || account?.provider || ""}?synced=1`);
}

/**
 * Disconnects an account: the stored credential is destroyed and its resources
 * go with it. Inventory Forge can no longer verify is worse than none.
 */
export async function disconnectAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const accountId = String(formData.get("accountId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!accountId) redirect("/integrations");

  await deleteConnectedAccount(session.workspaceId, accountId);

  revalidateInventory();
  redirect(provider ? `/integrations/${provider}?disconnected=1` : "/integrations");
}
