import type { Metadata } from "next";

import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { ForgeLogo, ForgeMark } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Auth.js reports failures by bouncing back here with ?error=. These are the
 * ones a user can actually act on; anything else gets the generic message
 * rather than a raw error code.
 */
const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already registered to Forge through a different sign-in method.",
  AccessDenied: "Google sign-in was cancelled, so you were not signed in.",
  Configuration:
    "Forge's Google sign-in is not configured correctly. This is a server-side problem, not something you did.",
  Verification: "That sign-in link has expired. Try again.",
};

/**
 * The product's front door. Middleware has already bounced anyone who is
 * signed in, so reaching this page means there is no active session.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const message = error
    ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.")
    : undefined;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="flex items-center gap-2.5">
          <ForgeMark />
          <span className="text-[0.98rem] font-[650] tracking-[0.01em]">Forge</span>
        </span>
        <ThemeToggle compact />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <div className="mb-6">
            <ForgeLogo size={104} />
            <p className="eyebrow mt-5 mb-2">Project resource intelligence</p>
            <h1 className="title-xl text-balance">Sign in to Forge</h1>
            <p className="mt-2 text-pretty text-muted">
              Everything your projects are built on, in one place.
            </p>
          </div>

          {message ? (
            <p
              role="alert"
              className="surface-card mb-4 border-(--status-error-border) bg-(--status-error-bg) px-4 py-3 text-sm text-error"
            >
              {message}
            </p>
          ) : null}

          <section className="surface-card p-5">
            <GoogleSignIn next={next} />
            <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
              Google is currently the only way to sign in to Forge. Forge
              receives your name, email address and profile picture — nothing
              else, and it never gains access to anything else in your Google
              account.
            </p>
          </section>

          {/*
            Saying plainly which part is real. Sign-in genuinely authenticates
            and creates a workspace; the inventory inside is still sample data
            until provider integrations are connected.
          */}
          <p className="mt-5 text-center text-[0.82rem] leading-relaxed text-muted">
            <span className="pill pill--syncing mr-1.5 align-middle normal-case">
              Preview
            </span>
            Sign-in is real. The projects and resources inside are sample data —
            no cloud accounts are connected yet.
          </p>
        </div>
      </main>

      <footer className="px-5 py-5 text-center text-[0.8rem] text-faint sm:px-8">
        Forge · forge.harithkavish.com
      </footer>
    </div>
  );
}
