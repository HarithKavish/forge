"use client";

import { useEffect } from "react";

import { readEcosystemUser, store, USER_KEY } from "@/lib/ecosystem/store";

/**
 * Fills the ecosystem's shared identity, and only when it is empty.
 *
 * It used to write on every render, unconditionally. Forge had no picture to
 * write — the identity service did not hand one out — so it wrote an empty one,
 * and opening Forge cleared the picture on every other surface. Changing it
 * again brought it back everywhere except here, until Forge was opened and wiped
 * it once more.
 *
 * The account service owns this value: it writes it at sign-in and again
 * whenever the name or picture changes, and it is the only place that knows the
 * truth. Forge's job is to leave it alone.
 *
 * What remains is a gap-filler. Someone whose cookie was cleared but whose Forge
 * session survives would otherwise look signed out everywhere else, so a missing
 * value is written once. An existing one is never touched.
 */
export function IdentitySync({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  useEffect(() => {
    if (readEcosystemUser()) return;
    store().set(USER_KEY, JSON.stringify({ name, picture: image ?? "" }));
  }, [name, image]);

  return null;
}
