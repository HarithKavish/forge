# Forge Local Bridge

The local companion process for Worldview's Claude Code integration. Runs on
your own machine, next to Claude Code itself — never on Vercel or
Cloudflare, because the Agent SDK's session discovery/history/resume APIs
only work against the local filesystem (see the forge repo's
`docs/BRIDGE.md` for why this exists and what it replaces).

## What it does

- **Discovers** every Claude Code session on this machine (via the Agent
  SDK's `listSessions()` — never by parsing `~/.claude/projects/*.jsonl`
  yourself; that format is explicitly not a stable API).
- **Reads history** for a session (`getSessionMessages()`).
- **Relays live activity** from Claude Code's own hooks to Worldview's 3D
  world (presence/state only — never a prompt, a diff, or tool output).
- **Resumes** a session (`query({ options: { resume } })`) and streams the
  reply back to Forge's browser tab directly, over `localhost` — this
  never goes through Forge's servers.

## Install

```
npm install
```

## Link to your Forge workspace (once)

```
npm run bridge
```

Open the URL it prints. That's it — it hands the bridge a pairing token
automatically. No copy-pasting.

## Auto-report every session (once)

```
npm run install-hooks
```

Merges a handful of `http` hooks into `~/.claude/settings.json`, pointed at
this bridge's fixed local URL. Safe to re-run (idempotent) and never
touches hooks it didn't add itself. To remove them:

```
npm run uninstall-hooks
```

## Run it

```
npm run bridge      # dev, restarts on file change
npm run start        # plain run
```

Prints its status (linked or not, port) on startup. Leave it running
whenever you want Worldview to see this machine's Claude Code sessions.

## Security model

- **Browser ↔ bridge**: gated on a `bridgeToken`, generated once on this
  machine (`~/.forge-bridge/state.json`, `chmod 600`), handed to the
  browser exactly once via the connect link above, and never sent to
  Forge's remote side. CORS restricts responses to Forge's own origin(s)
  even if some other tab tries to read them.
- **Claude Code hook → bridge**: same token, baked into the hook headers
  by the installer. Loopback-bound (`127.0.0.1`, not `0.0.0.0`) — not
  reachable from the network.
- **Bridge → forge-gateway**: the pairing token, same mechanism the old
  per-session flow used, just scoped to the whole bridge/workspace now
  instead of one Claude session.
- **Content never leaves this machine.** The bridge forwards presence
  (state + a short activity label) to forge-gateway for Worldview's 3D
  world. It never forwards transcript content, tool input, or tool
  output anywhere — those only ever flow to the browser directly, over
  `localhost`.

## Uninstall

```
npm run uninstall-hooks
```

then delete `~/.forge-bridge/` and stop running `npm run bridge`.
