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

export type AgentProvider = "claude" | "codex" | "gemini" | "other";
export type AgentSessionStatus = "active" | "revoked";

/**
 * A registered coding-agent session, for Worldview's presence map. This is
 * the registration only — no online/offline state, no activity. See
 * docs/WORLDVIEW.md §4.
 */
export interface AgentSession {
  id: string;
  workspaceId: string;
  ownerId: string;
  projectId?: string;
  provider: AgentProvider;
  /** Opaque, safe to show -- never a credential. Correlates with a live PresenceEntry. */
  sessionRef: string;
  label?: string;
  status: AgentSessionStatus;
  createdAt: string;
}

/**
 * A project shared with the current user from a workspace they hold no
 * membership in (docs/WORLDVIEW.md §13a). Deliberately thinner than
 * `Project` -- a collaborator sees enough to register/view agent sessions
 * on it, nothing about its resources, billing, or status.
 */
export interface SharedProject {
  projectId: string;
  projectName: string;
  workspaceId: string;
}

/**
 * What the registration forms on /worldview actually need from a project --
 * an id and a name, and whether to label it "(shared)". Deliberately not
 * `Project` or `SharedProject` directly: the forms merge one workspace's
 * own projects with others shared into it, and this is the common shape
 * both reduce to.
 */
export interface SelectableProject {
  id: string;
  name: string;
  shared?: boolean;
}

/**
 * An `AgentSession` with its owner's Worldview color already resolved
 * server-side (docs/WORLDVIEW.md §9) -- computed once per distinct
 * (workspaceId, ownerId) pair on the page, since a session's owner may not
 * be the viewer once sessions on shared projects are mixed in
 * (docs/WORLDVIEW.md §13a).
 */
export interface DisplaySession extends AgentSession {
  color: { light: string; dark: string };
}

/** One grant on a project's Worldview access, for the owner's management UI. */
export interface ProjectCollaborator {
  id: string;
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
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
