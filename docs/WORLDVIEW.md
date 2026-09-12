# Worldview — Design Proposal

Status: **build-order steps 1, 3 and 4 implemented, tested, and reviewed**
(step 2's responsibilities are folded into step 3's PR — see §12). Step 5
(sharing) is still an open decision, not started; step 6 (Codex/Gemini
adapters) is on hold; step 7 items are partially done (visual polish shipped,
the §6 live-detail relay does not work as originally scoped — see the note
there). Several sections below were corrected against what building steps
1-4 actually required, rather than left as the pre-implementation guess —
each correction says what changed and why, so this stays a design record,
not just a plan.

Scope of this document: Worldview, a page that visualizes coding-agent
sessions (Claude Code, Codex, …) live, grouped by project and by the person
running them. It extends the project/workspace model in
[ARCHITECTURE.md](ARCHITECTURE.md) and does not change it. Feature work is
sequenced at the end, the same way ARCHITECTURE.md does it.

---

## 1. What Worldview is, and deliberately isn't

Worldview answers "who has an agent running, on what, and are they still
there" — nothing more.

- **A presence map, not a control surface.** Forge can show that a session
  exists and is online. It never attaches to, resumes, or sends input to one.
  Visibility and control are different permissions by construction — Worldview
  has no code path that could offer the second one, not a UI that hides it.
- **Not a transcript store.** Worldview shows *that* an agent is editing a
  file or running tests, not the diff or the output. This is a hard
  requirement, not a v1-scope cut — see §4.
- **Read-only with respect to the agents themselves**, in the same sense
  Forge is read-only with respect to infrastructure (ARCHITECTURE.md §11):
  Worldview observes hook events; it does not configure, restart, or kill
  anything running on the originating machine.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| Person | An existing Forge `user`, scoped to a workspace via `workspace_members`. |
| Agent provider | Which CLI/product is driving the session — `claude`, `codex`, `gemini`, `other`. |
| Agent session | One running instance of a provider's CLI, registered to a person and (optionally) a project. Ephemeral by nature — it does not outlive the process. |
| Presence | The live online/idle/offline state of a session, plus a short activity label ("running tests"). Never persisted — see §4. |
| Docking station | **Built per-session, not per-project as originally worded here.** Each offline session renders grayscale and dimmed in place within its project card, rather than a project as a whole switching to a separate "everyone's docked" layout. A UI concept, not a data concept. |

## 3. System shape

```
Local machine                    forge-gateway (Cloudflare Worker +      Forge (Vercel)
                                  Durable Object per workspace — §5)
┌────────────────────┐           ┌───────────────────────┐          ┌──────────────────────┐
│ Claude Code's own    │  HTTPS    │ POST /events/claude     │  HTTPS   │ POST /api/gateway/    │
│ native type:"http"   │──POST────▶│ (source adapter reads   │─────────▶│ sessions (verify      │
│ hooks (SessionStart, │  Bearer   │  hook_event_name +      │  Bearer  │ pairing token, create │
│ PreToolUse, Stop, …)  │  <pairing │  tool_name only)        │ <shared  │ agent_sessions row —  │
└────────────────────┘  token>    │ PresenceRegistry DO      │ secret>  │ once per session, not │
                                  │ (in-memory + storage,     │          │ once per event)       │
                                  │  Hibernation-API WS)      │          └──────────┬────────────┘
                                  └─────────┬───────────────┘                     │
                                            │ GET /ws?token=<viewer token>        │ Postgres (Neon)
                                            ▼                                     ▼
                                  ┌───────────────────────┐          ┌──────────────────────┐
                                  │ Browser (Worldview)    │◀─Server──│ agent_sessions,       │
                                  │ direct WS to gateway    │ Component│ workspace_members.color│
                                  └───────────────────────┘          └──────────────────────┘
```

Two separate channels, on purpose: Forge's Postgres holds the durable
*registration* (who this session belongs to, which project, which provider —
configuration), while the gateway holds the *presence* (is it online right
now, what is it doing) and never writes that to Forge's database. §4 is why.

**Corrected against the build:** the original diagram showed a generic
`POST /events` the gateway would normalize "per provider" from inside one
endpoint. What actually got built is one endpoint per provider
(`/events/claude`, and a future `/events/codex` alongside its own adapter
file) — Claude Code's native `type: "http"` hooks always send Claude Code's
own payload shape verbatim, with no way to configure a different body, so
there was never a generic envelope for the gateway to normalize *into* at
the wire level; normalization happens once, inside each adapter, on read.
No localStorage cache was built either (§7 describes one) — Worldview
currently blank-paints until the first WebSocket message, same as never
having had the cache.

## 4. Data model — durable registration, ephemeral presence

This is the load-bearing decision in this document, driven directly by the
"no persisted conversations" requirement: **content and activity are never
written to Forge's database.** Not truncated, not summarized, not stored and
expired — never written. Two consequences follow from that one rule, and
everything else in this section is just working out their shape.

**Durable (Postgres, `lib/db/schema.ts`) — configuration, not content:**

```ts
export const agentProvider = pgEnum("agent_provider", [
  "claude", "codex", "gemini", "other",
]);

export const agentSessionStatus = pgEnum("agent_session_status", [
  "active",   // registration is valid; presence is tracked by the gateway
  "revoked",  // unlisted from Forge -- does NOT stop the gateway from
              // still accepting the pairing token; see §8's correction
]);

export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Nullable like resources.project_id — an unassigned session is real. */
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  provider: agentProvider("provider").notNull(),
  /** Opaque. Never a resumable token — see §8. (Not gateway-issued in the
   * end, either: derived deterministically from the pairing token — §5.1.) */
  sessionRef: text("session_ref").notNull(),
  /** Free-text, person-supplied ("Harith's laptop"). Never provider content. */
  label: text("label"),
  status: agentSessionStatus("status").notNull().default("active"),
  lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("agent_sessions_ref_key").on(t.sessionRef),
  index("agent_sessions_workspace_idx").on(t.workspaceId),
  index("agent_sessions_project_idx").on(t.projectId),
]);
```

Plus one column on the existing join table, so color is assigned per person
*within a workspace* rather than globally:

```ts
// workspaceMembers += 
color: text("color"), // hex; null = derive deterministically from userId
```

**Ephemeral (gateway process memory, never Postgres):**

- online / idle / offline state
- last-heartbeat timestamp
- current activity label ("editing `lib/db/schema.ts`", "running tests")
- anything that came from a tool call's arguments or output

If the gateway restarts, presence resets to "unknown until the next
heartbeat" — that's an acceptable cost of not persisting it, not a bug to
work around with a cache table.

**What this buys:** a Postgres backup, an export, or a compromised read
replica exposes *who has agents on what project*, never *what those agents
were doing*. That is a materially smaller thing to have to protect, and it
means Worldview can be added without extending Forge's credential-handling
model (ARCHITECTURE.md §7) at all — sessions carry no secrets.

## 5. The gateway

**Why not inside the Next.js app.** Two constraints from
ARCHITECTURE.md §9 rule it out directly: Vercel functions don't hold
persistent connections, and Hobby-tier cron fires once a day — neither
works for a service that must hold open WebSocket fan-out and receive hook
POSTs within seconds. The gateway is a small, separately-run process.

**Where it runs.** Decided: [Cloudflare Workers](https://github.com/HarithKavish/forge-gateway),
not the Oracle VM this section originally recommended. A per-workspace
Durable Object turned out to fit the presence-registry-plus-WebSocket-fan-out
shape better than a VM process would have — it's Cloudflare's own textbook
use case (stateful object, live connections, no box to patch), and it
removes the "new VPS to operate" downside §11 originally flagged. No longer
an open question — see §13 for what's still open.

**Responsibilities:**

1. **Registration.** Forge mints a pairing token, scoped to one
   workspace/user/(optional) project, shown once in the UI as a
   `.claude/settings.json` block to paste. **Corrected against the build:**
   this is *not* single-use. A native `type: "http"` hook has no way to
   cache a second, rotated credential between invocations (each firing is a
   fresh, stateless process), so the pairing token is used directly, and
   repeatedly, as the bearer credential for the hook's entire lifetime
   (90-day TTL) — see §8 for what that costs. `sessionRef` is derived
   deterministically from the token itself (`sr_` + a truncated SHA-256),
   computed identically by Forge and the gateway from the same raw string,
   so the two never need to exchange one. The callback to Forge that
   creates the `agent_sessions` row fires once per session — gated on the
   gateway's Durable Object never having seen that `sessionRef` before, not
   on a token being consumed — so a Durable Object eviction can legitimately
   trigger it again; `registerGatewaySession` on Forge's side is an upsert
   for exactly that reason.
2. **Ingest.** One endpoint per provider (`POST /events/<provider>`), not a
   single generic one — see the note under §3. Each source adapter reads
   only its provider's native payload and produces a content-free envelope
   internally:

   ```json
   { "state": "working", "activity": "Running Bash", "timestamp": 1757579500 }
   ```

   Capabilities are still **declared, not assumed**, just per-adapter-file
   rather than via a payload field: `src/adapters/claude.ts` is what "this
   provider supports these events" looks like in practice. A CLI with no
   lifecycle hooks at all can still be "registered" — it just never shows
   online.
3. **Presence registry.** A `PresenceRegistry` Durable Object per workspace,
   keyed by `sessionRef`. A session is `online` while events arrive inside a
   90-second timeout window (a Durable Object alarm sweeps expired ones to
   `offline`), or `offline` immediately on an explicit terminal event — a
   small state machine, backed by the object's own storage so it survives
   an eviction, never a Postgres table.
4. **Fan-out.** A WebSocket per connected browser (`GET /ws?token=`),
   authenticated with a short-lived (10-minute) token Forge mints from the
   user's existing session — the browser never talks to the gateway with
   any Forge-session-derived credential directly, only this narrow one. The
   gateway resolves which workspace to attach to purely from the verified
   token's claim, never a client-supplied id, so there's nothing to
   mismatch. Built on the Durable Object Hibernation API specifically so a
   connection sitting idle between events doesn't keep its object billed as
   continuously active.
5. **Snapshot.** The first WebSocket message on connect is a full
   `{"type":"snapshot","sessions":[...]}"`, so the browser isn't blank until
   the first delta arrives — this replaced the originally-planned separate
   `GET /presence` REST call for that purpose on the browser's path; that
   endpoint still exists, but now serves Forge's own server (rendering
   Worldview's first paint) rather than the browser directly.

## 6. Live detail without storage

**This section's original plan does not work for the Claude Code adapter as
actually built, and needs to be rethought rather than implemented as
written.** The plan was: the gateway relays a scoped request to "the
originating hook process (or a small companion listener alongside it)" and
streams the response back to one browser. That assumes the local side is
*reachable* — something the gateway can call into. A native `type: "http"`
hook is the opposite: it only ever calls *out*, once per lifecycle event,
and the process handling that call exits immediately after. There is no
listener on the local machine for the gateway to reach, and nothing
long-lived to relay through. Building this for real would mean running a
genuine local companion process (a small always-on listener next to
`claude`) — a materially bigger ask of anyone connecting an agent than
"paste a token," and not attempted here.

What's still true and still load-bearing: nothing beyond a state label and
an activity string is ever persisted, online or offline, and an offline
session has no detail to show *by construction* — there was never anywhere
it could have been read back from. That half of "no persisted
conversations" holds regardless of whether a live-detail relay ever gets
built. The relay itself is deferred, not designed away — see §13.

## 7. Browser-side caching

**Not built.** Worldview currently blank-paints its avatar grid until the
first WebSocket `snapshot` message arrives, which is fast enough in practice
(one connection, one round trip) that this hasn't been worth adding yet. The
plan below is unchanged if it does become worth doing:

Per-viewer `localStorage`, keyed by workspace: last-known presence snapshot
and activity labels, so reopening Worldview paints instantly instead of
blank-until-first-WS-message. This is a convenience cache only —

- it is private to that browser and never uploaded anywhere,
- it is best-effort (cleared devtools, private window, different browser all
  produce an empty cache, which must render correctly — same rule Forge
  already applies to any browser-storage use),
- it is never the source of truth for *whether* a session is online — that
  always comes from a live WS message or snapshot fetch, never from what was
  last cached, so a stale cache can't show someone as online when they're not.

## 8. Security model

- **`sessionRef` is opaque and non-resumable.** It identifies a session for
  display purposes only. It is not a session token, API key, or anything
  that could be replayed against the local hook process to control it.
- **Two separate token kinds, neither reusable as the other, with different
  lifetimes for different reasons.** Viewer tokens (Forge session → gateway
  WS) are short-TTL (10 minutes) and reissued per page load or reconnect,
  since they only ever need to survive one browser session's worth of
  connection — compromising one exposes presence for the workspaces that
  viewer already sees, nothing more. Pairing tokens are **not** short-lived
  — corrected from the original plan (see §5.1): a 90-day standing
  credential, because that's what a native hook config can actually hold.
  There is no way to revoke a single leaked pairing token early short of
  rotating `GATEWAY_SHARED_SECRET`, which invalidates every pairing *and*
  viewer token everywhere at once. Forge's own session cookies already
  accept the identical long-lived/no-central-revocation tradeoff
  (`docs/AUTH.md` "Sessions") — this isn't a new risk class for the
  product, just the same one extended to a second credential.
- **Fan-out is scoped server-side by the gateway**, not filtered client-side
  by the browser. A viewer token simply cannot subscribe outside its
  authorized workspaces; there is no payload to filter out of.
- **Revocation is weaker than originally planned, and worth knowing
  precisely how.** The `/worldview` "Revoke" button flips the
  `agent_sessions` row to `revoked` in Forge, and Worldview's own list
  (which always joins against that row) correctly stops showing the
  session — that part works as intended. What it does *not* do: because the
  gateway verifies a pairing token's signature locally (§5.1) and never
  re-checks Forge on events after the first, revoking in Forge does not
  invalidate the token itself. The agent keeps running, keeps sending
  events, and the gateway keeps accepting and broadcasting presence for
  that `sessionRef` — it's just no longer attached to a row Forge will
  show anyone. Only the token's own 90-day expiry or rotating
  `GATEWAY_SHARED_SECRET` (which takes every token down with it) actually
  stops the gateway from accepting it. This is the real cost of the
  no-round-trip-per-event design in §5.1, not a hypothetical: "Revoke"
  reads as "disconnect this agent" but only does "unlist this agent."
  Closing the gap needs the gateway to check revocation status somehow (a
  periodic re-check against Forge, most likely), which isn't built.

## 9. Color and provider identity

- `workspaceMembers.color` — set explicitly by the person (a settings
  control, not built by this proposal) or derived deterministically from
  `userId` (hash → fixed palette index) so an unset color is still stable
  and never collides within the same workspace by chance.
- The provider icon shown over a session is derived straight from
  `agentSessions.provider` — no separate storage, no per-session override.

## 10. Presence state machine

```
   registration created
          │
          ▼
      "unknown"  ──first heartbeat──▶  "online"
                                          │  │
                              heartbeat   │  │ no heartbeat within timeout
                              keeps       │  │ or explicit Stop event
                              renewing ◀──┘  ▼
                                          "offline"
```

**Resolved, differently than either option this section originally posed.**
`idle` did not become a third *presence* state (the wire protocol and the
UI still only ever show `online`/`offline`) — it became a third *event*
state a source adapter can report (`"working" | "idle" | "stopped"`,
`forge-gateway`'s `NormalizedEvent`), which still renders as online, just
with an honest activity label instead of a stale "Running X". Claude
Code's `Stop` event (end of one turn, not the CLI session ending) maps to
`idle` → activity "Waiting for input" for exactly this reason: the process
is still alive and about to receive the next prompt, which is a materially
different thing from having gone offline, but didn't need a whole separate
visual treatment to say so.

## 11. Constraints this imposes

1. **The gateway is a new dependency to operate.** If it's down, Worldview
   shows every session offline — a availability problem, not a security
   one, but a real one: nothing about Forge's other pages depends on it.
2. **No central kill switch for a live browser session**, same tradeoff
   Forge already accepted for its own JWT sessions (§8) — consistent, but
   worth knowing it applies here too.
3. **Coverage depends on hook support per provider, and not just whether
   hooks exist at all.** Claude Code's confirmed and built (native
   `type: "http"` hooks, verified against a real hook payload and a real
   local gateway). Codex CLI (`openai/codex`) does have a lifecycle-hooks
   system with the same event names, but — checked directly against its
   docs before assuming otherwise — its hook handler types are "command"
   and "MCP tool" only; an HTTP handler is not supported. Reaching a remote
   gateway from a Codex hook would need a local wrapper script (a `command`
   hook shelling out to `curl`, essentially), which is exactly the
   extra-moving-part design this document's Claude Code adapter deliberately
   avoided (§5.1). Gemini CLI's hook model hasn't been checked yet. Neither
   is implemented — on hold, not attempted blind.
4. **The §6 live-detail relay cannot be built for a native-`http`-hook
   adapter at all**, not merely complicated by NAT — see §6's rewrite. It
   would need a genuine long-lived local process to relay through, which no
   provider adapter here has established a reason to require yet.

## 12. Build order

Each step should render something real in Worldview, the same discipline
ARCHITECTURE.md §10 applies to the inventory.

1. **Schema** — `agent_sessions` + `workspace_members.color`, plus a manual
   "register a session" form. **Done.** PR
   [forge#13](https://github.com/HarithKavish/forge/pull/13). Also fixed an
   unrelated pre-existing defect found along the way: migration `0001` was
   missing its `meta/_journal.json` entry and snapshot, silently corrupting
   the baseline every future `drizzle-kit generate` would diff against.
2. **Gateway skeleton** — presence registry, snapshot REST. **Done, but
   merged into step 3's delivery rather than shipped alone**: by the time
   the gateway existed, so did the Claude Code adapter, so there was no
   separate "gateway with no real source of events" milestone in practice.
   PR [forge-gateway#1](https://github.com/HarithKavish/forge-gateway/pull/1)
   (new repository — onboarded into the HarithKavish ecosystem as part of
   this step, including a governance-registry PR since it didn't exist
   before).
3. **Claude Code source adapter.** **Done.** Real hook wiring end to end —
   verified against a live local `wrangler dev` and a real Claude Code hook
   payload shape, not just typechecked. Required the pairing-token model
   correction in §5.1/§8 once native `http` hooks' real constraints were
   understood. Same PRs as step 2.
4. **WebSocket fan-out.** **Done.** Cloudflare Durable Objects' Hibernation
   API, verified with a live WebSocket client receiving a real snapshot and
   a real-time update in the same test run. Same PRs; one real bug (a
   reconnect timer that could force-close a newer, unrelated socket) caught
   by review and fixed before merge.
5. **Sharing primitive** (see §13) — **not started.** Still an open
   decision, not just missing code; building an invite flow before deciding
   what it grants would need redoing.
6. **Additional provider adapters** (Codex, Gemini, …) — **on hold.** Codex's
   hook system doesn't support an HTTP handler (§11.3), so it isn't the same
   shape of work step 3 was; needs its own design pass, not a copy-paste.
7. **Visual layer** — **done, ahead of schedule relative to this list**,
   because it's what the original brief actually asked to see: projects as
   cards, sessions as colored avatar tokens (§9), a provider icon badge,
   online-pulse / offline-docked states. Same PRs as steps 2-4. The §6
   live-detail relay remains not built, and — per §6's rewrite — isn't a
   matter of finishing it, but of deciding whether it's worth a genuine
   local companion process at all.

## 13. Open questions

- **Sharing primitive.** Still fully open — `workspace_members` already
  models many users per workspace with roles (`owner` / `admin` /
  `member`), but there is no invite flow and no role that grants partial
  visibility — today a member either sees the whole workspace or isn't in
  it. Worldview is the first feature that actually needs "see this
  project's agents, not its resources or credentials." Worth deciding
  whether that's a new workspace role's read scope, a per-project ACL, or a
  lighter viewer-link mechanism — before building any invite UI, since it
  changes what the invite even grants. Nothing built against this yet;
  every session on `/worldview` today provably belongs to the viewer
  (single-user workspaces, confirmed by review against `workspaces.personal`)
  so the question hasn't been forced yet, but the UI (`SessionList`'s
  single `myColor` prop applied to every avatar) already assumes it isn't
  answered — that assumption is called out in code, not silent.
- **Revocation doesn't actually revoke** (§8) — closing this needs the
  gateway to check a session's status against Forge somehow, which trades
  away part of the no-round-trip-per-event design in §5.1/§5.3. Worth
  deciding how much that tradeoff is worth before a real incident forces
  the answer.
- **Codex and Gemini adapter shape.** Codex needs a `command`-hook wrapper
  script (§11.3) rather than a native `http` hook — a materially different
  and more involved integration than Claude Code's, not a copy-paste of
  `src/adapters/claude.ts`. Gemini CLI's hook model hasn't been checked at
  all. Both on hold rather than guessed at.
- **Whether the §6 live-detail relay is worth a local companion process.**
  Not a "how" question anymore (§6 settled that a native-hook adapter can't
  do it) but a "should we" one: is richer live detail worth asking anyone
  connecting an agent to run more than "paste a token into a hook config"?
- **Multiple sessions per person per project.** The motivating example
  (two Claude sessions for one person, three Codex sessions for a
  collaborator, same project) needs the visual layer to render several
  simultaneous avatar tokens per person cleanly. Partially exercised (the
  project-grouped grid renders an arbitrary number of tokens per project
  card today), but never actually tested with two-plus *real, concurrently
  online* sessions for the same person — only ever one at a time so far.
