import Link from "next/link";

import { money, pluralize, relativeTime } from "@/lib/format";
import { providerName } from "@/lib/providers/catalogue";
import type { ProjectSummary } from "@/lib/data/types";
import { StatusBadge } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";

/**
 * A project at a glance. Used on both the dashboard and the projects listing so
 * a project reads the same wherever it appears.
 *
 * The whole card is the link — "view project" as a separate button would be a
 * smaller target for the same action.
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="surface-card lift flex flex-col gap-3 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="title-lg truncate">{project.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{project.description}</p>
        </div>
        <StatusBadge level={project.healthStatus} />
      </div>

      {project.environments.length > 0 || project.status === "archived" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {project.status === "archived" ? (
            <span className="pill pill--plain">Archived</span>
          ) : null}
          {project.environments.map((environment) => (
            <span key={environment} className="pill pill--plain">
              {environment}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        <div>
          <dt className="text-[0.72rem] text-muted">Services</dt>
          <dd className="tabular text-[0.95rem] font-[650]">{project.serviceCount}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] text-muted">Resources</dt>
          <dd className="tabular text-[0.95rem] font-[650]">{project.resourceCount}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] text-muted">Monthly</dt>
          <dd className="tabular text-[0.95rem] font-[650]">
            {project.monthlyCost > 0 ? money(project.monthlyCost) : "—"}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {project.providers.slice(0, 5).map((provider) => (
            <ProviderMark key={provider} provider={provider} size="sm" />
          ))}
          {project.providers.length === 0 ? (
            <span className="text-[0.8rem] text-faint">No resources yet</span>
          ) : null}
          <span className="sr-only">
            {project.providers.map((p) => providerName(p)).join(", ")}
          </span>
        </div>
        <span className="text-[0.8rem] text-muted">
          {relativeTime(project.lastActivityAt, "No activity")}
        </span>
      </div>

      {project.unhealthyCount > 0 ? (
        <p className="text-[0.8rem] text-warning">
          {pluralize(project.unhealthyCount, "resource")} need attention
        </p>
      ) : null}
    </Link>
  );
}
