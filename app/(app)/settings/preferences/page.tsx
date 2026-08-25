import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import { getOverview, listConnectedAccounts } from "@/lib/data/queries";
import { pluralize, relativeTime } from "@/lib/format";
import { DetailRow, SectionCard } from "@/components/ui/page";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = {
  title: "Preferences",
};

export default async function PreferencesSettingsPage() {
  const session = await requireSession();
  const [overview, accounts] = await Promise.all([
    getOverview(session.workspaceId),
    listConnectedAccounts(session.workspaceId),
  ]);

  const lastSync = accounts
    .map((a) => a.lastSyncAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Appearance"
        description="Follows your system setting until you choose otherwise."
      >
        <div className="max-w-56">
          <ThemeToggle />
        </div>
      </SectionCard>

      <SectionCard
        title="Inventory"
        description="Everything Forge currently knows about, read from your connected platforms."
      >
        <dl>
          <DetailRow label="Connected platforms">{overview.connectedProviders}</DetailRow>
          <DetailRow label="Resources discovered">{overview.resources}</DetailRow>
          <DetailRow label="Unassociated">{overview.unassociatedResources}</DetailRow>
          <DetailRow label="Last synchronization">
            {relativeTime(lastSync, "Never")}
          </DetailRow>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Discovery runs when you connect a platform and whenever you press
          Synchronize on an integration.{" "}
          {accounts.length === 0
            ? "Nothing is connected yet, so the inventory is empty."
            : `${pluralize(accounts.length, "account")} connected.`}
        </p>
        <Link href="/integrations" className="btn btn--sm mt-3">
          Manage integrations
        </Link>
      </SectionCard>

      <SectionCard title="Not built yet">
        <p className="text-sm leading-relaxed text-muted">
          Scheduled background synchronization, notification routing, and the
          thresholds that decide when a resource is called &ldquo;potentially
          unused&rdquo; are all still fixed in code. They are left out of this
          screen rather than shown as controls with nothing behind them.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          For now a resource is called <em>recently inactive</em> after 30 days
          without an observed signal, and <em>potentially unused</em> after 60.
        </p>
      </SectionCard>
    </div>
  );
}
