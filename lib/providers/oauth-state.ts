/**
 * OAuth `state` handling, shared by every provider that uses OAuth.
 *
 * This is CSRF-critical code, so it exists once rather than being copied per
 * provider. The state is both the anti-forgery token and where to send the user
 * afterwards, so a forged callback can neither complete a connection nor choose
 * the landing page.
 *
 * It also carries the PKCE verifier for providers that use it. The verifier
 * must never leave the server, so it lives in the same HttpOnly cookie as the
 * nonce rather than anywhere the browser can read.
 */

import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

/** Ten minutes is ample for a consent screen and short enough to be useless later. */
const STATE_MAX_AGE = 60 * 10;

function cookieName(provider: string): string {
  return `forge.oauth_state.${provider}`;
}

export interface BeginOptions {
  /** Generate a PKCE verifier and return its challenge. */
  pkce?: boolean;
}

export interface BeginResult {
  state: string;
  /** S256 challenge to send on the authorize request, when PKCE was requested. */
  codeChallenge?: string;
}

/** Issues a nonce, remembers it with the return path and any PKCE verifier. */
export async function beginOAuthState(
  provider: string,
  returnTo: string,
  options: BeginOptions = {},
): Promise<BeginResult> {
  const state = randomBytes(32).toString("base64url");
  const verifier = options.pkce ? randomBytes(64).toString("base64url") : "";

  const store = await cookies();
  // nonce | verifier | returnTo — returnTo last, since it is the only part that
  // can itself contain the separator.
  store.set(cookieName(provider), [state, verifier, returnTo].join("|"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });

  return {
    state,
    codeChallenge: options.pkce
      ? createHash("sha256").update(verifier).digest("base64url")
      : undefined,
  };
}

export interface StateCheck {
  ok: boolean;
  returnTo: string;
  codeVerifier?: string;
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

  const [nonce = "", verifier = "", ...rest] = stored.split("|");
  const returnTo = rest.join("|") || fallback;

  // Same-origin paths only; a stored absolute URL would be an open redirect.
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : fallback;

  return {
    ok: nonce === received,
    returnTo: safeReturn,
    codeVerifier: verifier || undefined,
  };
}
