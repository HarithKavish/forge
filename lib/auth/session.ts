/**
 * Server-side session access.
 *
 * The single boundary every page reads through. Its internals went from a mock
 * cookie, to Auth.js + Google, to the HarithKavish identity service — and no
 * caller changed for any of it. That was the point of the seam.
 */

import { redirect } from "next/navigation";

import { auth } from "./index";
import type { ForgeSession } from "./types";

export async function getSession(): Promise<ForgeSession | null> {
  const session = await auth();

  // A session without a workspace cannot scope a query, so it is not a usable
  // Forge session even if Auth.js considers the user signed in.
  if (!session?.user?.id || !session.workspaceId) return null;

  return {
    userId: session.user.id,
    username: session.user.username ?? null,
    name: session.user.name ?? "Forge user",
    image: session.user.image,
    workspaceId: session.workspaceId,
    workspaceName: session.workspaceName ?? "Personal workspace",
  };
}

/**
 * Guard for protected pages. Middleware already redirects unauthenticated
 * traffic; this is the second line of defence so a page can never render
 * without a session even if a route slips past the matcher.
 */
export async function requireSession(): Promise<ForgeSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
