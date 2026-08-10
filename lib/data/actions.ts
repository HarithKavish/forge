"use server";

/**
 * Inventory actions.
 *
 * Deliberately limited to organizing what Forge already knows about — assign,
 * ignore, archive. Nothing here touches a provider. Forge does not delete,
 * stop or modify infrastructure; the only route to a destructive action is the
 * link out to the platform's own console.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addCreatedProject, clearOverrides, mergeOverride } from "./overrides";

export interface ProjectFormState {
  error?: string;
}

/** Refresh every view that shows inventory counts. */
function revalidateInventory(): void {
  revalidatePath("/home");
  revalidatePath("/projects");
  revalidatePath("/resources");
  revalidatePath("/alerts");
}

export async function assignResourceAction(formData: FormData): Promise<void> {
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  const projectId = String(formData.get("projectId") ?? "");
  const environmentId = String(formData.get("environmentId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");

  await mergeOverride(resourceId, {
    // Empty string is the "no project" option, stored as an explicit null so it
    // overrides the seed rather than falling through to it.
    projectId: projectId || null,
    environmentId: environmentId || null,
    serviceId: serviceId || null,
  });

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

/** Keeps the resource in the inventory but stops it raising attention items. */
export async function setIgnoredAction(formData: FormData): Promise<void> {
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  await mergeOverride(resourceId, {
    ignored: String(formData.get("ignored") ?? "") === "true",
  });

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

/** Marks a resource retired in Forge. It is never touched at the provider. */
export async function setArchivedAction(formData: FormData): Promise<void> {
  const resourceId = String(formData.get("resourceId") ?? "");
  if (!resourceId) redirect("/resources");

  await mergeOverride(resourceId, {
    archived: String(formData.get("archived") ?? "") === "true",
  });

  revalidateInventory();
  redirect(`/resources/${resourceId}`);
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2) {
    return { error: "Give the project a name of at least 2 characters." };
  }
  if (name.length > 60) {
    return { error: "Project names are limited to 60 characters." };
  }

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";

  const id = `prj_new_${Date.now().toString(36)}`;

  await addCreatedProject({
    id,
    name,
    slug,
    description: description || "No description yet.",
    createdAt: new Date().toISOString(),
  });

  revalidateInventory();
  redirect(`/projects/${id}`);
}

/** Drops every local edit and returns the demo inventory to its seed state. */
export async function resetDemoAction(): Promise<void> {
  await clearOverrides();
  revalidateInventory();
  redirect("/settings/preferences");
}
