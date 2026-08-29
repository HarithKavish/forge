/**
 * Cloudflare connection OAuth.
 *
 * Cloudflare shipped self-managed OAuth clients in June 2026, so a third-party
 * application can now register its own client and ask a user for scoped,
 * read-only access — no token pasting, and no reuse of Wrangler's first-party
 * client id.
 *
 * Endpoints are not published in the OAuth guide, so they are configurable.
 * The defaults are the ones the dashboard actually serves, confirmed by the
 * standard `invalid_client` response an unregistered client id receives.
 *
 * PKCE is used because it costs nothing and removes the value of an intercepted
 * authorization code.
 */

const DEFAULT_AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
const DEFAULT_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";

export interface CloudflareOAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  /**
   * Scope names match Cloudflare API token permission names. They are not
   * hardcoded: the list a client may request is fixed when the client is
   * registered, so this mirrors whatever was chosen there.
   */
  scopes: string;
}

export function cloudflareOAuthConfig(): CloudflareOAuthConfig {
  const clientId = process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET;

  const scopes = process.env.CLOUDFLARE_OAUTH_SCOPES ?? "";

  if (!clientId || !clientSecret || !scopes.trim()) {
    throw new Error(
      "CLOUDFLARE_OAUTH_CLIENT_ID, CLOUDFLARE_OAUTH_CLIENT_SECRET and " +
        "CLOUDFLARE_OAUTH_SCOPES must be set. See docs/INTEGRATIONS.md.",
    );
  }

  return {
    clientId,
    clientSecret,
    authorizeUrl: process.env.CLOUDFLARE_OAUTH_AUTHORIZE_URL ?? DEFAULT_AUTHORIZE_URL,
    tokenUrl: process.env.CLOUDFLARE_OAUTH_TOKEN_URL ?? DEFAULT_TOKEN_URL,
    /**
     * Cloudflare does NOT fall back to the client's registered scopes when the
     * authorize request omits `scope` -- it grants nothing, and the consent
     * screen renders "0 total permissions" with no permission to tick, so the
     * user cannot complete it. The scope list is therefore mandatory.
     *
     * Names must be a subset of what the OAuth client was registered with:
     * anything else is rejected at the authorize step with `invalid_scope`.
     * Include `offline_access` to receive a refresh token, otherwise the
     * connection expires and needs a manual reconnect.
     */
    scopes: scopes.trim(),
  };
}

/** The redirect URI registered with the client. Derived, never hardcoded. */
export function cloudflareCallbackUrl(origin: string): string {
  return new URL("/api/integrations/cloudflare/callback", origin).toString();
}

export function cloudflareAuthorizeUrl(
  origin: string,
  state: string,
  codeChallenge: string,
): string {
  const config = cloudflareOAuthConfig();
  const url = new URL(config.authorizeUrl);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", cloudflareCallbackUrl(origin));
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

export interface CloudflareTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

interface RawToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function toTokenResponse(payload: RawToken): CloudflareTokenResponse {
  if (payload.error || !payload.access_token) {
    // The description is safe to surface; it never contains the secret.
    throw new Error(
      payload.error_description ?? payload.error ?? "No access token returned.",
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000)
      : undefined,
    scope: payload.scope,
  };
}

/** Client credentials go in the POST body, never in a URL. */
async function postToken(body: URLSearchParams): Promise<CloudflareTokenResponse> {
  const { tokenUrl } = cloudflareOAuthConfig();

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok && response.status >= 500) {
    throw new Error(`Cloudflare token endpoint returned ${response.status}.`);
  }

  return toTokenResponse((await response.json()) as RawToken);
}

export async function exchangeCloudflareCode(
  code: string,
  codeVerifier: string,
  origin: string,
): Promise<CloudflareTokenResponse> {
  const { clientId, clientSecret } = cloudflareOAuthConfig();

  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cloudflareCallbackUrl(origin),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
  );
}

export async function refreshCloudflareToken(
  refreshToken: string,
): Promise<CloudflareTokenResponse> {
  const { clientId, clientSecret } = cloudflareOAuthConfig();

  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
}
