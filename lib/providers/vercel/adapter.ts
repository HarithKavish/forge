/**
 * Vercel adapter.
 *
 * Discovers projects and domains. A project's latest production deployment is a
 * genuine usage signal — it means someone shipped — which makes Vercel one of
 * the few providers where "potentially unused" can be said with confidence.
 */

import { z } from "zod";

import { providerJson } from "../http";
import type {
  AccountIdentity,
  DiscoveredResource,
  ProviderAdapter,
  ProviderContext,
  ResourceRef,
} from "../types";

const API = "https://api.vercel.com";

export const vercelCredentialSchema = z.object({
  accessToken: z.string().min(20, "A Vercel access token is longer than this"),
  /** Required to see a team's projects; personal accounts leave it empty. */
  teamId: z.string().optional(),
});

export type VercelCredentials = z.infer<typeof vercelCredentialSchema>;

type Ctx = ProviderContext<VercelCredentials>;

/** Team-scoped calls need the team id on every request, not just the first. */
function url(ctx: Ctx, path: string): string {
  const teamId = ctx.credentials.teamId ?? (ctx.settings.teamId as string | undefined);
  if (!teamId) return API + path;
  return API + path + (path.includes("?") ? "&" : "?") + `teamId=${encodeURIComponent(teamId)}`;
}

function get<T>(ctx: Ctx, path: string): Promise<T> {
  return providerJson<T>({
    provider: "vercel",
    url: url(ctx, path),
    token: ctx.credentials.accessToken,
    signal: ctx.signal,
  });
}

interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt?: number;
  live?: boolean;
  targets?: {
    production?: { createdAt?: number; readyState?: string; url?: string } | null;
  };
  latestDeployments?: { createdAt?: number; readyState?: string }[];
  nodeVersion?: string;
}

interface VercelDomain {
  id: string;
  name: string;
  createdAt: number;
  verified: boolean;
  serviceType?: string;
}

/** Deployment state maps onto Forge's scale; ERROR is a real failure. */
function deploymentHealth(state: string | undefined) {
  if (!state) return "unknown" as const;
  if (state === "READY") return "healthy" as const;
  if (state === "ERROR" || state === "CANCELED") return "error" as const;
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING") {
    return "warning" as const;
  }
  return "unknown" as const;
}

export const vercelAdapter: ProviderAdapter<VercelCredentials> = {
  id: "vercel",
  displayName: "Vercel",

  capabilities: {
    resourceDiscovery: true,
    resourceStatus: true,
    // Production deployments are real evidence of use.
    activity: true,
    // Billing is team-level; there is no per-project figure to report.
    cost: false,
    managementUrl: true,
  },

  credentialSchema: vercelCredentialSchema,

  async authenticate(ctx) {
    const me = await get<{ user: { id: string; username: string; name?: string; email?: string } }>(
      ctx,
      "/v2/user",
    );

    const teamId = ctx.credentials.teamId;
    let scope = me.user.username;

    if (teamId) {
      const team = await get<{ id: string; slug: string; name: string }>(
        ctx,
        `/v2/teams/${encodeURIComponent(teamId)}`,
      );
      scope = team.slug;
    }

    const identity: AccountIdentity = {
      // The team is the account when one is set, otherwise the user.
      externalAccountId: teamId ?? me.user.id,
      displayName: teamId ? `${scope} (team)` : `@${me.user.username}`,
      settings: { teamId: teamId ?? "", scope, username: me.user.username },
    };
    return identity;
  },

  async *discoverResources(ctx) {
    const scope =
      (ctx.settings.scope as string | undefined) ??
      ctx.credentials.teamId ??
      "dashboard";

    // --- Projects, paginated by Vercel's timestamp cursor ------------------
    let until: number | undefined;
    for (let guard = 0; guard < 50; guard += 1) {
      const path = `/v9/projects?limit=100${until ? `&until=${until}` : ""}`;
      const page = await get<{
        projects: VercelProject[];
        pagination?: { next: number | null };
      }>(ctx, path);

      for (const project of page.projects ?? []) {
        const production = project.targets?.production;
        const latest = project.latestDeployments?.[0];
        const deployedAt = production?.createdAt ?? latest?.createdAt;

        yield {
          providerResourceId: project.id,
          resourceType: "vercel.project",
          name: project.name,
          providerStatus: production?.readyState ?? latest?.readyState ?? "no deployment",
          healthStatus: deploymentHealth(production?.readyState ?? latest?.readyState),
          providerCreatedAt: new Date(project.createdAt),
          // A production deployment is the usage signal — not `updatedAt`,
          // which moves when a setting changes.
          lastActivityAt: deployedAt ? new Date(deployedAt) : undefined,
          activitySignalAvailable: true,
          managementUrl: `https://vercel.com/${scope}/${project.name}`,
          metadata: {
            framework: project.framework ?? "—",
            nodeVersion: project.nodeVersion ?? "—",
            productionUrl: production?.url ?? "",
          },
        } satisfies DiscoveredResource;
      }

      const next = page.pagination?.next;
      if (!next || (page.projects?.length ?? 0) === 0) break;
      until = next;
    }

    // --- Domains ----------------------------------------------------------
    const domains = await get<{ domains: VercelDomain[] }>(ctx, "/v5/domains?limit=100");
    for (const domain of domains.domains ?? []) {
      yield {
        providerResourceId: `domain:${domain.id}`,
        resourceType: "vercel.domain",
        name: domain.name,
        providerStatus: domain.verified ? "verified" : "unverified",
        healthStatus: domain.verified ? "healthy" : "warning",
        providerCreatedAt: new Date(domain.createdAt),
        // A domain has no usage signal of its own; the project it serves does.
        activitySignalAvailable: false,
        managementUrl: `https://vercel.com/${scope}/~/domains/${domain.name}`,
        metadata: { serviceType: domain.serviceType ?? "—" },
      } satisfies DiscoveredResource;
    }
  },

  getManagementUrl(resource: ResourceRef) {
    return typeof resource.metadata?.managementUrl === "string"
      ? resource.metadata.managementUrl
      : undefined;
  },
};
