import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProject } from "@/lib/data/queries";
import { money, pluralize, relativeTime } from "@/lib/format";
import { BackLink, Breadcrumbs, PageHeader } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { ProjectTabs } from "@/components/project/project-tabs";
import { ExternalIcon } from "@/components/ui/icons";

/**
 * Project chrome.
 *
 * The header and section tabs live in the layout so they persist across the
 * project's sections — switching tabs re-renders only the section below,
 * and the identity of what you are looking at never flickers.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();
  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        />
        <BackLink href="/projects" label="All projects" />
      </div>

      <PageHeader
        eyebrow={project.status === "archived" ? "Archived project" : "Project"}
        title={project.name}
        description={project.description}
        actions={
          <Link href={`/resources?view=unassociated`} className="btn">
            <ExternalIcon size={15} />
            Assign resources
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge level={project.healthStatus} />
        {project.environments.map((environment) => (
          <span key={environment} className="pill pill--plain">
            {environment}
          </span>
        ))}
        <span className="text-sm text-muted">
          {pluralize(project.serviceCount, "service")} ·{" "}
          {pluralize(project.resourceCount, "resource")} ·{" "}
          {pluralize(project.providerCount, "platform")}
          {project.monthlyCost > 0 ? ` · ${money(project.monthlyCost)}/month` : ""}
        </span>
        <span className="text-sm text-faint">
          Last activity {relativeTime(project.lastActivityAt, "not recorded")}
        </span>
      </div>

      <ProjectTabs projectId={project.id} />

      {children}
    </div>
  );
}
