/**
 * The provider abstraction.
 *
 * Hard boundary: an adapter talks to exactly one external API and returns
 * normalized plain objects. It never imports the database, never knows what a
 * project is, and never decides whether a resource is "unused" — that is the
 * core's job. Keeping adapters free of domain logic is what lets a new provider
 * be added without touching Forge itself.
 *
 * Capabilities are declared, not assumed. GitHub has no infrastructure cost;
 * some Atlas tiers expose no per-cluster billing. The core reads
 * `capabilities` and skips work rather than calling a method that throws.
 */

import type { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Capabilities                                                                */
/* -------------------------------------------------------------------------- */

export interface ProviderCapabilities {
  /** Can enumerate resources for an account. Required for a useful adapter. */
  resourceDiscovery: boolean;
  /** Can report live per-resource state beyond what discovery returned. */
  resourceStatus: boolean;
  /** Can report observed usage signals (requests, commits, CPU). */
  activity: boolean;
  /** Can report per-resource cost with a defensible accuracy label. */
  cost: boolean;
  /** Can produce a deep link into the provider console. */
  managementUrl: boolean;
}

/* -------------------------------------------------------------------------- */
/* Normalized results                                                          */
/* -------------------------------------------------------------------------- */

export type StatusLevel = "healthy" | "warning" | "error" | "unknown";

export type CostAccuracy =
  | "actual"
  | "provider_reported"
  | "estimated"
  | "unavailable";

export type CostPeriod = "hourly" | "daily" | "monthly";

/** What an adapter returns for one discovered object. */
export interface DiscoveredResource {
  /** The provider's identifier. Must be stable across syncs for the account. */
  providerResourceId: string;
  /** Namespaced type slug, e.g. "aws.ec2.instance". Adapter-owned vocabulary. */
  resourceType: string;
  name: string;
  region?: string;
  /** Provider's own state string, preserved verbatim for the detail view. */
  providerStatus?: string;
  /** That state mapped onto Forge's semantic scale. */
  healthStatus: StatusLevel;
  /** Creation time as reported by the provider, if it reports one. */
  providerCreatedAt?: Date;
  /**
   * Last observed *use*. Omit when the provider gives no usage signal — do not
   * substitute the discovery time, which would make idle resources look active.
   */
  lastActivityAt?: Date;
  /**
   * Whether a usage signal exists for this resource *type* at all.
   *
   * Separate from `lastActivityAt` being absent, because the two mean different
   * things: no signal available is permanent and should read as "unknown", while
   * a signal that exists but shows nothing yet may fill in later. Defaults to
   * the adapter's `activity` capability when omitted.
   *
   * Cloudflare is why this exists — Pages projects report deployments, zones
   * report nothing, and one flag for the whole provider cannot say both.
   */
  activitySignalAvailable?: boolean;
  managementUrl?: string;
  /** Provider-specific extras, kept out of the core schema. */
  metadata?: Record<string, unknown>;
}

/** One observed usage signal. `observedAt` is provider time, not read time. */
export interface ActivitySignal {
  signal: string;
  observedAt: Date;
  value?: Record<string, unknown>;
}

/**
 * A cost figure with its provenance. `unavailable` is a legitimate, expected
 * answer — Forge shows "cost unavailable" rather than inventing a number.
 */
export interface CostResult {
  accuracy: CostAccuracy;
  amount?: number;
  currency?: string;
  period?: CostPeriod;
  periodStart?: Date;
  periodEnd?: Date;
  /** Which API produced the figure, recorded for auditability. */
  source?: string;
}

/** Identity confirmed at connection time, used to label the account. */
export interface AccountIdentity {
  /** Provider-side account id: AWS account number, GitHub login, Atlas org id. */
  externalAccountId: string;
  displayName: string;
  /** Non-secret connection details persisted on the connected account. */
  settings?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Adapter context                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Everything an adapter needs for a call. Credentials arrive already decrypted
 * by the caller and are held only for the duration of the call.
 */
export interface ProviderContext<TCredentials = unknown> {
  credentials: TCredentials;
  /** Non-secret settings captured at connect time (region, org slug, ...). */
  settings: Record<string, unknown>;
  /** Cooperative cancellation so a slow provider cannot hang a sync run. */
  signal?: AbortSignal;
}

/** The result of refreshing a credential, with its new expiry if there is one. */
export interface RefreshedCredentials<TCredentials> {
  credentials: TCredentials;
  expiresAt?: Date;
}

/**
 * A resource as stored by Forge, narrowed to the fields an adapter may read.
 * Adapters receive this rather than the full row so they cannot depend on
 * project association or any other core concept.
 */
export interface ResourceRef {
  providerResourceId: string;
  resourceType: string;
  name: string;
  region?: string | null;
  metadata?: Record<string, unknown> | null;
}

/* -------------------------------------------------------------------------- */
/* The adapter interface                                                       */
/* -------------------------------------------------------------------------- */

export interface ProviderAdapter<TCredentials = unknown> {
  /** Stable slug stored in `resources.provider`. Never change it after release. */
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * Shape of the secret this provider needs (PAT, IAM key pair, API key).
   * The connect endpoint validates user input against this before encrypting,
   * so unknown fields never reach storage.
   */
  readonly credentialSchema: z.ZodType<TCredentials>;

  /**
   * Verify the credentials and resolve who they belong to. Must throw
   * `ProviderAuthError` on bad credentials so the UI can distinguish
   * "wrong key" from "provider is down".
   */
  authenticate(ctx: ProviderContext<TCredentials>): Promise<AccountIdentity>;

  /**
   * Enumerate everything visible to these credentials.
   *
   * Returned as an async iterable so large accounts stream page by page
   * instead of materializing thousands of resources in memory.
   */
  discoverResources(
    ctx: ProviderContext<TCredentials>,
  ): AsyncIterable<DiscoveredResource>;

  /** Required when `capabilities.resourceStatus` is true. */
  getResourceStatus?(
    ctx: ProviderContext<TCredentials>,
    resource: ResourceRef,
  ): Promise<{ healthStatus: StatusLevel; providerStatus?: string }>;

  /** Required when `capabilities.activity` is true. */
  getActivity?(
    ctx: ProviderContext<TCredentials>,
    resource: ResourceRef,
    since: Date,
  ): Promise<ActivitySignal[]>;

  /** Required when `capabilities.cost` is true. */
  getCost?(
    ctx: ProviderContext<TCredentials>,
    resource: ResourceRef,
  ): Promise<CostResult>;

  /**
   * Exchange an expiring credential for a fresh one.
   *
   * Optional because not every provider issues expiring credentials — an AWS
   * IAM role or a static API key has nothing to refresh. Implement it when the
   * provider hands back a refresh token, and the sync layer will call it
   * before a credential goes stale rather than waiting for a 401.
   */
  refreshCredentials?(credentials: TCredentials): Promise<RefreshedCredentials<TCredentials>>;

  /**
   * Deep link into the provider console. Synchronous and pure — it is a URL
   * template, not an API call, so the inventory can render links for free.
   */
  getManagementUrl?(
    resource: ResourceRef,
    settings: Record<string, unknown>,
  ): string | undefined;
}
