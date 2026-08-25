/**
 * GitHub connection OAuth.
 *
 * Separate from sign-in on purpose. Auth.js answers "who is this person";
 * this answers "which GitHub account may Forge read on their behalf". Merging
 * the two would mean the identity provider and the resource provider could
 * never differ — exactly the coupling the architecture avoids.
 *
 * The handshake is implemented here rather than delegated because Auth.js
 * models sign-in, not account linking for a third-party inventory. The parts
 * that matter for safety — a random `state` echoed back and compared, an
 * HttpOnly cookie, no token in any URL — are done explicitly below.
 */

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

export const STATE_COOKIE = "forge.gh_oauth_state";
const STATE_MAX_AGE = 60 * 10; // Ten minutes is ample for a consent screen.

/**
 * `repo` is required to see private repositories. It is broad — GitHub has no
 * read-only variant for private repos in OAuth Apps — so the connect screen
 * says so plainly rather than burying it. `read:org` lets org repositories
 * appear. Forge only ever issues GET requests.
 */
export const GITHUB_SCOPES = "repo read:org read:user";

export function githubOAuthConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must be set. See docs/INTEGRATIONS.md.",
    );
  }
  return { clientId, clientSecret };
}

/** The redirect URI registered with GitHub. Derived, never hardcoded per-env. */
export function githubCallbackUrl(origin: string): string {
  return new URL("/api/integrations/github/callback", origin).toString();
}

/**
 * Creates the authorize URL and stores the matching state.
 *
 * The state is both a CSRF token and where to send the user afterwards, so a
 * forged callback cannot complete a connection and cannot choose the landing
 * page either.
 */
export async function beginGitHubAuthorization(
  origin: string,
  returnTo: string,
): Promise<string> {
  const { clientId } = githubOAuthConfig();
  const nonce = randomBytes(32).toString("base64url");

  const store = await cookies();
  store.set(STATE_COOKIE, `${nonce}:${returnTo}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", githubCallbackUrl(origin));
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("state", nonce);
  // Force the account chooser so a second account can be connected.
  url.searchParams.set("allow_signup", "false");

  return url.toString();
}

export interface StateCheck {
  ok: boolean;
  returnTo: string;
}

/**
 * Verifies the state GitHub echoed back against the cookie, and consumes it.
 *
 * A single-use check: the cookie is cleared whether or not it matched, so a
 * replayed callback cannot succeed.
 */
export async function consumeGitHubState(received: string | null): Promise<StateCheck> {
  const store = await cookies();
  const stored = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!stored || !received) return { ok: false, returnTo: "/integrations/github" };

  const separator = stored.indexOf(":");
  const nonce = separator === -1 ? stored : stored.slice(0, separator);
  const returnTo = separator === -1 ? "/integrations/github" : stored.slice(separator + 1);

  // Same-origin paths only; a stored absolute URL would be an open redirect.
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/integrations/github";

  return { ok: nonce === received, returnTo: safeReturn };
}

export interface GitHubTokenResponse {
  accessToken: string;
  scope?: string;
  tokenType?: string;
}

/** Exchanges the authorization code for an access token, server-side only. */
export async function exchangeGitHubCode(
  code: string,
  origin: string,
): Promise<GitHubTokenResponse> {
  const { clientId, clientSecret } = githubOAuthConfig();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: githubCallbackUrl(origin),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (payload.error || !payload.access_token) {
    // GitHub's description is safe to surface; it never contains the secret.
    throw new Error(payload.error_description ?? payload.error ?? "No access token returned.");
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope,
    tokenType: payload.token_type,
  };
}
