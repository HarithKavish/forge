/**
 * Worldview pairing tokens.
 *
 * A pairing token is how a not-yet-connected agent session proves it was
 * requested by a signed-in Forge user, without forge-gateway ever holding a
 * database credential or a long-lived master secret in a hook config. See
 * docs/WORLDVIEW.md §5.1 and §7.
 *
 * Stateless by design: the claims are HMAC-signed with GATEWAY_SHARED_SECRET
 * (shared with forge-gateway) rather than stored in a table. That also means
 * there is no server-side "used" flag -- a token replayed within its TTL
 * mints a second agent_sessions row with the same claims rather than being
 * rejected outright. Bounded by a short TTL and scoped to the workspace that
 * minted it, that is a low-severity, self-inflicted duplicate at worst, not
 * a way to reach another workspace's data. If that tradeoff stops being
 * acceptable, single-use enforcement needs actual state (e.g. a short-lived
 * row keyed by a token id) -- there is no way to add it to a purely stateless
 * scheme.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

const TTL_MS = 15 * 60 * 1000;

export interface PairingClaims {
  workspaceId: string;
  ownerId: string;
  provider: "claude" | "codex" | "gemini" | "other";
  projectId: string | null;
  label: string | null;
  exp: number;
}

function gatewaySecret(): string {
  const secret = env().GATEWAY_SHARED_SECRET;
  if (!secret) {
    throw new Error(
      "GATEWAY_SHARED_SECRET is not set. Required to mint or verify Worldview pairing tokens.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", gatewaySecret()).update(payload).digest("base64url");
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
