import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  getConnectedAccount,
  getProject,
  listAllEnvironments,
  listAllServices,
  listProjectRecords,
} from "@/lib/data/queries";
import { getResource } from "@/lib/data/queries";
import { getOverrides } from "@/lib/data/overrides";
import { setArchivedAction, setIgnoredAction } from "@/lib/data/actions";
import {
  absoluteDate,
  costAccuracyLabel,
  money,
  presenceLabel,
  relativeTime,
  resourceTypeLabel,
} from "@/lib/format";
import { getProvider, providerName } from "@/lib/mock/providers";
import {
  BackLink,
  Breadcrumbs,
  DetailRow,
  ObservationInference,
  PageHeader,
  SectionCard,
} from "@/components/ui/page";
import { ActivityBadge, StatusBadge } from "@/components/ui/status";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ExternalIcon } from "@/components/ui/icons";
import { AssignForm } from "@/components/resource/assign-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resourceId: string }>;
}): Promise<Metadata> {
  const { resourceId } = await params;
  const session = await requireSession();
  const resource = await getResource(session.workspaceId, resourceId);
  return { title: resource?.name ?? "Resource" };
}

/**
 * Everything Forge knows about one resource, and the two things it can do
 * about it: organize it, or hand the user off to the platform that owns it.
 */
export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ resourceId: string }>;
}) {
  const { resourceId } = await params;
  const session = await requireSession();

  const resource = await getResource(session.workspaceId, resourceId);
  if (!resource) notFound();

  const [account, projects, environments, services, overrides] = await Promise.all([
    getConnectedAccount(session.workspaceId, resource.connectedAccountId),
    listProjectRecords(session.workspaceId),
    listAllEnvironments(session.workspaceId),
    listAllServices(session.workspaceId),
    getOverrides(),
  ]);

  const project = resource.projectId
    ? await getProject(session.workspaceId, resource.projectId)
    : undefined;

  const environment = environments.find((e) => e.id === resource.environmentId);
  const service = services.find((s) => s.id === resource.serviceId);
  const provider = getProvider(resource.provider);
  const override = overrides[resource.id];
  const ignored = override?.ignored === true;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Resources", href: "/resources" },
            ...(project ? [{ label: project.name, href: `/projects/${project.id}` }] : []),
            { label: resource.name },
          ]}
        />
        <BackLink href="/resources" label="All resources" />
      </div>

      <PageHeader
        eyebrow={`${providerName(resource.provider)} · ${resourceTypeLabel(resource.resourceType)}`}
        title={resource.name}
        description={resource.providerResourceId}
        actions={
          <>
            <Link href={`/resources/${resource.id}/open`} className="btn btn--primary">
              <ExternalIcon size={15} />
              Open in {providerName(resource.provider)}
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge level={resource.healthStatus} />
        <ActivityBadge state={resource.activityState} />
        {!resource.projectId ? <span className="pill pill--warning">No project</span> : null}
        {resource.presence !== "live" ? (
          <span className="pill pill--plain">{presenceLabel(resource.presence)}</span>
        ) : null}
        {ignored ? <span className="pill pill--plain">Ignored</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <div className="flex flex-col gap-4">
          {/* --- Activity: fact and inference kept apart ------------------- */}
          <SectionCard
            title="Activity"
            description="What Forge observed, and what it concludes from that."
          >
            {resource.activityReason ? (
              <ObservationInference
                observation={resource.activityReason}
                inference={
                  resource.activityState === "potentially_unused"
                    ? "This resource may no longer be needed. Forge has not verified that — review it before acting."
                    : resource.activityState === "recently_inactive"
                      ? "Activity has stopped recently. This may be expected for this resource."
                      : undefined
                }
              />
            ) : (
              <ObservationInference observation="No activity signal has been collected for this resource yet." />
            )}

            <dl className="mt-4 border-t border-border pt-2">
              <DetailRow label="Last observed activity">
                {relativeTime(resource.lastActivityAt, "No signal")}
              </DetailRow>
              <DetailRow label="Last seen by a sync">
                {relativeTime(resource.lastSeenAt)}
              </DetailRow>
              <DetailRow label="First discovered">
                {absoluteDate(resource.discoveredAt)}
              </DetailRow>
              <DetailRow label="Created at provider">
                {absoluteDate(resource.providerCreatedAt)}
              </DetailRow>
            </dl>
          </SectionCard>

          {/* --- Cost ------------------------------------------------------ */}
          <SectionCard title="Cost">
            {resource.costAmount === undefined ? (
              <p className="text-sm text-muted">
                {provider?.capabilities.cost
                  ? "No cost figure has been collected for this resource yet."
                  : `${providerName(resource.provider)} does not expose per-resource cost, so Forge has no figure to show. It will not estimate one.`}
              </p>
            ) : (
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="metric">
                    {money(resource.costAmount, resource.costCurrency)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    per {resource.costPeriod ?? "month"} · as of{" "}
                    {absoluteDate(resource.costAsOf)}
                  </p>
                </div>
                <span
                  className="pill pill--neutral"
                  title="How much this figure can be trusted"
                >
                  {costAccuracyLabel(resource.costAccuracy)}
                </span>
              </div>
            )}
          </SectionCard>

          {/* --- Provider metadata ---------------------------------------- */}
          {resource.metadata && Object.keys(resource.metadata).length > 0 ? (
            <SectionCard
              title="Provider details"
              description="Kept as reported, outside Forge's core model."
            >
              <dl>
                {Object.entries(resource.metadata).map(([key, value]) => (
                  <DetailRow key={key} label={humanize(key)}>
                    <span className="font-mono text-[0.82rem]">{value}</span>
                  </DetailRow>
                ))}
              </dl>
            </SectionCard>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {/* --- Association ---------------------------------------------- */}
          <SectionCard
            title="Project association"
            description={
              resource.projectId
                ? "Where this resource belongs."
                : "This resource belongs to no project yet."
            }
          >
            <AssignForm
              resourceId={resource.id}
              projects={projects}
              environments={environments}
              services={services}
              currentProjectId={resource.projectId}
              currentEnvironmentId={resource.environmentId}
              currentServiceId={resource.serviceId}
            />

            {project ? (
              <div className="mt-4 border-t border-border pt-3">
                <dl>
                  <DetailRow label="Project">
                    <Link href={`/projects/${project.id}`} className="hover:text-accent">
                      {project.name}
                    </Link>
                  </DetailRow>
                  <DetailRow label="Environment">{environment?.name ?? "—"}</DetailRow>
                  <DetailRow label="Service">{service?.name ?? "—"}</DetailRow>
                </dl>
              </div>
            ) : null}
          </SectionCard>

          {/* --- Source --------------------------------------------------- */}
          <SectionCard title="Source">
            <div className="mb-3 flex items-center gap-3">
              <ProviderMark provider={resource.provider} size="lg" />
              <div className="min-w-0">
                <p className="font-[650]">{providerName(resource.provider)}</p>
                <p className="truncate text-sm text-muted">
                  {account?.displayName ?? "Unknown account"}
                </p>
              </div>
            </div>
            <dl>
              <DetailRow label="Provider resource id">
                <span className="font-mono text-[0.8rem] break-all">
                  {resource.providerResourceId}
                </span>
              </DetailRow>
              <DetailRow label="Region">{resource.region ?? "—"}</DetailRow>
              <DetailRow label="Provider state">
                {resource.providerStatus ?? "—"}
              </DetailRow>
              <DetailRow label="Presence">{presenceLabel(resource.presence)}</DetailRow>
              {account ? (
                <DetailRow label="Account">
                  <Link
                    href={`/integrations/${resource.provider}`}
                    className="hover:text-accent"
                  >
                    {account.externalAccountId}
                  </Link>
                </DetailRow>
              ) : null}
            </dl>
          </SectionCard>

          {/* --- Organize -------------------------------------------------- */}
          <SectionCard
            title="Organize"
            description="Forge never changes anything at the provider."
          >
            <div className="flex flex-col gap-2">
              <form action={setIgnoredAction}>
                <input type="hidden" name="resourceId" value={resource.id} />
                <input type="hidden" name="ignored" value={ignored ? "false" : "true"} />
                <button type="submit" className="btn w-full justify-start">
                  {ignored ? "Stop ignoring" : "Ignore"}
                </button>
              </form>
              <p className="px-1 text-[0.78rem] leading-snug text-muted">
                Keeps the resource in the inventory but stops it appearing in
                alerts.
              </p>

              <form action={setArchivedAction} className="mt-2">
                <input type="hidden" name="resourceId" value={resource.id} />
                <input
                  type="hidden"
                  name="archived"
                  value={resource.presence === "archived" ? "false" : "true"}
                />
                <button type="submit" className="btn w-full justify-start">
                  {resource.presence === "archived" ? "Restore" : "Archive"}
                </button>
              </form>
              <p className="px-1 text-[0.78rem] leading-snug text-muted">
                Marks it retired in Forge only. The resource is not stopped or
                deleted at {providerName(resource.provider)}.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** "instanceType" / "storageClass" -> "Instance type" / "Storage class". */
function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
