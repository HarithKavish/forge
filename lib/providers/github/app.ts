/**
 * GitHub App authentication.
 *
 * Replaces the OAuth App flow, which forced the `repo` scope — GitHub offers no
 * read-only variant of it, so every connection granted write access Forge never
 * used. A GitHub App can ask for `Contents: Read-only` and `Metadata:
 * Read-only` instead, and the installer chooses which repositories to share.
 * That is the difference between a consent screen an external user will accept
 * and one they will not.
 *
 * There is also no per-user secret. The app's private key lives in the
 * environment; a connection stores only an installation id, and a short-lived
 * installation token is minted for each run. Nothing long-lived is held per
 * user, so there is nothing per user to leak.
 */

import { createSign } from "node:crypto";

import { ProviderAuthError, ProviderUnavailableError } from "../errors";

const API = "https://api.github.com";

export interface GitHubAppConfig {
  appId: string;
  /** The app's URL name, used to build the install link. */
  slug: string;
  privateKey: string;
}

export function githubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  const slug = process.env.GITHUB_APP_SLUG;
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !slug || !rawKey) {
    throw new Error(
      "GITHUB_APP_ID, GITHUB_APP_SLUG and GITHUB_APP_PRIVATE_KEY must be set. See docs/INTEGRATIONS.md.",
    );
  }

  // A PEM has real newlines, which most secret stores will not hold. Accept
  // either the literal-\n form or base64, so pasting it anywhere works.
  let privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  if (!privateKey.includes("BEGIN")) {
    privateKey = Buffer.from(privateKey, "base64").toString("utf8");
  }

  return { appId, slug, privateKey };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Signs the short-lived JWT that proves Forge is this app.
 *
 * Hand-rolled with node:crypto rather than pulling in a JWT library: it is one
 * RS256 signature over two JSON objects, and `jose` is only present here as a
 * transitive dependency of Auth.js, which is not something to build on.
 */
export function appJwt(): string {
  const { appId, privateKey } = githubAppConfig();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      // Backdated by a minute to tolerate clock skew, which GitHub rejects.
      iat: now - 60,
      exp: now + 540, // GitHub caps app JWTs at 10 minutes.
      iss: appId,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();

  return `${header}.${payload}.${base64url(signer.sign(privateKey))}`;
}

async function appRequest<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${appJwt()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Forge (forge.harithkavish.com)",
      },
      cache: "no-store",
    });
  } catch (cause) {
    throw new ProviderUnavailableError("Could not reach the GitHub API.", "github", cause);
  }

  if (response.status === 401 || response.status === 404) {
    // 404 here usually means the installation was uninstalled at GitHub.
    throw new ProviderAuthError(
      "GitHub rejected this installation. It may have been uninstalled or the app's key rotated.",
      "github",
    );
  }
  if (!response.ok) {
    throw new ProviderUnavailableError(`GitHub returned ${response.status}.`, "github");
  }

  return (await response.json()) as T;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

/**
 * Mints an installation token, valid one hour.
 *
 * Minted per run rather than stored: it expires quickly, and keeping it would
 * mean holding a per-user secret for no benefit.
 */
export async function installationToken(installationId: string): Promise<InstallationToken> {
  const result = await appRequest<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    "POST",
  );
  return { token: result.token, expiresAt: new Date(result.expires_at) };
}

export interface InstallationAccount {
  installationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
}

/** Who an installation belongs to, and whether they shared all repos or some. */
export async function installationAccount(
  installationId: string,
): Promise<InstallationAccount> {
  const result = await appRequest<{
    id: number;
    account: { id: number; login: string; type: string } | null;
    repository_selection: string;
  }>(`/app/installations/${encodeURIComponent(installationId)}`);

  if (!result.account) {
    throw new ProviderAuthError(
      "That GitHub installation has no account attached.",
      "github",
    );
  }

  return {
    installationId: String(result.id),
    // The numeric id, not the login: logins can be renamed, ids cannot.
    accountId: String(result.account.id),
    accountLogin: result.account.login,
    accountType: result.account.type,
    repositorySelection: result.repository_selection,
  };
}

/** Where to send someone to install the app on their account or organisation. */
export function githubInstallUrl(state: string): string {
  const { slug } = githubAppConfig();
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}
