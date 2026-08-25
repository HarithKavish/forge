/**
 * Cloudflare adapter.
 *
 * Discovers zones, Workers, R2 buckets and Pages projects.
 *
 * Cloudflare is the best-behaved provider Forge talks to on credentials: its
 * API tokens are genuinely fine-grained and read-only, so a connection grants
 * exactly what Forge uses — unlike GitHub, where `repo` forces write access
 * because no read-only variant exists.
 */

import { z } from "zod";

import { providerJson, unwrapCloudflare, type CloudflareEnvelope } from "../http";
import { ProviderAuthError, ProviderError } from "../errors";
import type {
  AccountIdentity,
  DiscoveredResource,
  ProviderAdapter,
  ProviderContext,
  ResourceRef,
  StatusLevel,
} from "../types";

const API = "https://api.cloudflare.com/client/v4";

export const cloudflareCredentialSchema = z.object({
  apiToken: z.string().min(20, "A Cloudflare API token is longer than this"),
  /** Optional: pins the connection to one account when the token sees several. */
  accountId: z.string().optional(),
});

export type CloudflareCredentials = z.infer<typeof cloudflareCredentialSchema>;

type Ctx = ProviderContext<CloudflareCredentials>;

function get<T>(ctx: Ctx, path: string): Promise<CloudflareEnvelope<T>> {
  return providerJson<CloudflareEnvelope<T>>({
    provider: "cloudflare",
    url: path.startsWith("http") ? path : API + path,
    token: ctx.credentials.apiToken,
    signal: ctx.signal,
  });
}

/**
 * For product areas the token may not cover.
 *
 * A token scoped to Zone:Read alone is a perfectly reasonable thing to connect;
 * it should discover zones, not fail the whole run because it cannot read R2.
 * Genuine auth failures still propagate — only a missing permission is treated
 * as "this product is not part of this connection".
 */
async function optional<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (cause) {
    if (cause instanceof ProviderError && !(cause instanceof ProviderAuthError)) {
      return fallback;
    }
    if (cause instanceof ProviderAuthError) throw cause;
    return fallback;
  }
}

interface CfZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  created_on: string;
  modified_on: string;
  activated_on: string | null;
  plan?: { name: string };
  account?: { id: string; name: string };
}

interface CfAccount {
  id: string;
  name: string;
}

/** `active` is the only healthy zone state; anything else needs a look. */
function zoneHealth(zone: CfZone): StatusLevel {
  if (zone.paused) return "warning";
  return zone.status === "active" ? "healthy" : "warning";
}

async function resolveAccount(ctx: Ctx): Promise<CfAccount> {
  const accounts = unwrapCloudflare(
    await get<CfAccount[]>(ctx, "/accounts"),
    "cloudflare",
  );
  if (!accounts || accounts.length === 0) {
    throw new ProviderAuthError(
      "This token can see no Cloudflare accounts. It may be missing the Account Settings: Read permission.",
      "cloudflare",
    );
  }
  const pinned =
    ctx.credentials.accountId ?? (ctx.settings.accountId as string | undefined);
  return accounts.find((a) => a.id === pinned) ?? (accounts[0] as CfAccount);
}

export const cloudflareAdapter: ProviderAdapter<CloudflareCredentials> = {
  id: "cloudflare",
  displayName: "Cloudflare",

  capabilities: {
    resourceDiscovery: true,
    resourceStatus: true,
    /**
     * True because Pages projects carry a real deployment timestamp. Zones,
     * Workers and R2 do not expose one over REST, and say so per row rather
     * than being reported as merely quiet — which would be a different and
     * misleading claim.
     */
    activity: true,
    // Cloudflare bills per account and plan, never per zone.
    cost: false,
    managementUrl: true,
  },

  credentialSchema: cloudflareCredentialSchema,

  async authenticate(ctx) {
    // Verify the token itself before anything else is attempted.
    const result = unwrapCloudflare(
      await get<{ id: string; status: string }>(ctx, "/user/tokens/verify"),
      "cloudflare",
    );
    if (result.status !== "active") {
      throw new ProviderAuthError(
        `This Cloudflare token is ${result.status}.`,
        "cloudflare",
      );
    }

    const account = await resolveAccount(ctx);
    const identity: AccountIdentity = {
      externalAccountId: account.id,
      displayName: account.name,
      settings: { accountId: account.id, accountName: account.name },
    };
    return identity;
  },

  async *discoverResources(ctx) {
    const account = await resolveAccount(ctx);
    const dash = `https://dash.cloudflare.com/${account.id}`;

    // --- Zones, paginated -------------------------------------------------
    for (let page = 1; page <= 50; page += 1) {
      const envelope = await get<CfZone[]>(ctx, `/zones?per_page=50&page=${page}`);
      const zones = unwrapCloudflare(envelope, "cloudflare") ?? [];

      for (const zone of zones) {
        const managementUrl = `${dash}/${zone.name}`;
        yield {
          providerResourceId: zone.id,
          resourceType: "cloudflare.zone",
          name: zone.name,
          providerStatus: zone.paused ? "paused" : zone.status,
          healthStatus: zoneHealth(zone),
          providerCreatedAt: new Date(zone.created_on),
          // Deliberately no lastActivityAt: `modified_on` tracks configuration
          // edits, not traffic, and using it would make a dormant zone look
          // busy. Request volume needs the GraphQL analytics API.
          activitySignalAvailable: false,
          managementUrl,
          metadata: {
            managementUrl,
            plan: zone.plan?.name ?? "—",
            zoneStatus: zone.status,
            type: zone.type,
            account: zone.account?.name ?? account.name,
            activatedOn: zone.activated_on ?? "",
          },
        } satisfies DiscoveredResource;
      }

      const info = envelope.result_info;
      if (!info || info.page >= info.total_pages || zones.length === 0) break;
    }

    // --- Workers ----------------------------------------------------------
    interface CfWorker {
      id: string;
      created_on: string;
      modified_on: string;
    }
    const workers = await optional(
      get<CfWorker[]>(ctx, `/accounts/${account.id}/workers/scripts`).then((e) =>
        unwrapCloudflare(e, "cloudflare"),
      ),
      [] as CfWorker[],
    );

    for (const worker of workers ?? []) {
      const managementUrl = `${dash}/workers/services/view/${worker.id}`;
      yield {
        providerResourceId: `worker:${worker.id}`,
        resourceType: "cloudflare.worker",
        name: worker.id,
        providerStatus: "deployed",
        healthStatus: "healthy",
        providerCreatedAt: new Date(worker.created_on),
        activitySignalAvailable: false,
        managementUrl,
        metadata: { managementUrl, modifiedOn: worker.modified_on },
      } satisfies DiscoveredResource;
    }

    // --- R2 buckets -------------------------------------------------------
    interface CfR2 {
      name: string;
      creation_date: string;
      location?: string;
    }
    const r2 = await optional(
      get<{ buckets: CfR2[] }>(ctx, `/accounts/${account.id}/r2/buckets`).then((e) =>
        unwrapCloudflare(e, "cloudflare"),
      ),
      { buckets: [] as CfR2[] },
    );

    for (const bucket of r2?.buckets ?? []) {
      const managementUrl = `${dash}/r2/default/buckets/${bucket.name}`;
      yield {
        providerResourceId: `r2:${bucket.name}`,
        resourceType: "cloudflare.r2_bucket",
        name: bucket.name,
        healthStatus: "healthy",
        providerCreatedAt: new Date(bucket.creation_date),
        activitySignalAvailable: false,
        managementUrl,
        metadata: { managementUrl, location: bucket.location ?? "auto" },
      } satisfies DiscoveredResource;
    }

    // --- Pages projects ---------------------------------------------------
    interface CfPages {
      id: string;
      name: string;
      created_on: string;
      subdomain: string;
      production_branch: string;
      latest_deployment?: { created_on: string; environment: string };
    }
    const pages = await optional(
      get<CfPages[]>(ctx, `/accounts/${account.id}/pages/projects`).then((e) =>
        unwrapCloudflare(e, "cloudflare"),
      ),
      [] as CfPages[],
    );

    for (const project of pages ?? []) {
      const deployed = project.latest_deployment?.created_on;
      const managementUrl = `${dash}/pages/view/${project.name}`;
      yield {
        providerResourceId: `pages:${project.id}`,
        resourceType: "cloudflare.pages_project",
        name: project.name,
        healthStatus: "healthy",
        providerCreatedAt: new Date(project.created_on),
        // The one Cloudflare resource with a genuine usage signal.
        lastActivityAt: deployed ? new Date(deployed) : undefined,
        activitySignalAvailable: true,
        managementUrl,
        metadata: {
          managementUrl,
          subdomain: project.subdomain,
          productionBranch: project.production_branch,
        },
      } satisfies DiscoveredResource;
    }
  },

  getManagementUrl(resource: ResourceRef) {
    return typeof resource.metadata?.managementUrl === "string"
      ? resource.metadata.managementUrl
      : undefined;
  },
};
