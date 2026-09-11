import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { mintViewerToken } from "@/lib/gateway/viewer";

/**
 * Called by the browser (components/agent-sessions/live-presence.tsx) on
 * mount and on every WebSocket reconnect, since a viewer token is
 * deliberately short-lived (10 minutes) -- see lib/gateway/viewer.ts.
 *
 * Ordinary middleware-protected route, unlike app/api/gateway/*: this one
 * runs with a real Forge session, which is exactly what makes it safe to
 * mint a token scoped to that session's own workspace.
 */
export async function GET() {
  const session = await requireSession();
  const token = mintViewerToken(session.workspaceId, session.userId);
  return NextResponse.json({ token });
}
