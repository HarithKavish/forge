"use server";

/**
 * Account actions.
 *
 * Deletion is irreversible and takes the whole workspace with it, so it asks
 * the user to type their own email address first. A button alone is too easy to
 * hit by accident for something with no undo.
 */

import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";
import { deleteAccountAndData } from "@/lib/core/account";

export interface DeleteAccountState {
  error?: string;
}

export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const session = await requireSession();
  const typed = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();

  if (typed !== session.email.toLowerCase()) {
    return { error: "That does not match the email address on this account." };
  }

  await deleteAccountAndData(session.userId);

  // The session is a signed token, so it stays technically valid until it
  // expires; clearing it is what actually ends the session on this device.
  await signOut({ redirectTo: "/login?deleted=1" });

  // Unreachable: signOut throws a redirect.
  redirect("/login?deleted=1");
}
