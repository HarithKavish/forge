"use server";

/**
 * Authentication actions.
 *
 * Mock implementations — see the warning in ./cookies.ts. Any email and a
 * password of at least 6 characters signs in, because there is no user store
 * yet. The signatures are the ones Auth.js's `signIn`/`signOut` will satisfy,
 * so the forms calling them do not change later.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACCOUNTS_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  encodeCookieValue,
  parseAccounts,
} from "./cookies";
import type { ForgeAccount, ForgeSession } from "./types";

export interface AuthFormState {
  error?: string;
}

/** Stable pseudo-id from an email, so the same address is the same user. */
function userIdFor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  return `usr_${Math.abs(hash).toString(36).padStart(7, "0")}`;
}

/** "ada.lovelace@example.com" -> "Ada Lovelace". Never invents a real identity. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "Forge user";
}

async function establishSession(email: string, name: string): Promise<void> {
  const store = await cookies();
  const userId = userIdFor(email);

  const session: ForgeSession = {
    userId,
    email,
    name,
    // One personal workspace per user — the tenancy model from the foundation.
    workspaceId: `ws_${userId.slice(4)}`,
    workspaceName: `${name.split(" ")[0] ?? name}'s workspace`,
    issuedAt: new Date().toISOString(),
  };

  const known = parseAccounts(store.get(ACCOUNTS_COOKIE)?.value);
  const accounts: ForgeAccount[] = [
    { userId, email, name },
    ...known.filter((a) => a.userId !== userId),
  ].slice(0, 5);

  const secure = process.env.NODE_ENV === "production";

  store.set(SESSION_COOKIE, encodeCookieValue(session), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  store.set(ACCOUNTS_COOKIE, encodeCookieValue(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Only same-origin paths may be used as a post-login destination — an
 * attacker-supplied absolute URL would turn login into an open redirect.
 */
function safeDestination(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  await establishSession(email, nameFromEmail(email));
  redirect(safeDestination(formData.get("next")));
}

/** One-click resume for an account already remembered on this device. */
export async function continueAsAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login");

  const store = await cookies();
  const known = parseAccounts(store.get(ACCOUNTS_COOKIE)?.value);
  const account = known.find((a) => a.email === email);
  if (!account) redirect("/login");

  await establishSession(account.email, account.name);
  redirect("/home");
}

/** Ends the session but keeps the device's account list for a fast return. */
export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Full sign-out: also forgets which accounts this browser has seen. */
export async function forgetAllAccountsAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ACCOUNTS_COOKIE);
  redirect("/login");
}
