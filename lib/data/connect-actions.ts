"use server";

/**
 * Token-based provider connections.
 *
 * The credential-entry path deliberately did not exist while there was nowhere
 * safe to put a secret. It exists now because the encrypted store is wired and
 * proven — but the order below still matters:
 *
 *   validate shape → prove identity with the provider → persist → encrypt
 *
 * Nothing is written until the provider itself confirms the credential works
 * and says who it belongs to. A bad token is rejected without ever touching the
 * database, and a good one can never be filed under the wrong account.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { upsertConnectedAccount } from "@/lib/core/connected-accounts";
import { saveCredential } from "@/lib/core/credentials";
import { getProvider } from "@/lib/providers/catalogue";
import { requireAdapter } from "@/lib/providers/registry";
import {
  ProviderAuthError,
  ProviderError,
  ProviderPermissionError,
} from "@/lib/providers/errors";
import { runDiscovery } from "@/lib/sync/discover";

export interface ConnectFormState {
  error?: string;
}

export async function connectWithTokenAction(
  _prev: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const session = await requireSession();
  const providerId = String(formData.get("provider") ?? "");

  const provider = getProvider(providerId);
  if (!provider?.implemented || provider.connectMethod !== "token") {
    return { error: "That provider cannot be connected this way." };
  }

  const adapter = requireAdapter(providerId);

  // Only the fields the provider declared, so nothing unexpected reaches the
  // credential schema.
  const raw: Record<string, string> = {};
  for (const field of provider.credentialFields ?? []) {
    const value = String(formData.get(field.name) ?? "").trim();
    if (value) raw[field.name] = value;
  }

  const parsed = adapter.credentialSchema.safeParse(raw);
  if (!parsed.success) {
    // Zod's message describes the shape, never the value.
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "Credential"}: ${first.message}` : "That credential is not valid.",
    };
  }

  const credentials = parsed.data;

  try {
    // Ask the provider who this credential belongs to before persisting it.
    const identity = await adapter.authenticate({ credentials, settings: {} });

    const account = await upsertConnectedAccount(session.workspaceId, {
      provider: providerId,
      displayName: identity.displayName,
      externalAccountId: identity.externalAccountId,
      settings: identity.settings,
    });

    await saveCredential(account.id, credentials);

    // Discover immediately: a connection that shows nothing until some later
    // background job would look broken.
    const outcome = await runDiscovery(session.workspaceId, {
      id: account.id,
      provider: account.provider,
      settings: account.settings,
    });

    revalidatePath("/home");
    revalidatePath("/resources");
    revalidatePath("/integrations");
    revalidatePath(`/integrations/${providerId}`);

    const query = new URLSearchParams({ connected: "1" });
    if (outcome.ok && outcome.stats) {
      query.set("found", String(outcome.stats.discovered));
    } else {
      query.set("sync_error", "1");
    }
    redirect(`/integrations/${providerId}?${query}`);
  } catch (cause) {
    // redirect() throws; let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;

    if (cause instanceof ProviderAuthError) {
      return {
        error: `${provider.displayName} rejected that credential. Check it was copied in full and has not been revoked.`,
      };
    }
    if (cause instanceof ProviderPermissionError) {
      return {
        error: `That credential is valid but missing a permission Forge needs. Compare it against the list above.`,
      };
    }
    if (cause instanceof ProviderError) {
      return { error: cause.toPublicMessage() };
    }
    // Never surface a raw error: it can carry request details.
    return { error: "Could not complete the connection. Please try again." };
  }
}
