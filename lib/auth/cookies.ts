/**
 * Cookie encoding shared by middleware and server code.
 *
 * ---------------------------------------------------------------------------
 * DEMO AUTHENTICATION — NOT SECURE.
 *
 * This payload is base64 of plain JSON. It is *not* signed and *not*
 * encrypted, so anyone can forge one by editing a cookie. That is acceptable
 * only because this phase ships with mock data and no real provider
 * credentials behind the session.
 *
 * Replacing it with Auth.js means swapping the implementation of
 * `getSession()` / the sign-in action for `auth()` and `signIn()`. The cookie
 * names, session shape and middleware logic below stay as they are.
 * ---------------------------------------------------------------------------
 *
 * Runs in the edge runtime, so this module uses only web APIs — no `Buffer`,
 * and no `next/headers` import that would tie it to the Node runtime.
 */

import type { ForgeAccount, ForgeSession } from "./types";

export const SESSION_COOKIE = "forge.session";
/** Accounts remembered on this device, so signing out still offers one click back in. */
export const ACCOUNTS_COOKIE = "forge.accounts";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** base64url of UTF-8 JSON. Unicode-safe, unlike a bare btoa(JSON). */
export function encodeCookieValue(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns null on anything malformed — a corrupt cookie logs the user out. */
export function decodeCookieValue<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** Shape check, so a stale cookie from an older build cannot crash a render. */
export function isValidSession(value: unknown): value is ForgeSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<ForgeSession>;
  return (
    typeof s.userId === "string" &&
    typeof s.email === "string" &&
    typeof s.workspaceId === "string"
  );
}

export function parseAccounts(raw: string | undefined): ForgeAccount[] {
  const value = decodeCookieValue<unknown>(raw);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is ForgeAccount =>
      !!a &&
      typeof a === "object" &&
      typeof (a as ForgeAccount).userId === "string" &&
      typeof (a as ForgeAccount).email === "string",
  );
}
