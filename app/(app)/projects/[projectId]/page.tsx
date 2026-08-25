import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  getProject,
  listAlerts,
  listEnvironments,
  listResources,
  listServices,
} from "@/lib/data/queries";
import { money, pluralize, relativeTime, resourceTypeLabel } from "@/lib/format";
import { providerName } from "@/lib/providers/catalogue";
import {
  MetricTile,
  ObservationInference,
  SectionCard,
} from "@/components/ui/page";
import { StatusBadge, StatusDot } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";

/**
 * Project overview.
 *
 * Laid out to make the chain the product is built around legible at a glance:
 * project → services → resources → platforms.
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const [services, environments, resources, alerts] = await Promise.all([
    listServices(session.workspaceId, projectId),
    listEnvironments(session.workspaceId, projectId),
    listResources(session.workspaceId, { projectId }),
    listAlerts(session.workspaceId),
  ]);

  const projectAlerts = alerts.filter((a) => a.projectId === projectId);

  // Group resources under the platform that owns them.
  const byProvider = new Map<string, typeof resources>();
  for (const resource of resources) {
    const list = byProvider.get(resource.provider) ?? [];
    list.push(resource);
    byProvider.set(resource.provider, list);
  }

  const unhealthy = resources.filter(
    (r) => r.healthStatus === "error" || r.healthStatus === "warning",
  ).length;
  const inactive = resources.filter(
    (r) => r.activityState === "potentially_unused" || r.activityState === "recently_inactive",
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Services" value={project.serviceCount} href={`/projects/${projectId}/services`} />
        <MetricTile label="Resources" value={project.resourceCount} href={`/projects/${projectId}/resources`} />
        <MetricTile
          label="Need attention"
          value={unhealthy}
          tone={unhealthy > 0 ? "warning" : "default"}
          hint={inactive > 0 ? `${inactive} showing low activity` : "All healthy"}
          href={`/projects/${projectId}/resources`}
        />
        <MetricTile
          label="Monthly cost"
          value={project.monthlyCost > 0 ? money(project.monthlyCost) : "—"}
          hint="Provider-reported"
          href={`/projects/${projectId}/costs`}
        />
      </div>

      {projectAlerts.length > 0 ? (
        <SectionCard
          title="Attention"
          description={`${pluralize(projectAlerts.length, "item")} in this project.`}
          bodyClassName="divide-y divide-(--border)"
        >
          {projectAlerts.map((alert) => (
            <article key={alert.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.95rem] font-[650]">{alert.title}</h3>
                <div className="mt-2">
                  <ObservationInference
                    observation={alert.observation}
                    inference={alert.inference}
                  />
                </div>
              </div>
              <Link href={alert.href} className="btn btn--sm flex-none">
                Review
              </Link>
            </article>
          ))}
        </SectionCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* --- Services --------------------------------------------------- */}
        <SectionCard
          title="Services"
          description="The logical parts of this project."
          actions={
            <Link href={`/projects/${projectId}/services`} className="btn btn--sm">
              Details
            </Link>
          }
          bodyClassName="divide-y divide-(--border)"
        >
          {services.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No services defined yet.
            </p>
          ) : (
            services.map((service) => {
              const count = resources.filter((r) => r.serviceId === service.id).length;
              return (
                <Link
                  key={service.id}
                  href={`/projects/${projectId}/services`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
                >
                  <StatusDot level={service.healthStatus} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.92rem] font-[650]">
                      {service.name}
                    </span>
                    <span className="block truncate text-[0.8rem] text-muted">
                      {service.description}
                    </span>
                  </span>
                  <span className="tabular flex-none text-[0.8rem] text-muted">
                    {pluralize(count, "resource")}
                  </span>
                </Link>
              );
            })
          )}
        </SectionCard>

        {/* --- Resources by platform --------------------------------------- */}
        <SectionCard
          title="Resources by platform"
          description="Where this project actually lives."
          actions={
            <Link href={`/projects/${projectId}/resources`} className="btn btn--sm">
              All resources
            </Link>
          }
          bodyClassName="divide-y divide-(--border)"
        >
          {resources.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted">
                No resources assigned to this project yet.
              </p>
              <Link href="/resources?view=unassociated" className="btn btn--sm mt-3">
                Assign from inventory
              </Link>
            </div>
          ) : (
            [...byProvider.entries()].map(([provider, list]) => (
              <div key={provider} className="px-5 py-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <ProviderMark provider={provider} size="sm" />
                  <h3 className="text-[0.88rem] font-[650]">{providerName(provider)}</h3>
                  <span className="text-[0.8rem] text-faint">{list.length}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {list.map((resource) => (
                    <li key={resource.id}>
                      <Link
                        href={`/resources/${resource.id}`}
                        className="surface-inset flex items-center gap-2.5 px-3 py-2 transition-colors hover:border-(--border-strong)"
                      >
                        <StatusDot level={resource.healthStatus} />
                        <span className="min-w-0 flex-1 truncate text-[0.88rem] font-medium">
                          {resource.name}
                        </span>
                        <span className="hidden flex-none text-[0.78rem] text-muted sm:block">
                          {resourceTypeLabel(resource.resourceType)}
                        </span>
                        <span className="flex-none text-[0.78rem] text-faint">
                          {relativeTime(resource.lastActivityAt, "No signal")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </SectionCard>
      </div>

      {/* --- Environments -------------------------------------------------- */}
      <SectionCard title="Environments" description="Optional grouping within the project.">
        {environments.length === 0 ? (
          <p className="text-sm text-muted">
            No environments defined. Resources can belong to this project without one.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {environments.map((environment) => {
              const list = resources.filter((r) => r.environmentId === environment.id);
              const bad = list.filter(
                (r) => r.healthStatus === "error" || r.healthStatus === "warning",
              ).length;
              return (
                <div key={environment.id} className="surface-inset p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-[650]">{environment.name}</p>
                    <StatusBadge level={bad > 0 ? "warning" : list.length > 0 ? "healthy" : "unknown"} />
                  </div>
                  <p className="mt-1.5 text-[0.82rem] text-muted">
                    {pluralize(list.length, "resource")}
                    {bad > 0 ? ` · ${bad} need attention` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
