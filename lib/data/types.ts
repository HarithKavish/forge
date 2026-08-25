/**
 * View-model types for the UI.
 *
 * These mirror the Drizzle row types in lib/db/schema.ts field for field, with
 * one deliberate difference: timestamps are ISO strings rather than `Date`, so
 * every object crosses the server/client boundary without a serialization step.
 *
 * The distinctions the schema enforces are preserved here — `lastSeenAt` is not
 * `lastActivityAt`, `activityState` is an inference that carries its evidence
 * in `activityReason`, and cost always travels with an accuracy label.
 */

export type StatusLevel = "healthy" | "warning" | "error" | "unknown";
export type ActivityState =
  | "active"
  | "recently_inactive"
  | "potentially_unused"
  | "unknown";
export type CostAccuracy =
  | "actual"
  | "provider_reported"
  | "estimated"
  | "unavailable";
export type ResourcePresence = "live" | "missing" | "archived";
export type ProjectStatus = "active" | "archived";
export type EnvironmentKind =
  | "development"
  | "staging"
  | "production"
  | "testing"
  | "experimental"
  | "other";
export type SyncStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed";
export type ConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "error"
  | "disabled"
  | "not_connected";

export interface ProviderCapabilities {
  resourceDiscovery: boolean;
  resourceStatus: boolean;
  activity: boolean;
  cost: boolean;
  managementUrl: boolean;
}

/**
 * Re-exported rather than redeclared: the catalogue owns this shape, and a
 * second copy here had already drifted out of sync with it. Type-only, so
 * nothing from lib/providers/ is pulled into a client bundle.
 */
export type { ProviderInfo, CredentialField } from "@/lib/providers/catalogue";

export interface ConnectedAccount {
  id: string;
  workspaceId: string;
  provider: string;
  displayName: string;
  externalAccountId: string;
  status: ConnectionStatus;
  region?: string;
  lastSyncAt?: string;
  lastSyncStatus?: SyncStatus;
  lastSyncError?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  healthStatus: StatusLevel;
  createdAt: string;
  lastActivityAt?: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  kind: EnvironmentKind;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  description: string;
  healthStatus: StatusLevel;
}

export interface Resource {
  id: string;
  workspaceId: string;
  connectedAccountId: string;
  provider: string;
  providerResourceId: string;
  resourceType: string;
  name: string;
  region?: string;

  projectId?: string;
  environmentId?: string;
  serviceId?: string;

  presence: ResourcePresence;
  providerStatus?: string;
  healthStatus: StatusLevel;

  providerCreatedAt?: string;
  discoveredAt: string;
  /** Last sync that still returned this resource. Not evidence of use. */
  lastSeenAt: string;
  /** Last observed *use*. Absent means no usage signal was available. */
  lastActivityAt?: string;

  activityState: ActivityState;
  /** The observation behind `activityState`, phrased as fact. */
  activityReason?: string;

  costAmount?: number;
  costCurrency?: string;
  costPeriod?: "hourly" | "daily" | "monthly";
  costAccuracy: CostAccuracy;
  costAsOf?: string;

  managementUrl?: string;
  metadata?: Record<string, string>;
  /** Set when the user chose to stop this resource raising attention items. */
  ignoredAt?: string;
}

/** Derived attention item. Never stored — recomputed from the inventory. */
export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  category:
    | "unassociated"
    | "potentially_unused"
    | "unhealthy"
    | "sync_failure"
    | "cost";
  title: string;
  /** What was measured. Always literally true. */
  observation: string;
  /** What Forge concludes from it. Always labelled as inference in the UI. */
  inference?: string;
  resourceId?: string;
  projectId?: string;
  connectedAccountId?: string;
  href: string;
  detectedAt: string;
}

/** Counters for the home dashboard. */
export interface WorkspaceOverview {
  projects: number;
  activeProjects: number;
  resources: number;
  connectedProviders: number;
  healthyResources: number;
  unassociatedResources: number;
  potentiallyUnusedResources: number;
  unhealthyResources: number;
  attentionCount: number;
  knownMonthlyCost: number;
  costCurrency: string;
  resourcesWithoutCostData: number;
}

/** A project row enriched with the counts the listing needs. */
export interface ProjectSummary extends Project {
  serviceCount: number;
  resourceCount: number;
  providerCount: number;
  providers: string[];
  environments: string[];
  monthlyCost: number;
  unhealthyCount: number;
}
