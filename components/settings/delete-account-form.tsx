"use client";

import { useActionState, useState } from "react";

import {
  deleteAccountAction,
  type DeleteAccountState,
} from "@/lib/data/account-actions";

const INITIAL: DeleteAccountState = {};

/**
 * Deleting is irreversible, so the button stays disabled until the user has
 * typed their own address — deliberate friction, proportional to the
 * consequence.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(deleteAccountAction, INITIAL);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="confirmEmail">
          Type <span className="font-mono">{email}</span> to confirm
        </label>
        <input
          id="confirmEmail"
          name="confirmEmail"
          className="field"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
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

      <button
        type="submit"
        className="btn btn--danger self-start"
        disabled={!matches || pending}
      >
        {pending ? "Deleting…" : "Delete my account and all data"}
      </button>
    </form>
  );
}
