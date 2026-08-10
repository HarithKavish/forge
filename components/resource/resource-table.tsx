import Link from "next/link";

import {
  money,
  relativeTime,
  resourceTypeLabel,
} from "@/lib/format";
import type {
  ConnectedAccount,
  Environment,
  Project,
  Resource,
} from "@/lib/data/types";
import { ActivityBadge, StatusBadge, StatusDot } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";
import { EmptyState } from "@/components/ui/page";

export interface ResourceLookups {
  projects: Record<string, Project>;
  accounts: Record<string, ConnectedAccount>;
  environments: Record<string, Environment>;
}

/**
 * The inventory table.
 *
 * Shared by the global inventory and the per-project resource tab so a
 * resource reads identically in both. Wide by design — the whole point of the
 * inventory is density — so it scrolls inside its own container rather than
 * forcing the page sideways.
 *
 * `variant="compact"` drops the columns that are redundant in a project
 * context, where every row belongs to the project already on screen.
 */
export function ResourceTable({
  resources,
  lookups,
  variant = "full",
  emptyTitle = "No resources match this view",
  emptyDescription,
  emptyAction,
}: {
  resources: Resource[];
  lookups: ResourceLookups;
  variant?: "full" | "compact";
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (resources.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const full = variant === "full";

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Resource</th>
            <th scope="col">Type</th>
            <th scope="col">Provider</th>
            {full ? <th scope="col">Account</th> : null}
            {full ? <th scope="col">Project</th> : null}
            <th scope="col">Environment</th>
            <th scope="col">Status</th>
            <th scope="col">Activity</th>
            <th scope="col">Cost</th>
            <th scope="col">Last seen</th>
            <th scope="col">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => {
            const project = resource.projectId
              ? lookups.projects[resource.projectId]
              : undefined;
            const account = lookups.accounts[resource.connectedAccountId];
            const environment = resource.environmentId
              ? lookups.environments[resource.environmentId]
              : undefined;

            return (
              <tr key={resource.id}>
                <td className="max-w-[16rem]">
                  <Link
                    href={`/resources/${resource.id}`}
                    className="flex min-w-0 items-center gap-2 font-[650] hover:text-accent"
                  >
                    <StatusDot level={resource.healthStatus} />
                    <span className="truncate">{resource.name}</span>
                  </Link>
                  {resource.presence === "missing" ? (
                    <span className="pill pill--plain mt-1">Missing at provider</span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap text-muted">
                  {resourceTypeLabel(resource.resourceType)}
                </td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <ProviderMark provider={resource.provider} size="sm" />
                  </span>
                </td>
                {full ? (
                  <td className="max-w-[12rem] truncate text-muted">
                    {account?.displayName ?? "—"}
                  </td>
                ) : null}
                {full ? (
                  <td className="max-w-[12rem]">
                    {project ? (
                      <Link
                        href={`/projects/${project.id}`}
                        className="truncate hover:text-accent"
                      >
                        {project.name}
                      </Link>
                    ) : (
                      // The headline case: unassociated is stated, not left blank.
                      <span className="pill pill--warning">No project</span>
                    )}
                  </td>
                ) : null}
                <td className="whitespace-nowrap text-muted">
                  {environment?.name ?? "—"}
                </td>
                <td>
                  <StatusBadge level={resource.healthStatus} />
                </td>
                <td>
                  <ActivityBadge state={resource.activityState} />
                </td>
                <td className="tabular whitespace-nowrap">
                  {resource.costAmount === undefined ? (
                    <span className="text-faint">Unavailable</span>
                  ) : (
                    <span title={`${resource.costPeriod} · ${resource.costAccuracy}`}>
                      {money(resource.costAmount, resource.costCurrency)}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap text-muted">
                  {relativeTime(resource.lastSeenAt)}
                </td>
                <td className="whitespace-nowrap text-muted">
                  {/* Never falls back to lastSeenAt — that would fake a usage signal. */}
                  {relativeTime(resource.lastActivityAt, "No signal")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Builds the id→entity maps the table needs. */
export function buildLookups(
  projects: Project[],
  accounts: ConnectedAccount[],
  environments: Environment[],
): ResourceLookups {
  return {
    projects: Object.fromEntries(projects.map((p) => [p.id, p])),
    accounts: Object.fromEntries(accounts.map((a) => [a.id, a])),
    environments: Object.fromEntries(environments.map((e) => [e.id, e])),
  };
}
