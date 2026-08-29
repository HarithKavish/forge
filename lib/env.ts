/**
 * Validated server environment.
 *
 * Server-only. Nothing here may be imported from a client component.
 *
 * Validation is lazy — on first access, not at module load — so `next build`
 * and any code path that never touches the database do not require a full
 * production environment to be present.
 *
 * Only variables this codebase reads directly are validated here. Auth.js
 * reads AUTH_SECRET and the identity provider's client credentials itself and
 * raises its own errors, so duplicating those checks would only produce two
 * different error messages for one mistake.
 */

import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a Postgres connection URL"),

  /**
   * Credential encryption keyring, newest first:
   *   FORGE_ENCRYPTION_KEYS="2:<base64-32-bytes>,1:<base64-32-bytes>"
   *
   * Optional until a provider integration actually stores a credential. Making
   * it required today would block sign-in on a key nothing uses yet;
   * lib/crypto/secrets.ts raises a precise error if it is ever needed and
   * absent.
   */
  FORGE_ENCRYPTION_KEYS: z.string().min(1).optional(),

  /** Shared secret for the cron-triggered sync drain endpoint. */
  CRON_SECRET: z.string().min(16).optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Names the variables but never prints their values.
    throw new Error(`Invalid server environment:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** The credential keyring, or a precise error explaining what is missing. */
export function encryptionKeyring(): string {
  const keys = env().FORGE_ENCRYPTION_KEYS;
  if (!keys) {
    throw new Error(
      "FORGE_ENCRYPTION_KEYS is not set. It is required before Forge can store " +
        "a provider credential. Generate one with:\n" +
        "  node -e \"console.log('1:' + require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return keys;
}
