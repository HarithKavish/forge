/**
 * OAuth `state` handling, shared by every provider that uses OAuth.
 *
 * This is CSRF-critical code, so it exists once rather than being copied per
 * provider. The state is both the anti-forgery token and where to send the user
 * afterwards, so a forged callback can neither complete a connection nor choose
 * the landing page.
 */

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

/** Ten minutes is ample for a consent screen and short enough to be useless later. */
const STATE_MAX_AGE = 60 * 10;

function cookieName(provider: string): string {
  return `forge.oauth_state.${provider}`;
}

/** Issues a nonce, remembers it alongside the return path, returns the nonce. */
export async function beginOAuthState(
  provider: string,
  returnTo: string,
): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const store = await cookies();

  store.set(cookieName(provider), `${nonce}:${returnTo}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });

  return nonce;
}

export interface StateCheck {
  ok: boolean;
  returnTo: string;
}

/**
 * Verifies the state the provider echoed back, and consumes it.
 *
 * Single use: the cookie is cleared whether or not it matched, so a replayed
 * callback cannot succeed.
 */
export async function consumeOAuthState(
  provider: string,
  received: string | null,
): Promise<StateCheck> {
  const fallback = `/integrations/${provider}`;
  const store = await cookies();
  const stored = store.get(cookieName(provider))?.value;
  store.delete(cookieName(provider));

  if (!stored || !received) return { ok: false, returnTo: fallback };

  const separator = stored.indexOf(":");
  const nonce = separator === -1 ? stored : stored.slice(0, separator);
  const returnTo = separator === -1 ? fallback : stored.slice(separator + 1);

  // Same-origin paths only; a stored absolute URL would be an open redirect.
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : fallback;

  return { ok: nonce === received, returnTo: safeReturn };
}
