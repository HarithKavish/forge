/**
 * Database client.
 *
 * Neon's HTTP driver is used because Forge runs on serverless functions, where
 * a pooled TCP connection per invocation exhausts Postgres connection limits.
 *
 * Constructed eagerly. A lazy proxy was tried and reverted: the Auth.js Drizzle
 * adapter inspects the client to work out which SQL dialect it is talking to,
 * and a proxy defeats that check ("Unsupported database type"). Wrapping an ORM
 * client is not worth the subtle breakage.
 *
 * Constructing this does not open a connection — the Neon HTTP driver only
 * sends a request when a query runs — but DATABASE_URL must be *present* at
 * build time, because Next imports this module while collecting page data.
 *
 * Isolation rule: queries live in lib/core/ and lib/auth/, scoped by the
 * workspace resolved from the session. A raw `db` import elsewhere is how
 * cross-tenant leaks happen.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "./schema";

function createClient() {
  return drizzle(neon(env().DATABASE_URL), { schema });
}

export type Database = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as { forgeDb?: Database };

// Reuse across hot reloads in development; a fresh client per HMR pass leaks.
export const db: Database = globalForDb.forgeDb ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.forgeDb = db;
}

export { schema };
