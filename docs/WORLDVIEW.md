# Worldview — Design Proposal

Status: **proposed, awaiting review**
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
  Forge is read-only with respect to infrastructure (ARCHITECTURE.md §1):
  Worldview observes hook events; it does not configure, restart, or kill
  anything running on the originating machine.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| Person | An existing Forge `user`, scoped to a workspace via `workspace_members`. |
| Agent provider | Which CLI/product is driving the session — `claude`, `codex`, `gemini`, `other`. |
| Agent session | One running instance of a provider's CLI, registered to a person and (optionally) a project. Ephemeral by nature — it does not outlive the process. |
| Presence | The live online/idle/offline state of a session, plus a short activity label ("running tests"). Never persisted — see §4. |
| Docking station | The idle-state visual for a project with no online agents. A UI concept, not a data concept. |

## 3. System shape

```
Local machine                    Gateway (long-lived process,           Forge (Vercel)
                                  not Vercel — see §5)
┌────────────────────┐           ┌───────────────────────┐          ┌──────────────────────┐
│ Claude Code /       │  HTTPS    │ ingest: /events        │  HTTPS   │ registration API     │
│ Codex / … hooks     │──POST────▶│ normalize per provider │◀─────────│ (mint pairing tokens,│
│ (SessionStart,      │           │ presence registry       │          │  CRUD agent_sessions)│
│  PreToolUse, Stop)  │           │ (in-memory, heartbeat)  │          └──────────┬────────────┘
└────────────────────┘           └─────────┬───────────────┘                     │
                                            │ WebSocket, workspace-scoped         │ Postgres (Neon)
                                            ▼                                     ▼
                                  ┌───────────────────────┐          ┌──────────────────────┐
                                  │ Browser (Worldview)    │◀─Server──│ agent_sessions,       │
                                  │ direct WS to gateway    │ Components│ workspace_members.color│
                                  │ localStorage cache      │          └──────────────────────┘
                                  └───────────────────────┘
```

Two separate channels, on purpose: Forge's Postgres holds the durable
*registration* (who this session belongs to, which project, which provider —
configuration), while the gateway holds the *presence* (is it online right
now, what is it doing) and never writes that to Forge's database. §4 is why.

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
  "revoked",  // pairing token invalidated — gateway rejects further events
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
  /** Opaque, gateway-issued. Never a resumable token — see §7. */
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

**Where it runs.** Recommendation: the Oracle VM already running Jarvis/
Hermes, since that's infra you already operate and monitor, rather than
standing up a third host. Flagged as an open question in §12 rather than
decided here — it's not load-bearing to the data model.

**Responsibilities:**

1. **Registration.** Forge mints a short-lived pairing token, scoped to one
   workspace/user/(optional) project, shown once in the UI. The user drops
   it into their local hook config. The first event using that token creates
   the `agent_sessions` row (via a server-to-server call back to Forge) and
   the token is consumed — it cannot mint a second session.
2. **Ingest.** `POST /events` per provider, normalized to a generic,
   content-free envelope:

   ```json
   {
     "sessionRef": "sr_...",
     "state": "working",
     "activity": "running_tests",
     "timestamp": 1757579500
   }
   ```

   Normalization is per-provider, mirroring `ProviderAdapter`
   (`lib/providers/types.ts`): capabilities are **declared, not assumed** —
   a source adapter reports whether it can supply `heartbeat`,
   `activityLabel`, and `liveQuery` (§6), and Worldview reads that before
   rendering a detail it cannot fill. A CLI with no lifecycle hooks at all
   can still be "registered" — it just never shows online.
3. **Presence registry.** In-memory map keyed by `sessionRef`. A session is
   `online` while heartbeats arrive inside a timeout window, `offline` once
   that window lapses or an explicit `Stop` event arrives — a small state
   machine, not a table.
4. **Fan-out.** WebSocket per connected browser, authenticated with a
   short-lived token Forge mints from the user's existing session (the
   browser never talks to the gateway with Google-derived credentials, the
   same separation AUTH.md draws between Google and Forge identity). The
   gateway scopes each connection to the workspaces/projects that viewer is
   authorized to see and never broadcasts outside that scope.
5. **Snapshot.** `GET /presence?workspaceId=` for first paint, so the
   browser isn't blank until the first WS delta arrives.

## 6. Live detail without storage

"Loaded from the device when the agent is online" (per the brief) means the
gateway can also **relay**, not just observe: when a viewer opens a specific
online session for more detail, the gateway forwards a scoped request to the
originating hook process (or a small companion listener alongside it) and
streams the response straight through to that one browser. Nothing in that
path is written anywhere — if the session goes offline mid-relay, the detail
view just goes blank, the same way the rest of Worldview does.

Offline sessions have no detail to show, by construction — there was never
anywhere it could have been read back from. That is the correct behavior
here, not a gap: it's what "not persistent" means.

## 7. Browser-side caching

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
- **Two separate short-lived tokens**, neither reusable as the other:
  registration pairing tokens (device → gateway → Forge, consumed on first
  use) and viewer tokens (Forge session → gateway WS, short TTL, reissued
  per page load). Compromising a browser's viewer token exposes presence
  for the workspaces that viewer already sees — nothing more, and nothing
  that lets it originate events or read another workspace.
- **Fan-out is scoped server-side by the gateway**, not filtered client-side
  by the browser. A viewer token simply cannot subscribe outside its
  authorized workspaces; there is no payload to filter out of.
- **Revocation** is deleting the `agent_sessions` row (or flipping it to
  `revoked`) — the gateway rejects further events on that `sessionRef`
  immediately. This mirrors Forge's own no-central-revocation-list tradeoff
  for its JWT sessions (AUTH.md §Sessions): simple, no database round trip
  per event, at the cost of no instant kill switch for a token already in a
  browser's memory before its TTL expires.

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

Whether "registered, gateway reachable, but no tool activity recently"
deserves its own `idle` state between `online` and `offline` is left open —
see §12. Nothing in §4's data model depends on the answer; it only changes
what the gateway's in-memory state machine and the docking-station UI do
with a heartbeat gap.

## 11. Constraints this imposes

1. **The gateway is a new dependency to operate.** If it's down, Worldview
   shows every session offline — a availability problem, not a security
   one, but a real one: nothing about Forge's other pages depends on it.
2. **No central kill switch for a live browser session**, same tradeoff
   Forge already accepted for its own JWT sessions (§8) — consistent, but
   worth knowing it applies here too.
3. **Coverage depends on hook support per provider.** Claude Code's hook
   system is confirmed capable of this. A provider with no lifecycle-event
   mechanism can only ever be "registered," never "online," until it grows
   one or a source adapter finds another signal.
4. **The relay in §6 needs the originating machine reachable from the
   gateway** (or the machine polling out to it) — an agent behind a strict
   NAT/firewall with no outbound long-poll gets presence but not live
   detail. Worth confirming against how the Oracle VM and typical dev
   machines are actually networked before promising the relay feature.

## 12. Build order

Each step should render something real in Worldview, the same discipline
ARCHITECTURE.md §10 applies to the inventory.

1. **Schema** — `agent_sessions` + `workspace_members.color`, plus a manual
   "register a session" form (no gateway yet). Proves the Worldview UI
   against real rows the same way the current dashboard proves itself
   against `lib/mock/` data.
2. **Gateway skeleton** on the VM — ingest endpoint, in-memory presence,
   snapshot REST. Worldview polls the snapshot; no WebSocket yet.
3. **Claude Code source adapter** — real hook wiring end to end, one
   provider, proves the pairing-token flow and the normalized envelope.
4. **WebSocket fan-out**, replacing polling with live updates.
5. **Sharing primitive** (see §13) — needed before a second person's agents
   can appear on a shared project at all.
6. **Additional provider adapters** (Codex, Gemini, …) as capability-
   declared source adapters, same shape as step 3.
7. Then: the §6 live-detail relay, idle state, docking-station visual
   polish.

## 13. Open questions

- **Sharing primitive.** `workspace_members` already models many users per
  workspace with roles (`owner` / `admin` / `member`), but there is no
  invite flow and no role that grants partial visibility — today a member
  either sees the whole workspace or isn't in it. Worldview is the first
  feature that actually needs "see this project's agents, not its
  resources or credentials." Worth deciding whether that's a new workspace
  role's read scope, a per-project ACL, or a lighter viewer-link mechanism
  — before building any invite UI, since it changes what the invite even
  grants.
- **Where the gateway runs** — the Oracle VM is the low-effort default
  (§5), but it ties Worldview's uptime to that VM's, which isn't currently
  held to any uptime bar.
- **`idle` as a third presence state** — §10.
- **Multiple sessions per person per project.** The motivating example
  (two Claude sessions for one person, three Codex sessions for a
  collaborator, same project) needs the docking-station UI to render
  several simultaneous sessions per person cleanly — a UI question, but
  worth confirming before the visual design assumes one agent per person.
- **NAT/reachability for the live-detail relay** (§11.4).
