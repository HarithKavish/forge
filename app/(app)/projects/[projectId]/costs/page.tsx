import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProject, listResources } from "@/lib/data/queries";
import { costAccuracyLabel, money, pluralize, resourceTypeLabel } from "@/lib/format";
import { getProvider, providerName } from "@/lib/mock/providers";
import { MetricTile, SectionCard } from "@/components/ui/page";
import { ProviderMark } from "@/components/ui/provider-mark";

/**
 * Cost for the project.
 *
 * Two rules the product holds to are visible here: every figure is labelled
 * with how much it can be trusted, and resources with no cost data are counted
 * out loud rather than quietly treated as zero. A total that hides its own
 * gaps would be worse than no total.
 */
export default async function ProjectCostsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await requireSession();

  const project = await getProject(session.workspaceId, projectId);
  if (!project) notFound();

  const resources = await listResources(session.workspaceId, { projectId });

  const billing = resources
    .filter((r) => r.costAmount !== undefined)
    .sort((a, b) => (b.costAmount ?? 0) - (a.costAmount ?? 0));
  const noData = resources.filter((r) => r.costAmount === undefined);
  const total = billing.reduce((sum, r) => sum + (r.costAmount ?? 0), 0);

  // Per-platform subtotals.
  const byProvider = new Map<string, number>();
  for (const resource of billing) {
    byProvider.set(
      resource.provider,
      (byProvider.get(resource.provider) ?? 0) + (resource.costAmount ?? 0),
    );
  }

  const idle = billing.filter(
    (r) => r.activityState === "potentially_unused" || r.activityState === "recently_inactive",
  );
  const idleTotal = idle.reduce((sum, r) => sum + (r.costAmount ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Reported monthly"
          value={total > 0 ? money(total) : "—"}
          hint={`From ${pluralize(billing.length, "resource")}`}
        />
        <MetricTile
          label="No cost data"
          value={noData.length}
          hint="Excluded from the total"
        />
        <MetricTile
          label="Low activity"
          value={idleTotal > 0 ? money(idleTotal) : "—"}
          tone={idleTotal > 0 ? "warning" : "default"}
          hint={`Across ${pluralize(idle.length, "resource")}`}
        />
        <MetricTile label="Platforms billing" value={byProvider.size} />
      </div>

      {byProvider.size > 0 ? (
        <SectionCard title="By platform">
          <ul className="flex flex-col gap-2.5">
            {[...byProvider.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([provider, amount]) => (
                <li key={provider} className="flex items-center gap-3">
                  <ProviderMark provider={provider} size="sm" />
                  <span className="w-32 flex-none truncate text-[0.9rem] font-[650]">
                    {providerName(provider)}
                  </span>
                  {/* Proportional bar — a comparison, not a decoration. */}
                  <span
                    className="h-2 flex-1 overflow-hidden rounded-full bg-(--surface-sunken)"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, (amount / total) * 100)}%` }}
                    />
                  </span>
                  <span className="tabular w-24 flex-none text-right text-[0.9rem] font-[650]">
                    {money(amount)}
                  </span>
                </li>
              ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        title="By resource"
        description="Every figure carries the accuracy Forge can vouch for."
        bodyClassName=""
      >
        {billing.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No resource in this project reports cost data.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Resource</th>
                  <th scope="col">Type</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {billing.map((resource) => (
                  <tr key={resource.id}>
                    <td>
                      <Link
                        href={`/resources/${resource.id}`}
                        className="font-[650] hover:text-accent"
                      >
                        {resource.name}
                      </Link>
                    </td>
                    <td className="text-muted">{resourceTypeLabel(resource.resourceType)}</td>
                    <td className="text-muted">{providerName(resource.provider)}</td>
                    <td>
                      <span className="pill pill--neutral">
                        {costAccuracyLabel(resource.costAccuracy)}
                      </span>
                    </td>
                    <td className="tabular font-[650]">
                      {money(resource.costAmount ?? 0, resource.costCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {noData.length > 0 ? (
        <SectionCard
          title="No cost data"
          description={`${pluralize(noData.length, "resource")} are not included in the total above.`}
          bodyClassName="divide-y divide-(--border)"
        >
          {noData.map((resource) => {
            const provider = getProvider(resource.provider);
            return (
              <Link
                key={resource.id}
                href={`/resources/${resource.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-(--surface-sunken)"
              >
                <ProviderMark provider={resource.provider} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[0.9rem] font-[650]">
                  {resource.name}
                </span>
                <span className="text-[0.8rem] text-muted">
                  {provider?.capabilities.cost
                    ? "No figure collected yet"
                    : `${providerName(resource.provider)} exposes no per-resource cost`}
                </span>
              </Link>
            );
          })}
        </SectionCard>
      ) : null}
    </div>
  );
}
