import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import { listAlerts } from "@/lib/data/queries";
import { pluralize, relativeTime } from "@/lib/format";
import { EmptyState, ObservationInference, PageHeader, SectionCard } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { ViewTabs } from "@/components/ui/tabs";
import type { Alert } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "Alerts",
};

const CATEGORY_LABELS: Record<Alert["category"], string> = {
  unassociated: "Unassociated",
  potentially_unused: "Potentially unused",
  unhealthy: "Unhealthy",
  sync_failure: "Sync failures",
  cost: "Cost",
};

const SEVERITY_TONE = {
  critical: "error",
  warning: "warning",
  info: "unknown",
} as const;

const FILTERS = ["all", "critical", "warning"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Attention items.
 *
 * The page is built around one rule the product will not bend on: what was
 * measured and what Forge concludes from it are shown as separate things. An
 * item with no defensible conclusion shows the measurement alone rather than
 * inventing a verdict to fill the space.
 */
export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const session = await requireSession();
  const { severity } = await searchParams;

  const filter: Filter = FILTERS.includes(severity as Filter)
    ? (severity as Filter)
    : "all";

  const all = await listAlerts(session.workspaceId);
  const alerts = filter === "all" ? all : all.filter((a) => a.severity === filter);

  // Group by category so related items are dealt with together.
  const grouped = new Map<Alert["category"], Alert[]>();
  for (const alert of alerts) {
    const list = grouped.get(alert.category) ?? [];
    list.push(alert);
    grouped.set(alert.category, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Attention"
        description="What Forge thinks is worth a decision, with the evidence behind it."
      />

      <div className="surface-inset max-w-[80ch] px-4 py-3">
        <p className="text-sm text-muted">
          Forge separates{" "}
          <span className="font-[650] text-text">what it observed</span> from{" "}
          <span className="font-[650] text-text">what it infers</span>. Inactivity
          is a measurement; &ldquo;no longer needed&rdquo; is a judgement Forge is
          not in a position to make for you. Nothing here is acted on
          automatically.
        </p>
      </div>

      <ViewTabs
        tabs={[
          { label: "All", value: "all", count: all.length },
          {
            label: "Critical",
            value: "critical",
            count: all.filter((a) => a.severity === "critical").length,
          },
          {
            label: "Warning",
            value: "warning",
            count: all.filter((a) => a.severity === "warning").length,
          },
        ]}
        active={filter}
        basePath="/alerts"
        paramName="severity"
        ariaLabel="Alert severity"
      />

      {alerts.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title={filter === "all" ? "Nothing needs attention" : `No ${filter} items`}
            description={
              filter === "all"
                ? "Every resource is assigned to a project, healthy, and showing activity."
                : "Try the other severities."
            }
            action={
              filter !== "all" ? (
                <Link href="/alerts" className="btn btn--sm">
                  Show all
                </Link>
              ) : (
                <Link href="/resources" className="btn btn--sm">
                  Open inventory
                </Link>
              )
            }
          />
        </div>
      ) : (
        [...grouped.entries()].map(([category, list]) => (
          <SectionCard
            key={category}
            title={CATEGORY_LABELS[category]}
            description={pluralize(list.length, "item")}
            bodyClassName="divide-y divide-(--border)"
          >
            {list.map((alert) => (
              <article
                key={alert.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start"
              >
                <div className="flex-none pt-0.5">
                  <StatusBadge
                    level={SEVERITY_TONE[alert.severity]}
                    label={alert.severity}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[0.95rem] font-[650]">{alert.title}</h3>
                  <div className="mt-2">
                    <ObservationInference
                      observation={alert.observation}
                      inference={alert.inference}
                    />
                  </div>
                  <p className="mt-2.5 text-[0.78rem] text-faint">
                    Detected {relativeTime(alert.detectedAt)}
                  </p>
                </div>

                <div className="flex flex-none flex-wrap gap-2 sm:flex-col">
                  <Link href={alert.href} className="btn btn--sm">
                    Review
                  </Link>
                  {alert.projectId ? (
                    <Link
                      href={`/projects/${alert.projectId}`}
                      className="btn btn--sm btn--ghost"
                    >
                      Project
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </SectionCard>
        ))
      )}
    </div>
  );
}
