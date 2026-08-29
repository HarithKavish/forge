/**
 * Session shapes, and the Auth.js module augmentation that carries them.
 *
 * `ForgeSession` is what the application actually consumes. Keeping it separate
 * from Auth.js's own `Session` is what lets the identity provider change
 * without touching a single page: every route reads this shape, not the
 * identity service's.
 */

import type { DefaultSession } from "next-auth";
// Not used directly, but importing the module is what makes it resolvable for
// the `declare module "next-auth/jwt"` augmentation below. Removing this import
// breaks the build.
import type { JWT } from "next-auth/jwt";

/** The active session, as the rest of Forge sees it. */
export interface ForgeSession {
  /** Forge's internal user id. Never a provider's id. */
  userId: string;
  email: string;
  name: string;
  image?: string | null;
  /** The tenant every query is scoped to. */
  workspaceId: string;
  workspaceName: string;
}

declare module "next-auth" {
  interface Session {
    workspaceId?: string;
    workspaceName?: string;
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    workspaceId?: string;
    workspaceName?: string;
  }
}
