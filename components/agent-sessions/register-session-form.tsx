"use client";

/**
 * Manual agent-session registration (docs/WORLDVIEW.md §12, step 1).
 *
 * Stands in for the gateway pairing flow that doesn't exist yet: this is the
 * only way a session gets a row today, and it proves the same registration
 * path the gateway will eventually drive automatically.
 */

import { useActionState } from "react";

import { registerAgentSessionAction, type AgentSessionFormState } from "@/lib/data/actions";
import { agentProviderLabel } from "@/lib/format";
import type { AgentProvider, SelectableProject } from "@/lib/data/types";

const INITIAL: AgentSessionFormState = {};

const PROVIDERS: AgentProvider[] = ["claude", "codex", "gemini", "other"];

export function RegisterSessionForm({ projects }: { projects: SelectableProject[] }) {
  const [state, formAction, pending] = useActionState(registerAgentSessionAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="provider">
          Agent provider
        </label>
        <select id="provider" name="provider" className="field" defaultValue="claude" required>
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {agentProviderLabel(provider)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="projectId">
          Project <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id="projectId" name="projectId" className="field" defaultValue="">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.shared ? " (shared)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="label">
          Label <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="label"
          name="label"
          className="field"
          placeholder="Harith's laptop"
          maxLength={60}
        />
        <p className="mt-1.5 text-[0.8rem] text-muted">
          For you to recognize it by. Never anything the agent said or did.
        </p>
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
          {pending ? "Registering…" : "Register session"}
        </button>
      </div>
    </form>
  );
}
