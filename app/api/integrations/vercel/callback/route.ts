import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { upsertConnectedAccount } from "@/lib/core/connected-accounts";
import { saveCredential } from "@/lib/core/credentials";
import { consumeOAuthState } from "@/lib/providers/oauth-state";
import { vercelAdapter } from "@/lib/providers/vercel/adapter";
import { exchangeVercelCode } from "@/lib/providers/vercel/oauth";
import { runDiscovery } from "@/lib/sync/discover";

/**
 * Completes the Vercel connection.
 *
 * Same order as every other connect path: verify state, exchange the code,
 * confirm who the token belongs to, persist, encrypt, discover. Identity is
 * established before anything is written, so a token cannot be filed under the
 * wrong account.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;

  const fail = (reason: string, returnTo = "/integrations/vercel") =>
    NextResponse.redirect(new URL(`${returnTo}?error=${reason}`, request.url));

  if (params.get("error")) {
    const { returnTo } = await consumeOAuthState("vercel", params.get("state"));
    return fail("denied", returnTo);
  }

  const { ok, returnTo } = await consumeOAuthState("vercel", params.get("state"));
  if (!ok) return fail("state_mismatch");

  const code = params.get("code");
  if (!code) return fail("no_code", returnTo);

  try {
    const token = await exchangeVercelCode(code, request.nextUrl.origin);

    const credentials = {
      accessToken: token.accessToken,
      // The installation decides scope; a team install only ever sees that team.
      teamId: token.teamId,
    };

    const identity = await vercelAdapter.authenticate({
      credentials,
      settings: {},
    });

    const account = await upsertConnectedAccount(session.workspaceId, {
      provider: "vercel",
      displayName: identity.displayName,
      externalAccountId: identity.externalAccountId,
      settings: { ...identity.settings, installationId: token.installationId ?? "" },
    });

    await saveCredential(account.id, credentials);

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
    // Never surface the raw error: it can carry request details.
    return fail("exchange_failed", returnTo);
  }
}
