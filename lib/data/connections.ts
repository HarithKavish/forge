/**
 * Simulated provider connections.
 *
 * Deliberately credential-free. A mock "connect" form with real-looking
 * credential fields is a genuine hazard — someone will eventually paste a live
 * AWS key into it, and this build has no encrypted credential path to receive
 * it. So connecting in this preview records that an account exists and nothing
 * else; no secret is requested, transmitted or stored.
 *
 * The real flow will post a credential to a server action that validates it
 * against the provider, encrypts it via lib/crypto/secrets.ts and writes it to
 * `provider_credentials`. This module disappears at that point.
 */

import { cookies } from "next/headers";

import { decodeCookieValue, encodeCookieValue } from "@/lib/auth/cookies";
import type { ConnectedAccount } from "./types";

const CONNECTIONS_COOKIE = "forge.connections";
const MAX_AGE = 60 * 60 * 24 * 30;

interface ConnectionState {
  /** Accounts added during the demo. */
  added: {
    id: string;
    provider: string;
    displayName: string;
    externalAccountId: string;
    createdAt: string;
  }[];
  /** Seeded account ids the user disconnected. */
  removed: string[];
}

const EMPTY: ConnectionState = { added: [], removed: [] };

export async function getConnectionState(): Promise<ConnectionState> {
  const store = await cookies();
  const value = decodeCookieValue<ConnectionState>(
    store.get(CONNECTIONS_COOKIE)?.value,
  );
  if (!value || !Array.isArray(value.added) || !Array.isArray(value.removed)) {
    return EMPTY;
  }
  return value;
}

async function write(state: ConnectionState): Promise<void> {
  const store = await cookies();
  store.set(CONNECTIONS_COOKIE, encodeCookieValue(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function addSimulatedConnection(
  provider: string,
  displayName: string,
): Promise<void> {
  const state = await getConnectionState();
  const suffix = Date.now().toString(36).slice(-5);

  await write({
    ...state,
    added: [
      ...state.added,
      {
        id: `acc_sim_${provider}_${suffix}`,
        provider,
        displayName,
        externalAccountId: `simulated-${suffix}`,
        createdAt: new Date().toISOString(),
      },
    ].slice(0, 10),
  });
}

export async function removeConnection(accountId: string): Promise<void> {
  const state = await getConnectionState();
  await write({
    added: state.added.filter((a) => a.id !== accountId),
    removed: state.removed.includes(accountId)
      ? state.removed
      : [...state.removed, accountId],
  });
}

export async function clearConnections(): Promise<void> {
  const store = await cookies();
  store.delete(CONNECTIONS_COOKIE);
}

/** Applies demo connect/disconnect on top of the seeded accounts. */
export function mergeAccounts(
  seeded: ConnectedAccount[],
  state: ConnectionState,
  workspaceId: string,
): ConnectedAccount[] {
  const kept = seeded.filter((a) => !state.removed.includes(a.id));

  const added: ConnectedAccount[] = state.added.map((account) => ({
    id: account.id,
    workspaceId,
    provider: account.provider,
    displayName: account.displayName,
    externalAccountId: account.externalAccountId,
    status: "connected",
    // Nothing has run against this account, so there is no sync to report and
    // no resources to claim it discovered.
    lastSyncStatus: undefined,
    lastSyncAt: undefined,
    createdAt: account.createdAt,
  }));

  return [...kept, ...added];
}
