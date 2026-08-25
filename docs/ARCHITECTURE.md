# Forge — Architecture Proposal

Status: **proposed, awaiting review**
Scope of this document: the foundation only — the decisions that are expensive
to reverse. Feature work is sequenced at the end.

---

## 1. Starting point

The repository was empty (a 2-byte `README.md`, one commit). There was no
existing stack to preserve, so nothing has been replaced or thrown away. Every
choice below is a first choice rather than a migration.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router), TypeScript strict | One language for UI, API and provider adapters. Server Components let the inventory render from the database without shipping a client data layer. |
| Database | Neon Postgres | The domain is unambiguously relational — `User → Project → Environment → Service → Resource` plus a relationship graph. Serverless Postgres matches serverless compute. |
| ORM | Drizzle | SQL-first and typed; no query engine binary, which matters in a serverless bundle. Migrations are plain reviewable `.sql`. |
| Auth | Auth.js + Google OAuth | Self-hosted, no vendor on the critical path. Google is a sign-in method, not the identity model — see [AUTH.md](AUTH.md). The email/password plan was dropped: it needs a password store and email delivery to be worth anything, and Google gets a real login working today. |
| Styling | Tailwind v4 | Design tokens live in CSS (`app/globals.css`); status colours are defined once and reused, so a badge cannot drift between pages. |
| Hosting | Vercel → `forge.harithkavish.com` | Zero-ops deploys. Constraints this imposes are in §9. |

## 3. System shape

```
Browser  ──►  Next.js (Server Components + Route Handlers)
                  │
                  ├── lib/core/       domain: projects, services, inventory
                  │                   ALL queries tenant-scoped
                  ├── lib/db/         Drizzle schema + client
                  ├── lib/crypto/     credential envelope encryption
                  └── lib/sync/       job claim → adapter → reconcile
                          │
                          ▼
                  lib/providers/      ProviderAdapter implementations
                     github/  aws/  mongodb-atlas/  …
                          │
                          ▼
                    Provider APIs

Vercel Cron ──► /api/sync/drain (shared-secret auth) ──► lib/sync/
```

The dependency direction is enforced by convention and review: `lib/core/`
never imports `lib/providers/*` implementations, and adapters never import
`lib/db/`. That is what makes a new provider additive.

## 4. Tenancy

The tenant is a **workspace**, not a user. Every tenant-owned row carries
`workspace_id`; authorization reduces to a single question — *does this user
have a `workspace_members` row for this workspace?*

In V1 each signup gets one auto-created personal workspace, so the product
behaves as single-user. Teams later require adding member rows and a role
check, not reshaping thirteen tables.

**Isolation is enforced in one place.** `lib/core/` exposes repositories that
take a `WorkspaceContext` resolved from the session; they are the only modules
permitted to import `db`. Any `where` clause missing `workspace_id` is a
cross-tenant leak, so the rule is mechanical rather than a matter of care at
each call site. Postgres RLS is a deliberate *later* hardening step — it is
additive on top of this schema, not a rewrite.

## 5. Data model

18 tables — 4 for Auth.js, 2 for tenancy, 12 for the domain. See
`lib/db/schema.ts`; the generated DDL is `lib/db/migrations/0000_initial_schema.sql`.

```
users ──┬── workspace_members ── workspaces ──┬── projects ──┬── environments
        │                                     │              └── services
        └── (accounts, sessions,              │
             verification_tokens)             ├── connected_accounts ── provider_credentials
                                              │          │
                                              │          └── sync_jobs
                                              └── resources ──┬── activity_records
                                                              ├── cost_records
                                                              ├── resource_relationships
                                                              └── health_checks ── health_check_results
```

Four decisions in that schema are load-bearing:

**Provider IDs are never primary keys.** Forge keys are internal UUIDs;
`provider_resource_id` is an ordinary column, unique only *within* a connected
account. Two AWS accounts can legitimately contain the same-looking id.

**Association is nullable on purpose.** `resources.project_id IS NULL` *is* the
definition of an unassociated resource. It is a headline feature, not a missing
value to be cleaned up.

**Observation and inference are different columns.** `last_seen_at` (the
provider still returns it) is separate from `last_activity_at` (it was actually
used), which is separate from `activity_state` (Forge's conclusion) and
`activity_reason` (the evidence). A resource discovered hourly and never used
must not look active.

**Cost is never a bare number.** Every cost carries `accuracy`
(`actual` / `provider_reported` / `estimated` / `unavailable`), a currency, and
an as-of timestamp. `unavailable` is a normal answer that renders as
"cost unavailable" — Forge does not invent a figure.

Deletion is never inferred either: sync marks a vanished resource
`presence = 'missing'` and keeps the row. A provider outage must never read as
"all your resources disappeared".

## 6. Provider abstraction

`lib/providers/types.ts` defines `ProviderAdapter`. An adapter talks to exactly
one external API and returns normalized plain objects. It does not import the
database, does not know what a project is, and does not decide whether anything
is unused.

Capabilities are **declared, not assumed**:

```ts
capabilities: {
  resourceDiscovery, resourceStatus, activity, cost, managementUrl
}
```

The sync engine reads these before scheduling work, and the UI reads them
before rendering a column a provider cannot fill. GitHub reports no
infrastructure cost; that is a `false`, not a thrown exception.

Two details worth noting: `discoverResources` returns an `AsyncIterable` so a
large account streams page by page instead of materializing thousands of
resources; and `getManagementUrl` is synchronous and pure — a URL template, not
an API call — so the inventory renders deep links for free.

The registry (`lib/providers/registry.ts`) lives in code, **not** a `providers`
table. A table would drift from the adapter that implements the behaviour, and
the failure mode of that drift is calling a method that does not exist. This is
the one place the proposal departs from the spec's entity list, and the
catalogue is still served over the API for the UI.

## 7. Credentials

```
Browser ─(secret, once, over TLS)─► Route Handler ─► encrypt ─► provider_credentials
                                                                      │
Provider API ◄── adapter ◄── decrypt (in-memory, per call) ◄──────────┘
```

- AES-256-GCM, versioned keyring (`FORGE_ENCRYPTION_KEYS`). New keys are added
  at a higher version and old rows re-encrypted in the background — rotation
  without downtime.
- Each ciphertext is **bound to its `connected_account.id`** via GCM additional
  authenticated data. Copying a credential row onto another account fails to
  decrypt rather than silently granting access to someone else's provider.
- Secrets live in their own table, so listing integrations never selects the
  column. A careless `select()` cannot leak a key.
- No secret is ever returned by an API, logged, or included in
  `last_sync_error`. The frontend receives only display name, provider, status
  and sync state.

## 8. Sync

```
cron ─► claim queued sync_jobs ─► decrypt ─► adapter.discoverResources()
     ─► normalize ─► reconcile against inventory ─► update job + account status
```

Reconciliation upserts on `(connected_account_id, provider_resource_id)`,
refreshes `last_seen_at`, and marks rows absent from the response as `missing`.
Failures record `last_sync_error` and leave inventory untouched — a failed sync
is never destructive. `sync_jobs` gives the UI something concrete to show
("last sync 2 minutes ago — failed: API authentication error") instead of a
spinner.

## 9. Constraints this stack imposes

These are real and worth knowing now rather than discovering later:

1. **Vercel Cron on Hobby fires once per day.** Minute-level sync needs the Pro
   plan, or an external scheduler hitting `/api/sync/drain`. V1 also syncs on
   demand from the UI, so this affects freshness, not function.
2. **Function timeouts** (60s Hobby / 300s Pro) mean sync must be chunked. The
   job queue already models that: a large account enqueues follow-up jobs
   rather than running long.
3. **JWT sessions, not database sessions.** Middleware must be able to
   verify a session in the edge runtime, and a database session cannot be
   checked there. Middleware would then only know that *some* cookie existed
   while the real check happened later in the request — and a stale cookie
   would bounce between `/login` and `/home` forever. The `sessions` table is
   still wired into the adapter, so switching costs no migration.
   Consequence: no central revocation list; a session ends when its cookie is
   cleared or expires.


4. **Currency.** Providers bill in their own currency (usually USD) while the
   spec's mockups show ₹. Forge stores the provider's currency verbatim and
   will not silently convert. Displaying a single total therefore needs an
   explicit FX decision — flagged, not guessed.

## 10. Build order

Each step ships deployable.

1. **Auth + tenancy** — signup/login, personal workspace, `WorkspaceContext`,
   tenant-scoped repositories. *Isolation before features.*
2. **Projects** — CRUD, services, environments.
3. **GitHub adapter** — the simplest real integration: token auth, clean
   pagination, genuine activity signal (pushes), honest `cost: false`.
4. **Inventory** — global resource table, filters, assign-to-project, the
   unassociated view, deep links out. *The core loop closes here.*
5. **Dashboard** — built against real discovered data, not mock data.
6. **AWS adapter** — proves the abstraction against a provider with regions,
   many resource types, and real cost.
7. Then: health checks → activity analysis → unused detection → cost → Atlas.

## 11. Deliberately not in V1

Organizations and roles beyond `owner`; the dependency graph UI (the table
exists, nothing writes to it); natural-language search; automatic project
inference; any destructive provider action. Forge reads, organizes and
analyses — the only write it offers is a link to the provider's own console.

## 12. Open questions

- **AWS credentials:** long-lived IAM access keys are simple but permanent.
  Cross-account role assumption with an external ID is materially safer and the
  standard for this class of tool. It changes the connect flow, so it is worth
  deciding before the AWS adapter, not after.
- **Currency display** (§9.4).
- **Sync cadence** — depends on the Vercel plan (§9.1).
