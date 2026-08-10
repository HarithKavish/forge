import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  getProject,
  listAllEnvironments,
  listConnectedAccounts,
  listProjectRecords,
  listResources,
} from "@/lib/data/queries";
import { money, pluralize } from "@/lib/format";
import { SectionCard } from "@/components/ui/page";
import { SearchField } from "@/components/ui/filters";
import { ResourceTable, buildLookups } from "@/components/resource/resource-table";

/** Every resource assigned to this project, in the same table the inventory uses. */
export default async function ProjectResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { projectId } = await params;
  const { q } = await searchParams;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const [resources, projects, accounts, environments] = await Promise.all([
    listResources(session.workspaceId, { projectId, search: q ?? "" }),
    listProjectRecords(session.workspaceId),
    listConnectedAccounts(session.workspaceId),
    listAllEnvironments(session.workspaceId),
  ]);

  const lookups = buildLookups(projects, accounts, environments);
  const billing = resources.filter((r) => r.costAmount !== undefined);
  const total = billing.reduce((sum, r) => sum + (r.costAmount ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchField
          basePath={`/projects/${projectId}/resources`}
          value={q ?? ""}
          placeholder="Search this project"
          label="Search project resources"
        />
        <Link href="/resources?view=unassociated" className="btn btn--sm">
          Assign more resources
        </Link>
      </div>

      <SectionCard
        title={pluralize(resources.length, "resource")}
        description={
          billing.length > 0
            ? `${money(total)} per month reported across ${pluralize(billing.length, "resource")}.`
            : "No resource in this project reports cost data."
        }
        bodyClassName=""
      >
        <ResourceTable
          resources={resources}
          lookups={lookups}
          variant="compact"
          emptyTitle={q ? "No resources match that search" : "No resources assigned yet"}
          emptyDescription={
            q
              ? "Try a different term."
              : "Assign discovered resources to this project from the global inventory."
          }
          emptyAction={
            <Link
              href={q ? `/projects/${projectId}/resources` : "/resources?view=unassociated"}
              className="btn btn--sm"
            >
              {q ? "Clear search" : "Open inventory"}
            </Link>
          }
        />
      </SectionCard>
    </div>
  );
}
