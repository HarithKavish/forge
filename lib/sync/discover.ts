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
import { loadCredential } from "@/lib/core/credentials";
import { reconcileDiscovered, type ReconcileStats } from "@/lib/core/resources";
import { requireAdapter } from "@/lib/providers/registry";
import { ProviderAuthError, ProviderError } from "@/lib/providers/errors";
import type { DiscoveredResource } from "@/lib/providers/types";

export interface DiscoveryOutcome {
  ok: boolean;
  stats?: ReconcileStats;
  error?: string;
  needsReauth?: boolean;
}

/** Stops a wedged provider from holding a serverless function open. */
const DISCOVERY_TIMEOUT_MS = 45_000;

export async function runDiscovery(
  workspaceId: string,
  account: { id: string; provider: string; settings: unknown },
): Promise<DiscoveryOutcome> {
  const adapter = requireAdapter(account.provider);

  const credentials = await loadCredential(account.id);
  if (!credentials) {
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

    const stats = await reconcileDiscovered(
      workspaceId,
      account,
      discovered,
      { providerReportsActivity: adapter.capabilities.activity },
    );

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
