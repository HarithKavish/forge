import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import {
  listAllEnvironments,
  listConnectedAccounts,
  listProjectRecords,
  listProviders,
  listResources,
  resourceViewCounts,
  type ResourceView,
} from "@/lib/data/queries";
import { money, pluralize } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui/page";
import { ViewTabs } from "@/components/ui/tabs";
import { SearchField, SelectFilter } from "@/components/ui/filters";
import { ResourceTable, buildLookups } from "@/components/resource/resource-table";

export const metadata: Metadata = {
  title: "Resources",
};

const VIEWS: { label: string; value: ResourceView }[] = [
  { label: "All", value: "all" },
  { label: "Associated", value: "associated" },
  { label: "Unassociated", value: "unassociated" },
  { label: "Potentially unused", value: "potentially_unused" },
  { label: "Unhealthy", value: "unhealthy" },
  { label: "Recently discovered", value: "recent" },
];

const VIEW_VALUES = new Set(VIEWS.map((v) => v.value));

/** Copy shown above each view, so the tab explains itself. */
const VIEW_NOTES: Partial<Record<ResourceView, string>> = {
  unassociated:
    "These exist in a connected account but belong to no project. They are the resources most often forgotten — assigning them makes every other view more accurate.",
  potentially_unused:
    "Forge saw no meaningful activity for these. That is an observation about signals, not proof that a resource is unneeded — open one to see the evidence before acting.",
  unhealthy: "The provider reports a degraded or failing state for these resources.",
  recent: "Discovered in the last 45 days.",
};

/**
 * The global inventory — the answer to "what do I actually have?".
 *
 * All filter state lives in the URL so any view here is a shareable link, which
 * is what makes "3 resources have no project" on the dashboard able to point
 * straight at the exact list.
 */
export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; provider?: string; q?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const view: ResourceView =
    params.view && VIEW_VALUES.has(params.view as ResourceView)
      ? (params.view as ResourceView)
      : "all";
  const provider = params.provider ?? "all";
  const search = params.q ?? "";

  const [resources, counts, projects, accounts, environments, providers] =
    await Promise.all([
      listResources(session.workspaceId, { view, provider, search }),
      resourceViewCounts(session.workspaceId),
      listProjectRecords(session.workspaceId),
      listConnectedAccounts(session.workspaceId),
      listAllEnvironments(session.workspaceId),
      listProviders(),
    ]);

  const lookups = buildLookups(projects, accounts, environments);
  const connectedProviders = new Set(accounts.map((a) => a.provider));

  const billing = resources.filter((r) => r.costAmount !== undefined);
  const visibleCost = billing.reduce((sum, r) => sum + (r.costAmount ?? 0), 0);

  const preserve = { provider, q: search };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inventory"
        title="Resources"
        description="Everything Forge has discovered across your connected platforms, whether or not it belongs to a project."
        actions={
          <Link href="/integrations" className="btn">
            Connect a platform
          </Link>
        }
      />

      <ViewTabs
        tabs={VIEWS.map((v) => ({ ...v, count: counts[v.value] }))}
        active={view}
        basePath="/resources"
        preserve={preserve}
        ariaLabel="Resource views"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          basePath="/resources"
          value={search}
          preserve={{ view, provider }}
          placeholder="Search by name, id, type or region"
          label="Search resources"
        />
        <SelectFilter
          basePath="/resources"
          paramName="provider"
          value={provider}
          preserve={{ view, q: search }}
          label="Platform"
          options={[
            { value: "all", label: "All platforms" },
            ...providers
              .filter((p) => connectedProviders.has(p.id))
              .map((p) => ({ value: p.id, label: p.displayName })),
          ]}
        />
      </div>

      {VIEW_NOTES[view] ? (
        <p className="surface-inset max-w-[80ch] px-4 py-3 text-sm text-muted">
          {VIEW_NOTES[view]}
        </p>
      ) : null}

      <SectionCard
        title={pluralize(resources.length, "resource")}
        description={
          billing.length > 0
            ? `${money(visibleCost)} per month reported across ${pluralize(billing.length, "resource")} in this view. ${resources.length - billing.length} report no cost data.`
            : "No resource in this view reports cost data."
        }
        bodyClassName=""
      >
        <ResourceTable
          resources={resources}
          lookups={lookups}
          emptyTitle="No resources match this view"
          emptyDescription={
            search || provider !== "all"
              ? "Try clearing the search or platform filter."
              : "Once a platform is connected, discovered resources appear here."
          }
          emptyAction={
            <Link href="/resources" className="btn btn--sm">
              Clear filters
            </Link>
          }
        />
      </SectionCard>
    </div>
  );
}
