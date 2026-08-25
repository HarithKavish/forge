/**
 * Neon adapter.
 *
 * Discovers projects and branches. Compute endpoints carry `last_active`, which
 * is a real usage signal — a branch nobody has connected to in months is
 * genuinely idle, not merely quiet.
 *
 * Cost is declared false on purpose. Neon's consumption API returns compute
 * hours and storage, not currency; converting those to money needs the account's
 * plan pricing, which the API does not expose. Forge would have to hardcode a
 * rate card and present the result as fact, which is exactly what the cost
 * model forbids. Usage is surfaced as metadata instead.
 */

import { z } from "zod";

import { providerJson } from "../http";
import type {
  AccountIdentity,
  DiscoveredResource,
  ProviderAdapter,
  ProviderContext,
  ResourceRef,
  StatusLevel,
} from "../types";

const API = "https://console.neon.tech/api/v2";

export const neonCredentialSchema = z.object({
  apiKey: z.string().min(20, "A Neon API key is longer than this"),
});

export type NeonCredentials = z.infer<typeof neonCredentialSchema>;

type Ctx = ProviderContext<NeonCredentials>;

function get<T>(ctx: Ctx, path: string): Promise<T> {
  return providerJson<T>({
    provider: "neon",
    url: API + path,
    token: ctx.credentials.apiKey,
    signal: ctx.signal,
  });
}

interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  created_at: string;
  updated_at: string;
  pg_version: number;
  store_passwords?: boolean;
  synthetic_storage_size?: number;
}

interface NeonBranch {
  id: string;
  project_id: string;
  name: string;
  current_state: string;
  created_at: string;
  updated_at: string;
  default: boolean;
  protected?: boolean;
  logical_size?: number;
}

interface NeonEndpoint {
  id: string;
  project_id: string;
  branch_id: string;
  current_state: string;
  last_active?: string;
  autoscaling_limit_min_cu?: number;
  autoscaling_limit_max_cu?: number;
}

/** `idle` is normal for Neon — it scales to zero. Only errors are unhealthy. */
function endpointHealth(state: string | undefined): StatusLevel {
  if (!state) return "unknown";
  if (state === "active" || state === "idle") return "healthy";
  return "warning";
}

function megabytes(bytes: number | undefined): string {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const neonAdapter: ProviderAdapter<NeonCredentials> = {
  id: "neon",
  displayName: "Neon",

  capabilities: {
    resourceDiscovery: true,
    resourceStatus: true,
    // Compute endpoints report `last_active`.
    activity: true,
    // Consumption is available; currency is not. See the note at the top.
    cost: false,
    managementUrl: true,
  },

  credentialSchema: neonCredentialSchema,

  async authenticate(ctx) {
    const me = await get<{ id: string; email: string; name?: string; login?: string }>(
      ctx,
      "/users/me",
    );

    const identity: AccountIdentity = {
      externalAccountId: me.id,
      displayName: me.name ? `${me.name} (${me.email})` : me.email,
      settings: { email: me.email },
    };
    return identity;
  },

  async *discoverResources(ctx) {
    const { projects } = await get<{ projects: NeonProject[] }>(ctx, "/projects");

    for (const project of projects ?? []) {
      const console_ = `https://console.neon.tech/app/projects/${project.id}`;

      yield {
        providerResourceId: project.id,
        resourceType: "neon.project",
        name: project.name,
        region: project.region_id,
        providerStatus: "active",
        healthStatus: "healthy",
        providerCreatedAt: new Date(project.created_at),
        // The project itself has no usage signal; its endpoints do.
        activitySignalAvailable: false,
        managementUrl: console_,
        metadata: {
          managementUrl: console_,
          postgresVersion: String(project.pg_version),
          storage: megabytes(project.synthetic_storage_size),
        },
      } satisfies DiscoveredResource;

      // Endpoints first, so each branch can be given its own activity.
      const { endpoints } = await get<{ endpoints: NeonEndpoint[] }>(
        ctx,
        `/projects/${project.id}/endpoints`,
      );
      const byBranch = new Map<string, NeonEndpoint>();
      for (const endpoint of endpoints ?? []) byBranch.set(endpoint.branch_id, endpoint);

      const { branches } = await get<{ branches: NeonBranch[] }>(
        ctx,
        `/projects/${project.id}/branches`,
      );

      for (const branch of branches ?? []) {
        const endpoint = byBranch.get(branch.id);
        const branchUrl = `${console_}/branches/${branch.id}`;

        yield {
          providerResourceId: branch.id,
          resourceType: "neon.branch",
          name: `${project.name}/${branch.name}`,
          region: project.region_id,
          providerStatus: endpoint?.current_state ?? branch.current_state,
          healthStatus: endpointHealth(endpoint?.current_state),
          providerCreatedAt: new Date(branch.created_at),
          // The real signal: when a client last connected to this branch.
          lastActivityAt: endpoint?.last_active ? new Date(endpoint.last_active) : undefined,
          activitySignalAvailable: Boolean(endpoint),
          managementUrl: branchUrl,
          metadata: {
            managementUrl: branchUrl,
            project: project.name,
            isDefault: String(branch.default),
            protected: String(branch.protected ?? false),
            logicalSize: megabytes(branch.logical_size),
            computeMinCu: String(endpoint?.autoscaling_limit_min_cu ?? "—"),
            computeMaxCu: String(endpoint?.autoscaling_limit_max_cu ?? "—"),
          },
        } satisfies DiscoveredResource;
      }
    }
  },

  getManagementUrl(resource: ResourceRef) {
    return typeof resource.metadata?.managementUrl === "string"
      ? resource.metadata.managementUrl
      : undefined;
  },
};
