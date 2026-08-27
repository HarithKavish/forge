/**
 * Vercel connection OAuth.
 *
 * Vercel calls these Integrations rather than OAuth apps, but the flow is
 * ordinary OAuth: the user installs the integration against their personal
 * account or a team, and Forge receives a code to exchange for a token scoped
 * to that installation.
 *
 * This is what makes Vercel workable on a multi-user platform — every user
 * authorises their own account, and nobody has to create or paste a token.
 * Read-only permissions are chosen once, by whoever registers the integration
 * in the Vercel console, and apply to every installation.
 */

const TOKEN_URL = "https://api.vercel.com/v2/oauth/access_token";

export interface VercelOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** The integration's URL slug, from the Vercel Integration Console. */
  slug: string;
}

export function vercelOAuthConfig(): VercelOAuthConfig {
  const clientId = process.env.VERCEL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.VERCEL_OAUTH_CLIENT_SECRET;
  const slug = process.env.VERCEL_INTEGRATION_SLUG;

  if (!clientId || !clientSecret || !slug) {
    throw new Error(
      "VERCEL_OAUTH_CLIENT_ID, VERCEL_OAUTH_CLIENT_SECRET and VERCEL_INTEGRATION_SLUG must be set. See docs/INTEGRATIONS.md.",
    );
  }
  return { clientId, clientSecret, slug };
}

/** The redirect URI registered with the integration. Derived, never hardcoded. */
export function vercelCallbackUrl(origin: string): string {
  return new URL("/api/integrations/vercel/callback", origin).toString();
}

/**
 * Where to send the user to install the integration.
 *
 * Vercel drives installation from its own marketplace page rather than a bare
 * `/authorize` endpoint, so the "connect" link points there and carries the
 * state through.
 */
export function vercelInstallUrl(state: string): string {
  const { slug } = vercelOAuthConfig();
  const url = new URL(`https://vercel.com/integrations/${slug}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface VercelTokenResponse {
  accessToken: string;
  /** Present when the integration was installed against a team. */
  teamId?: string;
  installationId?: string;
  userId?: string;
}

/** Exchanges the installation code for an access token, server-side only. */
export async function exchangeVercelCode(
  code: string,
  origin: string,
): Promise<VercelTokenResponse> {
  const { clientId, clientSecret } = vercelOAuthConfig();

  // Vercel expects form encoding here, not JSON.
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: vercelCallbackUrl(origin),
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Vercel token exchange failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    team_id?: string | null;
    installation_id?: string;
    user_id?: string;
    error?: string;
    error_description?: string;
  };

  if (payload.error || !payload.access_token) {
    // Vercel's description is safe to surface; it never contains the secret.
    throw new Error(
      payload.error_description ?? payload.error ?? "No access token returned.",
    );
  }

  return {
    accessToken: payload.access_token,
    teamId: payload.team_id ?? undefined,
    installationId: payload.installation_id,
    userId: payload.user_id,
  };
}
