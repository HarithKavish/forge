"use client";

/**
 * Bridge connection status only (docs/BRIDGE.md "Local bridge discovery").
 * No session list here anymore -- discovering and linking sessions happens
 * only from inside a project's own panel ("Link agent session"), scoped to
 * that project's not-yet-linked sessions. This panel just answers "is a
 * bridge running and linked to my workspace," using the same automatic
 * `/discover` + `/link` flow (useLocalBridge) -- no URL or token ever
 * shown, nothing to copy/paste.
 */

import { useLocalBridge } from "@/lib/hooks/use-local-bridge";

export function LocalBridgePanel() {
  const { connection, linking, linkNow } = useLocalBridge();

  if (connection.phase === "checking") {
    return <p className="text-sm text-muted">Looking for a local bridge…</p>;
  }

  if (connection.phase === "not_found") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">No local bridge detected. In your Forge checkout, run:</p>
        <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-border bg-surface-soft px-3 py-2.5 text-[0.82rem]">
          cd bridge{"\n"}npm install{"\n"}npm run install-hooks{"\n"}npm run bridge
        </pre>
        <p className="text-sm text-muted">
          Forge checks for it automatically — no link to open once it&rsquo;s running.
        </p>
      </div>
    );
  }

  if (connection.phase === "unlinked") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Bridge detected on this machine, not yet linked to a workspace.</p>
        <button type="button" className="btn btn--primary self-start" onClick={linkNow} disabled={linking}>
          {linking ? "Linking…" : "Link this bridge"}
        </button>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted">
      Bridge connected. Open a project&rsquo;s panel and use &ldquo;Link agent session&rdquo; to attach a session to it.
    </p>
  );
}
