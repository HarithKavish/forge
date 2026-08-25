/**
 * GitHub adapter.
 *
 * The first real implementation of ProviderAdapter, and the test of whether the
 * abstraction holds: it talks only to GitHub's REST API and returns plain
 * normalized objects. It does not import the database, does not know what a
 * project is, and does not decide whether a repository is unused.
 *
 * Capabilities are honest. GitHub exposes no infrastructure cost, so `cost` is
 * false and the UI renders "not supported" rather than an empty figure.
 */

import { z } from "zod";

import {
  ProviderAuthError,
  ProviderPermissionError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from "../errors";
import { refreshGitHubToken } from "./oauth";
import type {
  AccountIdentity,
  RefreshedCredentials,
  DiscoveredResource,
  ProviderAdapter,
  ProviderContext,
  ResourceRef,
  StatusLevel,
} from "../types";

const API = "https://api.github.com";

/** What Forge stores for a GitHub connection. OAuth gives us a bearer token. */
export const githubCredentialSchema = z.object({
  accessToken: z.string().min(1),
  /** Scopes GitHub actually granted, which can be narrower than requested. */
  scope: z.string().optional(),
  tokenType: z.string().optional(),
  /**
   * Only issued when the OAuth App expires access tokens. Absent means the
   * access token is permanent and there is nothing to refresh.
   */
  refreshToken: z.string().optional(),
  refreshTokenExpiresAt: z.string().optional(),
});

export type GitHubCredentials = z.infer<typeof githubCredentialSchema>;

/** Only the fields Forge uses. GitHub returns far more. */
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  size: number;
  stargazers_count: number;
  open_issues_count: number;
  visibility?: string;
  owner: { login: string; type: string };
}

async function githubFetch(
  path: string,
  ctx: ProviderContext<GitHubCredentials>,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path.startsWith("http") ? path : API + path, {
      headers: {
        Authorization: "Bearer " + ctx.credentials.accessToken,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Forge (forge.harithkavish.com)",
      },
      signal: ctx.signal,
      cache: "no-store",
    });
  } catch (cause) {
    // Network-level failure. Retryable, and must never be read as "the
    // repositories are gone".
    throw new ProviderUnavailableError(
      "Could not reach the GitHub API.",
      "github",
      cause,
    );
  }

  if (response.ok) return response;

  // 401 means the token is dead; 403 is either rate limiting or a missing
  // scope, and those need very different handling.
  if (response.status === 401) {
    throw new ProviderAuthError(
      "GitHub rejected the stored token. It may have been revoked.",
      "github",
    );
  }

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
      const seconds = reset
        ? Math.max(1, reset - Math.floor(Date.now() / 1000))
        : undefined;
      throw new ProviderRateLimitError(
        "GitHub rate limit reached.",
        "github",
        seconds,
      );
    }
    throw new ProviderPermissionError(
      "GitHub refused the request. The token is missing a required scope.",
      "github",
      "repo",
    );
  }

  throw new ProviderUnavailableError(
    "GitHub returned " + response.status + ".",
    "github",
  );
}

/** Follows RFC 5988 `Link` headers rather than guessing at page counts. */
function nextPageUrl(response: Response): string | undefined {
  const link = response.headers.get("link");
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const [urlPart, relPart] = part.split(";");
    if (relPart && relPart.includes('rel="next"')) {
      return urlPart ? urlPart.trim().replace(/^<|>$/g, "") : undefined;
    }
  }
  return undefined;
}

/**
 * Repository state, mapped onto Forge's semantic scale.
 *
 * "Archived" is a deliberate choice by the owner, not a fault, so it is a
 * warning rather than an error — it means "look at this", not "something broke".
 */
function repoHealth(repo: GitHubRepo): StatusLevel {
  if (repo.disabled) return "error";
  if (repo.archived) return "warning";
  return "healthy";
}

export const githubAdapter: ProviderAdapter<GitHubCredentials> = {
  id: "github",
  displayName: "GitHub",

  capabilities: {
    resourceDiscovery: true,
    resourceStatus: true,
    // `pushed_at` is a genuine usage signal, so this is not a hollow true.
    activity: true,
    // GitHub bills per seat, not per repository. Forge will not invent one.
    cost: false,
    managementUrl: true,
  },

  credentialSchema: githubCredentialSchema,

  async authenticate(ctx) {
    const response = await githubFetch("/user", ctx);
    const user = (await response.json()) as {
      id: number;
      login: string;
      name: string | null;
      type: string;
    };

    const identity: AccountIdentity = {
      // GitHub's numeric id, not the login: logins can be renamed, ids cannot.
      externalAccountId: String(user.id),
      displayName: user.name ? user.name + " (@" + user.login + ")" : "@" + user.login,
      settings: {
        login: user.login,
        accountType: user.type,
        grantedScope: ctx.credentials.scope ?? "",
      },
    };
    return identity;
  },

  /**
   * Streams every repository the token can see — owned, collaborator, and via
   * org membership — page by page, so a large account never has to be held in
   * memory all at once.
   */
  async *discoverResources(ctx) {
    let url: string | undefined =
      "/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=full_name";

    while (url) {
      const response: Response = await githubFetch(url, ctx);
      const repos = (await response.json()) as GitHubRepo[];

      for (const repo of repos) {
        const discovered: DiscoveredResource = {
          // Numeric id, stable across renames and transfers.
          providerResourceId: String(repo.id),
          resourceType: "github.repository",
          name: repo.full_name,
          providerStatus: repo.archived
            ? "archived"
            : repo.disabled
              ? "disabled"
              : "active",
          healthStatus: repoHealth(repo),
          providerCreatedAt: new Date(repo.created_at),
          /**
           * `pushed_at` is the last commit — real evidence of use.
           * `updated_at` is deliberately not used: it moves when metadata like
           * the description changes, which would make an untouched repository
           * look active.
           */
          lastActivityAt: repo.pushed_at ? new Date(repo.pushed_at) : undefined,
          managementUrl: repo.html_url,
          metadata: {
            visibility: repo.visibility ?? (repo.private ? "private" : "public"),
            owner: repo.owner.login,
            ownerType: repo.owner.type,
            defaultBranch: repo.default_branch,
            language: repo.language ?? "—",
            fork: String(repo.fork),
            archived: String(repo.archived),
            sizeKb: String(repo.size),
            stars: String(repo.stargazers_count),
            openIssues: String(repo.open_issues_count),
            description: repo.description ?? "",
          },
        };
        yield discovered;
      }

      url = nextPageUrl(response);
    }
  },

  async getResourceStatus(ctx, resource) {
    const response = await githubFetch(
      "/repositories/" + resource.providerResourceId,
      ctx,
    );
    const repo = (await response.json()) as GitHubRepo;
    return {
      healthStatus: repoHealth(repo),
      providerStatus: repo.archived
        ? "archived"
        : repo.disabled
          ? "disabled"
          : "active",
    };
  },

  async getActivity(ctx, resource, since) {
    const response = await githubFetch(
      "/repositories/" +
        resource.providerResourceId +
        "/commits?per_page=100&since=" +
        since.toISOString(),
      ctx,
    );
    const commits = (await response.json()) as {
      sha: string;
      commit: { author: { date: string } | null };
    }[];

    return commits
      .map((commit) => commit.commit?.author?.date)
      .filter((date): date is string => Boolean(date))
      .map((date) => ({ signal: "github.push", observedAt: new Date(date) }));
  },

  /**
   * Only meaningful when the OAuth App issues expiring tokens. Without a
   * refresh token this throws rather than silently returning a dead credential,
   * so the failure is visible as "reconnect" instead of a mysterious 401.
   */
  async refreshCredentials(credentials): Promise<RefreshedCredentials<GitHubCredentials>> {
    if (!credentials.refreshToken) {
      throw new ProviderAuthError(
        "This GitHub connection has no refresh token. Reconnect the account.",
        "github",
      );
    }

    const token = await refreshGitHubToken(credentials.refreshToken);

    return {
      credentials: {
        accessToken: token.accessToken,
        // GitHub rotates the refresh token on use; keep the new one.
        refreshToken: token.refreshToken ?? credentials.refreshToken,
        refreshTokenExpiresAt:
          token.refreshTokenExpiresAt?.toISOString() ??
          credentials.refreshTokenExpiresAt,
        scope: token.scope ?? credentials.scope,
        tokenType: token.tokenType ?? credentials.tokenType,
      },
      expiresAt: token.expiresAt,
    };
  },

  getManagementUrl(resource: ResourceRef) {
    // A pure template — no API call — so the inventory renders links for free.
    return resource.name ? "https://github.com/" + resource.name : undefined;
  },
};
