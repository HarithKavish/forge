import type { Metadata } from "next";
import Link from "next/link";

import { requireSession } from "@/lib/auth/session";
import { listConnectedAccounts } from "@/lib/data/queries";
import { pluralize } from "@/lib/format";
import { DetailRow, SectionCard } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";

export const metadata: Metadata = {
  title: "Security settings",
};

/**
 * Security.
 *
 * States plainly what is and is not in place. A settings page that implied
 * encryption or session controls this build does not have would be worse than
 * one that admits the gap.
 */
export default async function SecuritySettingsPage() {
  const session = await requireSession();
  const accounts = await listConnectedAccounts(session.workspaceId);

  const needingAttention = accounts.filter(
    (a) => a.status === "needs_reauth" || a.status === "error",
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Session"
        description="How this browser is signed in."
      >
        <dl>
          <DetailRow label="Method">
            <span className="pill pill--neutral">Google OAuth 2.0</span>
          </DetailRow>
          <DetailRow label="Managed by">Auth.js</DetailRow>
          <DetailRow label="Storage">HTTP-only, Secure cookie</DetailRow>
          <DetailRow label="Signed">
            <span className="text-healthy">Yes</span>
          </DetailRow>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The session is a signed token in an HTTP-only cookie, so it cannot be
          read or altered by scripts in the browser. Auth.js handles the OAuth
          exchange, including the state and PKCE checks that protect the
          callback — none of that is reimplemented here.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Signing out clears the cookie. Because sessions are stateless tokens
          rather than database rows, there is no server-side revocation list; a
          session ends when its cookie is cleared or it expires after 30 days.
        </p>
      </SectionCard>

      <SectionCard
        title="Credential handling"
        description="How provider secrets will be stored once integrations are live."
      >
        <ul className="flex list-disc flex-col gap-2 pl-4 text-sm text-muted">
          <li>
            Secrets are encrypted with AES-256-GCM under a versioned keyring, so
            a key can be rotated without downtime.
          </li>
          <li>
            Each ciphertext is cryptographically bound to the account it belongs
            to — a credential row copied onto another account fails to decrypt
            rather than silently granting access.
          </li>
          <li>
            Secrets live in their own table, so listing integrations never reads
            the column and cannot leak one into an API response.
          </li>
          <li>
            Nothing is decrypted outside a provider call, and no secret is ever
            logged or returned to the browser.
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          None of this is exercised yet: Forge does not ask for provider
          credentials in this build, which is why the connect flow collects
          nothing.
        </p>
      </SectionCard>

      <SectionCard
        title="Connected account health"
        description={
          needingAttention.length === 0
            ? "All connected accounts are authenticating normally."
            : `${pluralize(needingAttention.length, "account")} need re-authentication.`
        }
        bodyClassName="divide-y divide-(--border)"
      >
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9rem] font-[650]">{account.displayName}</p>
              <p className="truncate text-[0.8rem] text-muted">
                {account.status === "needs_reauth"
                  ? "The stored credential was rejected by the provider."
                  : "Authenticating normally."}
              </p>
            </div>
            <StatusBadge
              level={account.status === "connected" ? "healthy" : "warning"}
              label={account.status === "connected" ? "Valid" : "Needs re-auth"}
            />
            <Link
              href={`/integrations/${account.provider}`}
              className="btn btn--sm btn--ghost"
            >
              Manage
            </Link>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
