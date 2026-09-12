import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionStatuses } from "@/lib/core/agent-sessions";
import { safeEqual } from "@/lib/crypto/secrets";
import { env } from "@/lib/env";

/**
 * Server-to-server only -- forge-gateway's periodic revocation check
 * (docs/WORLDVIEW.md §8). Excluded from middleware's session check like the
 * rest of app/api/gateway/*.
 *
 * The gateway's PresenceRegistry Durable Object calls this on an interval
 * for whatever sessionRefs it currently knows about, not per-event -- this
 * is what actually lets a "Revoke" stop an agent, at the cost of a lag up
 * to that interval rather than instant effect. See forge-gateway's
 * src/presence.ts for the other half.
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

  let body: { workspaceId?: string; sessionRefs?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.workspaceId || !Array.isArray(body.sessionRefs)) {
    return NextResponse.json({ error: "workspaceId and sessionRefs are required" }, { status: 400 });
  }

  const statuses = await getSessionStatuses(body.workspaceId, body.sessionRefs);
  return NextResponse.json({ statuses });
}
