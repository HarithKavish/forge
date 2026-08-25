/**
 * Edge-safe Auth.js configuration.
 *
 * Split from lib/auth/index.ts on purpose: middleware runs in the edge runtime,
 * where the database adapter cannot. This half holds only what is needed to
 * *read* a session — provider metadata and the session strategy — so middleware
 * can validate a request without a database round trip on every navigation.
 *
 * Google is configured here as an authentication *method*. It is deliberately
 * not woven into the domain model: Forge identifies a user by its own internal
 * id, and the Google account is one row in `accounts` pointing at it. Swapping
 * Google for another identity provider later means editing this array.
 */

import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [
    // Client id and secret are read from AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.
    // They are never referenced in source, and never reach the browser.
    Google({
      authorization: {
        params: {
          // Only what is needed to create a Forge user. No Google APIs are
          // called beyond identity.
          scope: "openid email profile",
          // Let the user pick which Google account to use rather than silently
          // reusing whichever one the browser happens to be signed into.
          prompt: "select_account",
        },
      },
    }),
  ],

  pages: {
    signIn: "/login",
    // Auth.js appends ?error=..., which the login page surfaces.
    error: "/login",
  },

  /**
   * JWT rather than database sessions, so middleware can verify a session
   * itself. With database sessions the edge could only check that *some*
   * cookie existed, while the real check happened later in the request — and a
   * stale cookie would then bounce between middleware and the page. Verifying
   * in one place removes that whole class of bug.
   *
   * The trade-off is that signing out clears the cookie rather than deleting a
   * server-side row. docs/AUTH.md records how to move to database sessions if
   * server-side revocation is ever needed.
   */
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },

  // Vercel terminates TLS upstream; trust the forwarded host.
  trustHost: true,
} satisfies NextAuthConfig;
