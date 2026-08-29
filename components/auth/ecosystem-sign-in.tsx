"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { signInAction } from "@/lib/auth/actions";
import { readEcosystemUser } from "@/lib/ecosystem/store";

/** One attempt per tab, so a stale ecosystem value cannot cause a redirect loop. */
const ATTEMPTED = "forge.autoContinue";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary w-full" disabled={pending}>
      {pending ? "Taking you to sign in…" : "Sign in to Nexus"}
    </button>
  );
}

/**
 * The way into Forge.
 *
 * It leads to the ecosystem's identity service rather than to a provider. What
 * someone signs in with there is that service's business, and Forge is told a
 * subject either way.
 *
 * `next` rides through the round trip so someone who asked for /projects lands
 * back on /projects rather than the dashboard.
 */
export function EcosystemSignIn({ next }: { next?: string }) {
  const form = useRef<HTMLFormElement>(null);

  /*
   * Someone already signed in elsewhere in the ecosystem should not be asked
   * again. Forge cannot treat that shared value as a session — any subdomain
   * can write it — so it does the real thing: it starts the round trip, which
   * returns without a prompt while their session there is live.
   *
   * Attempted once per tab. Without the guard, a shared value that no longer
   * matches a live session would bounce between here and the identity service
   * for as long as the tab stayed open.
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
    <form action={signInAction} ref={form}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton />
    </form>
  );
}
