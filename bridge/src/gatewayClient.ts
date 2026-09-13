import { GATEWAY_URL } from "./config.js";
import type { HookEventState } from "./liveState.js";
import { loadState } from "./state.js";

/**
 * Presence only, forwarded to forge-gateway's new `/events/bridge` endpoint
 * -- never the browser's history/message endpoints, and never anything a
 * hook payload's tool_input/tool_result carried. Same shared-secret trust
 * model as before (the pairing token proves this bridge belongs to a
 * workspace); what changed is *what identifies the session* -- the real
 * Claude session id, not a hash of the token (see docs/BRIDGE.md).
 *
 * Best-effort: a failed push here never blocks anything local. Worldview
 * showing stale presence is a availability gap, not a correctness one --
 * same tradeoff the gateway's own revocation check already accepted.
 */
export async function pushPresence(input: {
  providerSessionId: string;
  cwd?: string;
  state: HookEventState;
  activity?: string;
}): Promise<void> {
  const state = loadState();
  if (!state.pairingToken) return; // not linked to a workspace yet -- nothing to push

  try {
    await fetch(`${GATEWAY_URL}/events/bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.pairingToken}` },
      body: JSON.stringify({
        provider: "claude",
        providerSessionId: input.providerSessionId,
        cwd: input.cwd,
        state: input.state,
        activity: input.activity,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Gateway unreachable -- Worldview just won't reflect this beat. Not fatal.
  }
}
