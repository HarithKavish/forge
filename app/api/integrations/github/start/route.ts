import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { beginOAuthState } from "@/lib/providers/oauth-state";
import { githubInstallUrl } from "@/lib/providers/github/app";

/**
 * Starts the GitHub connection by sending the user to install the app.
 *
 * A GET that mutates nothing except the state cookie, so it is safe as a plain
 * link from the connect page.
 */
export async function GET(request: NextRequest) {
  await requireSession();

  const returnTo = request.nextUrl.searchParams.get("next") ?? "/integrations/github";

  try {
    const { state } = await beginOAuthState("github", returnTo);
    return NextResponse.redirect(githubInstallUrl(state));
  } catch {
    return NextResponse.redirect(
      new URL("/integrations/github?error=not_configured", request.url),
    );
  }
}
