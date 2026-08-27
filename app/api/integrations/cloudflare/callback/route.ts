import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { upsertConnectedAccount } from "@/lib/core/connected-accounts";
import { saveCredential } from "@/lib/core/credentials";
import { consumeOAuthState } from "@/lib/providers/oauth-state";
import { cloudflareAdapter } from "@/lib/providers/cloudflare/adapter";
import { exchangeCloudflareCode } from "@/lib/providers/cloudflare/oauth";
import { runDiscovery } from "@/lib/sync/discover";

/**
 * Completes the Cloudflare connection.
 *
 * Same order as every other connect path: verify state, exchange the code,
 * confirm who the token belongs to, persist, encrypt, discover.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;

  const fail = (reason: string, returnTo = "/integrations/cloudflare") =>
    NextResponse.redirect(new URL(`${returnTo}?error=${reason}`, request.url));

  if (params.get("error")) {
    const { returnTo } = await consumeOAuthState("cloudflare", params.get("state"));
    return fail("denied", returnTo);
  }

  const { ok, returnTo, codeVerifier } = await consumeOAuthState(
    "cloudflare",
    params.get("state"),
  );
  if (!ok || !codeVerifier) return fail("state_mismatch");

  const code = params.get("code");
  if (!code) return fail("no_code", returnTo);

  try {
    const token = await exchangeCloudflareCode(
      code,
      codeVerifier,
      request.nextUrl.origin,
    );

    const credentials = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scope: token.scope,
    };

    const identity = await cloudflareAdapter.authenticate({
      credentials,
      settings: {},
    });

    const account = await upsertConnectedAccount(session.workspaceId, {
      provider: "cloudflare",
      displayName: identity.displayName,
      externalAccountId: identity.externalAccountId,
      settings: identity.settings,
    });

    await saveCredential(account.id, credentials, token.expiresAt);

    const outcome = await runDiscovery(session.workspaceId, {
      id: account.id,
      provider: account.provider,
      settings: account.settings,
    });

    const destination = new URL(returnTo, request.url);
    destination.searchParams.set("connected", "1");
    if (outcome.ok && outcome.stats) {
      destination.searchParams.set("found", String(outcome.stats.discovered));
    } else if (outcome.error) {
      destination.searchParams.set("sync_error", "1");
    }
    return NextResponse.redirect(destination);
  } catch {
    return fail("exchange_failed", returnTo);
  }
}
