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

## 8. Robot models and the agent gallery

Every robot's *physical model* is chosen by `AgentModel` (`world-scene.tsx`),
keyed on `AgentProvider` — never hardcoded to Claude, so a provider gaining
its own model is a new branch there, not a rewrite:

- `claude` → `ClaudeBotModel`, a voxel build of Claude's own mark (wide
  flat head, two ear nubs, two eye slits, two leg-pair "feet").
- `gemini` → `GeminiBotModel`, a `LatheGeometry` teardrop with a real
  red→green→blue gradient baked in as per-vertex colors (the same
  technique `SkyDome` uses for its sky), two dot eyes, a curved-torus
  smile, and two capsule "hands". No legs — it "walks" by squashing and
  stretching the whole body instead, driven by the same shared
  `animateModel` helper every other model uses.
- Every other provider → `HumanoidModel`, the original generic body, kept
  as the fallback until each gets a model of its own.

`topYFor(provider)` is the one place that knows how tall each model is, so
the status sphere floats at a sensible height regardless of which model is
actually rendered underneath it.

**Roaming and separation.** A linked session's robot no longer orbits a
small fixed circle while online — `roamTarget` traces a wide, non-circular
path (two independent-frequency waves per axis) covering most of the
platform, clamped clear of the firepit at the center. Every robot
currently roaming a platform registers its live position in that
platform's own `neighbors` map (a plain `Map`, mutated every frame, never
React state); `applySeparation` reads it to steer each robot away from
whichever neighbors are closer than `SEPARATION_RADIUS` — lightweight
pairwise steering, not real pathfinding, but enough that robots visibly go
around each other instead of overlapping. `WALKING_OUT`'s target is the
*live* roam position, re-evaluated every frame and blended in via the
existing transition's `progress`, so the handoff into `ONLINE_WALKING`
never snaps even though the target itself never stops moving.

**The Agent Gallery.** `DisplayIsland` is a fixed showcase platform,
positioned well clear of the project-island cluster (`SHOWCASE_ISLAND_POSITION`,
with `Trees` given a matching `extraExclude` so the scatter doesn't plant a
tree on top of it) — not one project among others, and not something
Worldview lets you create more of. Same dark platform body as a project
island, but its ring glows gold (`SHOWCASE_RING_COLOR`) instead of blue,
and every character standing on it carries a gold status sphere always —
never green or gray, because a showcase character was never online or
offline to begin with. `ShowcaseRobot` reuses `AgentModel` and the same
roam/separation math `AgentRobot` uses, just permanently in the roaming
state (no dock, no offline state — there's no real session behind it to be
offline). `SHOWCASE_CHARACTERS` is the roster: one entry per provider that
has a real model built, added to as each one ships. `ShowcaseCharacterId`
(`AgentProvider` plus `"deepseek" | "perplexity" | "grok"`) is deliberately
*not* the same type as `AgentProvider` and never becomes a schema
migration — DeepSeek, Perplexity and Grok have no real session behind them
today, so there's nothing for a database column to record; they exist only
as gallery characters until that changes. Claude, Codex and Gemini are
real `AgentProvider` values already, so their models render identically
whether the caller is `AgentRobot` (a real linked session) or
`ShowcaseRobot` (the gallery) — the same `AgentModel` switch serves both.

**Four more models.** Codex is a rounded gradient cloud (a vertex-colored
sphere, the same per-vertex-gradient technique as Gemini and `SkyDome`)
with a white ">_" glyph and two closed happy eyes; it's Codex's *real*
model now, not just a gallery one, since `codex` was already a valid
provider. DeepSeek is a whale that floats clear of the ground and
"walks" by flapping its tail (`tailRef`) rather than standing on legs —
the shared walk-bob every model already gets from `bodyRef` reads as the
body rising and dipping with each stroke, for free. Perplexity is an
eight-bladed rotor that spins continuously (`spinRef`, independent of
whether it's currently walking — a parked rotor that stops spinning
would read as broken) around a face that deliberately isn't part of the
spinning group, so it stays forward-facing. Grok is eight distinct
shapes (`GROK_SHAPES`) occupying one "slot" — all eight render, but only
one is ever visible, and `ShowcaseRobot` flips which one once per walk-
bob cycle, timed to the moment the body is about to rise off its trough
("while it is going to go up, it must change"); a `breatheRef` on the
same cycle scales the whole thing up and down uniformly, distinct from
Gemini's anisotropic squash/stretch on its own `bodyGroupRef`.

**Two fixes the gallery surfaced.** First, the platform's fixed position
happened to land on a rise in `Landscape`'s procedural hills, which read
as "half sunk into the ground" — `Landscape` now takes a second,
independent `extraFlatten` well (radius centered on the island, not the
origin) alongside its existing origin-centered one, the same shape of fix
`Trees`' `extraExclude` already applied to keep a tree from spawning on
top of it. Second, the original `roamTarget` summed two independent
Cartesian sine waves per axis, which reaches the corners of its bounding
square far more often than its center and then gets clamped straight
back onto the platform's rim there — that clamping, not intent, was why
characters visibly "just revolved around the border" while the middle
sat empty. The rewritten version is polar instead: radius breathes
between the exclusion well and the roam radius while angle drifts
continuously, so the path genuinely crosses the middle. Both the radial
breathing rate and the angular speed/direction are derived from each
robot's own `seed` rather than a shared constant, so a platform with
several robots doesn't read as one synchronized merry-go-round (which is
also what made Claude look like it was "chasing" Gemini before). Real
occupancy — "they must occupy a certain area... not hit or pass through
each other" — is `resolveOverlap`: a hard floor under `applySeparation`'s
gentler steering, applied after it and before the final
`clampToAnnulus`, so the firepit's own exclusion radius stays the
authoritative last word regardless of what separation just did.

## 9. Performance

Worldview was unusable on a throttled laptop and hung outright on a phone.
Investigating with the actual scene (dozens of real projects, not a handful
of test ones) rather than guessing turned up two dominant costs, both
architectural rather than tunable:

- **~60 real-time `THREE.PointLight`s.** Every project platform's firepit
  (§8) carried its own dynamic point light — with dozens of platforms,
  dozens of lights. Three.js's standard forward renderer has no
  per-object light culling: every light in the scene adds cost to the
  fragment shader of *every* lit surface that uses it, not just nearby
  ones, so this cost multiplied against the terrain, every platform,
  every robot and every tree, all at once. This was almost certainly the
  single largest cost by a wide margin — a GPU shader-bound one, which
  matches "hangs" better than "runs a bit slow."
- **~450+ draw calls even with zero linked sessions.** 58 project
  platforms, each rendering its own hex body + ring (2), title text (1)
  and firepit (3 meshes), plus 22 separate mountain peaks (2 cones each)
  — none of it shared geometry, each one a full round-trip through the
  browser's WebGL driver. Real production guidance for mobile web puts
  the comfortable ceiling closer to 100–150 draw calls; this scene
  started well past 400 before a single agent robot ever rendered.

**What changed**, all in `world-scene.tsx`:

- Every firepit's stone base and both flame cones are now three shared
  `InstancedMesh`es across *every* platform (`InstancedFirepits`) — 3
  draw calls total, not 3 per platform — animated from one `useFrame`
  loop instead of one per platform, with a small per-instance phase
  offset (so the fires don't all flicker in perfect unison, which reads
  slightly *more* natural than before, not less). **There is no light at
  all here now** — the glow still reads from each flame's own emissive
  material plus Bloom, same as before; the one real, disclosed loss is
  the very faint warm wash a point light used to cast on the platform
  surface immediately around it, which was never central to the "looks
  like fire" impression in the first place.
- The mountain range (`Mountains`) is two shared `InstancedMesh`es (body,
  snow cap) instead of 44 separate meshes — entirely static, so this is
  a one-time `useEffect`, the same pattern `Trees` already used for its
  70 trees.
- `Bloom` now runs with `mipmapBlur` — a mip-chain-based blur instead of
  several full-resolution blur passes, substantially cheaper for a
  visually near-identical result. Native MSAA (`antialias: true`) is off,
  since it was redundant on top of that and doubly expensive combined
  with a >1x pixel ratio.
- Pixel ratio is now adaptive, via drei's `PerformanceMonitor`: starts at
  1.5 (down from a fixed 1.75 ceiling), steps down toward a floor of 1
  under sustained low frame time, and back up when the device recovers.
  A capable desktop never has quality reduced; a struggling laptop or
  phone gets a lighter render automatically rather than by a blind
  static guess. If even the DPR floor isn't enough, `onFallback` drops
  Bloom entirely as a last resort.

**What this didn't touch, and why it's the next lever if more is still
needed:** every platform's hex body + ring (up to ~116 draw calls) and
project-name text (~58 draw calls, SDF-rendered via drei's `Text`) are
still one real mesh/component per platform. The same instancing technique
above would collapse the hex bodies to ~2 draw calls, but a platform
isn't purely decorative the way a firepit or a mountain is — it's
clickable and highlights on hover, and `InstancedMesh` click/hover needs
a `event.instanceId` → project lookup instead of each platform's own
closure-captured handler. Doable, but a real (if contained) rework
rather than a drop-in swap, so it's called out here rather than done
silently alongside the changes above.

## 10. Open questions

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
