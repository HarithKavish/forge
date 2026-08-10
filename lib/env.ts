/**
 * Validated server environment.
 *
 * Server-only. Nothing here may be imported from a client component — every
 * value below is a secret except `NEXT_PUBLIC_APP_URL`. Validation happens on
 * first access rather than at module load so `next build` does not require a
 * production keyring to be present.
 */

import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a Postgres connection URL"),

  /** Auth.js session signing secret. Generate with `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  /**
   * Credential encryption keyring, newest first:
   *   FORGE_ENCRYPTION_KEYS="2:<base64-32-bytes>,1:<base64-32-bytes>"
   * The highest version encrypts; older versions stay listed so existing rows
   * remain readable until they are re-encrypted.
   */
  FORGE_ENCRYPTION_KEYS: z
    .string()
    .min(1, "FORGE_ENCRYPTION_KEYS is required to store provider credentials"),

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
    // The message names variables but never prints their values.
    throw new Error(`Invalid server environment:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
