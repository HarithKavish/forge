import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { beginGitHubAuthorization } from "@/lib/providers/github/oauth";

/**
 * Starts the GitHub connection.
 *
 * A GET that mutates nothing except the state cookie, so it is safe as a plain
 * link from the connect page.
 */
export async function GET(request: NextRequest) {
  // Middleware already guards this path; requireSession is the second line.
  await requireSession();

  const returnTo = request.nextUrl.searchParams.get("next") ?? "/integrations/github";

  try {
    const authorizeUrl = await beginGitHubAuthorization(request.nextUrl.origin, returnTo);
    return NextResponse.redirect(authorizeUrl);
  } catch {
    // Missing client id or secret. Say so on the page rather than showing a
    // stack trace or a broken GitHub screen.
    return NextResponse.redirect(
      new URL("/integrations/github?error=not_configured", request.url),
    );
  }
}
