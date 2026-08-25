import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getProviderInfo, listAccountsForProvider } from "@/lib/data/queries";
import { GITHUB_SCOPES } from "@/lib/providers/github/oauth";
import { BackLink, Breadcrumbs, PageHeader, SectionCard } from "@/components/ui/page";
import { ProviderMark } from "@/components/ui/provider-mark";
import { ExternalIcon } from "@/components/ui/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ providerId: string }>;
}): Promise<Metadata> {
  const { providerId } = await params;
  const provider = await getProviderInfo(providerId);
  return { title: `Connect ${provider?.displayName ?? "integration"}` };
}

/** Plain-English descriptions of the OAuth scopes Forge requests. */
const SCOPE_EXPLANATIONS: { scope: string; what: string; why: string }[] = [
  {
    scope: "repo",
    what: "Read access to your repositories, including private ones.",
    why: "Private repositories are invisible without it. GitHub's OAuth Apps have no read-only variant of this scope, so it also grants write — Forge only ever issues GET requests, but the grant itself is broader than what Forge uses.",
  },
  {
    scope: "read:org",
    what: "See which organisations you belong to.",
    why: "Without it, repositories owned by an organisation do not appear.",
  },
  {
    scope: "read:user",
    what: "Read your public profile.",
    why: "Used to label the connection with the account it belongs to.",
  },
];

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

  return (
    <div className="mx-auto flex max-w-[44rem] flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Integrations", href: "/integrations" },
            { label: provider.displayName, href: `/integrations/${provider.id}` },
            { label: "Connect" },
          ]}
        />
        <BackLink href={`/integrations/${provider.id}`} label={provider.displayName} />
      </div>

      <div className="flex items-center gap-3">
        <ProviderMark provider={provider.id} size="lg" />
        <PageHeader
          eyebrow={existing.length > 0 ? "Add another account" : "Connect"}
          title={`Connect ${provider.displayName}`}
          description={provider.summary}
        />
      </div>

      {provider.implemented ? (
        <>
          <SectionCard title="What Forge will be able to see">
            <ul className="flex flex-col gap-3">
              {SCOPE_EXPLANATIONS.map((item) => (
                <li key={item.scope}>
                  <p className="font-mono text-[0.82rem] font-[650]">{item.scope}</p>
                  <p className="mt-0.5 text-sm">{item.what}</p>
                  <p className="mt-0.5 text-[0.82rem] leading-relaxed text-muted">
                    {item.why}
                  </p>
                </li>
              ))}
            </ul>

            <div className="surface-inset mt-4 px-3.5 py-3">
              <p className="eyebrow text-[0.68rem]">Requested scope string</p>
              <p className="mt-1.5 font-mono text-[0.8rem] break-all text-muted">
                {GITHUB_SCOPES}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="What happens to the token">
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
                Revoked the moment you disconnect — and revocable from{" "}
                {provider.displayName} at any time, independently of Forge.
              </li>
              <li>
                Forge reads. It does not create, modify, or delete anything in
                your account.
              </li>
            </ul>

            <div className="mt-5 flex flex-wrap gap-2">
              {/*
                A link rather than a form: the start route only sets a state
                cookie and redirects, so there is nothing to protect against
                double submission.
              */}
              <Link
                href={`/api/integrations/github/start?next=${encodeURIComponent(`/integrations/${provider.id}`)}`}
                className="btn btn--primary"
                prefetch={false}
              >
                <ExternalIcon size={15} />
                Continue to {provider.displayName}
              </Link>
              <Link href={`/integrations/${provider.id}`} className="btn btn--ghost">
                Cancel
              </Link>
            </div>
          </SectionCard>
        </>
      ) : (
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
      )}
    </div>
  );
}
