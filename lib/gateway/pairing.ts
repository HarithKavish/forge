/**
 * Worldview pairing tokens.
 *
 * A pairing token is how a real agent session proves it was requested by a
 * signed-in Forge user, without forge-gateway ever holding a database
 * credential. See docs/WORLDVIEW.md §5.1 and §7.
 *
 * Used directly, and repeatedly, as the bearer credential a native Claude
 * Code HTTP hook sends on every event for as long as that hook config lives
 * -- there is no separate short-lived "ingest token" exchanged after the
 * first use, because a native http hook has no way to cache one between
 * invocations (each hook firing is a fresh process). The token is the
 * credential, for its whole lifetime.
 *
 * That has a real cost: there is no way to revoke a single leaked token
 * early short of rotating GATEWAY_SHARED_SECRET, which invalidates every
 * token everywhere. Forge's own session cookies already accept the
 * identical tradeoff (docs/AUTH.md "Sessions") -- long-lived, no central
 * revocation list, ends at expiry or a secret rotation.
 *
 * Stateless by design: the claims are HMAC-signed rather than stored in a
 * table, and `deriveSessionRef` below means Forge and forge-gateway agree on
 * the same sessionRef for a given token without ever exchanging one.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { sign } from "./hmac";

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface PairingClaims {
  workspaceId: string;
  ownerId: string;
  provider: "claude" | "codex" | "gemini" | "other";
  projectId: string | null;
  label: string | null;
  exp: number;
}

export function mintPairingToken(claims: Omit<PairingClaims, "exp">): string {
  const payload: PairingClaims = { ...claims, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPairingToken(token: string): PairingClaims {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Malformed pairing token");

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid pairing token signature");
  }

  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PairingClaims;
  if (claims.exp < Date.now()) throw new Error("Pairing token has expired");
  return claims;
}

/**
 * The same token always derives the same sessionRef -- computed here and,
 * independently, in forge-gateway's src/pairing.ts, from the identical raw
 * token string. Must stay byte-for-byte identical to that implementation.
 */
export function deriveSessionRef(token: string): string {
  return `sr_${createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
}
