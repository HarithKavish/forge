import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProviderInfo, listAccountsForProvider } from "@/lib/data/queries";
import { GITHUB_SCOPES } from "@/lib/providers/github/oauth";
import { BackLink, Breadcrumbs, PageHeader, SectionCard } from "@/components/ui/page";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ExternalIcon } from "@/components/ui/icons";
import { TokenConnectForm } from "@/components/integrations/token-connect-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ providerId: string }>;
}): Promise<Metadata> {
  const { providerId } = await params;
  const provider = await getProviderInfo(providerId);
  return { title: `Connect ${provider?.displayName ?? "integration"}` };
}

export default async function ConnectProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const session = await requireSession();

  const provider = await getProviderInfo(providerId);
  if (!provider) notFound();

  const existing = await listAccountsForProvider(session.workspaceId, providerId);
  const back = `/integrations/${provider.id}`;

  return (
    <div className="mx-auto flex max-w-[44rem] flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Integrations", href: "/integrations" },
            { label: provider.displayName, href: back },
            { label: "Connect" },
          ]}
        />
        <BackLink href={back} label={provider.displayName} />
      </div>

      <div className="flex items-center gap-3">
        <ProviderMark provider={provider.id} size="lg" />
        <PageHeader
          eyebrow={existing.length > 0 ? "Add another account" : "Connect"}
          title={`Connect ${provider.displayName}`}
          description={provider.summary}
        />
      </div>

      {!provider.implemented ? (
        <SectionCard title="Not available yet">
          <p className="text-sm leading-relaxed text-muted">
            The {provider.displayName} adapter has not been built, so there is
            nothing to authenticate against and no inventory to discover. Forge
            will not ask for credentials it cannot yet use.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            When it lands, connecting will need a{" "}
            {provider.credentialKind.toLowerCase()}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/integrations" className="btn">
              Back to integrations
            </Link>
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost"
            >
              <ExternalIcon size={15} />
              Open {provider.displayName} console
            </a>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="What Forge will be able to see">
            {provider.requiredScopes ? (
              <ul className="flex flex-col gap-1.5">
                {provider.requiredScopes.map((scope) => (
                  <li key={scope} className="font-mono text-[0.82rem]">
                    {scope}
                  </li>
                ))}
              </ul>
            ) : null}

            {provider.connectMethod === "oauth" ? (
              <div className="surface-inset mt-4 px-3.5 py-3">
                <p className="eyebrow text-[0.68rem]">Requested scope string</p>
                <p className="mt-1.5 font-mono text-[0.8rem] break-all text-muted">
                  {GITHUB_SCOPES}
                </p>
              </div>
            ) : null}

            {/*
              Stated up front rather than buried. Where a provider forces a
              broader grant than Forge uses, that is the user's decision to make
              with the facts in front of them.
            */}
            {provider.caveat ? (
              <p className="mt-4 rounded-[var(--radius-inner)] border border-(--status-warning-border) bg-(--status-warning-bg) px-3.5 py-3 text-[0.85rem] leading-relaxed text-warning">
                {provider.caveat}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="What happens to the credential">
            <ul className="flex list-disc flex-col gap-2 pl-4 text-sm text-muted">
              <li>
                Encrypted with AES-256-GCM before it is stored, and bound to this
                connection so it cannot be reused elsewhere.
              </li>
              <li>
                Decrypted in memory only while Forge is talking to{" "}
                {provider.displayName}. It is never logged, never returned by an
                API, and never reaches your browser.
              </li>
              <li>
                Destroyed the moment you disconnect — and revocable from{" "}
                {provider.displayName} at any time, independently of Forge.
              </li>
              <li>Forge reads. It creates, modifies and deletes nothing.</li>
            </ul>

            {provider.connectMethod === "oauth" ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/api/integrations/github/start?next=${encodeURIComponent(back)}`}
                  className="btn btn--primary"
                  prefetch={false}
                >
                  <ExternalIcon size={15} />
                  Continue to {provider.displayName}
                </Link>
                <Link href={back} className="btn btn--ghost">
                  Cancel
                </Link>
              </div>
            ) : null}
          </SectionCard>

          {provider.connectMethod === "token" && provider.credentialFields ? (
            <SectionCard
              title={`Paste your ${provider.credentialKind.toLowerCase()}`}
              description={
                provider.credentialUrl
                  ? undefined
                  : "Forge verifies it before storing anything."
              }
              actions={
                provider.credentialUrl ? (
                  <a
                    href={provider.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--sm"
                  >
                    <ExternalIcon size={14} />
                    Create one
                  </a>
                ) : null
              }
            >
              <TokenConnectForm
                providerId={provider.id}
                providerName={provider.displayName}
                fields={provider.credentialFields}
                cancelHref={back}
              />
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
