import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProject, listResources } from "@/lib/data/queries";
import { absoluteDate, relativeTime, resourceTypeLabel } from "@/lib/format";
import { providerName } from "@/lib/mock/providers";
import { EmptyState, SectionCard } from "@/components/ui/page";
import { ActivityBadge, StatusDot } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";

/**
 * Activity for the project.
 *
 * Resources are ordered by when they were last *used*, not when they were last
 * seen by a sync — so the quietest things sink to the bottom, which is exactly
 * where attention is needed. Resources with no usage signal at all are listed
 * separately rather than sorted as if they were maximally stale.
 */
export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const resources = await listResources(session.workspaceId, { projectId });

  const withSignal = resources
    .filter((r) => r.lastActivityAt)
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime(),
    );
  const withoutSignal = resources.filter((r) => !r.lastActivityAt);

  if (resources.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          title="No activity to show"
          description="Once resources are assigned to this project, their observed activity appears here."
          action={
            <Link href="/resources?view=unassociated" className="btn btn--sm">
              Assign resources
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Observed activity"
        description="Most recently used first. These are measurements from each platform, not Forge's conclusions."
        bodyClassName="divide-y divide-(--border)"
      >
        {withSignal.map((resource) => (
          <Link
            key={resource.id}
            href={`/resources/${resource.id}`}
            className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-(--surface-sunken)"
          >
            <ProviderMark provider={resource.provider} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <StatusDot level={resource.healthStatus} />
                <span className="truncate text-[0.92rem] font-[650]">{resource.name}</span>
              </span>
              <span className="mt-1 block text-[0.82rem] text-muted">
                {resource.activityReason ??
                  `${providerName(resource.provider)} · ${resourceTypeLabel(resource.resourceType)}`}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-1.5">
              <ActivityBadge state={resource.activityState} />
              <span
                className="text-[0.8rem] text-muted"
                title={absoluteDate(resource.lastActivityAt)}
              >
                {relativeTime(resource.lastActivityAt)}
              </span>
            </span>
          </Link>
        ))}
      </SectionCard>

      {withoutSignal.length > 0 ? (
        <SectionCard
          title="No activity signal"
          description="These platforms expose no usage signal for these resource types. Forge reports that rather than treating silence as disuse."
          bodyClassName="divide-y divide-(--border)"
        >
          {withoutSignal.map((resource) => (
            <Link
              key={resource.id}
              href={`/resources/${resource.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
            >
              <ProviderMark provider={resource.provider} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[0.92rem] font-[650]">
                {resource.name}
              </span>
              <span className="text-[0.8rem] text-muted">
                Last seen {relativeTime(resource.lastSeenAt)}
              </span>
            </Link>
          ))}
        </SectionCard>
      ) : null}
    </div>
  );
}
