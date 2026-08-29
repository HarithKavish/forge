import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { DetailRow, SectionCard } from "@/components/ui/page";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";

export const metadata: Metadata = {
  title: "Account settings",
};

export default async function AccountSettingsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Account"
      >
        <dl>
          <DetailRow label="Name">{session.name}</DetailRow>
          <DetailRow label="Email">{session.email}</DetailRow>
          <DetailRow label="User id">
            <span className="font-mono text-[0.8rem]">{session.userId}</span>
          </DetailRow>
          <DetailRow label="Sign-in method">
            <span className="pill pill--neutral">HarithKavish account</span>
          </DetailRow>
        </dl>
      </SectionCard>

      <SectionCard title="Authentication">
        <p className="text-sm leading-relaxed text-muted">
          You signed in with your HarithKavish account. Forge is told who you
            are and nothing else — no password, no provider tokens, and no
            access to anything you have connected elsewhere.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            How you proved it — a user ID and password, or Google — is the
            identity service&rsquo;s business, not Forge&rsquo;s. The user id
            above is your account&rsquo;s own, so changing how you sign in never
            moves your projects, resources or workspace.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your name comes from your account, so it is changed at
            account.harithkavish.com rather than here.
        </p>
      </SectionCard>

      <SectionCard title="Delete account">
        <p className="mb-3 text-sm leading-relaxed text-muted">
          Removes your account, your workspace, and every project, resource,
          connection and stored credential in it. Immediate and irreversible.
        </p>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Nothing is changed in your connected platforms. To revoke Forge&rsquo;s
          access there as well, remove it from each platform&rsquo;s own settings.
        </p>
        <DeleteAccountForm email={session.email} />
      </SectionCard>

      <SectionCard title="Sign out">
        <p className="mb-3 text-sm text-muted">
          Clears your Forge session on this device and returns you to the sign-in
          page. Your HarithKavish account stays signed in — sign out of it at the
            identity service to end it everywhere.
        </p>
        <form action={signOutAction}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
