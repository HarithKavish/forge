import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { registerGatewaySession } from "@/lib/core/agent-sessions";
import { safeEqual } from "@/lib/crypto/secrets";
import { env } from "@/lib/env";
import { deriveSessionRef, verifyPairingToken } from "@/lib/gateway/pairing";

/**
 * Server-to-server only -- called by forge-gateway, never a browser. Excluded
 * from middleware's session check (middleware.ts) since there is no Forge
 * session here, only the shared secret.
 *
 * This is the "call back to Forge" from docs/WORLDVIEW.md §5.1, called once
 * per session (forge-gateway's index.ts only calls this the first time it
 * sees a given sessionRef, not on every hook event). The gateway already
 * verified the token and derived the same sessionRef itself before this
 * call -- Forge verifies again here anyway, because it is the only party
 * that ever writes an agent_sessions row and shouldn't trust the gateway's
 * word alone for that.
 */
export async function POST(request: NextRequest) {
  const secret = env().GATEWAY_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Gateway integration not configured" }, { status: 503 });
  }

  const auth = request.headers.get("Authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pairingToken: string;
  let providerSessionId: string | undefined;
  let cwd: string | undefined;
  try {
    const body = (await request.json()) as {
      pairingToken?: string;
      providerSessionId?: string;
      cwd?: string;
    };
    if (!body.pairingToken) throw new Error("pairingToken required");
    pairingToken = body.pairingToken;
    providerSessionId = body.providerSessionId;
    cwd = body.cwd;
  } catch {
    return NextResponse.json({ error: "pairingToken required" }, { status: 400 });
  }

  let claims;
  try {
    claims = verifyPairingToken(pairingToken);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid pairing token" },
      { status: 400 },
    );
  }

  // A bridge event carries the real provider session id, so its sessionRef
  // is derived from that (must match forge-gateway's own
  // `sr_<provider>_<providerSessionId>` exactly, since that's the row
  // Worldview's presence lookups join against). The old per-session pairing
  // flow never had one, so it keeps deriving sessionRef from the token
  // itself -- unchanged, still one session per token by construction.
  const sessionRef = providerSessionId
    ? `sr_${claims.provider}_${providerSessionId}`
    : deriveSessionRef(pairingToken);

  const session = await registerGatewaySession(claims.workspaceId, claims.ownerId, sessionRef, {
    provider: claims.provider,
    projectId: claims.projectId,
    label: claims.label,
    providerSessionId,
    workingDirectory: cwd,
  });

  return NextResponse.json({ sessionRef: session.sessionRef, workspaceId: claims.workspaceId });
}
