import { BRIDGE_PORT } from "./config.js";
import { startServer } from "./server.js";
import { loadState } from "./state.js";

const state = loadState();
const FORGE_ORIGIN = process.env.FORGE_ORIGIN ?? "https://forge.harithkavish.com";
const connectUrl = `${FORGE_ORIGIN}/worldview?connectBridge=1&bridgeToken=${state.bridgeToken}&bridgePort=${BRIDGE_PORT}`;

console.log("");
console.log("  Forge Local Bridge");
console.log("  ──────────────────");
console.log(`  Port: ${BRIDGE_PORT}`);
console.log("");

if (!state.pairingToken) {
  console.log("  Not linked to a Forge workspace yet. Open this once:");
  console.log("");
  console.log(`  ${connectUrl}`);
  console.log("");
  console.log("  It hands this bridge a pairing token automatically -- nothing to paste.");
} else {
  console.log(`  Linked to workspace ${state.linkedWorkspaceId}.`);
}

console.log("");
console.log("  Run `npm run install-hooks` once to make every Claude Code session on");
console.log("  this machine report here automatically (safe to re-run; it won't duplicate).");
console.log("");

startServer();
