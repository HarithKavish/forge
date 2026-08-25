/**
 * Envelope encryption for provider credentials.
 *
 * AES-256-GCM with a versioned keyring. Two properties matter:
 *
 *  - **Rotation.** Ciphertexts record the key version that produced them, so a
 *    new key can be introduced and old rows re-encrypted in the background
 *    without downtime or a big-bang migration.
 *  - **Binding.** Each ciphertext is authenticated against the id of the
 *    connected account that owns it (GCM additional authenticated data).
 *    Copying one workspace's credential row onto another account fails to
 *    decrypt rather than silently granting access to someone else's provider.
 *
 * Plaintext is returned as a string and should be held only for the duration of
 * a provider call. Never log it, never put it in an API response.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { encryptionKeyring } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the GCM standard.

export interface EncryptedSecret {
  /** base64(iv).base64(ciphertext).base64(authTag) */
  ciphertext: string;
  keyVersion: number;
}

type Keyring = Map<number, Buffer>;

let cachedKeyring: Keyring | undefined;

/**
 * Parse `FORGE_ENCRYPTION_KEYS` — a comma-separated list of `version:base64key`.
 * A bare base64 key with no version prefix is accepted as version 1 so local
 * setup stays a one-liner.
 */
function keyring(): Keyring {
  if (cachedKeyring) return cachedKeyring;

  const raw = encryptionKeyring();
  const ring: Keyring = new Map();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(":");
    const hasVersion = separator > 0;
    const version = hasVersion ? Number(trimmed.slice(0, separator)) : 1;
    const encoded = hasVersion ? trimmed.slice(separator + 1) : trimmed;

    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        `Invalid FORGE_ENCRYPTION_KEYS: key version must be a positive integer`,
      );
    }

    const key = Buffer.from(encoded, "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Invalid FORGE_ENCRYPTION_KEYS: key v${version} must decode to ${KEY_BYTES} bytes, got ${key.length}`,
      );
    }
    if (ring.has(version)) {
      throw new Error(
        `Invalid FORGE_ENCRYPTION_KEYS: duplicate key version ${version}`,
      );
    }

    ring.set(version, key);
  }

  if (ring.size === 0) {
    throw new Error("FORGE_ENCRYPTION_KEYS contains no usable keys");
  }

  cachedKeyring = ring;
  return ring;
}

/** The highest version in the keyring encrypts all new secrets. */
function currentKeyVersion(): number {
  return Math.max(...keyring().keys());
}

function keyFor(version: number): Buffer {
  const key = keyring().get(version);
  if (!key) {
    throw new Error(
      `Cannot decrypt: key version ${version} is not in FORGE_ENCRYPTION_KEYS. ` +
        `Retired keys must stay listed until their rows are re-encrypted.`,
    );
  }
  return key;
}

/**
 * Encrypt a provider secret.
 *
 * @param plaintext  Typically `JSON.stringify(credentials)`.
 * @param bindingId  The owning `connected_accounts.id`. The same value must be
 *                   supplied to {@link decryptSecret} or decryption fails.
 */
export function encryptSecret(
  plaintext: string,
  bindingId: string,
): EncryptedSecret {
  const version = currentKeyVersion();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFor(version), iv);
  cipher.setAAD(Buffer.from(bindingId, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: [
      iv.toString("base64"),
      encrypted.toString("base64"),
      authTag.toString("base64"),
    ].join("."),
    keyVersion: version,
  };
}

/**
 * Decrypt a provider secret.
 *
 * Throws if the payload was tampered with, was encrypted for a different
 * account, or was produced by a key no longer in the ring.
 */
export function decryptSecret(
  ciphertext: string,
  keyVersion: number,
  bindingId: string,
): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret");
  }
  const [ivPart, dataPart, tagPart] = parts as [string, string, string];

  const decipher = createDecipheriv(
    ALGORITHM,
    keyFor(keyVersion),
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAAD(Buffer.from(bindingId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  // Throws on authentication failure — do not catch and return a partial value.
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when a stored secret should be re-encrypted under the newest key. */
export function needsRotation(keyVersion: number): boolean {
  return keyVersion < currentKeyVersion();
}

/** Constant-time compare for cron/webhook shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Generate a keyring entry for setup docs: `node -e "..."`. */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
