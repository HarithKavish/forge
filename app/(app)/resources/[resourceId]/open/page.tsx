import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getConnectedAccount, getResource } from "@/lib/data/queries";
import { managementUrlFor } from "@/lib/mock/management-url";
import { getProvider, providerName } from "@/lib/mock/providers";
import { resourceTypeLabel } from "@/lib/format";
import { BackLink, PageHeader, SectionCard } from "@/components/ui/page";
import { ExternalIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Open in provider",
};

/**
 * Hand-off to the platform that actually owns the resource.
 *
 * An interstitial rather than a direct link, because these demo resources do
 * not exist in any real account — following the generated URL would land the
 * user on someone else's console or a 404. It shows the exact deep link Forge
 * would use, then offers the provider's console as the honest destination.
 *
 * Once real integrations land, this page collapses into a plain external link.
 */
export default async function OpenResourcePage({
  params,
}: {
  params: Promise<{ resourceId: string }>;
}) {
  const { resourceId } = await params;
  const session = await requireSession();

  const resource = await getResource(session.workspaceId, resourceId);
  if (!resource) notFound();

  const account = await getConnectedAccount(session.workspaceId, resource.connectedAccountId);
  const provider = getProvider(resource.provider);
  const deepLink = managementUrlFor(resource, account);

  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-6">
      <BackLink href={`/resources/${resource.id}`} label={resource.name} />

      <PageHeader
        eyebrow="Hand-off"
        title={`Open in ${providerName(resource.provider)}`}
        description={`Forge sends you to the platform that owns this resource rather than trying to manage it here.`}
      />

      <SectionCard title="Destination">
        <dl className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-2.5">
            <dt className="text-sm text-muted">Resource</dt>
            <dd className="text-sm font-medium">
              {resource.name} · {resourceTypeLabel(resource.resourceType)}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-2.5">
            <dt className="text-sm text-muted">Account</dt>
            <dd className="text-sm font-medium">{account?.displayName ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
            <dt className="text-sm text-muted">Region</dt>
            <dd className="text-sm font-medium">{resource.region ?? "—"}</dd>
          </div>
        </dl>

        {deepLink ? (
          <div className="surface-inset px-3.5 py-3">
            <p className="eyebrow text-[0.68rem]">Deep link Forge would open</p>
            <p className="mt-1.5 font-mono text-[0.78rem] leading-relaxed break-all text-muted">
              {deepLink}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {providerName(resource.provider)} has no direct console URL for this
            resource type, so Forge would open the platform's console instead.
          </p>
        )}
      </SectionCard>

      <SectionCard title="This is demo data">
        <p className="text-sm leading-relaxed text-muted">
          No provider account is connected yet, so this resource does not exist
          in any real {providerName(resource.provider)} account and the link
          above would not resolve. Once the {providerName(resource.provider)}{" "}
          integration is connected, this page is replaced by the deep link
          itself.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {provider ? (
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary"
            >
              <ExternalIcon size={15} />
              Open {provider.displayName} console
            </a>
          ) : null}
          <Link href={`/resources/${resource.id}`} className="btn">
            Back to resource
          </Link>
          <Link href={`/integrations/${resource.provider}`} className="btn btn--ghost">
            Connect {providerName(resource.provider)}
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
