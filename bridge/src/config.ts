import os from "node:os";
import path from "node:path";

/**
 * Everything the bridge needs to know about itself and where Forge lives.
 * All of this is local-machine config -- none of it is a secret shared with
 * Forge's remote side except PAIRING_TOKEN, which already was (it's the
 * same credential the old per-session pairing flow minted).
 */

export const BRIDGE_PORT = Number(process.env.FORGE_BRIDGE_PORT ?? 4317);

/**
 * forge-gateway's URL -- same one the browser already uses for the
 * WebSocket connection (docs/WORLDVIEW.md). The bridge talks to it for
 * presence only, never content.
 */
export const GATEWAY_URL = process.env.FORGE_GATEWAY_URL ?? "https://forge-gateway.harithkavish40.workers.dev";

/**
 * Forge's own web origin(s) allowed to call this bridge's local API.
 * CORS-restricted rather than "*" -- see docs/BRIDGE.md "Security model":
 * without this, any webpage open in the same browser could script a fetch
 * to localhost and read a user's Claude Code session history.
 */
export const ALLOWED_ORIGINS = (process.env.FORGE_BRIDGE_ALLOWED_ORIGINS ?? "https://forge.harithkavish.com,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Where the bridge keeps its own small local state -- never committed, never synced. */
export const STATE_DIR = process.env.FORGE_BRIDGE_STATE_DIR ?? path.join(os.homedir(), ".forge-bridge");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

/** Claude Code's own config dir -- respects CLAUDE_CONFIG_DIR like the CLI itself does. */
export const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
export const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_CONFIG_DIR, "settings.json");

export function hookUrl(): string {
  return `http://127.0.0.1:${BRIDGE_PORT}/hooks/claude`;
}
