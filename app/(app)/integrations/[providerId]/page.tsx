import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  getProviderInfo,
  listAccountsForProvider,
  listResources,
} from "@/lib/data/queries";
import { disconnectAccountAction, syncAccountAction } from "@/lib/data/actions";
import { absoluteDate, pluralize, relativeTime, resourceTypeLabel } from "@/lib/format";
import {
  BackLink,
  Breadcrumbs,
  DetailRow,
  MetricTile,
  PageHeader,
  SectionCard,
} from "@/components/ui/page";
import { StatusBadge, SyncBadge } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ExternalIcon } from "@/components/ui/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ providerId: string }>;
}): Promise<Metadata> {
  const { providerId } = await params;
  const provider = await getProviderInfo(providerId);
  return { title: provider?.displayName ?? "Integration" };
}

/** Reasons a connection attempt can fail, in language a user can act on. */
const CONNECT_ERRORS: Record<string, string> = {
  denied: "You cancelled the authorization, so nothing was connected.",
  state_mismatch:
    "That sign-in attempt could not be verified and was rejected. Start the connection again from this page.",
  no_code: "The provider did not return an authorization code. Try again.",
  exchange_failed:
    "Forge could not exchange the authorization code for a token. Check the OAuth client configuration.",
  not_configured:
    "Forge has no OAuth client configured for this provider. This is a server-side setting.",
};

const CAPABILITY_COPY: {
  key: "resourceDiscovery" | "resourceStatus" | "activity" | "cost" | "managementUrl";
  label: string;
  supported: string;
  missing: string;
}[] = [
  {
    key: "resourceDiscovery",
    label: "Resource discovery",
    supported: "Forge can enumerate everything visible to the credential.",
    missing: "This platform cannot be enumerated.",
  },
  {
    key: "resourceStatus",
    label: "Resource status",
    supported: "Live state is read per resource.",
    missing: "No live state beyond what discovery returns.",
  },
  {
    key: "activity",
    label: "Activity",
    supported: "Usage signals are collected and used to judge inactivity.",
    missing: "No usage signal is available, so activity stays Unknown.",
  },
  {
    key: "cost",
    label: "Cost",
    supported: "Per-resource cost is reported by the platform.",
    missing: "No per-resource billing is exposed. Forge will not estimate one.",
  },
  {
    key: "managementUrl",
    label: "Management links",
    supported: "Every resource links straight to its console page.",
    missing: "No deep links are available.",
  },
];

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<{
    connected?: string;
    found?: string;
    sync_error?: string;
    error?: string;
    synced?: string;
    disconnected?: string;
  }>;
}) {
  const { providerId } = await params;
  const { connected, found, sync_error: syncError, error: errorCode } = await searchParams;
  const session = await requireSession();

  const provider = await getProviderInfo(providerId);
  if (!provider) notFound();

  const [accounts, resources] = await Promise.all([
    listAccountsForProvider(session.workspaceId, providerId),
    listResources(session.workspaceId, { provider: providerId }),
  ]);

  // Resource types this provider actually produced, with counts.
  const byType = new Map<string, number>();
  for (const resource of resources) {
    byType.set(resource.resourceType, (byType.get(resource.resourceType) ?? 0) + 1);
  }

  const unassociated = resources.filter((r) => !r.projectId).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Integrations", href: "/integrations" },
            { label: provider.displayName },
          ]}
        />
        <BackLink href="/integrations" label="All integrations" />
      </div>

      <PageHeader
        eyebrow={accounts.length > 0 ? "Connected" : "Not connected"}
        title={provider.displayName}
        description={provider.summary}
        actions={
          <>
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalIcon size={15} />
              Console
            </a>
            <Link
              href={`/integrations/${provider.id}/connect`}
              className="btn btn--primary"
            >
              {accounts.length > 0 ? "Connect another account" : "Connect"}
            </Link>
          </>
        }
      />

      {connected ? (
        <p
          role="status"
          className="rounded-[var(--radius-card)] border border-(--status-healthy-border) bg-(--status-healthy-bg) px-4 py-3 text-sm text-healthy"
        >
          Connected. {found ? `${found} resources discovered.` : "Discovery has run."}
        </p>
      ) : null}
      {syncError ? (
        <p
          role="alert"
          className="rounded-[var(--radius-card)] border border-(--status-warning-border) bg-(--status-warning-bg) px-4 py-3 text-sm text-warning"
        >
          The account was connected, but the first discovery run failed. The
          reason is shown against the account below.
        </p>
      ) : null}
      {errorCode ? (
        <p
          role="alert"
          className="rounded-[var(--radius-card)] border border-(--status-error-border) bg-(--status-error-bg) px-4 py-3 text-sm text-error"
        >
          {CONNECT_ERRORS[errorCode] ?? "Connecting failed. Please try again."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Accounts" value={accounts.length} />
        <MetricTile
          label="Resources"
          value={resources.length}
          href={`/resources?provider=${provider.id}`}
        />
        <MetricTile
          label="Unassociated"
          value={unassociated}
          tone={unassociated > 0 ? "warning" : "default"}
          href={`/resources?view=unassociated&provider=${provider.id}`}
        />
        <MetricTile label="Resource types" value={byType.size} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SectionCard
          title="Accounts"
          bodyClassName="divide-y divide-(--border)"
        >
          {accounts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted">
                No {provider.displayName} account is connected.
              </p>
              <Link
                href={`/integrations/${provider.id}/connect`}
                className="btn btn--sm btn--primary mt-3"
              >
                Connect an account
              </Link>
            </div>
          ) : (
            accounts.map((account) => {
              const accountResources = resources.filter(
                (r) => r.connectedAccountId === account.id,
              );
              return (
                <div key={account.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.95rem] font-[650]">{account.displayName}</p>
                      <p className="font-mono text-[0.8rem] text-muted">
                        {account.externalAccountId}
                      </p>
                    </div>
                    <SyncBadge status={account.lastSyncStatus} />
                  </div>

                  {account.lastSyncError ? (
                    <p className="mt-2 rounded-[var(--radius-inner)] border border-(--status-warning-border) bg-(--status-warning-bg) px-3 py-2 text-[0.83rem] text-warning">
                      {account.lastSyncError}
                    </p>
                  ) : null}

                  <dl className="mt-2">
                    <DetailRow label="Resources">
                      <Link
                        href={`/resources?provider=${provider.id}`}
                        className="hover:text-accent"
                      >
                        {pluralize(accountResources.length, "resource")}
                      </Link>
                    </DetailRow>
                    <DetailRow label="Last sync">
                      {relativeTime(account.lastSyncAt, "Never")}
                    </DetailRow>
                    <DetailRow label="Connected">
                      {absoluteDate(account.createdAt)}
                    </DetailRow>
                    {account.region ? (
                      <DetailRow label="Region">{account.region}</DetailRow>
                    ) : null}
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={syncAccountAction}>
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="provider" value={provider.id} />
                      <button type="submit" className="btn btn--sm">
                        Synchronize now
                      </button>
                    </form>
                    <form action={disconnectAccountAction}>
                      <input type="hidden" name="accountId" value={account.id} />
                      <input type="hidden" name="provider" value={provider.id} />
                      <button type="submit" className="btn btn--sm btn--danger">
                        Disconnect
                      </button>
                    </form>
                  </div>
                  <p className="mt-1.5 text-[0.78rem] text-muted">
                    Disconnecting destroys the stored token and removes this
                    account&rsquo;s resources from Forge. Nothing at{" "}
                    {provider.displayName} is changed.
                  </p>
                </div>
              );
            })
          )}
        </SectionCard>

        <div className="flex flex-col gap-4">
          <SectionCard
            title="Capabilities"
          >
            <ul className="flex flex-col gap-3">
              {CAPABILITY_COPY.map((item) => {
                const supported = provider.capabilities[item.key];
                return (
                  <li key={item.key} className="flex gap-3">
                    <span className="flex-none pt-0.5">
                      <StatusBadge
                        level={supported ? "healthy" : "unknown"}
                        label={supported ? "Yes" : "No"}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.88rem] font-[650]">{item.label}</span>
                      <span className="block text-[0.82rem] text-muted">
                        {supported ? item.supported : item.missing}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {byType.size > 0 ? (
            <SectionCard title="Discovered types">
              <ul className="flex flex-col gap-1.5">
                {[...byType.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <li key={type} className="flex items-center justify-between gap-3">
                      <span className="text-[0.88rem]">{resourceTypeLabel(type)}</span>
                      <span className="tabular text-[0.85rem] text-muted">{count}</span>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
