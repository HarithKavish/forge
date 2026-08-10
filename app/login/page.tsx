import type { Metadata } from "next";

import { continueAsAction, forgetAllAccountsAction } from "@/lib/auth/actions";
import { getKnownAccounts } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";
import { ForgeMark } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The product's front door. Middleware has already bounced anyone who is
 * signed in, so reaching this page means there is no active session.
 *
 * Accounts previously used on this device are offered as one-click resume —
 * the "exactly one session" case then costs a single click rather than
 * retyping credentials.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const knownAccounts = await getKnownAccounts();

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
            <p className="eyebrow mb-2">Project resource intelligence</p>
            <h1 className="title-xl text-balance">Sign in to Forge</h1>
            <p className="mt-2 text-pretty text-muted">
              Everything your projects are built on, in one place.
            </p>
          </div>

          {knownAccounts.length > 0 ? (
            <section className="surface-card mb-4 p-4" aria-labelledby="known-accounts">
              <h2 id="known-accounts" className="eyebrow mb-3">
                Continue as
              </h2>
              <ul className="flex flex-col gap-2">
                {knownAccounts.map((account) => (
                  <li key={account.userId}>
                    <form action={continueAsAction}>
                      <input type="hidden" name="email" value={account.email} />
                      <button
                        type="submit"
                        className="surface-inset lift flex w-full items-center gap-3 px-3 py-2.5 text-left"
                      >
                        <span
                          className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border bg-surface-strong text-[0.72rem] font-[650] text-muted"
                          aria-hidden="true"
                        >
                          {account.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[0.9rem] font-[650]">
                            {account.name}
                          </span>
                          <span className="truncate text-[0.78rem] text-muted">
                            {account.email}
                          </span>
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={forgetAllAccountsAction} className="mt-3">
                <button type="submit" className="btn btn--ghost btn--sm">
                  Forget accounts on this device
                </button>
              </form>
            </section>
          ) : null}

          <section className="surface-card p-5">
            {knownAccounts.length > 0 ? (
              <h2 className="eyebrow mb-4">Use another account</h2>
            ) : null}
            <LoginForm next={next} />
          </section>

          {/*
            Stating plainly what this is. The product should never imply an
            authentication provider it is not actually talking to.
          */}
          <p className="mt-5 text-center text-[0.82rem] leading-relaxed text-muted">
            <span className="pill pill--syncing mr-1.5 align-middle normal-case">
              Demo
            </span>
            Authentication is mocked for this preview — any email and a password
            of six or more characters signs in. No provider account is connected,
            and the data you see is generated sample inventory.
          </p>
        </div>
      </main>

      <footer className="px-5 py-5 text-center text-[0.8rem] text-faint sm:px-8">
        Forge · forge.harithkavish.com
      </footer>
    </div>
  );
}
