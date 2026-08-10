/**
 * Provider catalogue.
 *
 * Mirrors what lib/providers/registry.ts will serve once adapters exist. The
 * capability flags are the real ones for each platform, not a uniform set —
 * GitHub genuinely cannot report infrastructure cost, and the UI is built to
 * show "not supported" rather than an empty number.
 */

import type { ProviderInfo } from "@/lib/data/types";

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "github",
    displayName: "GitHub",
    category: "source",
    summary: "Repositories, deployments and commit activity.",
    credentialKind: "Fine-grained personal access token (read-only)",
    consoleUrl: "https://github.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      cost: false,
      managementUrl: true,
    },
  },
  {
    id: "aws",
    displayName: "AWS",
    category: "cloud",
    summary: "EC2, S3, RDS, Lambda, EBS volumes and load balancers.",
    credentialKind: "Cross-account IAM role (read-only) or access key pair",
    consoleUrl: "https://console.aws.amazon.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      cost: true,
      managementUrl: true,
    },
  },
  {
    id: "mongodb-atlas",
    displayName: "MongoDB Atlas",
    category: "database",
    summary: "Clusters, databases and connection activity.",
    credentialKind: "Atlas API key pair (Project Read Only)",
    consoleUrl: "https://cloud.mongodb.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      cost: true,
      managementUrl: true,
    },
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare",
    category: "edge",
    summary: "Zones, DNS records, workers and R2 buckets.",
    credentialKind: "API token scoped to zone read",
    consoleUrl: "https://dash.cloudflare.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      // Cloudflare bills per account/plan, not per zone.
      cost: false,
      managementUrl: true,
    },
  },
  {
    id: "vercel",
    displayName: "Vercel",
    category: "platform",
    summary: "Projects, deployments and domains.",
    credentialKind: "Vercel access token",
    consoleUrl: "https://vercel.com/dashboard",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      // Billing is team-level; there is no per-project figure to report.
      cost: false,
      managementUrl: true,
    },
  },
  {
    id: "azure",
    displayName: "Azure",
    category: "cloud",
    summary: "Virtual machines, storage accounts and app services.",
    credentialKind: "Service principal with Reader role",
    consoleUrl: "https://portal.azure.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: true,
      cost: true,
      managementUrl: true,
    },
  },
  {
    id: "oracle-cloud",
    displayName: "Oracle Cloud",
    category: "cloud",
    summary: "Compute instances, block volumes and object storage.",
    credentialKind: "API signing key",
    consoleUrl: "https://cloud.oracle.com",
    capabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: false,
      cost: true,
      managementUrl: true,
    },
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderInfo | undefined {
  return BY_ID.get(id);
}

/** Display name for a provider slug, falling back to the slug itself. */
export function providerName(id: string): string {
  return BY_ID.get(id)?.displayName ?? id;
}
