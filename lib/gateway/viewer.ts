/**
 * Worldview viewer tokens.
 *
 * Minted from a signed-in Forge session and handed to the browser, which
 * uses it to connect directly to forge-gateway's WebSocket endpoint
 * (GET /ws) -- see docs/WORLDVIEW.md §5.4 in this repo. Unlike a pairing
 * token, a viewer token is short-lived (10 minutes) and reissued on every
 * page load or reconnect, since it only ever needs to survive one browser
 * session's worth of connection, not a standing hook config. Scopes the
 * connection to exactly the workspace it was minted for -- forge-gateway
 * never trusts a separately supplied workspace id, only the one in this
 * token's claims.
 *
 * Forge is the only party that mints one; forge-gateway only ever verifies
 * (src/viewer.ts there), since a viewer token comes from a Forge session
 * forge-gateway has no way to check itself.
 */

import { sign } from "./hmac";

const TTL_MS = 10 * 60 * 1000;

export interface ViewerClaims {
  workspaceId: string;
  userId: string;
  exp: number;
}

export function mintViewerToken(workspaceId: string, userId: string): string {
  const claims: ViewerClaims = { workspaceId, userId, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body)}`;
}
