/**
 * Forge V1 schema.
 *
 * Design rules enforced here (see docs/ARCHITECTURE.md for the reasoning):
 *
 *  1. Every tenant-owned row carries `workspaceId`. A workspace is the tenant.
 *     In V1 each user gets exactly one personal workspace, so the product looks
 *     single-user, but organizations/teams later require adding members — not
 *     rewriting every table.
 *  2. Forge primary keys are internal UUIDs. Provider identifiers are stored
 *     separately in `providerResourceId` and are never used as a primary key.
 *  3. Observed facts and inferred conclusions are different columns.
 *     `lastActivityAt` is an observation; `activityState` is an inference.
 *  4. Cost is never a bare number. Every cost carries an accuracy label and an
 *     as-of timestamp, so the UI can never present an estimate as fact.
 *  5. Secrets live in one table (`providerCredentials`) that no ordinary query
 *     touches, so a careless `select()` cannot leak them.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

/** Semantic status shared by projects, services, resources and health checks. */
export const statusLevel = pgEnum("status_level", [
  "healthy",
  "warning",
  "error",
  "unknown",
]);

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
]);

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

export const environmentKind = pgEnum("environment_kind", [
  "development",
  "staging",
  "production",
  "testing",
  "experimental",
  "other",
]);

export const connectedAccountStatus = pgEnum("connected_account_status", [
  "connected",
  "needs_reauth",
  "error",
  "disabled",
]);

/**
 * Whether the resource still exists at the provider. Distinct from health:
 * a resource can be present and unhealthy, or missing but still worth showing.
 * Forge never deletes rows on sync — it marks them `missing`.
 */
export const resourcePresence = pgEnum("resource_presence", [
  "live",
  "missing",
  "archived",
]);

/**
 * Inferred activity classification. Never write "potentially_unused" without a
 * supporting observation recorded in `activityRecords`.
 */
export const activityState = pgEnum("activity_state", [
  "active",
  "recently_inactive",
  "potentially_unused",
  "unknown",
]);

/** How much a cost figure can be trusted. `estimated` is Forge's own math. */
export const costAccuracy = pgEnum("cost_accuracy", [
  "actual",
  "provider_reported",
  "estimated",
  "unavailable",
]);

export const costPeriod = pgEnum("cost_period", ["hourly", "daily", "monthly"]);

export const healthCheckKind = pgEnum("health_check_kind", [
  "http",
  "tcp",
  "provider_state",
]);

export const syncKind = pgEnum("sync_kind", [
  "discovery",
  "activity",
  "cost",
  "health",
]);

export const syncStatus = pgEnum("sync_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
]);

export const relationshipKind = pgEnum("relationship_kind", [
  "depends_on",
  "attached_to",
  "contains",
  "deploys_from",
]);

/* -------------------------------------------------------------------------- */
/* Auth (Auth.js-compatible)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Column names follow the Auth.js Drizzle adapter contract. Forge authenticates
 * with Google; `accounts` holds that login identity.
 *
 * Note: an OAuth *login* identity (this table) is not the same thing as a
 * connected provider *account* (`connectedAccounts`). Signing in with GitHub
 * would not automatically grant Forge the right to inventory that GitHub org.
 *
 * These tables are temporary. Under the ecosystem's identity standard a person
 * is owned by the Account platform, and Forge holds only its own data keyed by
 * the subject the identity service issues. They stay until that service can
 * authenticate, and no credential belongs in them meanwhile.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("users_email_key").on(t.email)]);

export const accounts = pgTable("accounts", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [
  primaryKey({ columns: [t.provider, t.providerAccountId] }),
]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

/* -------------------------------------------------------------------------- */
/* Tenancy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The tenant boundary. Every authorization decision in Forge reduces to
 * "does this user have a membership row for this workspace?".
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** True for the auto-created single-user workspace. Teams come later. */
  personal: boolean("personal").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("workspaces_slug_key").on(t.slug)]);

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: workspaceRole("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  index("workspace_members_user_idx").on(t.userId),
]);

/* -------------------------------------------------------------------------- */
/* Project model                                                               */
/* -------------------------------------------------------------------------- */

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  status: projectStatus("status").notNull().default("active"),
  /**
   * Cached rollup of service/resource health so the dashboard does not
   * recompute the whole tree per request. Derived data — safe to rebuild.
   */
  healthStatus: statusLevel("health_status").notNull().default("unknown"),
  healthComputedAt: timestamp("health_computed_at", { withTimezone: true }),
  /** User-defined tags/metadata. Kept out of columns so V1 stays flexible. */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("projects_workspace_slug_key").on(t.workspaceId, t.slug),
  index("projects_workspace_idx").on(t.workspaceId),
]);

/** Optional grouping. Resources may sit in a project with no environment. */
export const environments = pgTable("environments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: environmentKind("kind").notNull().default("other"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("environments_project_name_key").on(t.projectId, t.name),
  index("environments_workspace_idx").on(t.workspaceId),
]);

/**
 * A logical component of a project ("Backend API"), as opposed to the concrete
 * provisioned objects that implement it. One service maps to many resources.
 */
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  healthStatus: statusLevel("health_status").notNull().default("unknown"),
  healthComputedAt: timestamp("health_computed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("services_project_name_key").on(t.projectId, t.name),
  index("services_workspace_idx").on(t.workspaceId),
]);

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One connected provider account. A workspace may hold many accounts for the
 * same provider ("AWS personal", "AWS client"), so `provider` is never unique.
 *
 * `provider` is a slug resolved against the code-side registry in
 * lib/providers/registry.ts rather than a `providers` table — capabilities are
 * a property of the adapter implementation, and a table would drift from it.
 */
export const connectedAccounts = pgTable("connected_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  /** User-facing label, e.g. "AWS — client work". */
  displayName: text("display_name").notNull(),
  /** Provider-side account identity (AWS account id, GitHub login, Atlas org). */
  externalAccountId: text("external_account_id"),
  status: connectedAccountStatus("status").notNull().default("connected"),
  /** Non-secret connection details: region, org slug, granted scopes. */
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: syncStatus("last_sync_status"),
  /** Human-readable reason shown next to a failed sync. Never contains secrets. */
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("connected_accounts_workspace_idx").on(t.workspaceId),
  uniqueIndex("connected_accounts_identity_key").on(
    t.workspaceId,
    t.provider,
    t.externalAccountId,
  ),
]);

/**
 * Encrypted provider secrets, isolated from `connectedAccounts` on purpose:
 * listing integrations never selects from this table, so a missing column
 * projection cannot leak a key into an API response.
 *
 * `keyVersion` supports rotation — re-encrypt rows under a new key without
 * downtime. Plaintext never leaves the server; see lib/crypto/secrets.ts.
 */
export const providerCredentials = pgTable("provider_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectedAccountId: uuid("connected_account_id")
    .notNull()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  /** AES-256-GCM payload: base64(iv).base64(ciphertext).base64(authTag). */
  ciphertext: text("ciphertext").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  /** For OAuth credentials that must be refreshed before use. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("provider_credentials_account_key").on(t.connectedAccountId),
]);

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The normalized record of one externally provisioned object.
 *
 * Association is deliberately nullable: `projectId IS NULL` is the definition
 * of an unassociated resource, which is a headline feature rather than an
 * error state.
 */
export const resources = pgTable("resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectedAccountId: uuid("connected_account_id")
    .notNull()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  /** The provider's own id. Stable within an account; never a Forge key. */
  providerResourceId: text("provider_resource_id").notNull(),
  /** Adapter-normalized type slug, e.g. "aws.ec2.instance", "github.repository". */
  resourceType: text("resource_type").notNull(),
  name: text("name").notNull(),
  region: text("region"),

  // --- association -------------------------------------------------------
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  environmentId: uuid("environment_id").references(() => environments.id, {
    onDelete: "set null",
  }),
  serviceId: uuid("service_id").references(() => services.id, {
    onDelete: "set null",
  }),

  // --- state -------------------------------------------------------------
  presence: resourcePresence("presence").notNull().default("live"),
  /** Provider's raw state string, kept verbatim for the detail view. */
  providerStatus: text("provider_status"),
  /** Provider state mapped onto Forge's semantic scale. */
  healthStatus: statusLevel("health_status").notNull().default("unknown"),

  // --- observations (facts) ----------------------------------------------
  /** When the provider says the resource was created. */
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  discoveredAt: timestamp("discovered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Last sync in which the provider still returned this resource. */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /**
   * Last observed *use* — a request, commit, CPU signal. Deliberately separate
   * from `lastSeenAt`: a resource can be discovered hourly and never used.
   */
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  lastStatusChangeAt: timestamp("last_status_change_at", {
    withTimezone: true,
  }),

  // --- inference ---------------------------------------------------------
  activityState: activityState("activity_state").notNull().default("unknown"),
  /** Why Forge inferred that state, so the UI can show evidence, not a verdict. */
  activityReason: text("activity_reason"),
  activityComputedAt: timestamp("activity_computed_at", { withTimezone: true }),

  // --- latest cost (denormalized from costRecords for fast inventory scans) -
  costAmount: numeric("cost_amount", { precision: 14, scale: 4 }),
  costCurrency: text("cost_currency"),
  costPeriod: costPeriod("cost_period"),
  costAccuracy: costAccuracy("cost_accuracy").notNull().default("unavailable"),
  costAsOf: timestamp("cost_as_of", { withTimezone: true }),

  // --- user actions ------------------------------------------------------
  /** "Ignore": stop surfacing in attention lists, keep in inventory. */
  ignoredAt: timestamp("ignored_at", { withTimezone: true }),
  /** "Archive": user considers it retired. Forge never deletes at the provider. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  managementUrl: text("management_url"),
  /** Provider-specific fields that must not pollute the core schema. */
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // Sync upserts on this pair — the provider id is only unique within an account.
  uniqueIndex("resources_account_provider_id_key").on(
    t.connectedAccountId,
    t.providerResourceId,
  ),
  index("resources_workspace_idx").on(t.workspaceId),
  index("resources_project_idx").on(t.projectId),
  // Drives the "unassociated resources" view.
  index("resources_workspace_project_idx").on(t.workspaceId, t.projectId),
  index("resources_workspace_type_idx").on(t.workspaceId, t.resourceType),
  index("resources_activity_idx").on(t.workspaceId, t.activityState),
]);

/**
 * Dependency graph edges. Not surfaced in V1, but modelling it now costs one
 * table and avoids reshaping the inventory later.
 */
export const resourceRelationships = pgTable("resource_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  fromResourceId: uuid("from_resource_id")
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  toResourceId: uuid("to_resource_id")
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  kind: relationshipKind("kind").notNull(),
  /** True when Forge guessed the edge rather than reading it from a provider. */
  inferred: boolean("inferred").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("resource_relationships_edge_key").on(
    t.fromResourceId,
    t.toResourceId,
    t.kind,
  ),
  index("resource_relationships_workspace_idx").on(t.workspaceId),
]);

/* -------------------------------------------------------------------------- */
/* Health, activity, cost                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Health is tracked independently of existence. A check may target a resource,
 * a service, or a bare URL belonging to a project.
 */
export const healthChecks = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  serviceId: uuid("service_id").references(() => services.id, {
    onDelete: "cascade",
  }),
  resourceId: uuid("resource_id").references(() => resources.id, {
    onDelete: "cascade",
  }),
  kind: healthCheckKind("kind").notNull(),
  /** Check-specific config: url, method, expected status, timeout. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  intervalSeconds: integer("interval_seconds").notNull().default(300),
  lastStatus: statusLevel("last_status").notNull().default("unknown"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("health_checks_workspace_idx").on(t.workspaceId),
  index("health_checks_due_idx").on(t.enabled, t.lastCheckedAt),
]);

export const healthCheckResults = pgTable("health_check_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  healthCheckId: uuid("health_check_id")
    .notNull()
    .references(() => healthChecks.id, { onDelete: "cascade" }),
  status: statusLevel("status").notNull(),
  latencyMs: integer("latency_ms"),
  detail: text("detail"),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("health_check_results_check_time_idx").on(t.healthCheckId, t.checkedAt),
]);

/**
 * Append-only observed activity. This is the evidence behind `activityState`;
 * without a row here, Forge must report "unknown" rather than "unused".
 */
export const activityRecords = pgTable("activity_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  /** Adapter-defined signal, e.g. "github.push", "aws.cpu_utilization". */
  signal: text("signal").notNull(),
  /** When the activity happened at the provider — not when Forge read it. */
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  value: jsonb("value").$type<Record<string, unknown>>(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("activity_records_resource_time_idx").on(t.resourceId, t.observedAt),
  index("activity_records_workspace_idx").on(t.workspaceId),
]);

/** Historical cost per resource per period. Always carries its accuracy label. */
export const costRecords = pgTable("cost_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  /** Provider's billing currency. Forge does not silently convert currencies. */
  currency: text("currency").notNull(),
  accuracy: costAccuracy("accuracy").notNull(),
  /** Which API produced the figure, for auditability. */
  source: text("source"),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("cost_records_period_key").on(
    t.resourceId,
    t.periodStart,
    t.periodEnd,
  ),
  index("cost_records_workspace_idx").on(t.workspaceId),
]);

/* -------------------------------------------------------------------------- */
/* Background work                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Queue of provider work. Serverless functions cannot hold long-running
 * workers, so a cron endpoint claims rows here and drains them.
 *
 * A failed job records the error and leaves inventory untouched — a provider
 * outage must never look like "all your resources disappeared".
 */
export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectedAccountId: uuid("connected_account_id")
    .notNull()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  kind: syncKind("kind").notNull(),
  status: syncStatus("status").notNull().default("queued"),
  attempt: integer("attempt").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  /** Counts: discovered / created / updated / missing. Drives the sync report. */
  stats: jsonb("stats").$type<Record<string, number>>(),
}, (t) => [
  index("sync_jobs_claim_idx").on(t.status, t.scheduledAt),
  index("sync_jobs_account_idx").on(t.connectedAccountId),
]);

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type ActivityRecord = typeof activityRecords.$inferSelect;
export type CostRecord = typeof costRecords.$inferSelect;
export type HealthCheck = typeof healthChecks.$inferSelect;
