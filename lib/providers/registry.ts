/**
 * The provider registry.
 *
 * Code is the source of truth for which providers exist and what they can do —
 * there is no `providers` table. A database row would inevitably drift from the
 * adapter that actually implements the behaviour, and the failure mode of that
 * drift is calling a method the adapter does not have.
 *
 * Adding a provider is: write the adapter, register it here. Nothing in
 * lib/core/ changes.
 */

import type { ProviderAdapter, ProviderCapabilities } from "./types";

// Adapters are registered as they are implemented. GitHub, AWS, then MongoDB
// Atlas — chosen because source control, cloud infrastructure and a managed
// database exercise three genuinely different shapes of integration.
const adapters = new Map<string, ProviderAdapter<never>>();

function register<T>(adapter: ProviderAdapter<T>): void {
  if (adapters.has(adapter.id)) {
    throw new Error(`Duplicate provider registration: ${adapter.id}`);
  }
  adapters.set(adapter.id, adapter as ProviderAdapter<never>);
}

/** Look up an adapter, or undefined for a provider slug Forge does not know. */
export function getAdapter(providerId: string): ProviderAdapter<never> | undefined {
  return adapters.get(providerId);
}

/** Look up an adapter, throwing if absent. Use when the slug came from our DB. */
export function requireAdapter(providerId: string): ProviderAdapter<never> {
  const adapter = adapters.get(providerId);
  if (!adapter) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return adapter;
}

export function listAdapters(): ProviderAdapter<never>[] {
  return [...adapters.values()];
}

/**
 * Capability check used by the sync engine before scheduling work, and by the
 * UI before rendering a cost or activity column that a provider cannot fill.
 */
export function supports(
  providerId: string,
  capability: keyof ProviderCapabilities,
): boolean {
  return adapters.get(providerId)?.capabilities[capability] ?? false;
}

/** Serializable provider catalogue for `GET /api/providers`. No secrets. */
export function providerCatalogue() {
  return listAdapters().map((a) => ({
    id: a.id,
    displayName: a.displayName,
    capabilities: a.capabilities,
  }));
}

export { register };
