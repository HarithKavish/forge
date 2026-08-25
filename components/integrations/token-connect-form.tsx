"use client";

/**
 * Credential entry for token-based providers.
 *
 * Fields are declared by the catalogue, not hardcoded here, so a new provider
 * needs no new form. Secrets use `type="password"` and `autoComplete="off"` —
 * they are not passwords and must not land in a password manager or a browser's
 * autofill history.
 */

import { useActionState } from "react";
import Link from "next/link";

import {
  connectWithTokenAction,
  type ConnectFormState,
} from "@/lib/data/connect-actions";
import type { CredentialField } from "@/lib/providers/catalogue";

const INITIAL: ConnectFormState = {};

export function TokenConnectForm({
  providerId,
  providerName,
  fields,
  cancelHref,
}: {
  providerId: string;
  providerName: string;
  fields: CredentialField[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(connectWithTokenAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={providerId} />

      {fields.map((field) => (
        <div key={field.name}>
          <label className="label" htmlFor={field.name}>
            {field.label}
            {field.required ? null : (
              <span className="font-normal text-muted"> (optional)</span>
            )}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.secret ? "password" : "text"}
            className="field font-mono text-[0.85rem]"
            placeholder={field.placeholder}
            required={field.required}
            autoComplete="off"
            spellCheck={false}
            // A pasted token should not be re-offered by the browser later.
            data-1p-ignore
          />
          {field.help ? (
            <p className="mt-1.5 text-[0.8rem] leading-snug text-muted">{field.help}</p>
          ) : null}
        </div>
      ))}

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-inner)] border border-(--status-error-border) bg-(--status-error-bg) px-3 py-2 text-sm text-error"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? `Verifying with ${providerName}…` : `Connect ${providerName}`}
        </button>
        <Link href={cancelHref} className="btn btn--ghost">
          Cancel
        </Link>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-muted">
        Forge verifies the credential with {providerName} before storing
        anything. If it is rejected, nothing is saved.
      </p>
    </form>
  );
}
