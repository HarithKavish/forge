/**
 * Provider credential storage.
 *
 * The only module that reads or writes `provider_credentials`. Plaintext exists
 * here and inside an adapter call, and nowhere else — never in a log, never in
 * an API response, never on a connected-account row.
 *
 * Ciphertexts are bound to the connected account that owns them, so a row
 * copied onto another account fails to decrypt rather than silently granting
 * one workspace access to another's provider.
 */

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { providerCredentials } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, needsRotation } from "@/lib/crypto/secrets";

/** Encrypts and stores a credential, replacing any existing one. */
export async function saveCredential(
  connectedAccountId: string,
  credential: unknown,
  expiresAt?: Date,
): Promise<void> {
  const { ciphertext, keyVersion } = encryptSecret(
    JSON.stringify(credential),
    connectedAccountId,
  );

  await db
    .insert(providerCredentials)
    .values({ connectedAccountId, ciphertext, keyVersion, expiresAt })
    .onConflictDoUpdate({
      target: providerCredentials.connectedAccountId,
      set: { ciphertext, keyVersion, expiresAt: expiresAt ?? null, rotatedAt: new Date() },
    });
}

/**
 * Decrypts a credential for the duration of one provider call.
 *
 * Returns null when there is no credential, which is different from a failed
 * decrypt — the latter throws, because silently treating a tampered or
 * mis-keyed row as "not connected" would hide a real problem.
 */
export interface StoredCredential<T> {
  credential: T;
  /** When the provider says it stops working. Absent means it does not expire. */
  expiresAt?: Date;
}

export async function loadCredential<T = unknown>(
  connectedAccountId: string,
): Promise<StoredCredential<T> | null> {
  const [row] = await db
    .select({
      ciphertext: providerCredentials.ciphertext,
      keyVersion: providerCredentials.keyVersion,
      expiresAt: providerCredentials.expiresAt,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.connectedAccountId, connectedAccountId))
    .limit(1);

  if (!row) return null;

  const plaintext = decryptSecret(row.ciphertext, row.keyVersion, connectedAccountId);

  // Re-encrypt under the newest key on the way past. Rotation then happens as a
  // side effect of ordinary use rather than needing a migration.
  if (needsRotation(row.keyVersion)) {
    const rotated = encryptSecret(plaintext, connectedAccountId);
    await db
      .update(providerCredentials)
      .set({
        ciphertext: rotated.ciphertext,
        keyVersion: rotated.keyVersion,
        rotatedAt: new Date(),
      })
      .where(eq(providerCredentials.connectedAccountId, connectedAccountId));
  }

  return {
    credential: JSON.parse(plaintext) as T,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export async function deleteCredential(connectedAccountId: string): Promise<void> {
  await db
    .delete(providerCredentials)
    .where(eq(providerCredentials.connectedAccountId, connectedAccountId));
}
