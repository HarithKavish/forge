"use server";

/**
 * Connect and disconnect actions.
 *
 * No credential ever reaches these — see the note in ./connections.ts. They
 * exist so the integrations flow is genuinely navigable end to end rather than
 * a screen with an inert button.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProvider } from "@/lib/mock/providers";
import { addSimulatedConnection, removeConnection } from "./connections";

function revalidateIntegrations(providerId?: string): void {
  revalidatePath("/home");
  revalidatePath("/integrations");
  revalidatePath("/alerts");
  if (providerId) revalidatePath(`/integrations/${providerId}`);
}

export async function connectProviderAction(formData: FormData): Promise<void> {
  const providerId = String(formData.get("provider") ?? "");
  const provider = getProvider(providerId);
  if (!provider) redirect("/integrations");

  const label = String(formData.get("displayName") ?? "").trim();

  await addSimulatedConnection(
    providerId,
    label || `${provider.displayName} — simulated`,
  );

  revalidateIntegrations(providerId);
  redirect(`/integrations/${providerId}?connected=1`);
}

export async function disconnectAccountAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  const providerId = String(formData.get("provider") ?? "");
  if (!accountId) redirect("/integrations");

  await removeConnection(accountId);

  revalidateIntegrations(providerId);
  redirect(providerId ? `/integrations/${providerId}` : "/integrations");
}
