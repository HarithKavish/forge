import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProviderInfo } from "@/lib/data/queries";
import { connectProviderAction } from "@/lib/data/connection-actions";
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

/**
 * The connection flow.
 *
 * There is deliberately no credential field on this page. A realistic-looking
 * secret input in a preview build invites someone to paste a live access key,
 * and there is nowhere safe for it to go yet — the encrypted credential path
 * exists in lib/crypto/secrets.ts but nothing is wired to it.
 *
 * So this page does the honest half of the job: it states exactly what will be
 * asked for, what Forge will read, and what it will never do. The action adds a
 * simulated account so the rest of the product stays navigable.
 */
export default async function ConnectProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const provider = await getProviderInfo(providerId);
  if (!provider) notFound();

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
          eyebrow="Add an account"
          title={`Connect ${provider.displayName}`}
          description={provider.summary}
        />
      </div>

      <SectionCard title="What Forge will ask for">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-[0.82rem] text-muted">Credential type</dt>
            <dd className="mt-0.5 text-[0.92rem] font-[650]">{provider.credentialKind}</dd>
          </div>
          <div>
            <dt className="text-[0.82rem] text-muted">Access level</dt>
            <dd className="mt-0.5 text-[0.92rem] font-[650]">
              Read-only. Forge never needs write access to do its job.
            </dd>
          </div>
        </dl>

        <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted">
          <li>The credential is encrypted before it is stored, and never returned by any API.</li>
          <li>It is decrypted in memory only for the duration of a call to {provider.displayName}.</li>
          <li>You can revoke it at any time by disconnecting the account.</li>
          <li>
            Forge reads. It does not stop, delete, resize or reconfigure anything
            in your account.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Credential entry is disabled in this preview">
        <p className="text-sm leading-relaxed text-muted">
          The adapter for {provider.displayName} is not built yet, so there is
          nothing to validate a credential against and no sync to run with it.
          Rather than show a form that looks real and quietly discards what you
          type — or worse, stores a live key somewhere it should not be — Forge
          asks for nothing here.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          You can add a simulated account to see how a connected platform
          behaves. It discovers no resources, because nothing has actually run.
        </p>

        <form action={connectProviderAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="provider" value={provider.id} />
          <div>
            <label className="label" htmlFor="displayName">
              Account label <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              className="field"
              placeholder={`${provider.displayName} — personal`}
              maxLength={48}
            />
            <p className="mt-1.5 text-[0.8rem] text-muted">
              How this account is named in Forge. Not a credential.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn--primary">
              Add simulated account
            </button>
            <Link href={`/integrations/${provider.id}`} className="btn btn--ghost">
              Cancel
            </Link>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Prepare on the platform side">
        <p className="text-sm leading-relaxed text-muted">
          When the adapter lands you will need a {provider.credentialKind.toLowerCase()}{" "}
          from {provider.displayName}. Creating it ahead of time does no harm —
          it grants read access only.
        </p>
        <a
          href={provider.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--sm mt-3"
        >
          <ExternalIcon size={15} />
          Open {provider.displayName} console
        </a>
      </SectionCard>
    </div>
  );
}
