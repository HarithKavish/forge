import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import {
  getOverview,
  listConnectedAccounts,
  listProjects,
} from "@/lib/data/queries";
import { pluralize } from "@/lib/format";
import { DetailRow, SectionCard } from "@/components/ui/page";
import { ProviderMark } from "@/components/ui/provider-mark";

export const metadata: Metadata = {
  title: "Workspace settings",
};

/**
 * Workspace settings.
 *
 * The workspace is the tenant — every query in Forge is scoped to it. In this
 * build each user gets exactly one, which is why there is no switcher; the
 * model is already built to hold members and roles when teams arrive.
 */
export default async function WorkspaceSettingsPage() {
  const session = await requireSession();

  const [overview, projects, accounts] = await Promise.all([
    getOverview(session.workspaceId),
    listProjects(session.workspaceId),
    listConnectedAccounts(session.workspaceId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Workspace">
        <dl>
          <DetailRow label="Name">{session.workspaceName}</DetailRow>
          <DetailRow label="Workspace id">
            <span className="font-mono text-[0.8rem]">{session.workspaceId}</span>
          </DetailRow>
          <DetailRow label="Type">Personal</DetailRow>
          <DetailRow label="Projects">{projects.length}</DetailRow>
          <DetailRow label="Resources">{overview.resources}</DetailRow>
        </dl>
      </SectionCard>

      <SectionCard
        title="Members"
      >
        <div className="surface-inset flex items-center gap-3 px-3.5 py-3">
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-surface-strong text-[0.78rem] font-[650] text-muted"
            aria-hidden="true"
          >
            {session.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.92rem] font-[650]">{session.name}</p>
            {session.username ? (
              <p className="truncate text-[0.82rem] text-muted">@{session.username}</p>
            ) : null}
          </div>
          <span className="pill pill--neutral">Owner</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Every record in Forge already carries a workspace id, and membership is
          a separate table — so inviting people later is a matter of adding
          member rows and a role check, not reshaping the data.
        </p>
      </SectionCard>

      <SectionCard
        title="Connected accounts"
        description={`${pluralize(accounts.length, "account")} across ${pluralize(overview.connectedProviders, "platform")}.`}
        actions={
          <Link href="/integrations" className="btn btn--sm">
            Manage
          </Link>
        }
        bodyClassName="divide-y divide-(--border)"
      >
        {accounts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No platforms connected.
          </p>
        ) : (
          accounts.map((account) => (
            <Link
              key={account.id}
              href={`/integrations/${account.provider}`}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
            >
              <ProviderMark provider={account.provider} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9rem] font-[650]">
                  {account.displayName}
                </span>
                <span className="block truncate font-mono text-[0.78rem] text-muted">
                  {account.externalAccountId}
                </span>
              </span>
            </Link>
          ))
        )}
      </SectionCard>
    </div>
  );
}
