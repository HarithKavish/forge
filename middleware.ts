/**
 * Route protection.
 *
 * Runs before any protected page renders, so an unauthenticated request never
 * produces dashboard markup at all — no flash of content before a bounce.
 *
 * It uses the edge-safe half of the Auth.js config, which can verify the
 * session JWT on its own. Middleware and the server components therefore reach
 * the same verdict about a request; if they could disagree, a stale cookie
 * would ping-pong between /login and /home.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/login"];

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const authenticated = Boolean(request.auth?.user);

  // Forge is an application, not a marketing site: the root is an entry point,
  // never a landing page.
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(authenticated ? "/home" : "/login", request.url),
    );
  }

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublic) {
    // A signed-in user has no reason to see the login page.
    if (authenticated) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    // Remember where they were headed so sign-in can return them there.
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  /**
   * Everything except Next internals, static assets, and /api/auth — the OAuth
   * callback must reach its handler rather than being redirected to /login,
   * which would make sign-in impossible.
   */
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
