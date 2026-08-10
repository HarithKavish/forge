/**
 * Database client.
 *
 * Neon's HTTP driver is used because Forge runs on serverless functions, where
 * a pooled TCP connection per invocation exhausts Postgres connection limits.
 *
 * Isolation rule: nothing in the app queries these tables directly. All reads
 * and writes go through the tenant-scoped repositories in lib/core/, which
 * require a `workspaceId` resolved from the session. A raw `db` import outside
 * lib/core/ or lib/sync/ is a bug — it is how cross-tenant leaks happen.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  forgeDb?: ReturnType<typeof createClient>;
};

function createClient() {
  return drizzle(neon(env().DATABASE_URL), { schema });
}

// Reuse across hot reloads in development; a fresh client per HMR pass leaks.
export const db = globalForDb.forgeDb ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.forgeDb = db;
}

export { schema };
export type Database = typeof db;
