/**
 * The read API the UI talks to.
 *
 * This is the seam. Today every function filters the fixtures in lib/mock/;
 * when the database is wired up each body becomes a Drizzle query against the
 * tenant-scoped repositories, and no page or component changes. That is why
 * they are all async and all take a `workspaceId` even though the mock has
 * only one workspace — the tenancy contract is visible at every call site.
 */

import {
  CONNECTED_ACCOUNTS,
  ENVIRONMENTS,
  PROJECTS,
  RESOURCES,
  SERVICES,
} from "@/lib/mock/seed";
import { PROVIDERS, getProvider, providerName } from "@/lib/mock/providers";
import { daysSince, resourceTypeLabel } from "@/lib/format";
import {
  applyOverride,
  getCreatedProjects,
  getOverrides,
  isIgnored,
} from "./overrides";
import { getConnectionState, mergeAccounts } from "./connections";
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

/**
 * Stamps the caller's workspace onto fixture rows. Stands in for the
 * `where workspaceId = ?` that the real queries will carry.
 */
function scope<T extends { workspaceId: string }>(rows: T[], workspaceId: string): T[] {
  return rows.map((row) => ({ ...row, workspaceId }));
}

/**
 * The single read path for resources: fixtures, scoped to the workspace, with
 * the user's own edits layered on. Everything below goes through this, so an
 * assignment made on one page is visible on all of them.
 */
async function allResources(workspaceId: string): Promise<Resource[]> {
  const overrides = await getOverrides();
  return scope(RESOURCES, workspaceId).map((resource) =>
    applyOverride(resource, overrides[resource.id]),
  );
}

/**
 * Seed projects plus anything created during this session. Stands in for a
 * single `select * from projects where workspace_id = ?`.
 */
async function allProjects(workspaceId: string): Promise<Project[]> {
  const created = await getCreatedProjects();
  const asProjects: Project[] = created.map((project) => ({
    id: project.id,
    workspaceId,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: "active",
    // A brand new project has nothing to report on yet, and "unknown" is the
    // honest answer rather than an optimistic "healthy".
    healthStatus: "unknown",
    createdAt: project.createdAt,
  }));
  return [...asProjects, ...scope(PROJECTS, workspaceId)];
}

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
  const state = await getConnectionState();
  return mergeAccounts(scope(CONNECTED_ACCOUNTS, workspaceId), state, workspaceId);
}

export async function getConnectedAccount(
  workspaceId: string,
  accountId: string,
): Promise<ConnectedAccount | undefined> {
  return (await listConnectedAccounts(workspaceId)).find((a) => a.id === accountId);
}

export async function listAccountsForProvider(
  workspaceId: string,
  providerId: string,
): Promise<ConnectedAccount[]> {
  return (await listConnectedAccounts(workspaceId)).filter(
    (a) => a.provider === providerId,
  );
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProjectFilters {
  search?: string;
  status?: "all" | "active" | "archived";
}

function summarize(project: Project, resources: Resource[]): ProjectSummary {
  const owned = resources.filter((r) => r.projectId === project.id);
  const providers = [...new Set(owned.map((r) => r.provider))];
  const environments = ENVIRONMENTS.filter((e) => e.projectId === project.id).map((e) => e.name);

  return {
    ...project,
    serviceCount: SERVICES.filter((s) => s.projectId === project.id).length,
    resourceCount: owned.length,
    providerCount: providers.length,
    providers,
    environments,
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
  const resources = await allResources(workspaceId);
  const search = filters.search?.trim().toLowerCase();

  return (await allProjects(workspaceId))
    .filter((p) => {
      if (filters.status && filters.status !== "all" && p.status !== filters.status) {
        return false;
      }
      if (search) {
        const haystack = `${p.name} ${p.description} ${p.slug}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .map((p) => summarize(p, resources));
}

export async function getProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectSummary | undefined> {
  const project = (await allProjects(workspaceId)).find((p) => p.id === projectId);
  if (!project) return undefined;
  return summarize(project, await allResources(workspaceId));
}

export async function listServices(projectId: string): Promise<Service[]> {
  return SERVICES.filter((s) => s.projectId === projectId);
}

export async function listEnvironments(projectId: string): Promise<Environment[]> {
  return ENVIRONMENTS.filter((e) => e.projectId === projectId);
}

/** Every environment in the workspace, for resolving names in the inventory. */
export async function listAllEnvironments(_workspaceId: string): Promise<Environment[]> {
  return ENVIRONMENTS;
}

/** Every service in the workspace, so the assign form can switch projects. */
export async function listAllServices(_workspaceId: string): Promise<Service[]> {
  return SERVICES;
}

/** Bare project rows, without the summary counts the listing needs. */
export async function listProjectRecords(workspaceId: string): Promise<Project[]> {
  return allProjects(workspaceId);
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

export type ResourceView =
  | "all"
  | "associated"
  | "unassociated"
  | "potentially_unused"
  | "unhealthy"
  | "recent";

export interface ResourceFilters {
  view?: ResourceView;
  provider?: string;
  projectId?: string;
  accountId?: string;
  search?: string;
}

/** Discovered within this many days counts as "recently discovered". */
const RECENT_DISCOVERY_DAYS = 45;

function matchesView(resource: Resource, view: ResourceView): boolean {
  switch (view) {
    case "associated":
      return Boolean(resource.projectId);
    case "unassociated":
      return !resource.projectId;
    case "potentially_unused":
      return resource.activityState === "potentially_unused";
    case "unhealthy":
      return resource.healthStatus === "error" || resource.healthStatus === "warning";
    case "recent":
      return (daysSince(resource.discoveredAt) ?? 999) <= RECENT_DISCOVERY_DAYS;
    default:
      return true;
  }
}

export async function listResources(
  workspaceId: string,
  filters: ResourceFilters = {},
): Promise<Resource[]> {
  const search = filters.search?.trim().toLowerCase();
  const view = filters.view ?? "all";

  const all = await allResources(workspaceId);
  return all.filter((r) => {
    if (!matchesView(r, view)) return false;
    if (filters.provider && filters.provider !== "all" && r.provider !== filters.provider) return false;
    if (filters.projectId && r.projectId !== filters.projectId) return false;
    if (filters.accountId && r.connectedAccountId !== filters.accountId) return false;
    if (search) {
      const haystack = [
        r.name,
        r.providerResourceId,
        resourceTypeLabel(r.resourceType),
        providerName(r.provider),
        r.region ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export async function getResource(
  workspaceId: string,
  resourceId: string,
): Promise<Resource | undefined> {
  return (await allResources(workspaceId)).find((r) => r.id === resourceId);
}

/** Counts for the inventory's view tabs, so each tab can show its own total. */
export async function resourceViewCounts(
  workspaceId: string,
): Promise<Record<ResourceView, number>> {
  const all = await allResources(workspaceId);
  const count = (view: ResourceView) => all.filter((r) => matchesView(r, view)).length;
  return {
    all: all.length,
    associated: count("associated"),
    unassociated: count("unassociated"),
    potentially_unused: count("potentially_unused"),
    unhealthy: count("unhealthy"),
    recent: count("recent"),
  };
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export async function getOverview(workspaceId: string): Promise<WorkspaceOverview> {
  const resources = await allResources(workspaceId);
  const projects = await allProjects(workspaceId);
  const accounts = await listConnectedAccounts(workspaceId);
  const alerts = await listAlerts(workspaceId);

  const withCost = resources.filter((r) => r.costAmount !== undefined);

  return {
    projects: projects.length,
    activeProjects: projects.filter((p) => p.status === "active").length,
    resources: resources.length,
    connectedProviders: new Set(accounts.map((a) => a.provider)).size,
    healthyResources: resources.filter((r) => r.healthStatus === "healthy").length,
    unassociatedResources: resources.filter((r) => !r.projectId).length,
    potentiallyUnusedResources: resources.filter((r) => r.activityState === "potentially_unused").length,
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
 * concludes (`inference`). An alert with no defensible inference carries none —
 * the UI shows the observation alone rather than inventing a verdict.
 */
export async function listAlerts(workspaceId: string): Promise<Alert[]> {
  const overrides = await getOverrides();
  // Ignored resources stay in the inventory but stop raising attention items.
  const resources = (await allResources(workspaceId)).filter(
    (r) => !isIgnored(overrides[r.id]),
  );
  const accounts = await listConnectedAccounts(workspaceId);
  const alerts: Alert[] = [];

  for (const account of accounts) {
    if (account.lastSyncStatus === "failed") {
      alerts.push({
        id: `alert_sync_${account.id}`,
        severity: "critical",
        category: "sync_failure",
        title: `${providerName(account.provider)} synchronization failed`,
        observation:
          account.lastSyncError ?? "The last synchronization attempt did not complete.",
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
      const days = daysSince(resource.lastActivityAt);
      alerts.push({
        id: `alert_unused_${resource.id}`,
        severity: "warning",
        category: "potentially_unused",
        title: `${resource.name} shows no recent activity`,
        observation:
          resource.activityReason ??
          (days === undefined
            ? "No usage signal has been observed."
            : `No meaningful activity observed for ${days} days.`),
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
        `${unassociated.length} discovered resources have no project association. ` +
        `${billing.length} of them report a cost, totalling $${total.toFixed(2)} per month.`,
      inference:
        "Resources without an owner are the ones most often forgotten. Assigning them makes the rest of Forge more accurate.",
      href: "/resources?view=unassociated",
      detectedAt: resources[0]?.lastSeenAt ?? new Date().toISOString(),
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
