import type { Metadata } from "next";

import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
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
      >
        <dl>
          <DetailRow label="Name">{session.name}</DetailRow>
          <DetailRow label="Email">{session.email}</DetailRow>
          <DetailRow label="User id">
            <span className="font-mono text-[0.8rem]">{session.userId}</span>
          </DetailRow>
          <DetailRow label="Sign-in method">
            <span className="pill pill--neutral">Google</span>
          </DetailRow>
        </dl>
      </SectionCard>

      <SectionCard title="Authentication">
        <p className="text-sm leading-relaxed text-muted">
          You signed in with Google. Forge stores your name, email address and
          profile picture, and a record that this Google account belongs to the
          Forge user above — nothing else. It holds no password and no access to
          your Google account.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Google is the authentication method, not your identity in Forge. Your
          projects, resources and workspace belong to the internal user id above,
          so a different sign-in method can be added later without any of them
          moving.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your name and email come from Google, so they are changed there rather
          than here.
        </p>
      </SectionCard>

      <SectionCard title="Sign out">
        <p className="mb-3 text-sm text-muted">
          Clears your Forge session on this device and returns you to the sign-in
          page. Your Google account itself stays signed in with Google.
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
