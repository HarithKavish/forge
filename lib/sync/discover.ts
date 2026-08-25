/**
 * Discovery runs.
 *
 * Loads a credential, streams whatever the adapter can see, and reconciles it
 * into the inventory. This is the only place the two halves meet: adapters know
 * nothing about the database, and lib/core/ knows nothing about any provider.
 *
 * A failed run is never destructive. Errors are recorded on the account and the
 * existing inventory is left exactly as it was, because "GitHub was briefly
 * unreachable" and "your repositories are gone" must not look the same.
 */

import { recordSyncResult } from "@/lib/core/connected-accounts";
import { loadCredential, saveCredential } from "@/lib/core/credentials";
import { reconcileDiscovered, type ReconcileStats } from "@/lib/core/resources";
import { requireAdapter } from "@/lib/providers/registry";
import { ProviderAuthError, ProviderError } from "@/lib/providers/errors";
import type { DiscoveredResource, ProviderAdapter } from "@/lib/providers/types";

export interface DiscoveryOutcome {
  ok: boolean;
  stats?: ReconcileStats;
  error?: string;
  needsReauth?: boolean;
}

/** Stops a wedged provider from holding a serverless function open. */
const DISCOVERY_TIMEOUT_MS = 45_000;

/**
 * Refresh a credential this long before it actually expires.
 *
 * Without the margin a token could pass the check and then expire mid-run,
 * halfway through pagination — which is the worst moment for it to happen.
 */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * Returns a credential that will still be valid for the whole run, refreshing
 * and persisting a new one if the stored one is close to expiring.
 *
 * A credential with no expiry never needs this, and an adapter with no
 * `refreshCredentials` cannot do it — both fall through to using what is
 * stored, which is correct for static keys.
 */
async function ensureFreshCredential(
  accountId: string,
  adapter: ProviderAdapter<never>,
  stored: { credential: unknown; expiresAt?: Date },
): Promise<unknown> {
  const expiring =
    stored.expiresAt !== undefined &&
    stored.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (!expiring || !adapter.refreshCredentials) return stored.credential;

  const refreshed = await adapter.refreshCredentials(stored.credential as never);
  await saveCredential(accountId, refreshed.credentials, refreshed.expiresAt);
  return refreshed.credentials;
}

export async function runDiscovery(
  workspaceId: string,
  account: { id: string; provider: string; settings: unknown },
): Promise<DiscoveryOutcome> {
  const adapter = requireAdapter(account.provider);

  const stored = await loadCredential(account.id);
  if (!stored) {
    const error = "No stored credential for this account. Reconnect it.";
    await recordSyncResult(workspaceId, account.id, {
      status: "failed",
      error,
      needsReauth: true,
    });
    return { ok: false, error, needsReauth: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

  try {
    const credentials = await ensureFreshCredential(account.id, adapter, stored);

    const ctx = {
      credentials: credentials as never,
      settings: (account.settings as Record<string, unknown>) ?? {},
      signal: controller.signal,
    };

    // Drained fully before writing anything: a page failing halfway through
    // would otherwise leave the rest of the inventory looking "missing".
    const discovered: DiscoveredResource[] = [];
    for await (const resource of adapter.discoverResources(ctx)) {
      discovered.push(resource);
    }

    const stats = await reconcileDiscovered(workspaceId, account, discovered, {
      providerReportsActivity: adapter.capabilities.activity,
    });

    await recordSyncResult(workspaceId, account.id, { status: "succeeded" });
    return { ok: true, stats };
  } catch (cause) {
    // Only the provider's own safe message is persisted — never a token, never
    // a raw stack.
    const isProviderError = cause instanceof ProviderError;
    const error = isProviderError
      ? cause.toPublicMessage()
      : "Discovery failed unexpectedly.";
    const needsReauth = cause instanceof ProviderAuthError;

    await recordSyncResult(workspaceId, account.id, {
      status: "failed",
      error,
      needsReauth,
    });
    return { ok: false, error, needsReauth };
  } finally {
    clearTimeout(timeout);
  }
}
