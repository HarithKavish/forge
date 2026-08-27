import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { beginOAuthState } from "@/lib/providers/oauth-state";
import { vercelInstallUrl } from "@/lib/providers/vercel/oauth";

/**
 * Starts the Vercel connection.
 *
 * A GET that mutates nothing except the state cookie, so it is safe as a plain
 * link from the connect page.
 */
export async function GET(request: NextRequest) {
  await requireSession();

  const returnTo = request.nextUrl.searchParams.get("next") ?? "/integrations/vercel";

  try {
    const { state } = await beginOAuthState("vercel", returnTo);
    return NextResponse.redirect(vercelInstallUrl(state));
  } catch {
    // Missing client id, secret or slug. Say so on the page rather than
    // bouncing the user to a broken Vercel screen.
    return NextResponse.redirect(
      new URL("/integrations/vercel?error=not_configured", request.url),
    );
  }
}
