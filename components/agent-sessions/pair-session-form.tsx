"use client";

/**
 * Mints a Worldview pairing token (docs/WORLDVIEW.md §5.1, §7) and shows it
 * once. Setup after that point -- wiring the token into a Claude Code hook
 * config -- happens outside Forge, in forge-gateway; this only gets someone
 * the token and points them there.
 */

import { useActionState, useState } from "react";

import { mintPairingTokenAction, type PairingFormState } from "@/lib/data/actions";
import { agentProviderLabel } from "@/lib/format";
import type { AgentProvider, Project } from "@/lib/data/types";

const INITIAL: PairingFormState = {};

const PROVIDERS: AgentProvider[] = ["claude", "codex", "gemini", "other"];

export function PairSessionForm({
  projects,
  gatewayUrl,
}: {
  projects: Project[];
  gatewayUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(mintPairingTokenAction, INITIAL);
  const [copied, setCopied] = useState(false);

  if (state.token) {
    const lines = [
      `export WORLDVIEW_PAIRING_TOKEN="${state.token}"`,
      `export WORLDVIEW_GATEWAY_URL="${gatewayUrl || "<your forge-gateway URL>"}"`,
    ].join("\n");

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          This token is shown once and expires in 15 minutes. Set it where
          your agent runs, then follow forge-gateway&rsquo;s README to wire up
          the hook.
        </p>
        <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.82rem]">
          {lines}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lines);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Clipboard access can be denied; the text is still selectable.
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href="https://github.com/HarithKavish/forge-gateway#readme"
            target="_blank"
            rel="noreferrer"
            className="btn btn--sm btn--ghost"
          >
            forge-gateway setup
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="pair-provider">
          Agent provider
        </label>
        <select id="pair-provider" name="provider" className="field" defaultValue="claude" required>
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {agentProviderLabel(provider)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="pair-projectId">
          Project <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id="pair-projectId" name="projectId" className="field" defaultValue="">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="pair-label">
          Label <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="pair-label"
          name="label"
          className="field"
          placeholder="Harith's laptop"
          maxLength={60}
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
          {pending ? "Minting…" : "Get pairing token"}
        </button>
      </div>
    </form>
  );
}
