/**
 * Session shapes.
 *
 * These types are the contract between the UI and whatever produces a session.
 * Auth.js will populate the same shape later, so no component or route needs to
 * change when the mock is removed — only the implementation behind
 * `getSession()` does.
 */

/** An account known to this browser. Shown in the "continue as" picker. */
export interface ForgeAccount {
  userId: string;
  email: string;
  name: string;
}

/** The active session. Mirrors what Auth.js will return from `auth()`. */
export interface ForgeSession {
  userId: string;
  email: string;
  name: string;
  /** The tenant every query is scoped to. One personal workspace per user. */
  workspaceId: string;
  workspaceName: string;
  issuedAt: string;
}
