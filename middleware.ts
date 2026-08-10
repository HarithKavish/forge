/**
 * Route protection.
 *
 * Redirects happen here rather than in a client effect so an unauthenticated
 * request never renders a protected page at all — no flash of the dashboard
 * before a bounce. This is also exactly where Auth.js middleware plugs in:
 * swap the cookie read for `auth()` and the rules below are unchanged.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  decodeCookieValue,
  isValidSession,
} from "@/lib/auth/cookies";

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const session = decodeCookieValue<unknown>(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const authenticated = isValidSession(session);

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
    // Remember where they were headed so login can return them there.
    if (pathname !== "/home") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the favicon and static asset requests.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
