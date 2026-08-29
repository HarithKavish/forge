"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { signInWithGoogleAction } from "@/lib/auth/actions";
import { readEcosystemUser } from "@/lib/ecosystem/store";

/** One attempt per tab, so a stale ecosystem value cannot cause a redirect loop. */
const ATTEMPTED = "forge.autoContinue";

/** Google's four-colour mark, as their branding guidance requires on this button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? (
        "Redirecting to Google…"
      ) : (
        <>
          <GoogleMark />
          Continue with Google
        </>
      )}
    </button>
  );
}

/**
 * The only way into Forge right now.
 *
 * `next` rides through the OAuth round trip so someone who asked for
 * /projects lands back on /projects rather than the dashboard.
 */
export function GoogleSignIn({ next }: { next?: string }) {
  const form = useRef<HTMLFormElement>(null);

  /*
   * Someone already signed in elsewhere in the ecosystem should not be asked
   * again. Forge cannot trust that value as a session, so it does the real
   * thing: it starts the Google round trip, which returns without a prompt
   * while their Google session is live and lands them where they were going.
   *
   * Attempted once per tab. Without the guard, an ecosystem value that no
   * longer matches a live Google session — revoked access, a signed-out Google
   * account — would bounce between here and Google for as long as the tab was
   * open.
   */
  useEffect(() => {
    if (!readEcosystemUser()) return;
    try {
      if (sessionStorage.getItem(ATTEMPTED) === "1") return;
      sessionStorage.setItem(ATTEMPTED, "1");
    } catch {
      return; // storage blocked: leave the button for them to press
    }
    form.current?.requestSubmit();
  }, []);

  return (
    <form action={signInWithGoogleAction} ref={form}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton />
    </form>
  );
}
