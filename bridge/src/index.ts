import { BRIDGE_PORT } from "./config.js";
import { startServer } from "./server.js";
import { loadState } from "./state.js";

const state = loadState();

console.log("");
console.log("  Forge Local Bridge");
console.log("  ──────────────────");
console.log(`  Port: ${BRIDGE_PORT}`);
console.log("");

if (!state.pairingToken) {
  // Nothing to open or paste -- Forge's own page probes this fixed port on
  // load and links itself automatically the first time it finds this
  // bridge unlinked (docs/BRIDGE.md "Local bridge discovery").
  console.log("  Not linked to a Forge workspace yet. Open Worldview in your browser --");
  console.log("  it detects and links this bridge automatically.");
} else {
  console.log(`  Linked to workspace ${state.linkedWorkspaceId}.`);
}

console.log("");
console.log("  Run `npm run install-hooks` once to make every Claude Code session on");
console.log("  this machine report here automatically (safe to re-run; it won't duplicate).");
console.log("");

startServer();
