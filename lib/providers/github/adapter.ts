/**
 * GitHub adapter.
 *
 * Backed by a GitHub App installation rather than an OAuth token. The
 * difference that matters: the app asks for `Contents: Read-only` and
 * `Metadata: Read-only`, so a connection cannot write, and the installer
 * chooses which repositories to share.
 *
 * A connection stores only an installation id. The short-lived installation
 * token is minted per run from the app's private key, so there is no
 * long-lived per-user secret at all.
 */

import { z } from "zod";

import { providerFetch } from "../http";
import { ProviderAuthError } from "../errors";
import { installationAccount, installationToken } from "./app";
import type {
  AccountIdentity,
  DiscoveredResource,
  ProviderAdapter,
  ProviderContext,
  ResourceRef,
  StatusLevel,
} from "../types";

const API = "https://api.github.com";

/** Not a secret — the app's private key is what grants access, and that is in the environment. */
export const githubCredentialSchema = z.object({
  installationId: z.string().min(1),
});

export type GitHubCredentials = z.infer<typeof githubCredentialSchema>;

type Ctx = ProviderContext<GitHubCredentials>;

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
  pushed_at: string | null;
  size: number;
  stargazers_count: number;
  open_issues_count: number;
  visibility?: string;
  owner: { login: string; type: string };
}

/**
 * One token per discovery run, reused across pages.
 *
 * Minting per page would be several needless round trips; minting once per run
 * keeps the token's life as short as the work that needs it.
 */
async function tokenFor(ctx: Ctx): Promise<string> {
  const cached = ctx.settings.__installationToken;
  if (typeof cached === "string" && cached) return cached;

  // A connection made against the old OAuth App has a token but no
  // installation id. Say that plainly rather than failing as a generic auth
  // error the user cannot act on.
  if (!ctx.credentials.installationId) {
    throw new ProviderAuthError(
      "This GitHub connection predates the Forge GitHub App. Disconnect it and connect again to re-establish it.",
      "github",
    );
  }

  const minted = await installationToken(ctx.credentials.installationId);
  // `settings` is per-call scratch space here, never persisted.
  (ctx.settings as Record<string, unknown>).__installationToken = minted.token;
  return minted.token;
}

async function get<T>(ctx: Ctx, path: string): Promise<Response> {
  return providerFetch({
    provider: "github",
    url: path.startsWith("http") ? path : API + path,
    token: await tokenFor(ctx),
    signal: ctx.signal,
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
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
 * Repository state on Forge's scale.
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
    const installation = await installationAccount(ctx.credentials.installationId);

    const identity: AccountIdentity = {
      externalAccountId: installation.accountId,
      displayName:
        installation.accountType === "Organization"
          ? `${installation.accountLogin} (organisation)`
          : `@${installation.accountLogin}`,
      settings: {
        login: installation.accountLogin,
        accountType: installation.accountType,
        installationId: installation.installationId,
        // "all" or "selected" — worth surfacing, since "selected" means the
        // inventory is deliberately partial rather than incomplete.
        repositorySelection: installation.repositorySelection,
      },
    };
    return identity;
  },

  /**
   * Streams every repository the installation can see, page by page, so a large
   * account is never held in memory all at once.
   */
  async *discoverResources(ctx) {
    let url: string | undefined = "/installation/repositories?per_page=100";

    while (url) {
      const response: Response = await get(ctx, url);
      const page = (await response.json()) as { repositories: GitHubRepo[] };

      for (const repo of page.repositories ?? []) {
        yield {
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
          activitySignalAvailable: true,
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
        } satisfies DiscoveredResource;
      }

      url = nextPageUrl(response);
    }
  },

  async getResourceStatus(ctx, resource) {
    const response = await get(ctx, `/repositories/${resource.providerResourceId}`);
    const repo = (await response.json()) as GitHubRepo;
    return {
      healthStatus: repoHealth(repo),
      providerStatus: repo.archived ? "archived" : repo.disabled ? "disabled" : "active",
    };
  },

  async getActivity(ctx, resource, since) {
    const response = await get(
      ctx,
      `/repositories/${resource.providerResourceId}/commits?per_page=100&since=${since.toISOString()}`,
    );
    const commits = (await response.json()) as {
      commit: { author: { date: string } | null };
    }[];

    return commits
      .map((commit) => commit.commit?.author?.date)
      .filter((date): date is string => Boolean(date))
      .map((date) => ({ signal: "github.push", observedAt: new Date(date) }));
  },

  getManagementUrl(resource: ResourceRef) {
    // A pure template — no API call — so the inventory renders links for free.
    return resource.name ? `https://github.com/${resource.name}` : undefined;
  },
};
