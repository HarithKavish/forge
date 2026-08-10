"use client";

import { useActionState } from "react";

import { signInAction, type AuthFormState } from "@/lib/auth/actions";

const INITIAL: AuthFormState = {};

/**
 * Credentials form.
 *
 * `useActionState` keeps the server action as the single source of validation,
 * which is the same shape Auth.js's credentials flow uses — swapping the
 * action out later leaves this component untouched.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          placeholder="you@example.com"
          autoComplete="email"
          required
          // The first thing on the page that needs input.
          autoFocus
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          placeholder="At least 6 characters"
          autoComplete="current-password"
          minLength={6}
          required
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-inner)] border border-(--status-error-border) bg-(--status-error-bg) px-3 py-2 text-sm text-error"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn--primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
