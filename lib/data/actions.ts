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
  deleteConnectedAccount,
  getConnectedAccount,
} from "@/lib/core/connected-accounts";
import { createProject } from "@/lib/core/projects";
import {
  assignResource,
  setResourceIgnored,
  setResourcePresence,
} from "@/lib/core/resources";
import { runDiscovery } from "@/lib/sync/discover";

export interface ProjectFormState {
  error?: string;
}

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
