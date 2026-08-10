/**
 * Demo inventory.
 *
 * Structured to mirror the real domain model rather than scattered through
 * components, so the query layer in lib/data/queries.ts can be repointed at
 * Postgres without any page changing.
 *
 * Timestamps are anchored to a fixed `SEED_NOW` instead of `Date.now()`. Two
 * reasons: server and client render identical strings (no hydration mismatch),
 * and the demo keeps telling the same story instead of ageing into nonsense.
 *
 * The data is generic on purpose — invented accounts, invented resource ids,
 * example.com domains. Nothing here corresponds to a real account.
 */

import type {
  ActivityState,
  ConnectedAccount,
  CostAccuracy,
  Environment,
  Project,
  Resource,
  ResourcePresence,
  Service,
  StatusLevel,
} from "@/lib/data/types";

/** The moment the demo snapshot was "taken". */
export const SEED_NOW = new Date("2026-08-10T09:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(SEED_NOW.getTime() - days * 86_400_000).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(SEED_NOW.getTime() - minutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Connected accounts                                                          */
/* -------------------------------------------------------------------------- */

export const CONNECTED_ACCOUNTS: ConnectedAccount[] = [
  {
    id: "acc_gh_main",
    workspaceId: "ws_demo",
    provider: "github",
    displayName: "GitHub — primary",
    externalAccountId: "example-org",
    status: "connected",
    lastSyncAt: minutesAgo(4),
    lastSyncStatus: "succeeded",
    createdAt: daysAgo(214),
  },
  {
    id: "acc_aws_prod",
    workspaceId: "ws_demo",
    provider: "aws",
    displayName: "AWS — production",
    externalAccountId: "4471••••2210",
    status: "connected",
    region: "us-east-1",
    lastSyncAt: minutesAgo(12),
    lastSyncStatus: "succeeded",
    createdAt: daysAgo(198),
  },
  {
    id: "acc_aws_lab",
    workspaceId: "ws_demo",
    provider: "aws",
    displayName: "AWS — experiments",
    externalAccountId: "9920••••1174",
    status: "needs_reauth",
    region: "ap-south-1",
    lastSyncAt: minutesAgo(188),
    lastSyncStatus: "failed",
    // Shown verbatim next to the account. Never contains the credential itself.
    lastSyncError: "Authentication failed — the access key was rejected (401).",
    createdAt: daysAgo(96),
  },
  {
    id: "acc_atlas_main",
    workspaceId: "ws_demo",
    provider: "mongodb-atlas",
    displayName: "MongoDB Atlas",
    externalAccountId: "org-6a2f94c1",
    status: "connected",
    lastSyncAt: minutesAgo(26),
    lastSyncStatus: "succeeded",
    createdAt: daysAgo(180),
  },
  {
    id: "acc_cf_main",
    workspaceId: "ws_demo",
    provider: "cloudflare",
    displayName: "Cloudflare",
    externalAccountId: "acct-2f7b31de",
    status: "connected",
    lastSyncAt: minutesAgo(51),
    lastSyncStatus: "succeeded",
    createdAt: daysAgo(160),
  },
  {
    id: "acc_vercel_main",
    workspaceId: "ws_demo",
    provider: "vercel",
    displayName: "Vercel — team",
    externalAccountId: "team_8fa21c",
    status: "connected",
    lastSyncAt: minutesAgo(8),
    lastSyncStatus: "partial",
    lastSyncError: "3 of 11 projects could not be read — rate limited.",
    createdAt: daysAgo(88),
  },
];

/* -------------------------------------------------------------------------- */
/* Projects, environments, services                                            */
/* -------------------------------------------------------------------------- */

export const PROJECTS: Project[] = [
  {
    id: "prj_ai_assistant",
    workspaceId: "ws_demo",
    name: "AI Assistant",
    slug: "ai-assistant",
    description:
      "Conversational assistant with a streaming API and a vector store.",
    status: "active",
    healthStatus: "healthy",
    createdAt: daysAgo(212),
    lastActivityAt: minutesAgo(38),
  },
  {
    id: "prj_commerce",
    workspaceId: "ws_demo",
    name: "Commerce Platform",
    slug: "commerce-platform",
    description: "Storefront, checkout and order management.",
    status: "active",
    healthStatus: "warning",
    createdAt: daysAgo(340),
    lastActivityAt: minutesAgo(142),
  },
  {
    id: "prj_vr",
    workspaceId: "ws_demo",
    name: "VR Experience",
    slug: "vr-experience",
    description: "WebXR scene delivery with an asset pipeline on object storage.",
    status: "active",
    healthStatus: "healthy",
    createdAt: daysAgo(154),
    lastActivityAt: daysAgo(2),
  },
  {
    id: "prj_analytics",
    workspaceId: "ws_demo",
    name: "Analytics Service",
    slug: "analytics-service",
    description: "Event ingestion, aggregation jobs and reporting API.",
    status: "active",
    healthStatus: "error",
    createdAt: daysAgo(268),
    lastActivityAt: minutesAgo(19),
  },
  {
    id: "prj_messaging",
    workspaceId: "ws_demo",
    name: "Messaging Platform",
    slug: "messaging-platform",
    description: "Realtime channels, presence and push notification fan-out.",
    status: "active",
    healthStatus: "warning",
    createdAt: daysAgo(122),
    lastActivityAt: daysAgo(6),
  },
  {
    id: "prj_legacy",
    workspaceId: "ws_demo",
    name: "Legacy Import Tool",
    slug: "legacy-import-tool",
    description: "Retired batch importer kept for reference.",
    status: "archived",
    healthStatus: "unknown",
    createdAt: daysAgo(520),
    lastActivityAt: daysAgo(214),
  },
];

export const ENVIRONMENTS: Environment[] = [
  { id: "env_ai_prod", projectId: "prj_ai_assistant", name: "Production", kind: "production" },
  { id: "env_ai_dev", projectId: "prj_ai_assistant", name: "Development", kind: "development" },
  { id: "env_com_prod", projectId: "prj_commerce", name: "Production", kind: "production" },
  { id: "env_com_stg", projectId: "prj_commerce", name: "Staging", kind: "staging" },
  { id: "env_vr_prod", projectId: "prj_vr", name: "Production", kind: "production" },
  { id: "env_an_prod", projectId: "prj_analytics", name: "Production", kind: "production" },
  { id: "env_an_dev", projectId: "prj_analytics", name: "Development", kind: "development" },
  { id: "env_msg_prod", projectId: "prj_messaging", name: "Production", kind: "production" },
  { id: "env_leg_prod", projectId: "prj_legacy", name: "Production", kind: "production" },
];

export const SERVICES: Service[] = [
  { id: "svc_ai_frontend", projectId: "prj_ai_assistant", name: "Frontend", description: "Web client and marketing shell.", healthStatus: "healthy" },
  { id: "svc_ai_api", projectId: "prj_ai_assistant", name: "Backend API", description: "Streaming inference gateway.", healthStatus: "healthy" },
  { id: "svc_ai_db", projectId: "prj_ai_assistant", name: "Database", description: "Conversation and embedding storage.", healthStatus: "healthy" },
  { id: "svc_ai_storage", projectId: "prj_ai_assistant", name: "Storage", description: "Uploaded documents and generated artifacts.", healthStatus: "healthy" },
  { id: "svc_ai_dns", projectId: "prj_ai_assistant", name: "DNS", description: "Public hostnames and certificates.", healthStatus: "healthy" },

  { id: "svc_com_frontend", projectId: "prj_commerce", name: "Storefront", description: "Customer-facing storefront.", healthStatus: "healthy" },
  { id: "svc_com_api", projectId: "prj_commerce", name: "Orders API", description: "Checkout, orders and fulfilment.", healthStatus: "warning" },
  { id: "svc_com_db", projectId: "prj_commerce", name: "Database", description: "Relational store for catalogue and orders.", healthStatus: "healthy" },
  { id: "svc_com_storage", projectId: "prj_commerce", name: "Media", description: "Product imagery.", healthStatus: "healthy" },
  { id: "svc_com_dns", projectId: "prj_commerce", name: "DNS", description: "Zone and edge caching.", healthStatus: "healthy" },

  { id: "svc_vr_frontend", projectId: "prj_vr", name: "Scene Client", description: "WebXR runtime bundle.", healthStatus: "healthy" },
  { id: "svc_vr_assets", projectId: "prj_vr", name: "Asset Pipeline", description: "Mesh and texture processing output.", healthStatus: "healthy" },
  { id: "svc_vr_dns", projectId: "prj_vr", name: "DNS", description: "Public hostname.", healthStatus: "healthy" },

  { id: "svc_an_ingest", projectId: "prj_analytics", name: "Ingestion", description: "Event intake endpoint.", healthStatus: "error" },
  { id: "svc_an_jobs", projectId: "prj_analytics", name: "Aggregation Jobs", description: "Scheduled rollups.", healthStatus: "healthy" },
  { id: "svc_an_db", projectId: "prj_analytics", name: "Database", description: "Event and rollup storage.", healthStatus: "healthy" },
  { id: "svc_an_storage", projectId: "prj_analytics", name: "Cold Storage", description: "Raw event archive.", healthStatus: "healthy" },

  { id: "svc_msg_gateway", projectId: "prj_messaging", name: "Gateway", description: "WebSocket connection handling.", healthStatus: "warning" },
  { id: "svc_msg_db", projectId: "prj_messaging", name: "Database", description: "Channel and message storage.", healthStatus: "healthy" },
  { id: "svc_msg_frontend", projectId: "prj_messaging", name: "Console", description: "Operator console.", healthStatus: "healthy" },

  { id: "svc_leg_batch", projectId: "prj_legacy", name: "Batch Runner", description: "Retired import worker.", healthStatus: "unknown" },
];

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

interface ResourceInput {
  id: string;
  account: string;
  provider: string;
  providerResourceId: string;
  type: string;
  name: string;
  region?: string;
  project?: string;
  env?: string;
  service?: string;
  presence?: ResourcePresence;
  providerStatus?: string;
  health?: StatusLevel;
  /** Days before SEED_NOW. */
  created: number;
  seen?: number;
  /** Days before SEED_NOW, or null when no usage signal exists at all. */
  activity?: number | null;
  state?: ActivityState;
  reason?: string;
  cost?: number;
  accuracy?: CostAccuracy;
  meta?: Record<string, string>;
}

/**
 * `activity: null` means the provider offers no usage signal for this resource
 * type — which is why `activityState` then has to be "unknown" rather than
 * "potentially unused". Absence of evidence is not evidence of disuse.
 */
function build(input: ResourceInput): Resource {
  const hasActivity = input.activity !== null && input.activity !== undefined;
  return {
    id: input.id,
    workspaceId: "ws_demo",
    connectedAccountId: input.account,
    provider: input.provider,
    providerResourceId: input.providerResourceId,
    resourceType: input.type,
    name: input.name,
    region: input.region,
    projectId: input.project,
    environmentId: input.env,
    serviceId: input.service,
    presence: input.presence ?? "live",
    providerStatus: input.providerStatus,
    healthStatus: input.health ?? "healthy",
    providerCreatedAt: daysAgo(input.created),
    discoveredAt: daysAgo(Math.min(input.created, 214)),
    lastSeenAt: minutesAgo((input.seen ?? 0.01) * 1440),
    lastActivityAt: hasActivity ? daysAgo(input.activity as number) : undefined,
    activityState: input.state ?? (hasActivity ? "active" : "unknown"),
    activityReason: input.reason,
    costAmount: input.cost,
    costCurrency: input.cost === undefined ? undefined : "USD",
    costPeriod: input.cost === undefined ? undefined : "monthly",
    costAccuracy: input.accuracy ?? (input.cost === undefined ? "unavailable" : "provider_reported"),
    costAsOf: input.cost === undefined ? undefined : daysAgo(1),
    managementUrl: undefined,
    metadata: input.meta,
  };
}

export const RESOURCES: Resource[] = [
  /* --- AI Assistant ----------------------------------------------------- */
  build({ id: "res_ai_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/ai-assistant", type: "github.repository", name: "ai-assistant", project: "prj_ai_assistant", service: "svc_ai_api", created: 212, activity: 0.03, reason: "Push to main observed 38 minutes ago.", meta: { visibility: "private", branch: "main", language: "TypeScript" } }),
  build({ id: "res_ai_web", account: "acc_vercel_main", provider: "vercel", providerResourceId: "prj_9182ac", type: "vercel.project", name: "ai-assistant-web", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_frontend", created: 88, activity: 0.05, reason: "Production deployment succeeded 1 hour ago.", meta: { framework: "Next.js", domain: "assistant.example.com" } }),
  build({ id: "res_ai_api_ec2", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-0d4a91c7be22f0a13", type: "aws.ec2.instance", name: "ai-assistant-api-prod", region: "us-east-1", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_api", providerStatus: "running", created: 190, activity: 0.01, reason: "Sustained CPU and network activity in the last hour.", cost: 62.4, meta: { instanceType: "t3.large", vpc: "vpc-0a91f2" } }),
  build({ id: "res_ai_ebs", account: "acc_aws_prod", provider: "aws", providerResourceId: "vol-0b17e8a4c9d2f3011", type: "aws.ebs.volume", name: "ai-assistant-api-root", region: "us-east-1", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_api", providerStatus: "in-use", created: 190, activity: 0.01, cost: 8, accuracy: "provider_reported", meta: { size: "80 GiB", type: "gp3", attachedTo: "i-0d4a91c7be22f0a13" } }),
  build({ id: "res_ai_s3", account: "acc_aws_prod", provider: "aws", providerResourceId: "ai-assistant-documents", type: "aws.s3.bucket", name: "ai-assistant-documents", region: "us-east-1", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_storage", created: 188, activity: 0.2, reason: "Object writes observed in the last 24 hours.", cost: 14.15, meta: { objects: "128,402", size: "412 GB" } }),
  build({ id: "res_ai_mongo", account: "acc_atlas_main", provider: "mongodb-atlas", providerResourceId: "ai-assistant-prod", type: "mongodb.cluster", name: "ai-assistant-prod", region: "us-east-1", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_db", providerStatus: "IDLE", created: 180, activity: 0.02, reason: "Connections and operations observed in the last hour.", cost: 57, meta: { tier: "M20", version: "7.0" } }),
  build({ id: "res_ai_mongo_dev", account: "acc_atlas_main", provider: "mongodb-atlas", providerResourceId: "ai-assistant-dev", type: "mongodb.cluster", name: "ai-assistant-dev", region: "us-east-1", project: "prj_ai_assistant", env: "env_ai_dev", service: "svc_ai_db", providerStatus: "IDLE", created: 178, activity: 9, state: "recently_inactive", reason: "No connections observed for 9 days.", cost: 9, meta: { tier: "M10", version: "7.0" } }),
  build({ id: "res_ai_zone", account: "acc_cf_main", provider: "cloudflare", providerResourceId: "zone_4a71c2", type: "cloudflare.zone", name: "assistant.example.com", project: "prj_ai_assistant", env: "env_ai_prod", service: "svc_ai_dns", providerStatus: "active", created: 160, activity: 0.04, reason: "DNS queries served in the last hour.", meta: { plan: "Free", records: "14" } }),

  /* --- Commerce Platform ------------------------------------------------ */
  build({ id: "res_com_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/commerce-platform", type: "github.repository", name: "commerce-platform", project: "prj_commerce", service: "svc_com_api", created: 340, activity: 0.1, reason: "Push to main observed 2 hours ago.", meta: { visibility: "private", branch: "main", language: "Go" } }),
  build({ id: "res_com_web", account: "acc_vercel_main", provider: "vercel", providerResourceId: "prj_5521ff", type: "vercel.project", name: "commerce-storefront", project: "prj_commerce", env: "env_com_prod", service: "svc_com_frontend", created: 84, activity: 1, reason: "Production deployment succeeded 1 day ago.", meta: { framework: "Next.js", domain: "shop.example.com" } }),
  build({ id: "res_com_api", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-07f2b6e1a8c94d552", type: "aws.ec2.instance", name: "commerce-orders-api", region: "us-east-1", project: "prj_commerce", env: "env_com_prod", service: "svc_com_api", providerStatus: "running", health: "warning", created: 300, activity: 0.01, reason: "Health check has returned 503 for 18 of the last 60 minutes.", cost: 124.8, meta: { instanceType: "m5.large", vpc: "vpc-0a91f2" } }),
  build({ id: "res_com_api_stg", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-01c8d93f7ba2e6604", type: "aws.ec2.instance", name: "commerce-orders-api-staging", region: "us-east-1", project: "prj_commerce", env: "env_com_stg", service: "svc_com_api", providerStatus: "running", created: 240, activity: 22, state: "potentially_unused", reason: "No inbound requests and CPU below 2% for 22 days.", cost: 62.4, meta: { instanceType: "t3.large" } }),
  build({ id: "res_com_rds", account: "acc_aws_prod", provider: "aws", providerResourceId: "commerce-orders-db", type: "aws.rds.instance", name: "commerce-orders-db", region: "us-east-1", project: "prj_commerce", env: "env_com_prod", service: "svc_com_db", providerStatus: "available", created: 298, activity: 0.01, reason: "Query activity observed in the last hour.", cost: 198.2, meta: { engine: "PostgreSQL 16", class: "db.m5.large", storage: "200 GiB" } }),
  build({ id: "res_com_s3", account: "acc_aws_prod", provider: "aws", providerResourceId: "commerce-product-media", type: "aws.s3.bucket", name: "commerce-product-media", region: "us-east-1", project: "prj_commerce", env: "env_com_prod", service: "svc_com_storage", created: 296, activity: 0.5, cost: 31.7, meta: { objects: "48,210", size: "1.2 TB" } }),
  build({ id: "res_com_alb", account: "acc_aws_prod", provider: "aws", providerResourceId: "commerce-prod-alb", type: "aws.elb.load_balancer", name: "commerce-prod-alb", region: "us-east-1", project: "prj_commerce", env: "env_com_prod", service: "svc_com_api", providerStatus: "active", health: "warning", created: 295, activity: 0.01, reason: "1 of 2 target group members is failing health checks.", cost: 22.5, meta: { scheme: "internet-facing", targets: "2" } }),
  build({ id: "res_com_zone", account: "acc_cf_main", provider: "cloudflare", providerResourceId: "zone_9d11ba", type: "cloudflare.zone", name: "shop.example.com", project: "prj_commerce", env: "env_com_prod", service: "svc_com_dns", providerStatus: "active", created: 158, activity: 0.02, meta: { plan: "Pro", records: "31" } }),

  /* --- VR Experience ---------------------------------------------------- */
  build({ id: "res_vr_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/vr-experience", type: "github.repository", name: "vr-experience", project: "prj_vr", service: "svc_vr_frontend", created: 154, activity: 2, reason: "Push to main observed 2 days ago.", meta: { visibility: "public", branch: "main", language: "TypeScript" } }),
  build({ id: "res_vr_s3", account: "acc_aws_prod", provider: "aws", providerResourceId: "vr-experience-assets", type: "aws.s3.bucket", name: "vr-experience-assets", region: "us-east-1", project: "prj_vr", env: "env_vr_prod", service: "svc_vr_assets", created: 150, activity: 2, cost: 46.9, meta: { objects: "9,884", size: "2.8 TB" } }),
  build({ id: "res_vr_cdn", account: "acc_cf_main", provider: "cloudflare", providerResourceId: "zone_71fc03", type: "cloudflare.zone", name: "vr.example.com", project: "prj_vr", env: "env_vr_prod", service: "svc_vr_dns", providerStatus: "active", created: 148, activity: 0.3, meta: { plan: "Pro", records: "9" } }),
  build({ id: "res_vr_worker", account: "acc_cf_main", provider: "cloudflare", providerResourceId: "worker_asset_signer", type: "cloudflare.worker", name: "vr-asset-signer", project: "prj_vr", env: "env_vr_prod", service: "svc_vr_assets", providerStatus: "deployed", created: 140, activity: 0.3, reason: "Worker invocations observed in the last 8 hours.", meta: { routes: "1" } }),
  build({ id: "res_vr_build", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-0aa72e19b4c8d0e77", type: "aws.ec2.instance", name: "vr-asset-builder", region: "us-east-1", project: "prj_vr", env: "env_vr_prod", service: "svc_vr_assets", providerStatus: "stopped", health: "unknown", created: 145, activity: 12, state: "recently_inactive", reason: "Instance has been stopped for 12 days.", cost: 0, accuracy: "provider_reported", meta: { instanceType: "c5.2xlarge", note: "Stopped instances still bill for attached storage." } }),
  build({ id: "res_vr_ebs", account: "acc_aws_prod", provider: "aws", providerResourceId: "vol-0f61c72d8b9a45e30", type: "aws.ebs.volume", name: "vr-asset-builder-data", region: "us-east-1", project: "prj_vr", env: "env_vr_prod", service: "svc_vr_assets", providerStatus: "in-use", created: 145, activity: 12, cost: 40, meta: { size: "400 GiB", type: "gp3", attachedTo: "i-0aa72e19b4c8d0e77" } }),

  /* --- Analytics Service ------------------------------------------------ */
  build({ id: "res_an_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/analytics-service", type: "github.repository", name: "analytics-service", project: "prj_analytics", service: "svc_an_ingest", created: 268, activity: 0.02, reason: "Push to main observed 19 minutes ago.", meta: { visibility: "private", branch: "main", language: "Rust" } }),
  build({ id: "res_an_ingest", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-06b3f81ca7e9d2440", type: "aws.ec2.instance", name: "analytics-ingest-prod", region: "us-east-1", project: "prj_analytics", env: "env_an_prod", service: "svc_an_ingest", providerStatus: "running", health: "error", created: 260, activity: 0.01, reason: "Ingestion endpoint has returned 5xx continuously for 42 minutes.", cost: 124.8, meta: { instanceType: "m5.large" } }),
  build({ id: "res_an_lambda", account: "acc_aws_prod", provider: "aws", providerResourceId: "analytics-rollup-hourly", type: "aws.lambda.function", name: "analytics-rollup-hourly", region: "us-east-1", project: "prj_analytics", env: "env_an_prod", service: "svc_an_jobs", providerStatus: "Active", created: 256, activity: 0.03, reason: "1,412 invocations in the last 24 hours.", cost: 6.2, meta: { runtime: "nodejs22.x", memory: "1024 MB" } }),
  build({ id: "res_an_mongo", account: "acc_atlas_main", provider: "mongodb-atlas", providerResourceId: "analytics-prod", type: "mongodb.cluster", name: "analytics-prod", region: "us-east-1", project: "prj_analytics", env: "env_an_prod", service: "svc_an_db", providerStatus: "IDLE", created: 250, activity: 0.01, cost: 189, meta: { tier: "M30", version: "7.0" } }),
  build({ id: "res_an_s3", account: "acc_aws_prod", provider: "aws", providerResourceId: "analytics-cold-archive", type: "aws.s3.bucket", name: "analytics-cold-archive", region: "us-east-1", project: "prj_analytics", env: "env_an_prod", service: "svc_an_storage", created: 248, activity: 0.9, cost: 88.4, meta: { objects: "2,140,882", size: "9.4 TB", storageClass: "Glacier Instant Retrieval" } }),
  build({ id: "res_an_dev_ec2", account: "acc_aws_lab", provider: "aws", providerResourceId: "i-09d1e77b3f4a06c28", type: "aws.ec2.instance", name: "analytics-dev-sandbox", region: "ap-south-1", project: "prj_analytics", env: "env_an_dev", providerStatus: "running", health: "unknown", created: 96, activity: null, state: "unknown", reason: "Activity could not be collected — the account's last sync failed.", cost: 31.2, accuracy: "estimated", meta: { instanceType: "t3.medium" } }),

  /* --- Messaging Platform ----------------------------------------------- */
  build({ id: "res_msg_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/messaging-platform", type: "github.repository", name: "messaging-platform", project: "prj_messaging", service: "svc_msg_gateway", created: 122, activity: 6, reason: "Push to main observed 6 days ago.", meta: { visibility: "private", branch: "main", language: "Elixir" } }),
  build({ id: "res_msg_gateway", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-04e7a2c19b8f3d016", type: "aws.ec2.instance", name: "messaging-gateway-prod", region: "us-east-1", project: "prj_messaging", env: "env_msg_prod", service: "svc_msg_gateway", providerStatus: "running", health: "warning", created: 120, activity: 0.01, reason: "Connection error rate above 4% for the last 3 hours.", cost: 62.4, meta: { instanceType: "t3.large" } }),
  build({ id: "res_msg_mongo", account: "acc_atlas_main", provider: "mongodb-atlas", providerResourceId: "messaging-prod", type: "mongodb.cluster", name: "messaging-prod", region: "us-east-1", project: "prj_messaging", env: "env_msg_prod", service: "svc_msg_db", providerStatus: "IDLE", created: 118, activity: 0.01, cost: 57, meta: { tier: "M20", version: "7.0" } }),
  build({ id: "res_msg_console", account: "acc_vercel_main", provider: "vercel", providerResourceId: "prj_7734bd", type: "vercel.project", name: "messaging-console", project: "prj_messaging", env: "env_msg_prod", service: "svc_msg_frontend", created: 80, activity: 6, reason: "Production deployment succeeded 6 days ago.", meta: { framework: "Next.js", domain: "messaging.example.com" } }),

  /* --- Legacy (archived project) ---------------------------------------- */
  build({ id: "res_leg_repo", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/legacy-import-tool", type: "github.repository", name: "legacy-import-tool", project: "prj_legacy", service: "svc_leg_batch", health: "unknown", created: 520, activity: 214, state: "potentially_unused", reason: "No commits, issues or releases observed for 214 days.", meta: { visibility: "private", branch: "master", language: "Python" } }),
  build({ id: "res_leg_ec2", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-0c5b8f21e7a94d306", type: "aws.ec2.instance", name: "legacy-import-runner", region: "us-east-1", project: "prj_legacy", env: "env_leg_prod", service: "svc_leg_batch", providerStatus: "terminated", presence: "missing", health: "unknown", created: 515, seen: 34, activity: 220, state: "unknown", reason: "Not returned by the provider since the sync 34 days ago.", meta: { instanceType: "t2.medium" } }),

  /* --- Unassociated ------------------------------------------------------ */
  build({ id: "res_un_ec2_a", account: "acc_aws_prod", provider: "aws", providerResourceId: "i-0e93a7c41d8b25f70", type: "aws.ec2.instance", name: "temp-migration-box", region: "us-east-1", providerStatus: "running", health: "warning", created: 212, activity: 63, state: "potentially_unused", reason: "No inbound network traffic and CPU below 1% for 63 days.", cost: 62.4, meta: { instanceType: "t3.large" } }),
  build({ id: "res_un_ebs_a", account: "acc_aws_prod", provider: "aws", providerResourceId: "vol-0d82be51f7c3a9004", type: "aws.ebs.volume", name: "unattached-volume-01", region: "us-east-1", providerStatus: "available", health: "warning", created: 205, activity: null, state: "potentially_unused", reason: "Volume has been detached from any instance since it was first discovered.", cost: 20, meta: { size: "200 GiB", type: "gp3", attachedTo: "none" } }),
  build({ id: "res_un_ebs_b", account: "acc_aws_prod", provider: "aws", providerResourceId: "vol-0197c4ea28fb6d115", type: "aws.ebs.volume", name: "unattached-volume-02", region: "us-east-1", providerStatus: "available", health: "warning", created: 141, activity: null, state: "potentially_unused", reason: "Volume has been detached from any instance since it was first discovered.", cost: 10, meta: { size: "100 GiB", type: "gp2", attachedTo: "none" } }),
  build({ id: "res_un_eip", account: "acc_aws_prod", provider: "aws", providerResourceId: "eipalloc-0b71c9d2fa4e8360a", type: "aws.ec2.elastic_ip", name: "203.0.113.47", region: "us-east-1", providerStatus: "unassociated", health: "warning", created: 190, activity: null, state: "potentially_unused", reason: "Elastic IP is not associated with any instance.", cost: 3.6, meta: { scope: "vpc" } }),
  build({ id: "res_un_s3", account: "acc_aws_prod", provider: "aws", providerResourceId: "old-site-backup-2024", type: "aws.s3.bucket", name: "old-site-backup-2024", region: "us-east-1", created: 480, activity: 402, state: "potentially_unused", reason: "No read or write requests observed for 402 days.", cost: 12.8, meta: { objects: "1,204", size: "340 GB" } }),
  build({ id: "res_un_sg", account: "acc_aws_prod", provider: "aws", providerResourceId: "sg-0f31b8e7c2a49d015", type: "aws.ec2.security_group", name: "legacy-open-access", region: "us-east-1", health: "warning", created: 470, activity: null, state: "unknown", reason: "Security groups expose no usage signal; association could not be determined.", meta: { rules: "6", vpc: "vpc-0a91f2" } }),
  build({ id: "res_un_mongo", account: "acc_atlas_main", provider: "mongodb-atlas", providerResourceId: "scratch-cluster", type: "mongodb.cluster", name: "scratch-cluster", region: "eu-west-1", providerStatus: "IDLE", health: "warning", created: 88, activity: 47, state: "potentially_unused", reason: "No client connections observed for 47 days.", cost: 57, meta: { tier: "M20", version: "6.0" } }),
  build({ id: "res_un_repo_a", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/design-tokens-spike", type: "github.repository", name: "design-tokens-spike", created: 96, activity: 71, state: "potentially_unused", reason: "No commits, issues or releases observed for 71 days.", meta: { visibility: "private", branch: "main", language: "CSS" } }),
  build({ id: "res_un_repo_b", account: "acc_gh_main", provider: "github", providerResourceId: "example-org/infra-notes", type: "github.repository", name: "infra-notes", created: 44, activity: 3, reason: "Push to main observed 3 days ago.", meta: { visibility: "private", branch: "main", language: "Markdown" } }),
  build({ id: "res_un_vercel", account: "acc_vercel_main", provider: "vercel", providerResourceId: "prj_2210cd", type: "vercel.project", name: "marketing-preview", created: 31, activity: 24, state: "recently_inactive", reason: "No deployment in 24 days.", meta: { framework: "Astro", domain: "preview.example.com" } }),
  build({ id: "res_un_zone", account: "acc_cf_main", provider: "cloudflare", providerResourceId: "zone_08bd41", type: "cloudflare.zone", name: "old-domain.example.com", providerStatus: "active", created: 400, activity: 122, state: "potentially_unused", reason: "No DNS queries served for 122 days.", meta: { plan: "Free", records: "3" } }),
  build({ id: "res_un_lambda", account: "acc_aws_lab", provider: "aws", providerResourceId: "experiment-webhook-relay", type: "aws.lambda.function", name: "experiment-webhook-relay", region: "ap-south-1", providerStatus: "Active", health: "unknown", created: 78, activity: null, state: "unknown", reason: "Activity could not be collected — the account's last sync failed.", accuracy: "unavailable", meta: { runtime: "python3.12", memory: "256 MB" } }),
];
