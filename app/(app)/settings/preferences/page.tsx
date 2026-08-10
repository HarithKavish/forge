import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { getOverrides } from "@/lib/data/overrides";
import { getConnectionState } from "@/lib/data/connections";
import { resetDemoAction } from "@/lib/data/actions";
import { pluralize } from "@/lib/format";
import { DetailRow, SectionCard } from "@/components/ui/page";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = {
  title: "Preferences",
};

export default async function PreferencesSettingsPage() {
  await requireSession();

  const [overrides, connections] = await Promise.all([
    getOverrides(),
    getConnectionState(),
  ]);

  const edited = Object.keys(overrides).length;
  const added = connections.added.length;
  const removed = connections.removed.length;
  const hasEdits = edited + added + removed > 0;

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
        title="Demo data"
        description="Changes you make in this preview are stored in your browser, not on a server."
      >
        <dl>
          <DetailRow label="Resources edited">{edited}</DetailRow>
          <DetailRow label="Accounts added">{added}</DetailRow>
          <DetailRow label="Accounts disconnected">{removed}</DetailRow>
        </dl>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          Assigning a resource to a project, ignoring one, or connecting a
          simulated account all persist so the product is genuinely testable.
          They live in a cookie on this device and are invisible to anyone else.
        </p>

        <form action={resetDemoAction} className="mt-4">
          <button type="submit" className="btn" disabled={!hasEdits}>
            {hasEdits
              ? `Reset ${pluralize(edited + added + removed, "change")}`
              : "No changes to reset"}
          </button>
        </form>
        <p className="mt-1.5 text-[0.8rem] text-muted">
          Returns the demo inventory to its original state.
        </p>
      </SectionCard>

      <SectionCard title="Not built yet">
        <p className="text-sm leading-relaxed text-muted">
          Notification routing, synchronization frequency and the thresholds that
          decide when a resource is called &ldquo;potentially unused&rdquo; all
          need the sync engine running against real accounts before they mean
          anything. They are left out rather than shown as controls with nothing
          behind them.
        </p>
      </SectionCard>
    </div>
  );
}
