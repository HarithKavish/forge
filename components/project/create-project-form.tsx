"use client";

import { useActionState } from "react";
import Link from "next/link";

import { createProjectAction, type ProjectFormState } from "@/lib/data/actions";

const INITIAL: ProjectFormState = {};

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="name">
          Project name
        </label>
        <input
          id="name"
          name="name"
          className="field"
          placeholder="Commerce Platform"
          maxLength={60}
          required
          autoFocus
        />
        <p className="mt-1.5 text-[0.8rem] text-muted">
          What you call this thing you have built.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="description">
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          className="field min-h-24 resize-y"
          placeholder="Storefront, checkout and order management."
          maxLength={240}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-inner)] border border-(--status-error-border) bg-(--status-error-bg) px-3 py-2 text-sm text-error"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </button>
        <Link href="/projects" className="btn btn--ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
