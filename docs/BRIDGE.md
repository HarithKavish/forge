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
  minted once via the one-time connect link
  (`bridge/README.md`), not per Claude session.
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

## 7. Open questions

- **Cross-machine resume** — deferred, see §5. Would need the `SessionStore`
  adapter the SDK docs point at, and a real answer to "does transcript
  content get mirrored to Forge's database," which this phase's sign-off
  explicitly said no to for the local case.
- **Codex/Gemini bridges** — the bridge's discovery/history/resume layer is
  Claude-specific by construction (it's built on `@anthropic-ai/claude-agent-sdk`).
  A future provider needs its own bridge module, not a generic abstraction
  guessed at ahead of a second real implementation.
