/**
 * Shared HMAC-SHA256 primitives for this Forge's two token kinds (pairing
 * tokens, lib/gateway/pairing.ts; viewer tokens, lib/gateway/viewer.ts).
 * Factored out so those two files don't each carry their own copy -- unlike
 * the duplication against forge-gateway's src/*.ts, which is unavoidable (no
 * shared package between the repos), there's no reason for it within this
 * one.
 */

import { createHmac } from "node:crypto";

import { env } from "@/lib/env";

export function gatewaySecret(): string {
  const secret = env().GATEWAY_SHARED_SECRET;
  if (!secret) {
    throw new Error(
      "GATEWAY_SHARED_SECRET is not set. Required to mint or verify Worldview gateway tokens.",
    );
  }
  return secret;
}

export function sign(payload: string): string {
  return createHmac("sha256", gatewaySecret()).update(payload).digest("base64url");
}
