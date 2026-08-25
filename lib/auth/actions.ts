"use server";

/**
 * Authentication actions.
 *
 * Thin wrappers over Auth.js. The OAuth handshake itself — state, PKCE, nonce,
 * code exchange — is entirely Auth.js's; none of it is reimplemented here,
 * because hand-rolling those checks is how OAuth implementations get broken.
 */

import { signIn, signOut } from "./index";

/**
 * Only same-origin paths may be used as a post-login destination. An
 * attacker-supplied absolute URL would turn sign-in into an open redirect.
 */
function safeDestination(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  // Throws a redirect to Google; nothing after this line runs on success.
  await signIn("google", { redirectTo: safeDestination(formData.get("next")) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
