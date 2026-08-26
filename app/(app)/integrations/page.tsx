import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import { listConnectedAccounts, listProviders, listResources } from "@/lib/data/queries";
import { pluralize, relativeTime } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui/page";
import { StatusBadge, SyncBadge } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { ProviderInfo } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "Integrations",
};

const CATEGORY_LABELS: Record<ProviderInfo["category"], string> = {
  cloud: "Cloud",
  source: "Source control",
  database: "Database",
  edge: "Edge & DNS",
  platform: "Deployment",
};

/**
 * The integration center.
 *
 * Ordered so connected platforms come first — the ones already producing
 * inventory are the ones the user acts on; the rest is a catalogue.
 */
export default async function IntegrationsPage() {
  const session = await requireSession();

  const [providers, accounts, resources] = await Promise.all([
    listProviders(),
    listConnectedAccounts(session.workspaceId),
    listResources(session.workspaceId),
  ]);

  const rows = providers.map((provider) => {
    const providerAccounts = accounts.filter((a) => a.provider === provider.id);
    const providerResources = resources.filter((r) => r.provider === provider.id);
    const failing = providerAccounts.some(
      (a) => a.lastSyncStatus === "failed" || a.status === "needs_reauth",
    );
    const degraded = providerAccounts.some((a) => a.lastSyncStatus === "partial");
    const lastSync = providerAccounts
      .map((a) => a.lastSyncAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      provider,
      accounts: providerAccounts,
      resourceCount: providerResources.length,
      connected: providerAccounts.length > 0,
      health: failing ? ("error" as const) : degraded ? ("warning" as const) : ("healthy" as const),
      lastSync,
    };
  });

  const connected = rows.filter((r) => r.connected);
  const available = rows.filter((r) => !r.connected);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
      />

      <SectionCard
        title="Connected"
        description={
          connected.length === 0
            ? "Nothing connected yet."
            : `${pluralize(connected.length, "platform")} · ${pluralize(accounts.length, "account")}`
        }
        bodyClassName="divide-y divide-(--border)"
      >
        {connected.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Connect a platform below to start building your inventory.
          </p>
        ) : (
          connected.map((row) => (
            <Link
              key={row.provider.id}
              href={`/integrations/${row.provider.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-(--surface-sunken)"
            >
              <ProviderMark provider={row.provider.id} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.98rem] font-[650]">{row.provider.displayName}</p>
                <p className="truncate text-[0.83rem] text-muted">
                  {pluralize(row.accounts.length, "account")} ·{" "}
                  {pluralize(row.resourceCount, "resource")} ·{" "}
                  {CATEGORY_LABELS[row.provider.category]}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[0.8rem] text-muted">
                  {row.lastSync ? `Synced ${relativeTime(row.lastSync)}` : "Never synced"}
                </span>
                <StatusBadge level={row.health} />
                <ChevronRightIcon size={16} className="text-faint" />
              </div>
            </Link>
          ))
        )}
      </SectionCard>

      <SectionCard
        title="Available"
        bodyClassName="grid gap-3 p-5 sm:grid-cols-2"
      >
        {available.map((row) => (
          <div key={row.provider.id} className="surface-inset flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <ProviderMark provider={row.provider.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-[650]">{row.provider.displayName}</p>
                <p className="mt-0.5 text-[0.82rem] text-muted">{row.provider.summary}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {capabilityPills(row.provider)}
            </div>
            <div className="mt-auto flex items-center gap-2">
              <Link
                href={`/integrations/${row.provider.id}/connect`}
                className="btn btn--sm btn--primary"
              >
                Connect
              </Link>
              <Link href={`/integrations/${row.provider.id}`} className="btn btn--sm">
                Details
              </Link>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Synchronization"
        bodyClassName="divide-y divide-(--border)"
      >
        {accounts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No accounts connected.
          </p>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <ProviderMark provider={account.provider} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9rem] font-[650]">{account.displayName}</p>
                {account.lastSyncError ? (
                  <p className="truncate text-[0.8rem] text-warning">
                    {account.lastSyncError}
                  </p>
                ) : (
                  <p className="truncate text-[0.8rem] text-muted">
                    {account.externalAccountId}
                  </p>
                )}
              </div>
              <span className="text-[0.8rem] text-muted">
                {relativeTime(account.lastSyncAt, "Never")}
              </span>
              <SyncBadge status={account.lastSyncStatus} />
            </div>
          ))
        )}
      </SectionCard>
    </div>
  );
}

/** Only the capabilities a provider actually has — absence is information. */
function capabilityPills(provider: ProviderInfo) {
  const labels: [keyof ProviderInfo["capabilities"], string][] = [
    ["resourceDiscovery", "Discovery"],
    ["resourceStatus", "Status"],
    ["activity", "Activity"],
    ["cost", "Cost"],
  ];

  return labels.map(([key, label]) => (
    <span
      key={key}
      className={provider.capabilities[key] ? "pill pill--neutral" : "pill pill--plain opacity-60"}
      title={
        provider.capabilities[key]
          ? `${provider.displayName} supports ${label.toLowerCase()}`
          : `${provider.displayName} does not expose ${label.toLowerCase()}`
      }
    >
      {provider.capabilities[key] ? label : `No ${label.toLowerCase()}`}
    </span>
  ));
}
