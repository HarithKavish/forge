/**
 * Auth.js instance.
 *
 * The boundary between "how someone proved who they are" and "who they are in
 * Forge". Google proves identity; the Drizzle adapter turns that into a Forge
 * `users` row with its own uuid, plus an `accounts` row recording that this
 * Google account maps to it.
 *
 * That indirection is the whole point. When the HarithKavish identity platform
 * replaces Google, it becomes another row in `accounts` for the same user —
 * every project, resource and workspace keeps pointing at the same internal id,
 * and nothing in the domain model has to change.
 */

import NextAuth from "next-auth";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  /**
   * Points at the existing schema rather than Auth.js's default table names.
   * `sessions` and `verificationTokens` are wired up so the adapter is complete
   * and a later switch to database sessions needs no migration, even though the
   * JWT strategy leaves them unused today.
   */
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

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
