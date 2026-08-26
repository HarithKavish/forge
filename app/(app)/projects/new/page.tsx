import type { Metadata } from "next";

import { BackLink, PageHeader, SectionCard } from "@/components/ui/page";
import { CreateProjectForm } from "@/components/project/create-project-form";

export const metadata: Metadata = {
  title: "New project",
};

/**
 * Project creation.
 *
 * Only a name and description: environments, services and resources are added
 * by assigning what already exists, rather than asked for up front in a wizard
 * the user cannot answer yet.
 */
export default function NewProjectPage() {
  return (
    <div className="mx-auto flex max-w-[40rem] flex-col gap-6">
      <BackLink href="/projects" label="Projects" />

      <PageHeader
        eyebrow="Workspace"
        title="New project"
      />

      <SectionCard>
        <CreateProjectForm />
      </SectionCard>

      <SectionCard title="What happens next">
        <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm text-muted">
          <li>
            Forge creates the project and opens it. It starts empty — no
            environments, services or resources.
          </li>
          <li>
            From <span className="text-text">Resources</span>, assign discovered
            resources to it. The unassociated view is the fastest place to start.
          </li>
          <li>
            As resources are assigned, the project&apos;s health, cost and
            activity are rolled up from them.
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
