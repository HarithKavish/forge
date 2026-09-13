# Forge Local Bridge

Companion to `docs/WORLDVIEW.md`. Read that first — this document only
covers what changed to support discovering, reading, and resuming a real
Claude Code session from Forge, rather than just knowing whether one is
online.

## 1. Why this exists

Worldview's original design (`docs/WORLDVIEW.md` §6, §13) explicitly
deferred this: *"is richer live detail worth asking anyone connecting an
agent to run more than 'paste a token into a hook config'?"* This is that
question, answered yes, driven by a concrete requirement: discover this
machine's Claude Code sessions automatically, show their real history, and
continue the same session from Forge's browser UI.

Research against the currently-installed `@anthropic-ai/claude-agent-sdk`
settled the one question that decides the whole shape: **there is no
supported way to resume a session, or return its result to a remote
server, from a process other than the one that already holds that
session's transcript on local disk.** `query({ options: { resume } } )`
loads the session from the local filesystem; cross-host resume needs a
custom `SessionStore` mirroring transcripts to shared storage, which this
phase deliberately does not build (decision below). So "continue this
session from Forge" can only ever happen via a process running on the same
machine as Claude Code — the bridge isn't an optional enhancement, it's the
only mechanism by which that requirement is possible at all, given Forge
itself is a remote, multi-tenant, publicly-hosted app (`forge.harithkavish.com`,
several separate workspaces already), not a localhost tool.

## 2. What stayed content-free, and what didn't

`docs/WORLDVIEW.md` §4 calls "content and activity are never written to
Forge's database" the load-bearing decision in that document. That still
holds — **the bridge never persists transcript content in Forge's Postgres,
and the gateway still never carries it.** What's new is that the browser now
reads history/streams a resumed reply directly from the bridge, over
`localhost`, entirely outside Forge's remote request path. Nothing about
that touches the database this line was protecting.

## 3. Session identity fix

Before: `sessionRef = sr_ + sha256(pairingToken)[:32]` — one pairing token
*was* a session's identity, by construction. That's wrong for a bridge
speaking for many sessions under one token, and `docs/WORLDVIEW.md` §8
already said as much (*"not... anything that could be replayed against the
local hook process to control it"*).

Now: a bridge-driven event carries the real `providerSessionId` (Claude
Code's own session UUID) explicitly, and `sessionRef` is derived from
*that* — `sr_<provider>_<providerSessionId>` — computed identically by
forge-gateway (`POST /events/bridge`) and Forge (`registerGatewaySession`).
The pairing token's role shrinks to exactly what §8 already said it was:
proof this request belongs to a workspace, nothing about which session.

The old `POST /events/claude` (token-derived sessionRef, one token per
session) is untouched and still works — this is additive, for anyone who
paired a remote machine directly rather than running a bridge.

## 4. Two transports, kept separate on purpose

- **Bridge → forge-gateway → Postgres** (`POST /events/bridge`): presence
  only — `state`, a short `activity` label, `providerSessionId`, `cwd`.
  Exactly what `/events/claude` always carried, just correctly identified.
  This is what lights up a session's platform in the 3D world.
- **Browser → bridge, directly, over `localhost`**: everything
  content-bearing — session list, full history, a resumed reply streamed
  live. Never touches forge-gateway or Forge's server. `localhost` is
  exempt from mixed-content blocking in every major browser, so an HTTPS
  `forge.harithkavish.com` tab can open this connection with no
  certificate.

## 5. What this phase deliberately does not build

- **No `SessionStore` / Postgres transcript mirror.** The original session
  stays local; the bridge runs on the same machine. Cross-machine resume
  (open a session on your laptop from your phone) is out of scope until
  that's an actual requirement, not a hypothetical one.
- **No per-session pairing.** One pairing token per bridge/workspace,
  minted once via automatic discovery (§8), not per Claude session.
- **No terminal/screen scraping.** Everything is the Agent SDK's own
  documented surface (`listSessions`, `getSessionInfo`, `getSessionMessages`,
  `query({ resume })`) confirmed against the actually-installed package's
  own type definitions, not assumed from docs.

## 6. Concurrency

One lock, enforced in the bridge (`src/claude/resume.ts`): a session
already being driven by a `resume()` the bridge itself started refuses a
second concurrent one. The bridge cannot see a *different* process (a
terminal someone has that session open in) — the SDK gives no
"is another writer attached" signal — so that case is left to fail at the
CLI/session-file level, not silently raced here.

## 7. Projects, linking, and discovery (second pass)

The first pass above shipped the bridge and a single always-open session
list behind a one-time connect URL. This pass replaced both the connection
UX and the project/session relationship model:

**Local bridge discovery.** The one-time `?connectBridge=1&bridgeToken=...`
URL is gone. The bridge listens on a fixed local port (`4317`,
`FORGE_BRIDGE_PORT`) with two Origin-gated, credential-less routes reachable
before any token exists:

- `GET /discover` → `{ connected, linked }` — Forge's page fetches this on
  load, from `lib/hooks/use-local-bridge.ts`.
- `POST /link` → the browser sends a pairing token Forge's server minted
  (`mintBridgePairingTokenAction`); the bridge stores it and hands back its
  `bridgeToken` in the response body — the one moment the browser learns it,
  from a same-request response rather than a URL or a printed value.

Origin-header validation (`requireBrowserOrigin` in `bridge/src/server.ts`)
is the trust boundary here, not a token: a page's JS cannot forge or omit
`Origin` on a cross-origin fetch, and CORS separately still stops any origin
outside `ALLOWED_ORIGINS` from reading the response. Every other route stays
gated on the `bridgeToken` this exchange produced.

**Projects are not managed here.** Worldview does not create or edit
projects — every project already in a workspace renders as its own
platform (`world-canvas.tsx` `groupByProject`), unconditionally, with zero
linked sessions or many. The old "+" platform for adding a project/agent by
hand (`world-scene.tsx` `AddPlatform`, `SHOW_ADD_PLATFORM`) still exists in
code but isn't rendered — there's nothing left for it to create.

**Linking is a project-panel action, not a gateway callback.**
`components/agent-sessions/project-panel.tsx` is the only place "Link agent
session" appears. It calls the bridge's `/sessions` directly (already-linked
`providerSessionId`s for *this* project filtered out client-side), then
`linkAgentSessionsAction` (`lib/data/actions.ts`) writes straight to
`agent_sessions` via `linkAgentSession` (`lib/core/agent-sessions.ts`) —
using the real `providerSessionId`, deriving the same
`sr_<provider>_<providerSessionId>` sessionRef §3 describes, so a session
linked this way and one that later reports live presence resolve to the
same row rather than duplicating. This is what makes "linked" survive the
bridge being completely offline: the row is a Forge-DB fact, and presence
(`presence` map, sourced from the forge-gateway WebSocket) only ever adds an
online/offline label on top of it, never gates whether it's listed.

**The conversation panel stacks, it doesn't navigate.** Clicking "Open" on
a linked session renders a second `.world-side-panel` absolutely positioned
at the same `inset:0` as the project panel underneath it, inside the same
fixed-size wrapper (`.world-side-panel-wrap`, `app/globals.css`) — same size
and position by construction, not by matching numbers by hand. The back
arrow just unmounts that overlay; the project panel's own state (open/
closed, its fetched data) was never touched.

**Robots.** `world-scene.tsx`'s `AgentRobot` replaced the old octahedron
marker: body color keyed on `AgentProvider` (`PROVIDER_COLORS`) — Claude's
orange, Codex's near-white, a blue for Gemini, and one fallback for `other`
(the enum has no `deepseek` slot to key on; a provider like that lands in
`other` rather than getting an invented enum value). A floating head sphere
tracks the session's *current* online state directly (green/gray); the
body's position instead runs through an explicit state machine
(`OFFLINE_DOCKED → WALKING_OUT → ONLINE_WALKING`, and the reverse) that
interpolates over `TRANSITION_SECONDS`, so a state flip animates rather than
teleports even if it reverses mid-transition. Each session's dock is one
`hashString(session.id)`-derived angle at a fixed radius — independent of
every other session on the platform, so adding or removing one never moves
another's dock, and independent of render order, so refresh/reconnect never
reassigns it either. Dock count equals linked-session count always, online
or not.

## 9. Open questions

- **Cross-machine resume** — deferred, see §5. Would need the `SessionStore`
  adapter the SDK docs point at, and a real answer to "does transcript
  content get mirrored to Forge's database," which this phase's sign-off
  explicitly said no to for the local case.
- **Codex/Gemini bridges** — the bridge's discovery/history/resume layer is
  Claude-specific by construction (it's built on `@anthropic-ai/claude-agent-sdk`).
  A future provider needs its own bridge module, not a generic abstraction
  guessed at ahead of a second real implementation.
- **Reconciliation, in practice** — §7's convergence on
  `sr_<provider>_<providerSessionId>` means a session linked while its
  machine was offline should pick up live presence the moment that machine's
  bridge starts reporting again, with no separate re-link step, purely
  because both paths write the same row. That's true by construction of the
  identity scheme, but hasn't yet been exercised end-to-end against a
  session linked while genuinely offline — worth a deliberate test before
  leaning on it.
