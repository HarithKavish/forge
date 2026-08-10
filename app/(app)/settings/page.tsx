import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { absoluteDate } from "@/lib/format";
import { DetailRow, SectionCard } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Account settings",
};

export default async function AccountSettingsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Account"
        description="Who you are signed in as."
      >
        <dl>
          <DetailRow label="Name">{session.name}</DetailRow>
          <DetailRow label="Email">{session.email}</DetailRow>
          <DetailRow label="User id">
            <span className="font-mono text-[0.8rem]">{session.userId}</span>
          </DetailRow>
          <DetailRow label="Signed in">{absoluteDate(session.issuedAt)}</DetailRow>
        </dl>
      </SectionCard>

      <SectionCard title="Authentication">
        <p className="text-sm leading-relaxed text-muted">
          This preview uses a mock credentials flow — any email and a password of
          six or more characters signs in, and the session is a plain browser
          cookie. It is not secure and is not meant to be. Real authentication
          arrives with Auth.js, using the same session shape, so nothing about
          this screen or the routing changes when it does.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Editing your name, changing a password and verifying an email address
          all need that real backing store, so they are not offered here rather
          than presented as controls that quietly do nothing.
        </p>
      </SectionCard>

      <SectionCard title="Sign out">
        <p className="mb-3 text-sm text-muted">
          Ends this session. The account stays offered on this device for a
          faster return; use &ldquo;forget accounts&rdquo; on the sign-in page to
          clear that too.
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
