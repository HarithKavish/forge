import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProject, listProjectCollaborators } from "@/lib/data/queries";
import { removeCollaboratorAction } from "@/lib/data/actions";
import { relativeTime } from "@/lib/format";
import { EmptyState, SectionCard } from "@/components/ui/page";
import { AddCollaboratorForm } from "@/components/project/add-collaborator-form";

/**
 * Who can see and register agent sessions on this project's Worldview data
 * from outside this workspace (docs/WORLDVIEW.md §13a). Nothing else about
 * the project -- resources, cost, credentials -- is granted by this.
 */
export default async function ProjectCollaboratorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const collaborators = await listProjectCollaborators(session.workspaceId, projectId);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Collaborators"
        description="Anyone added here can view this project's Worldview presence and register their own agent sessions on it -- nothing else in this workspace."
      >
        <AddCollaboratorForm projectId={projectId} />
      </SectionCard>

      <SectionCard title={`${collaborators.length} with access`} bodyClassName="">
        {collaborators.length === 0 ? (
          <EmptyState
            title="No collaborators yet"
            description="Add someone above by the email they sign into Forge with."
          />
        ) : (
          <ul className="divide-y divide-(--border)">
            {collaborators.map((collaborator) => (
              <li
                key={collaborator.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.92rem] font-[650]">
                    {collaborator.name || collaborator.email}
                  </p>
                  <p className="truncate text-[0.8rem] text-muted">
                    {collaborator.email} · Added {relativeTime(collaborator.createdAt)}
                  </p>
                </div>
                <form action={removeCollaboratorAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="collaboratorId" value={collaborator.id} />
                  <button type="submit" className="btn btn--sm btn--danger">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
