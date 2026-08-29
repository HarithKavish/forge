"use client";

import { store, USER_KEY } from "@/lib/ecosystem/store";

/**
 * Signing out of Forge signs the reader out of the ecosystem.
 *
 * The server action ends the Auth.js session. The shared value has to be
 * cleared here, in the browser, or every other surface would keep showing the
 * picture of someone this machine no longer has a session for.
 */
export function SignOutButton() {
  return (
    <button
      type="submit"
      className="btn btn--ghost w-full justify-start"
      onClick={() => store().remove(USER_KEY)}
    >
      Sign out
    </button>
  );
}
