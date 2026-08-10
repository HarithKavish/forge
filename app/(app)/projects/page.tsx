import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import { listProjects } from "@/lib/data/queries";
import { money, pluralize } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { ViewTabs } from "@/components/ui/tabs";
import { SearchField } from "@/components/ui/filters";
import { ProjectCard } from "@/components/project/project-card";
import { PlusIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Projects",
};

type StatusFilter = "all" | "active" | "archived";

const STATUSES: StatusFilter[] = ["all", "active", "archived"];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const status: StatusFilter = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "all";
  const search = params.q ?? "";

  // Unfiltered set drives the tab counts, so they stay stable as filters change.
  const [projects, everything] = await Promise.all([
    listProjects(session.workspaceId, { status, search }),
    listProjects(session.workspaceId),
  ]);

  const totalResources = projects.reduce((sum, p) => sum + p.resourceCount, 0);
  const totalCost = projects.reduce((sum, p) => sum + p.monthlyCost, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Each project gathers the services and resources it is built on, wherever they live."
        actions={
          <Link href="/projects/new" className="btn btn--primary">
            <PlusIcon size={16} />
            New project
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewTabs
          tabs={[
            { label: "All", value: "all", count: everything.length },
            {
              label: "Active",
              value: "active",
              count: everything.filter((p) => p.status === "active").length,
            },
            {
              label: "Archived",
              value: "archived",
              count: everything.filter((p) => p.status === "archived").length,
            },
          ]}
          active={status}
          basePath="/projects"
          paramName="status"
          preserve={{ q: search }}
          ariaLabel="Project status"
        />
        <SearchField
          basePath="/projects"
          value={search}
          preserve={{ status }}
          placeholder="Search projects"
          label="Search projects"
        />
      </div>

      {projects.length > 0 ? (
        <p className="text-sm text-muted">
          {pluralize(projects.length, "project")} · {pluralize(totalResources, "resource")}
          {totalCost > 0 ? ` · ${money(totalCost)} per month reported` : ""}
        </p>
      ) : null}

      {projects.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title={search ? "No projects match that search" : "No projects yet"}
            description={
              search
                ? "Try a different term, or clear the search to see everything."
                : "A project gathers the repositories, servers, databases and domains that make up one thing you have built."
            }
            action={
              search ? (
                <Link href="/projects" className="btn btn--sm">
                  Clear search
                </Link>
              ) : (
                <Link href="/projects/new" className="btn btn--primary">
                  <PlusIcon size={16} />
                  Create your first project
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
