"use client";

/**
 * Assign a resource to a project.
 *
 * This is the core loop of the product, so it is a real, working control
 * rather than a placeholder — the selection persists and every other view
 * updates to match.
 *
 * Environment and service are scoped to whichever project is selected, which
 * is why the full sets are passed in and narrowed here: picking a project must
 * not offer environments belonging to a different one.
 */

import { useState } from "react";

import { assignResourceAction } from "@/lib/data/actions";
import type { Environment, Project, Service } from "@/lib/data/types";

export function AssignForm({
  resourceId,
  projects,
  environments,
  services,
  currentProjectId,
  currentEnvironmentId,
  currentServiceId,
}: {
  resourceId: string;
  projects: Project[];
  environments: Environment[];
  services: Service[];
  currentProjectId?: string;
  currentEnvironmentId?: string;
  currentServiceId?: string;
}) {
  const [projectId, setProjectId] = useState(currentProjectId ?? "");

  const projectEnvironments = environments.filter((e) => e.projectId === projectId);
  const projectServices = services.filter((s) => s.projectId === projectId);

  return (
    <form action={assignResourceAction} className="flex flex-col gap-3">
      <input type="hidden" name="resourceId" value={resourceId} />

      <div>
        <label className="label" htmlFor="projectId">
          Project
        </label>
        <select
          id="projectId"
          name="projectId"
          className="field"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.status === "archived" ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>

      {projectId ? (
        <>
          <div>
            <label className="label" htmlFor="environmentId">
              Environment <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              id="environmentId"
              name="environmentId"
              className="field"
              defaultValue={
                projectId === currentProjectId ? (currentEnvironmentId ?? "") : ""
              }
              // Remounts when the project changes, so a stale selection from the
              // previous project cannot linger in the field.
              key={`env-${projectId}`}
            >
              <option value="">Not set</option>
              {projectEnvironments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="serviceId">
              Service <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              id="serviceId"
              name="serviceId"
              className="field"
              defaultValue={projectId === currentProjectId ? (currentServiceId ?? "") : ""}
              key={`svc-${projectId}`}
            >
              <option value="">Not set</option>
              {projectServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <button type="submit" className="btn btn--primary w-full">
        {currentProjectId ? "Update association" : "Assign to project"}
      </button>
    </form>
  );
}
