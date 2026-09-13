import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { STATE_DIR, STATE_FILE } from "./config.js";

/**
 * The bridge's own small local state file. Two credentials live here, and
 * they authenticate two different things -- do not conflate them:
 *
 * - `bridgeToken`: generated once, proves "this request came from a Forge
 *   tab the user actually linked" (browser -> bridge, and hook -> bridge).
 *   Never sent to Forge's remote side.
 * - `pairingToken`: the SAME kind of token Worldview's old per-session
 *   pairing flow minted (lib/gateway/pairing.ts in the forge repo), now
 *   repurposed to authenticate the bridge itself to forge-gateway -- one
 *   token for the whole bridge/workspace, not one per Claude session. The
 *   user pastes this in once (via `pair`), the same way they used to paste
 *   it into .claude/settings.json.
 */
export interface BridgeState {
  bridgeToken: string;
  pairingToken?: string;
  /** Cached from the pairing token's own claims, so routes can display
   *  "linked to workspace X" without re-decoding the token every time. */
  linkedWorkspaceId?: string;
  linkedProjectId?: string | null;
}

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

export function loadState(): BridgeState {
  ensureStateDir();
  if (!existsSync(STATE_FILE)) {
    const fresh: BridgeState = { bridgeToken: randomBytes(24).toString("base64url") };
    saveState(fresh);
    return fresh;
  }
  const raw = readFileSync(STATE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<BridgeState>;
    if (!parsed.bridgeToken) {
      parsed.bridgeToken = randomBytes(24).toString("base64url");
      saveState(parsed as BridgeState);
    }
    return parsed as BridgeState;
  } catch {
    const fresh: BridgeState = { bridgeToken: randomBytes(24).toString("base64url") };
    saveState(fresh);
    return fresh;
  }
}

export function saveState(state: BridgeState): void {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}
