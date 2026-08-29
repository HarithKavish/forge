"use client";

import { useEffect } from "react";

import { store, USER_KEY } from "@/lib/ecosystem/store";

/**
 * Publishes the signed-in reader to the ecosystem's shared store.
 *
 * Forge holds a real session; the other surfaces hold none, so without this
 * they would show a signed-out header to someone who is plainly signed in here.
 * Writing it means the picture appears on nexus, the blog and the rest, and a
 * reader arriving at any of them is not asked to sign in again.
 *
 * This publishes identity, not authority. Nothing downstream may treat it as
 * permission — see lib/ecosystem/store.ts.
 */
export function IdentitySync({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  useEffect(() => {
    store().set(USER_KEY, JSON.stringify({ name, picture: image ?? "" }));
  }, [name, image]);

  return null;
}
