import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createAgentSession } from "@/lib/core/agent-sessions";
import { env } from "@/lib/env";
import { verifyPairingToken } from "@/lib/gateway/pairing";

/**
 * Server-to-server only -- called by forge-gateway, never a browser. Excluded
 * from middleware's session check (middleware.ts) since there is no Forge
 * session here, only the shared secret.
 *
 * This is the "call back to Forge" from docs/WORLDVIEW.md §5.1. The gateway
 * relays the raw pairing token here rather than verifying it itself -- Forge
 * is the only party that ever writes an agent_sessions row, so it is also
 * the only party that needs to verify the claim behind one. See
 * forge-gateway's src/index.ts for the other half of this exchange.
 */
export async function POST(request: NextRequest) {
  const secret = env().GATEWAY_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Gateway integration not configured" }, { status: 503 });
  }

  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pairingToken: string;
  try {
    const body = (await request.json()) as { pairingToken?: string };
    if (!body.pairingToken) throw new Error("pairingToken required");
    pairingToken = body.pairingToken;
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

  const session = await createAgentSession(claims.workspaceId, claims.ownerId, {
    provider: claims.provider,
    projectId: claims.projectId,
    label: claims.label,
  });

  return NextResponse.json({ sessionRef: session.sessionRef, workspaceId: claims.workspaceId });
}
