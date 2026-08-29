/**
 * Auth.js instance.
 *
 * The boundary between "how someone proved who they are" and "who they are in
 * Forge". The identity service proves it; the Drizzle adapter records the
 * result.
 *
 * That indirection was written for this moment, and it held: swapping Google
 * for the identity service changed the provider and nothing else. Every
 * project, resource and workspace still points at the same internal id.
 *
 * What changed is where that id comes from. It is now the account's own
 * subject, issued by the identity service — Forge no longer invents an
 * identifier for a person, it is told one. Under the ecosystem's identity
 * standard the person belongs to the account platform, and `users` here is a
 * reference to them carrying cached display claims, not the origin of anyone.
 */

import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import { authConfig } from "./config";
import { ensureWorkspaceForUser } from "./workspace";

/**
 * Keep the link, drop the tokens.
 *
 * The adapter would persist whatever came back from the token exchange. Forge
 * spends that token once, to ask who signed in, and never needs it again — so
 * storing it means holding a credential for a service Forge does not call, on
 * the chance it is useful later. It is not.
 *
 * What stays in `accounts` is the link itself: which subject at the identity
 * service this Forge user is. That is a reference, which Forge is meant to
 * hold; the token would have been a credential, which it is not.
 */
function forgetTokens(adapter: Adapter): Adapter {
  const linkAccount = adapter.linkAccount?.bind(adapter);
  if (!linkAccount) return adapter;

  return {
    ...adapter,
    linkAccount: (account) =>
      linkAccount({
        ...account,
        access_token: undefined,
        refresh_token: undefined,
        id_token: undefined,
        session_state: undefined,
        expires_at: undefined,
      }),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  /**
   * Points at the existing schema rather than Auth.js's default table names.
   * `sessions` and `verificationTokens` are wired up so the adapter is complete
   * and a later switch to database sessions needs no migration, even though the
   * JWT strategy leaves them unused today.
   */
  adapter: forgetTokens(
    DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
  ),

  callbacks: {
    /**
     * `user` is only populated on the sign-in pass; later calls just carry the
     * existing token. The workspace lookup therefore runs once per sign-in
     * rather than once per request.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        const workspace = await ensureWorkspaceForUser(user.id, user.name);
        token.userId = user.id;
        token.workspaceId = workspace.id;
        token.workspaceName = workspace.name;
        return token;
      }

      // Backfill for a token issued before the workspace claims existed, or if
      // provisioning failed on a previous attempt. Without this a valid session
      // could exist with no tenant to scope queries to.
      if (!token.workspaceId && token.sub) {
        const workspace = await ensureWorkspaceForUser(token.sub, token.name);
        token.userId = token.sub;
        token.workspaceId = workspace.id;
        token.workspaceName = workspace.name;
      }

      return token;
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      session.workspaceId = token.workspaceId;
      session.workspaceName = token.workspaceName;
      return session;
    },
  },
});
