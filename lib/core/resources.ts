/**
 * Resource inventory.
 *
 * Every query is scoped to a workspace. Reconciliation here is deliberately
 * non-destructive: a resource the provider stops returning is marked
 * `presence = 'missing'`, never deleted. A provider outage or a narrowed token
 * must not read as "all your resources disappeared".
 */

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import type { DiscoveredResource } from "@/lib/providers/types";

export type ResourceRow = typeof resources.$inferSelect;

export interface ReconcileStats {
  discovered: number;
  created: number;
  updated: number;
  missing: number;
}

/** Days without an observed usage signal before Forge will call it inactive. */
const RECENTLY_INACTIVE_DAYS = 30;
const POTENTIALLY_UNUSED_DAYS = 60;

/**
 * Turns an observation into a classification, and records the evidence.
 *
 * Two rules this must never break: silence from a provider that offers no usage
 * signal is "unknown", not "unused"; and the reason is phrased as the
 * measurement, so the UI can show the fact and the inference separately.
 */
function classifyActivity(
  lastActivityAt: Date | undefined,
  providerReportsActivity: boolean,
): { activityState: ResourceRow["activityState"]; activityReason: string } {
  if (!lastActivityAt) {
    return providerReportsActivity
      ? {
          activityState: "unknown",
          activityReason: "No activity has been recorded for this resource yet.",
        }
      : {
          activityState: "unknown",
          activityReason:
            "This platform exposes no usage signal for this resource type.",
        };
  }

  const days = Math.floor((Date.now() - lastActivityAt.getTime()) / 86_400_000);

  if (days >= POTENTIALLY_UNUSED_DAYS) {
    return {
      activityState: "potentially_unused",
      activityReason: `No activity observed for ${days} days.`,
    };
  }
  if (days >= RECENTLY_INACTIVE_DAYS) {
    return {
      activityState: "recently_inactive",
      activityReason: `No activity observed for ${days} days.`,
    };
  }
  return {
    activityState: "active",
    activityReason:
      days <= 0
        ? "Activity observed today."
        : `Activity observed ${days} day${days === 1 ? "" : "s"} ago.`,
  };
}

/**
 * Writes a discovery run into the inventory.
 *
 * Upserts on (connected account, provider resource id) — the provider's id is
 * only unique within an account, never globally. Project association is
 * deliberately left alone on update: a resync must not undo the user's own
 * organisation of their inventory.
 */
export async function reconcileDiscovered(
  workspaceId: string,
  account: { id: string; provider: string },
  discovered: DiscoveredResource[],
  options: { providerReportsActivity: boolean },
): Promise<ReconcileStats> {
  const now = new Date();

  const existing = await db
    .select({ providerResourceId: resources.providerResourceId })
    .from(resources)
    .where(
      and(
        eq(resources.workspaceId, workspaceId),
        eq(resources.connectedAccountId, account.id),
      ),
    );
  const known = new Set(existing.map((r) => r.providerResourceId));

  let created = 0;
  let updated = 0;

  for (const item of discovered) {
    const activity = classifyActivity(item.lastActivityAt, options.providerReportsActivity);

    await db
      .insert(resources)
      .values({
        workspaceId,
        connectedAccountId: account.id,
        provider: account.provider,
        providerResourceId: item.providerResourceId,
        resourceType: item.resourceType,
        name: item.name,
        region: item.region,
        presence: "live",
        providerStatus: item.providerStatus,
        healthStatus: item.healthStatus,
        providerCreatedAt: item.providerCreatedAt,
        discoveredAt: now,
        lastSeenAt: now,
        lastActivityAt: item.lastActivityAt,
        activityState: activity.activityState,
        activityReason: activity.activityReason,
        activityComputedAt: now,
        managementUrl: item.managementUrl,
        metadata: item.metadata,
        // GitHub reports no cost. Absent is not zero.
        costAccuracy: "unavailable",
      })
      .onConflictDoUpdate({
        target: [resources.connectedAccountId, resources.providerResourceId],
        set: {
          name: item.name,
          resourceType: item.resourceType,
          region: item.region,
          // Reappearing after being marked missing restores it.
          presence: "live",
          providerStatus: item.providerStatus,
          healthStatus: item.healthStatus,
          providerCreatedAt: item.providerCreatedAt,
          lastSeenAt: now,
          lastActivityAt: item.lastActivityAt,
          activityState: activity.activityState,
          activityReason: activity.activityReason,
          activityComputedAt: now,
          managementUrl: item.managementUrl,
          metadata: item.metadata,
          updatedAt: now,
          // projectId / environmentId / serviceId are intentionally absent:
          // the user's assignments survive every resync.
        },
      });

    if (known.has(item.providerResourceId)) updated += 1;
    else created += 1;
  }

  // Anything the provider no longer returns is marked, never deleted.
  const seen = discovered.map((d) => d.providerResourceId);
  const missingResult = await db
    .update(resources)
    .set({ presence: "missing", updatedAt: now })
    .where(
      and(
        eq(resources.workspaceId, workspaceId),
        eq(resources.connectedAccountId, account.id),
        eq(resources.presence, "live"),
        seen.length > 0
          ? notInArray(resources.providerResourceId, seen)
          : sql`true`,
      ),
    )
    .returning({ id: resources.id });

  return {
    discovered: discovered.length,
    created,
    updated,
    missing: missingResult.length,
  };
}

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

export async function listResourceRows(
  workspaceId: string,
  filters: ResourceFilters = {},
): Promise<ResourceRow[]> {
  const rows = await db
    .select()
    .from(resources)
    .where(eq(resources.workspaceId, workspaceId));

  // Filtering in memory: a personal workspace holds hundreds of rows, not
  // millions, and keeping the predicates in one place with the view definitions
  // is worth more here than pushing them into SQL.
  return rows.filter((r) => matchesFilters(r, filters));
}

const RECENT_DISCOVERY_DAYS = 45;

function matchesView(resource: ResourceRow, view: ResourceView): boolean {
  switch (view) {
    case "associated":
      return Boolean(resource.projectId);
    case "unassociated":
      return !resource.projectId;
    case "potentially_unused":
      return resource.activityState === "potentially_unused";
    case "unhealthy":
      return resource.healthStatus === "error" || resource.healthStatus === "warning";
    case "recent": {
      const days = (Date.now() - resource.discoveredAt.getTime()) / 86_400_000;
      return days <= RECENT_DISCOVERY_DAYS;
    }
    default:
      return true;
  }
}

function matchesFilters(resource: ResourceRow, filters: ResourceFilters): boolean {
  if (!matchesView(resource, filters.view ?? "all")) return false;
  if (filters.provider && filters.provider !== "all" && resource.provider !== filters.provider) {
    return false;
  }
  if (filters.projectId && resource.projectId !== filters.projectId) return false;
  if (filters.accountId && resource.connectedAccountId !== filters.accountId) return false;

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      resource.name,
      resource.providerResourceId,
      resource.resourceType,
      resource.provider,
      resource.region ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

export async function getResourceRow(
  workspaceId: string,
  resourceId: string,
): Promise<ResourceRow | undefined> {
  const [row] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.id, resourceId)))
    .limit(1);
  return row;
}

/** Assigns a resource to a project, or clears the association when null. */
export async function assignResource(
  workspaceId: string,
  resourceId: string,
  assignment: {
    projectId: string | null;
    environmentId: string | null;
    serviceId: string | null;
  },
): Promise<void> {
  await db
    .update(resources)
    .set({ ...assignment, updatedAt: new Date() })
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.id, resourceId)));
}

/**
 * Assigns many resources to one project in a single statement.
 *
 * Environment and service are cleared rather than carried over: they belong to
 * whatever project the resource was in before, and pointing them at a foreign
 * project would leave the row internally inconsistent.
 */
export async function assignResourcesToProject(
  workspaceId: string,
  resourceIds: string[],
  projectId: string | null,
): Promise<number> {
  if (resourceIds.length === 0) return 0;

  const updated = await db
    .update(resources)
    .set({
      projectId,
      environmentId: null,
      serviceId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(resources.workspaceId, workspaceId),
        inArray(resources.id, resourceIds),
      ),
    )
    .returning({ id: resources.id });

  return updated.length;
}

export async function setResourcePresence(
  workspaceId: string,
  resourceId: string,
  presence: ResourceRow["presence"],
): Promise<void> {
  await db
    .update(resources)
    .set({
      presence,
      archivedAt: presence === "archived" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.id, resourceId)));
}

export async function setResourceIgnored(
  workspaceId: string,
  resourceId: string,
  ignored: boolean,
): Promise<void> {
  await db
    .update(resources)
    .set({ ignoredAt: ignored ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.id, resourceId)));
}

/** Clears the association of resources whose project is being removed. */
export async function unassignResourcesForProject(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  await db
    .update(resources)
    .set({ projectId: null, environmentId: null, serviceId: null })
    .where(and(eq(resources.workspaceId, workspaceId), eq(resources.projectId, projectId)));
}

export async function countResourcesForAccounts(
  workspaceId: string,
  accountIds: string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const rows = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.workspaceId, workspaceId),
        inArray(resources.connectedAccountId, accountIds),
      ),
    );
  return rows.length;
}
