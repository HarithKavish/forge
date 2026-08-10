/**
 * Server-side session access.
 *
 * Every protected page and layout reads the session through `requireSession()`.
 * When Auth.js lands, the body of these two functions changes and nothing that
 * calls them does.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACCOUNTS_COOKIE,
  SESSION_COOKIE,
  decodeCookieValue,
  isValidSession,
  parseAccounts,
} from "./cookies";
import type { ForgeAccount, ForgeSession } from "./types";

export async function getSession(): Promise<ForgeSession | null> {
  const store = await cookies();
  const value = decodeCookieValue<unknown>(store.get(SESSION_COOKIE)?.value);
  return isValidSession(value) ? value : null;
}

/** Accounts this browser has seen, for the "continue as" picker on /login. */
export async function getKnownAccounts(): Promise<ForgeAccount[]> {
  const store = await cookies();
  return parseAccounts(store.get(ACCOUNTS_COOKIE)?.value);
}

/**
 * Guard for protected pages. Middleware already redirects unauthenticated
 * traffic; this is the second line of defence so a page can never render
 * without a session even if a route slips past the matcher.
 */
export async function requireSession(): Promise<ForgeSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
