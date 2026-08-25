import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProject, listResources, listServices } from "@/lib/data/queries";
import { pluralize, relativeTime, resourceTypeLabel } from "@/lib/format";
import { providerName } from "@/lib/providers/catalogue";
import { EmptyState, SectionCard } from "@/components/ui/page";
import { ActivityBadge, StatusBadge, StatusDot } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";

/**
 * Services, each with the resources that implement it.
 *
 * This is the distinction the product is careful about: a service is a logical
 * part of the project ("Backend API"), while the resources beneath it are the
 * concrete things a provider actually provisioned. One service usually needs
 * several.
 */
export default async function ProjectServicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const [services, resources] = await Promise.all([
    listServices(session.workspaceId, projectId),
    listResources(session.workspaceId, { projectId }),
  ]);

  const unassigned = resources.filter((r) => !r.serviceId);

  if (services.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          title="No services defined"
          description="Services describe what this project is made of — a frontend, an API, a database — separately from the resources that implement them."
          action={
            <Link href={`/projects/${projectId}`} className="btn btn--sm">
              Back to overview
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {services.map((service) => {
        const owned = resources.filter((r) => r.serviceId === service.id);
        return (
          <SectionCard
            key={service.id}
            title={service.name}
            description={service.description}
            actions={<StatusBadge level={service.healthStatus} />}
            bodyClassName=""
          >
            {owned.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">
                No resources are assigned to this service yet.
              </p>
            ) : (
              <ul className="divide-y divide-(--border)">
                {owned.map((resource) => (
                  <li key={resource.id}>
                    <Link
                      href={`/resources/${resource.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
                    >
                      <StatusDot level={resource.healthStatus} />
                      <ProviderMark provider={resource.provider} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.92rem] font-[650]">
                          {resource.name}
                        </span>
                        <span className="block truncate text-[0.8rem] text-muted">
                          {providerName(resource.provider)} ·{" "}
                          {resourceTypeLabel(resource.resourceType)}
                          {resource.region ? ` · ${resource.region}` : ""}
                        </span>
                      </span>
                      <ActivityBadge state={resource.activityState} />
                      <span className="flex-none text-[0.8rem] text-muted">
                        {relativeTime(resource.lastActivityAt, "No signal")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}

      {unassigned.length > 0 ? (
        <SectionCard
          title="Not assigned to a service"
          description={`${pluralize(unassigned.length, "resource")} belong to this project but not to any of its services.`}
          bodyClassName=""
        >
          <ul className="divide-y divide-(--border)">
            {unassigned.map((resource) => (
              <li key={resource.id}>
                <Link
                  href={`/resources/${resource.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
                >
                  <StatusDot level={resource.healthStatus} />
                  <ProviderMark provider={resource.provider} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[0.92rem] font-[650]">
                    {resource.name}
                  </span>
                  <span className="text-[0.8rem] text-muted">
                    {resourceTypeLabel(resource.resourceType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
