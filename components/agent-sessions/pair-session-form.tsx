"use client";

/**
 * Mints a Worldview pairing token (docs/WORLDVIEW.md §5.1, §7) and shows the
 * exact settings.json to paste it into. The token is a native Claude Code
 * `type: "http"` hook's bearer credential directly -- there's no separate
 * setup script, because a native http hook has nowhere to run one.
 */

import { useActionState, useState } from "react";

import { mintPairingTokenAction, type PairingFormState } from "@/lib/data/actions";
import { agentProviderLabel } from "@/lib/format";
import type { AgentProvider, SelectableProject } from "@/lib/data/types";

const INITIAL: PairingFormState = {};

const PROVIDERS: AgentProvider[] = ["claude", "codex", "gemini", "other"];

export function PairSessionForm({
  projects,
  gatewayUrl,
}: {
  projects: SelectableProject[];
  gatewayUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(mintPairingTokenAction, INITIAL);
  const [copiedExport, setCopiedExport] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  if (state.token) {
    const exportLine = `export WORLDVIEW_PAIRING_TOKEN="${state.token}"`;
    const url = `${gatewayUrl || "<your forge-gateway URL>"}/events/claude`;
    const hookEntry = (event: string) => `    "${event}": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "${url}",
            "headers": { "Authorization": "Bearer $WORLDVIEW_PAIRING_TOKEN" },
            "allowedEnvVars": ["WORLDVIEW_PAIRING_TOKEN"]
          }
        ]
      }
    ]`;
    const config = `{
  "hooks": {
${["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"]
  .map(hookEntry)
  .join(",\n")}
  }
}`;

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          This token is shown once. It stays valid for 90 days and acts as a
          long-lived credential — treat it like one. There is no way to
          revoke it individually before then; regenerating here does not
          invalidate the old one.
        </p>

        <div>
          <p className="mb-1.5 text-[0.8rem] text-muted">
            1. Set it where your agent runs (shell profile, or your process
            manager&rsquo;s env config):
          </p>
          <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.82rem]">
            {exportLine}
          </pre>
          <button
            type="button"
            className="btn btn--sm mt-1.5"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(exportLine);
                setCopiedExport(true);
                setTimeout(() => setCopiedExport(false), 2000);
              } catch {
                // Clipboard access can be denied; the text is still selectable.
              }
            }}
          >
            {copiedExport ? "Copied" : "Copy"}
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-[0.8rem] text-muted">
            2. Add to <code>.claude/settings.json</code>:
          </p>
          <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.78rem] leading-relaxed">
            {config}
          </pre>
          <button
            type="button"
            className="btn btn--sm mt-1.5"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(config);
                setCopiedConfig(true);
                setTimeout(() => setCopiedConfig(false), 2000);
              } catch {
                // Clipboard access can be denied; the text is still selectable.
              }
            }}
          >
            {copiedConfig ? "Copied" : "Copy"}
          </button>
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
              {project.shared ? " (shared)" : ""}
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
