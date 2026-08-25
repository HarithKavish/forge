/**
 * The read API the UI talks to.
 *
 * Now backed by Postgres. Pages call these functions and receive view models
 * with ISO-string timestamps, so nothing below has to think about serialising
 * a Date across the server/client boundary.
 *
 * Every function takes a `workspaceId` and passes it to lib/core/, where the
 * `where` clause lives. That is the tenancy boundary.
 */

import {
  getConnectedAccount as coreGetAccount,
  listAccountsForProvider as coreAccountsForProvider,
  listConnectedAccounts as coreListAccounts,
  type ConnectedAccountRow,
} from "@/lib/core/connected-accounts";
import {
  getProjectRow,
  listEnvironmentRows,
  listProjectRows,
  listServiceRows,
  type EnvironmentRow,
  type ProjectRow,
  type ServiceRow,
} from "@/lib/core/projects";
import {
  getResourceRow,
  listResourceRows,
  type ResourceFilters,
  type ResourceRow,
  type ResourceView,
} from "@/lib/core/resources";
import { PROVIDERS, getProvider, providerName } from "@/lib/providers/catalogue";
import type {
  Alert,
  ConnectedAccount,
  Environment,
  Project,
  ProjectSummary,
  ProviderInfo,
  Resource,
  Service,
  WorkspaceOverview,
} from "./types";

export type { ResourceView, ResourceFilters };

const iso = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString() : undefined;

/* -------------------------------------------------------------------------- */
/* Mappers                                                                     */
/* -------------------------------------------------------------------------- */

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    connectedAccountId: row.connectedAccountId,
    provider: row.provider,
    providerResourceId: row.providerResourceId,
    resourceType: row.resourceType,
    name: row.name,
    region: row.region ?? undefined,
    projectId: row.projectId ?? undefined,
    environmentId: row.environmentId ?? undefined,
    serviceId: row.serviceId ?? undefined,
    presence: row.presence,
    providerStatus: row.providerStatus ?? undefined,
    healthStatus: row.healthStatus,
    providerCreatedAt: iso(row.providerCreatedAt),
    discoveredAt: row.discoveredAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastActivityAt: iso(row.lastActivityAt),
    activityState: row.activityState,
    activityReason: row.activityReason ?? undefined,
    // numeric() comes back as a string; absent stays absent rather than zero.
    costAmount: row.costAmount === null ? undefined : Number(row.costAmount),
    costCurrency: row.costCurrency ?? undefined,
    costPeriod: row.costPeriod ?? undefined,
    costAccuracy: row.costAccuracy,
    costAsOf: iso(row.costAsOf),
    managementUrl: row.managementUrl ?? undefined,
    metadata: (row.metadata as Record<string, string> | null) ?? undefined,
    ignoredAt: iso(row.ignoredAt),
  };
}

function toAccount(row: ConnectedAccountRow): ConnectedAccount {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    displayName: row.displayName,
    externalAccountId: row.externalAccountId ?? "",
    status: row.status,
    region: (row.settings as Record<string, string> | null)?.region,
    lastSyncAt: iso(row.lastSyncAt),
    lastSyncStatus: row.lastSyncStatus ?? undefined,
    lastSyncError: row.lastSyncError ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    status: row.status,
    healthStatus: row.healthStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

const toService = (row: ServiceRow): Service => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  description: row.description ?? "",
  healthStatus: row.healthStatus,
});

const toEnvironment = (row: EnvironmentRow): Environment => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  kind: row.kind,
});

/* -------------------------------------------------------------------------- */
/* Providers and accounts                                                      */
/* -------------------------------------------------------------------------- */

export async function listProviders(): Promise<ProviderInfo[]> {
  return PROVIDERS;
}

export async function getProviderInfo(id: string): Promise<ProviderInfo | undefined> {
  return getProvider(id);
}

export async function listConnectedAccounts(workspaceId: string): Promise<ConnectedAccount[]> {
  return (await coreListAccounts(workspaceId)).map(toAccount);
}

export async function getConnectedAccount(
  workspaceId: string,
  accountId: string,
): Promise<ConnectedAccount | undefined> {
  const row = await coreGetAccount(workspaceId, accountId);
  return row ? toAccount(row) : undefined;
}

export async function listAccountsForProvider(
  workspaceId: string,
  providerId: string,
): Promise<ConnectedAccount[]> {
  return (await coreAccountsForProvider(workspaceId, providerId)).map(toAccount);
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProjectFilters {
  search?: string;
  status?: "all" | "active" | "archived";
}

function summarize(project: Project, resources: Resource[], services: Service[], environments: Environment[]): ProjectSummary {
  const owned = resources.filter((r) => r.projectId === project.id);
  const providers = [...new Set(owned.map((r) => r.provider))];
  const lastActivity = owned
    .map((r) => r.lastActivityAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return {
    ...project,
    lastActivityAt: lastActivity,
    serviceCount: services.filter((s) => s.projectId === project.id).length,
    resourceCount: owned.length,
    providerCount: providers.length,
    providers,
    environments: environments
      .filter((e) => e.projectId === project.id)
      .map((e) => e.name),
    monthlyCost: owned.reduce((sum, r) => sum + (r.costAmount ?? 0), 0),
    unhealthyCount: owned.filter(
      (r) => r.healthStatus === "error" || r.healthStatus === "warning",
    ).length,
  };
}

export async function listProjects(
  workspaceId: string,
  filters: ProjectFilters = {},
): Promise<ProjectSummary[]> {
  const [projectRows, resourceRows, serviceRows, environmentRows] = await Promise.all([
    listProjectRows(workspaceId),
    listResourceRows(workspaceId),
    listServiceRows(workspaceId),
    listEnvironmentRows(workspaceId),
  ]);

  const resources = resourceRows.map(toResource);
  const services = serviceRows.map(toService);
  const environments = environmentRows.map(toEnvironment);
  const search = filters.search?.trim().toLowerCase();

  return projectRows
    .map(toProject)
    .filter((p) => {
      if (filters.status && filters.status !== "all" && p.status !== filters.status) return false;
      if (search) {
        return `${p.name} ${p.description} ${p.slug}`.toLowerCase().includes(search);
      }
      return true;
    })
    .map((p) => summarize(p, resources, services, environments));
}

export async function getProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectSummary | undefined> {
  const row = await getProjectRow(workspaceId, projectId);
  if (!row) return undefined;

  const [resourceRows, serviceRows, environmentRows] = await Promise.all([
    listResourceRows(workspaceId),
    listServiceRows(workspaceId),
    listEnvironmentRows(workspaceId),
  ]);

  return summarize(
    toProject(row),
    resourceRows.map(toResource),
    serviceRows.map(toService),
    environmentRows.map(toEnvironment),
  );
}

export async function listProjectRecords(workspaceId: string): Promise<Project[]> {
  return (await listProjectRows(workspaceId)).map(toProject);
}

export async function listServices(workspaceId: string, projectId: string): Promise<Service[]> {
  return (await listServiceRows(workspaceId, projectId)).map(toService);
}

export async function listEnvironments(
  workspaceId: string,
  projectId: string,
): Promise<Environment[]> {
  return (await listEnvironmentRows(workspaceId, projectId)).map(toEnvironment);
}

export async function listAllServices(workspaceId: string): Promise<Service[]> {
  return (await listServiceRows(workspaceId)).map(toService);
}

export async function listAllEnvironments(workspaceId: string): Promise<Environment[]> {
  return (await listEnvironmentRows(workspaceId)).map(toEnvironment);
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

export async function listResources(
  workspaceId: string,
  filters: ResourceFilters = {},
): Promise<Resource[]> {
  return (await listResourceRows(workspaceId, filters)).map(toResource);
}

export async function getResource(
  workspaceId: string,
  resourceId: string,
): Promise<Resource | undefined> {
  const row = await getResourceRow(workspaceId, resourceId);
  return row ? toResource(row) : undefined;
}

export async function resourceViewCounts(
  workspaceId: string,
): Promise<Record<ResourceView, number>> {
  const views: ResourceView[] = [
    "all",
    "associated",
    "unassociated",
    "potentially_unused",
    "unhealthy",
    "recent",
  ];
  const counts = await Promise.all(
    views.map(async (view) => (await listResourceRows(workspaceId, { view })).length),
  );
  return Object.fromEntries(views.map((v, i) => [v, counts[i] ?? 0])) as Record<
    ResourceView,
    number
  >;
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export async function getOverview(workspaceId: string): Promise<WorkspaceOverview> {
  const [resourceRows, projectRows, accountRows, alerts] = await Promise.all([
    listResourceRows(workspaceId),
    listProjectRows(workspaceId),
    coreListAccounts(workspaceId),
    listAlerts(workspaceId),
  ]);

  const resources = resourceRows.map(toResource);
  const withCost = resources.filter((r) => r.costAmount !== undefined);

  return {
    projects: projectRows.length,
    activeProjects: projectRows.filter((p) => p.status === "active").length,
    resources: resources.length,
    connectedProviders: new Set(accountRows.map((a) => a.provider)).size,
    healthyResources: resources.filter((r) => r.healthStatus === "healthy").length,
    unassociatedResources: resources.filter((r) => !r.projectId).length,
    potentiallyUnusedResources: resources.filter(
      (r) => r.activityState === "potentially_unused",
    ).length,
    unhealthyResources: resources.filter(
      (r) => r.healthStatus === "error" || r.healthStatus === "warning",
    ).length,
    attentionCount: alerts.length,
    // Only resources that actually reported a figure. Never extrapolated.
    knownMonthlyCost: withCost.reduce((sum, r) => sum + (r.costAmount ?? 0), 0),
    costCurrency: "USD",
    resourcesWithoutCostData: resources.length - withCost.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Alerts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Attention items, derived rather than stored.
 *
 * Every alert separates what was measured (`observation`) from what Forge
 * concludes (`inference`). An alert with no defensible inference carries none.
 */
export async function listAlerts(workspaceId: string): Promise<Alert[]> {
  const [resourceRows, accountRows] = await Promise.all([
    listResourceRows(workspaceId),
    coreListAccounts(workspaceId),
  ]);

  // Ignored resources stay in the inventory but stop raising attention items.
  const resources = resourceRows.map(toResource).filter((r) => !r.ignoredAt);
  const alerts: Alert[] = [];

  for (const account of accountRows.map(toAccount)) {
    if (account.lastSyncStatus === "failed") {
      alerts.push({
        id: `alert_sync_${account.id}`,
        severity: "critical",
        category: "sync_failure",
        title: `${providerName(account.provider)} synchronization failed`,
        observation: account.lastSyncError ?? "The last synchronization attempt did not complete.",
        inference:
          "Inventory for this account may be out of date. Existing resources have been kept unchanged.",
        connectedAccountId: account.id,
        href: `/integrations/${account.provider}`,
        detectedAt: account.lastSyncAt ?? account.createdAt,
      });
    } else if (account.lastSyncStatus === "partial") {
      alerts.push({
        id: `alert_sync_${account.id}`,
        severity: "warning",
        category: "sync_failure",
        title: `${providerName(account.provider)} synchronization was incomplete`,
        observation: account.lastSyncError ?? "Some resources could not be read.",
        connectedAccountId: account.id,
        href: `/integrations/${account.provider}`,
        detectedAt: account.lastSyncAt ?? account.createdAt,
      });
    }
  }

  for (const resource of resources) {
    if (resource.healthStatus === "error") {
      alerts.push({
        id: `alert_health_${resource.id}`,
        severity: "critical",
        category: "unhealthy",
        title: `${resource.name} is unhealthy`,
        observation: resource.activityReason ?? "The provider reports this resource as failing.",
        resourceId: resource.id,
        projectId: resource.projectId,
        href: `/resources/${resource.id}`,
        detectedAt: resource.lastSeenAt,
      });
    }

    if (resource.activityState === "potentially_unused") {
      alerts.push({
        id: `alert_unused_${resource.id}`,
        severity: "warning",
        category: "potentially_unused",
        title: `${resource.name} shows no recent activity`,
        observation: resource.activityReason ?? "No usage signal has been observed.",
        inference:
          resource.costAmount !== undefined
            ? "This resource may no longer be needed. It is still billing."
            : "This resource may no longer be needed.",
        resourceId: resource.id,
        projectId: resource.projectId,
        href: `/resources/${resource.id}`,
        detectedAt: resource.lastSeenAt,
      });
    }
  }

  const unassociated = resources.filter((r) => !r.projectId);
  if (unassociated.length > 0) {
    const billing = unassociated.filter((r) => r.costAmount !== undefined);
    const total = billing.reduce((sum, r) => sum + (r.costAmount ?? 0), 0);
    alerts.push({
      id: "alert_unassociated",
      severity: "warning",
      category: "unassociated",
      title: `${unassociated.length} resources are not assigned to a project`,
      observation:
        billing.length > 0
          ? `${unassociated.length} discovered resources have no project association. ${billing.length} of them report a cost, totalling $${total.toFixed(2)} per month.`
          : `${unassociated.length} discovered resources have no project association. None of them report a cost.`,
      inference:
        "Resources without an owner are the ones most often forgotten. Assigning them makes the rest of Forge more accurate.",
      href: "/resources?view=unassociated",
      detectedAt: resources[0]?.lastSeenAt ?? new Date().toISOString(),
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
