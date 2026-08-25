import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { upsertConnectedAccount } from "@/lib/core/connected-accounts";
import { saveCredential } from "@/lib/core/credentials";
import { githubAdapter } from "@/lib/providers/github/adapter";
import {
  consumeGitHubState,
  exchangeGitHubCode,
} from "@/lib/providers/github/oauth";
import { runDiscovery } from "@/lib/sync/discover";

/**
 * Completes the GitHub connection.
 *
 * Order matters: verify state, exchange the code, confirm who the token belongs
 * to, persist the account, encrypt the token, then discover. Identity is
 * established before anything is written, so a token can never be filed under
 * the wrong account.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;

  const fail = (reason: string, returnTo = "/integrations/github") =>
    NextResponse.redirect(new URL(`${returnTo}?error=${reason}`, request.url));

  // The user pressed Cancel on GitHub's consent screen.
  if (params.get("error")) {
    const { returnTo } = await consumeGitHubState(params.get("state"));
    return fail("denied", returnTo);
  }

  const { ok, returnTo } = await consumeGitHubState(params.get("state"));
  if (!ok) {
    // Mismatched or missing state: a forged or replayed callback. Nothing is
    // written and the user is told plainly.
    return fail("state_mismatch");
  }

  const code = params.get("code");
  if (!code) return fail("no_code", returnTo);

  try {
    const token = await exchangeGitHubCode(code, request.nextUrl.origin);

    const credentials = {
      accessToken: token.accessToken,
      scope: token.scope,
      tokenType: token.tokenType,
    };

    // Ask GitHub who this token belongs to before persisting anything.
    const identity = await githubAdapter.authenticate({
      credentials,
      settings: {},
    });

    const account = await upsertConnectedAccount(session.workspaceId, {
      provider: "github",
      displayName: identity.displayName,
      externalAccountId: identity.externalAccountId,
      settings: identity.settings,
    });

    await saveCredential(account.id, credentials);

    // Discover immediately: a connection that shows nothing until some later
    // background job would look broken.
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
    // Never surface the raw error: it can carry request details. The account is
    // left unconnected rather than half-written.
    return fail("exchange_failed", returnTo);
  }
}
