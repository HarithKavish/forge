import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { upsertConnectedAccount } from "@/lib/core/connected-accounts";
import { saveCredential } from "@/lib/core/credentials";
import { consumeOAuthState } from "@/lib/providers/oauth-state";
import { githubAdapter } from "@/lib/providers/github/adapter";
import { runDiscovery } from "@/lib/sync/discover";

/**
 * Completes the GitHub connection after the app is installed.
 *
 * GitHub returns an `installation_id` rather than an authorization code —
 * there is no token to exchange, because the app's private key is what grants
 * access. Identity is still confirmed before anything is written.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;

  const fail = (reason: string, returnTo = "/integrations/github") =>
    NextResponse.redirect(new URL(`${returnTo}?error=${reason}`, request.url));

  if (params.get("error")) {
    const { returnTo } = await consumeOAuthState("github", params.get("state"));
    return fail("denied", returnTo);
  }

  const { ok, returnTo } = await consumeOAuthState("github", params.get("state"));
  if (!ok) return fail("state_mismatch");

  const installationId = params.get("installation_id");
  if (!installationId) return fail("no_installation", returnTo);

  try {
    const credentials = { installationId };

    // Confirms the installation exists and tells us whose it is.
    const identity = await githubAdapter.authenticate({ credentials, settings: {} });

    const account = await upsertConnectedAccount(session.workspaceId, {
      provider: "github",
      displayName: identity.displayName,
      externalAccountId: identity.externalAccountId,
      settings: identity.settings,
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
    return fail("exchange_failed", returnTo);
  }
}
