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
import { assignSelectedAction } from "@/lib/data/actions";
import { money, pluralize } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui/page";
import { ViewTabs } from "@/components/ui/tabs";
import { SearchField, SelectFilter } from "@/components/ui/filters";
import { ResourceTable, buildLookups } from "@/components/resource/resource-table";
import { BulkSelection } from "@/components/resource/bulk-selection";

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

const FORM_ID = "inventory-bulk-assign";

/**
 * The global inventory — the answer to "what do I actually have?".
 *
 * All filter state lives in the URL so any view here is a shareable link, which
 * is what lets "3 resources have no project" on the dashboard point straight at
 * the exact list.
 *
 * The table sits inside a form so resources can be assigned in bulk. Plain
 * checkboxes and a server action, so it works without client JavaScript —
 * assigning fifty repositories one detail page at a time is not a workflow.
 */
export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    provider?: string;
    q?: string;
    assigned?: string;
  }>;
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

  // Where the bulk action should return to, filters intact.
  const query = new URLSearchParams();
  if (view !== "all") query.set("view", view);
  if (provider !== "all") query.set("provider", provider);
  if (search) query.set("q", search);
  const returnTo = query.toString() ? `/resources?${query}` : "/resources";

  const assigned = params.assigned;

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

      {assigned ? (
        <p
          role="status"
          className={
            assigned === "none"
              ? "rounded-[var(--radius-card)] border border-(--status-warning-border) bg-(--status-warning-bg) px-4 py-3 text-sm text-warning"
              : "rounded-[var(--radius-card)] border border-(--status-healthy-border) bg-(--status-healthy-bg) px-4 py-3 text-sm text-healthy"
          }
        >
          {assigned === "none"
            ? "Nothing was selected, so nothing changed."
            : `${pluralize(Number(assigned), "resource")} reassigned.`}
        </p>
      ) : null}

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

      <form action={assignSelectedAction} id={FORM_ID}>
        <input type="hidden" name="returnTo" value={returnTo} />

        <SectionCard
          title={pluralize(resources.length, "resource")}
          description={
            billing.length > 0
              ? `${money(visibleCost)} per month reported across ${pluralize(billing.length, "resource")} in this view. ${resources.length - billing.length} report no cost data.`
              : "No resource in this view reports cost data."
          }
          bodyClassName=""
        >
          {resources.length > 0 && projects.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <BulkSelection formId={FORM_ID} />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="bulk-project" className="text-sm text-muted">
                  Assign to
                </label>
                <select
                  id="bulk-project"
                  name="projectId"
                  className="field w-auto py-1.5"
                  defaultValue=""
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn--sm btn--primary">
                  Assign selected
                </button>
              </div>
            </div>
          ) : null}

          <ResourceTable
            resources={resources}
            lookups={lookups}
            selectable={resources.length > 0 && projects.length > 0}
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
      </form>

      {projects.length === 0 && resources.length > 0 ? (
        <p className="surface-inset max-w-[80ch] px-4 py-3 text-sm text-muted">
          Create a project and you can assign these resources to it from here.{" "}
          <Link href="/projects/new" className="text-text underline">
            Create a project
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
