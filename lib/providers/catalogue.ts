/**
 * Provider catalogue.
 *
 * Two kinds of entry, and the difference is visible in the UI rather than
 * glossed over: providers with a registered adapter can actually be connected;
 * the rest are planned, and say so.
 *
 * `capabilities` for an implemented provider comes from the adapter itself, so
 * the catalogue cannot drift from what the code can really do.
 */

import { getAdapter } from "./registry";
import type { ProviderCapabilities } from "./types";

export interface ProviderInfo {
  id: string;
  displayName: string;
  category: "cloud" | "source" | "database" | "edge" | "platform";
  summary: string;
  capabilities: ProviderCapabilities;
  /** What Forge asks for when connecting. */
  credentialKind: string;
  consoleUrl: string;
  /** True when an adapter is registered and the provider can be connected. */
  implemented: boolean;
}

const NO_CAPABILITIES: ProviderCapabilities = {
  resourceDiscovery: false,
  resourceStatus: false,
  activity: false,
  cost: false,
  managementUrl: false,
};

/** Planned providers declare what they *will* support once built. */
interface CatalogueEntry {
  id: string;
  displayName: string;
  category: ProviderInfo["category"];
  summary: string;
  credentialKind: string;
  consoleUrl: string;
  plannedCapabilities: ProviderCapabilities;
}

const ENTRIES: CatalogueEntry[] = [
  {
    id: "github",
    displayName: "GitHub",
    category: "source",
    summary: "Repositories, visibility, and commit activity.",
    credentialKind: "OAuth — you authorise Forge, no token to paste",
    consoleUrl: "https://github.com",
    plannedCapabilities: {
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
    credentialKind: "Cross-account IAM role (read-only)",
    consoleUrl: "https://console.aws.amazon.com",
    plannedCapabilities: {
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
    plannedCapabilities: {
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
    plannedCapabilities: {
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
    plannedCapabilities: {
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
    plannedCapabilities: {
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
    plannedCapabilities: {
      resourceDiscovery: true,
      resourceStatus: true,
      activity: false,
      cost: true,
      managementUrl: true,
    },
  },
];

function toProviderInfo(entry: CatalogueEntry): ProviderInfo {
  const adapter = getAdapter(entry.id);
  return {
    id: entry.id,
    displayName: entry.displayName,
    category: entry.category,
    summary: entry.summary,
    credentialKind: entry.credentialKind,
    consoleUrl: entry.consoleUrl,
    implemented: Boolean(adapter),
    // A registered adapter is the authority on its own capabilities. Planned
    // entries advertise intent, and are labelled as planned in the UI.
    capabilities: adapter
      ? adapter.capabilities
      : (entry.plannedCapabilities ?? NO_CAPABILITIES),
  };
}

export const PROVIDERS: ProviderInfo[] = ENTRIES.map(toProviderInfo);

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderInfo | undefined {
  return BY_ID.get(id);
}

/** Display name for a provider slug, falling back to the slug itself. */
export function providerName(id: string): string {
  return BY_ID.get(id)?.displayName ?? id;
}
