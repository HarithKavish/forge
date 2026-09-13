/**
 * Reads a pairing token's claims for display only -- "linked to workspace
 * X, project Y" in `GET /status`. Does NOT verify the signature: the bridge
 * has no reason to hold GATEWAY_SHARED_SECRET (that's Forge/forge-gateway's
 * server secret, and never should leave those two services), so it cannot
 * verify a token itself. That's fine, because the bridge never makes a
 * security decision based on a token's claims -- it just forwards the
 * opaque token to forge-gateway as a bearer credential and lets the gateway
 * do the real verification, exactly like the old per-session pairing flow
 * did. Decoding here is purely cosmetic.
 */

export interface PairingClaims {
  workspaceId: string;
  ownerId: string;
  provider: "claude" | "codex" | "gemini" | "other";
  projectId: string | null;
  label: string | null;
  exp: number;
}

export function readPairingClaims(token: string): PairingClaims | undefined {
  try {
    const [body] = token.split(".");
    if (!body) return undefined;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PairingClaims;
    if (typeof claims.workspaceId !== "string" || typeof claims.exp !== "number") return undefined;
    return claims;
  } catch {
    return undefined;
  }
}

export function isPairingTokenExpired(claims: PairingClaims): boolean {
  return claims.exp < Date.now();
}
