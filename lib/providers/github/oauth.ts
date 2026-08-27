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

import { beginOAuthState, consumeOAuthState } from "../oauth-state";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";


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
 * page either. See lib/providers/oauth-state.ts.
 */
export async function beginGitHubAuthorization(
  origin: string,
  returnTo: string,
): Promise<string> {
  const { clientId } = githubOAuthConfig();
  const nonce = await beginOAuthState("github", returnTo);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", githubCallbackUrl(origin));
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("state", nonce);
  url.searchParams.set("allow_signup", "false");

  return url.toString();
}

/** Verifies and consumes the state GitHub echoed back. */
export async function consumeGitHubState(received: string | null) {
  return consumeOAuthState("github", received);
}

export interface GitHubTokenResponse {
  accessToken: string;
  scope?: string;
  tokenType?: string;
  /**
   * Present only when the OAuth App has "Expire user access tokens" enabled,
   * which is GitHub's more secure default. Without it the access token never
   * expires and there is nothing to refresh.
   */
  refreshToken?: string;
  /** Access token expiry — typically 8 hours. */
  expiresAt?: Date;
  /** Refresh token expiry — typically 6 months. */
  refreshTokenExpiresAt?: Date;
}

interface RawTokenPayload {
  access_token?: string;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

function toTokenResponse(payload: RawTokenPayload): GitHubTokenResponse {
  if (payload.error || !payload.access_token) {
    // GitHub's description is safe to surface; it never contains the secret.
    throw new Error(
      payload.error_description ?? payload.error ?? "No access token returned.",
    );
  }

  const now = Date.now();
  return {
    accessToken: payload.access_token,
    scope: payload.scope,
    tokenType: payload.token_type,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in
      ? new Date(now + payload.expires_in * 1000)
      : undefined,
    refreshTokenExpiresAt: payload.refresh_token_expires_in
      ? new Date(now + payload.refresh_token_expires_in * 1000)
      : undefined,
  };
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

  return toTokenResponse((await response.json()) as RawTokenPayload);
}

/**
 * Exchanges a refresh token for a new access token.
 *
 * Runs before a credential expires rather than after a 401, so a sync is never
 * spent discovering that the token died.
 */
export async function refreshGitHubToken(
  refreshToken: string,
): Promise<GitHubTokenResponse> {
  const { clientId, clientSecret } = githubOAuthConfig();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub token refresh failed with ${response.status}.`);
  }

  return toTokenResponse((await response.json()) as RawTokenPayload);
}
