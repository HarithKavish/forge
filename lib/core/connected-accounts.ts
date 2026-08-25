/**
 * Connected provider accounts.
 *
 * Every function takes a `workspaceId` and every query filters on it. That is
 * the whole tenancy model: a `where` clause missing it is a cross-tenant leak,
 * so the rule is mechanical rather than a judgement call at each call site.
 *
 * Nothing here ever selects from `provider_credentials` — secrets live in their
 * own table precisely so that listing integrations cannot leak one.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connectedAccounts } from "@/lib/db/schema";
import type { SyncStatus } from "@/lib/data/types";
import { deleteCredential } from "./credentials";

export type ConnectedAccountRow = typeof connectedAccounts.$inferSelect;

export async function listConnectedAccounts(
  workspaceId: string,
): Promise<ConnectedAccountRow[]> {
  return db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, workspaceId))
    .orderBy(desc(connectedAccounts.createdAt));
}

export async function getConnectedAccount(
  workspaceId: string,
  accountId: string,
): Promise<ConnectedAccountRow | undefined> {
  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.id, accountId),
      ),
    )
    .limit(1);
  return row;
}

export async function listAccountsForProvider(
  workspaceId: string,
  provider: string,
): Promise<ConnectedAccountRow[]> {
  return db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, provider),
      ),
    );
}

/**
 * Creates the account, or returns the existing one if this provider identity is
 * already connected to this workspace.
 *
 * Reconnecting must not fork a second account with a duplicate set of
 * resources, so the unique index on (workspace, provider, external id) is what
 * enforces that rather than a prior existence check.
 */
export async function upsertConnectedAccount(
  workspaceId: string,
  input: {
    provider: string;
    displayName: string;
    externalAccountId: string;
    settings?: Record<string, unknown>;
  },
): Promise<ConnectedAccountRow> {
  await db
    .insert(connectedAccounts)
    .values({
      workspaceId,
      provider: input.provider,
      displayName: input.displayName,
      externalAccountId: input.externalAccountId,
      settings: input.settings,
      status: "connected",
    })
    .onConflictDoUpdate({
      target: [
        connectedAccounts.workspaceId,
        connectedAccounts.provider,
        connectedAccounts.externalAccountId,
      ],
      set: {
        displayName: input.displayName,
        settings: input.settings,
        status: "connected",
        // A successful reconnect clears whatever the last failure was.
        lastSyncError: null,
        updatedAt: new Date(),
      },
    });

  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, input.provider),
        eq(connectedAccounts.externalAccountId, input.externalAccountId),
      ),
    )
    .limit(1);

  if (!row) throw new Error("Failed to persist the connected account");
  return row;
}

/** Records the outcome of a sync run. Error text must never contain a secret. */
export async function recordSyncResult(
  workspaceId: string,
  accountId: string,
  result: { status: SyncStatus; error?: string; needsReauth?: boolean },
): Promise<void> {
  await db
    .update(connectedAccounts)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: result.status,
      lastSyncError: result.error ?? null,
      status: result.needsReauth ? "needs_reauth" : "connected",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.id, accountId),
      ),
    );
}

/**
 * Disconnects an account: the credential is destroyed and the account row goes
 * with it. Resources cascade, because inventory Forge can no longer verify is
 * worse than no inventory.
 */
export async function deleteConnectedAccount(
  workspaceId: string,
  accountId: string,
): Promise<void> {
  const account = await getConnectedAccount(workspaceId, accountId);
  if (!account) return;

  await deleteCredential(accountId);
  await db
    .delete(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.id, accountId),
      ),
    );
}
