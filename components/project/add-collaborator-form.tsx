"use client";

/**
 * Grants a project's Worldview access to someone by email
 * (docs/WORLDVIEW.md §13a). Requires that person to already have a Forge
 * account -- an account-less invite flow is explicitly left for later.
 */

import { useActionState } from "react";

import { addCollaboratorAction, type CollaboratorFormState } from "@/lib/data/actions";

const INITIAL: CollaboratorFormState = {};

export function AddCollaboratorForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(addCollaboratorAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="collaborator-email">
          Add a collaborator
        </label>
        <input
          id="collaborator-email"
          name="email"
          type="email"
          className="field"
          placeholder="friend@example.com"
          required
        />
      </div>
      <button type="submit" className="btn btn--primary" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
