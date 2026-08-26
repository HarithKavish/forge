import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import {
  getOverview,
  listAlerts,
  listConnectedAccounts,
  listProjects,
} from "@/lib/data/queries";
import { money, pluralize, relativeTime } from "@/lib/format";
import { providerName } from "@/lib/providers/catalogue";
import { MetricTile, ObservationInference, PageHeader, SectionCard } from "@/components/ui/page";
import { StatusBadge, SyncBadge } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ProjectCard } from "@/components/project/project-card";
import { PlusIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Home",
};

const SEVERITY_TONE = {
  critical: "error",
  warning: "warning",
  info: "unknown",
} as const;

/**
 * The command center.
 *
 * Ordered by what needs a decision rather than by what is easiest to count:
 * the totals give context, then attention items, then the projects themselves.
 * Nothing decorative — every figure on this page links to the view that
 * explains it.
 */
export default async function HomePage() {
  const session = await requireSession();
  const [overview, alerts, projects, accounts] = await Promise.all([
    getOverview(session.workspaceId),
    listAlerts(session.workspaceId),
    listProjects(session.workspaceId, { status: "active" }),
    listConnectedAccounts(session.workspaceId),
  ]);

  const topAlerts = alerts.slice(0, 4);
  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={session.workspaceName}
        title={`Welcome back, ${firstName}`}
        actions={
          <>
            <Link href="/integrations" className="btn">
              Integrations
            </Link>
            <Link href="/projects/new" className="btn btn--primary">
              <PlusIcon size={16} />
              New project
            </Link>
          </>
        }
      />

      {/* --- Overview ------------------------------------------------------ */}
      <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
        <h2 id="overview-heading" className="eyebrow">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricTile
            label="Projects"
            value={overview.activeProjects}
            hint={
              overview.projects > overview.activeProjects
                ? `${overview.projects - overview.activeProjects} archived`
                : "All active"
            }
            href="/projects"
          />
          <MetricTile
            label="Resources"
            value={overview.resources}
            hint={`Across ${pluralize(overview.connectedProviders, "platform")}`}
            href="/resources"
          />
          <MetricTile
            label="Healthy"
            value={overview.healthyResources}
            tone="healthy"
            hint={`of ${overview.resources} discovered`}
            href="/resources?view=all"
          />
          <MetricTile
            label="Unassociated"
            value={overview.unassociatedResources}
            tone={overview.unassociatedResources > 0 ? "warning" : "default"}
            hint="No project assigned"
            href="/resources?view=unassociated"
          />
          <MetricTile
            label="Potentially unused"
            value={overview.potentiallyUnusedResources}
            tone={overview.potentiallyUnusedResources > 0 ? "warning" : "default"}
            hint="Based on observed activity"
            href="/resources?view=potentially_unused"
          />
          <MetricTile
            label="Need attention"
            value={overview.unhealthyResources}
            tone={overview.unhealthyResources > 0 ? "error" : "default"}
            hint="Unhealthy or degraded"
            href="/resources?view=unhealthy"
          />
        </div>

        {/*
          Cost is stated as "known", with the number of resources it excludes
          shown alongside. A total that silently omits half the inventory would
          be worse than no total.
        */}
        <div className="surface-card flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div>
            <p className="eyebrow">Known monthly cost</p>
            <p className="metric mt-1.5">
              {money(overview.knownMonthlyCost, overview.costCurrency)}
            </p>
          </div>
          <p className="max-w-[46ch] text-[0.82rem] leading-snug text-muted">
            Provider-reported figures only.{" "}
            {pluralize(overview.resourcesWithoutCostData, "resource")} report no
            cost data, either because the platform does not expose per-resource
            billing or because the figure could not be collected.
          </p>
        </div>
      </section>

      {/* --- Attention ----------------------------------------------------- */}
      <SectionCard
        title="Attention required"
        description={
          alerts.length === 0
            ? "Nothing needs a decision right now."
            : `${pluralize(alerts.length, "item")} across your workspace.`
        }
        actions={
          alerts.length > 0 ? (
            <Link href="/alerts" className="btn btn--sm">
              View all
            </Link>
          ) : null
        }
        bodyClassName="divide-y divide-(--border)"
      >
        {topAlerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No unassociated, unhealthy or inactive resources were found.
          </p>
        ) : (
          topAlerts.map((alert) => (
            <article key={alert.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <div className="flex-none pt-0.5">
                <StatusBadge level={SEVERITY_TONE[alert.severity]} label={alert.severity} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.95rem] font-[650]">{alert.title}</h3>
                <div className="mt-2">
                  <ObservationInference
                    observation={alert.observation}
                    inference={alert.inference}
                  />
                </div>
              </div>
              <Link href={alert.href} className="btn btn--sm flex-none sm:mt-0.5">
                Review
              </Link>
            </article>
          ))
        )}
      </SectionCard>

      {/* --- Projects ------------------------------------------------------ */}
      <section aria-labelledby="projects-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="projects-heading" className="eyebrow">
            Projects
          </h2>
          <Link href="/projects" className="btn btn--ghost btn--sm">
            All projects
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>

      {/* --- Platforms ----------------------------------------------------- */}
      <SectionCard
        title="Connected platforms"
        actions={
          <Link href="/integrations" className="btn btn--sm">
            Manage
          </Link>
        }
        bodyClassName="divide-y divide-(--border)"
      >
        {accounts.map((account) => (
          <Link
            key={account.id}
            href={`/integrations/${account.provider}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
          >
            <ProviderMark provider={account.provider} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.92rem] font-[650]">{account.displayName}</p>
              <p className="truncate text-[0.8rem] text-muted">
                {providerName(account.provider)} · {account.externalAccountId}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.8rem] text-muted">
                {relativeTime(account.lastSyncAt, "Never synced")}
              </span>
              <SyncBadge status={account.lastSyncStatus} />
            </div>
          </Link>
        ))}
      </SectionCard>
    </div>
  );
}
