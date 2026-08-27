import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { beginOAuthState } from "@/lib/providers/oauth-state";
import { cloudflareAuthorizeUrl } from "@/lib/providers/cloudflare/oauth";

export async function GET(request: NextRequest) {
  await requireSession();

  const returnTo =
    request.nextUrl.searchParams.get("next") ?? "/integrations/cloudflare";

  try {
    const { state, codeChallenge } = await beginOAuthState(
      "cloudflare",
      returnTo,
      { pkce: true },
    );
    return NextResponse.redirect(
      cloudflareAuthorizeUrl(request.nextUrl.origin, state, codeChallenge!),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/integrations/cloudflare?error=not_configured", request.url),
    );
  }
}
