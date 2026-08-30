"use client";

import { useEffect, useState } from "react";

import { readEcosystemUser, store, USER_KEY } from "@/lib/ecosystem/store";

/**
 * The account's picture, kept current.
 *
 * The session carries whatever the picture was when the person signed in, which
 * is right until they change it — and changing it is exactly when every other
 * surface updates and Forge would not, because a JWT does not change under a
 * page that is already open.
 *
 * So the shared value wins when there is one, and the session is the fallback
 * for a first paint or a cleared cookie. Display only: nothing here decides what
 * anyone may see.
 */
export function useEcosystemPicture(fallback?: string | null): string | null {
  const [picture, setPicture] = useState<string | null>(fallback ?? null);

  useEffect(() => {
    const apply = () => {
      const user = readEcosystemUser();
      // An empty string means "no picture", which is a real answer and not a
      // reason to fall back to a stale one.
      if (user) setPicture(user.picture ? user.picture : null);
      else setPicture(fallback ?? null);
    };

    apply();
    store().subscribe((key) => {
      if (key === USER_KEY) apply();
    });
  }, [fallback]);

  return picture;
}
