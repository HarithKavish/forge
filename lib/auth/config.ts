/**
 * Edge-safe Auth.js configuration.
 *
 * Split from lib/auth/index.ts on purpose: middleware runs in the edge runtime,
 * where the database adapter cannot. This half holds only what is needed to
 * *read* a session — provider metadata and the session strategy — so middleware
 * can validate a request without a database round trip on every navigation.
 *
 * There is one provider, and it is not Google.
 *
 * A HarithKavish account is the identity; Google is one way of proving one, and
 * proving it is the identity service's job rather than Forge's. Forge asks who
 * is signed in and is told a subject. Whether that person used a password, a
 * passkey, or Google is a question Forge does not need to have an opinion about
 * — and every opinion it had was another place to change when the answer did.
 */

import type { NextAuthConfig } from "next-auth";

/** The ecosystem's identity service. Same deployable as the account platform. */
const ISSUER = "https://auth.harithkavish.com";

export const authConfig = {
  providers: [
    {
      /**
       * The provider id fixes the callback path Auth.js listens on, which is
       * registered as an exact redirect URI on the identity service. Renaming
       * it silently breaks sign-in, so it does not get renamed.
       */
      id: "harithkavish",
      name: "HarithKavish",
      type: "oauth",

      authorization: {
        url: `${ISSUER}/oauth/authorize`,
        params: { scope: "openid profile" },
      },
      token: `${ISSUER}/api/oauth/token`,
      userinfo: `${ISSUER}/api/oauth/userinfo`,

      clientId: "forge",
      clientSecret: process.env.AUTH_HARITHKAVISH_SECRET,

      /**
       * PKCE and state, both required by the identity service. `state` is what
       * ties the callback to the browser that began it; `pkce` is what makes an
       * intercepted code useless without the verifier that never left here.
       */
      checks: ["pkce", "state"],

      /**
       * `sub` is the account's own identifier, stable across every way its owner
       * might sign in. It is what Forge keys a user on, so that changing how
       * someone authenticates never changes who they are here.
       */
      profile(profile: {
        sub: string;
        name?: string;
        preferred_username?: string;
        picture?: string | null;
      }) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username ?? "Forge user",
          // The identity service does not hand out email addresses, and Forge
          // has never needed one. `users.email` stays for the adapter's sake.
          email: `${profile.sub}@accounts.harithkavish.com`,
          // Whatever the account chose. Null is the placeholder, not a failure.
          image: typeof profile.picture === "string" ? profile.picture : null,
        };
      },
    },
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
   * Forge's session is its own (V3). Signing out here ends this session; the
   * ecosystem session that vouched for it is ended at the identity service.
   */
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },

  // Vercel terminates TLS upstream; trust the forwarded host.
  trustHost: true,
} satisfies NextAuthConfig;
