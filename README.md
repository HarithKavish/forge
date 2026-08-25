# Forge

One place to see everything your projects are built on.

Modern projects rarely live in one platform — a repo on GitHub, an instance on
AWS, a cluster on Atlas, a zone on Cloudflare. Each provider knows about its own
resources. None of them knows about your *project*. Forge is the layer that
does: it shows which resources belong to which project, which belong to nothing
at all, which look forgotten, what they cost, whether they're healthy, and where
to go to manage them.

Forge reads and organizes. It does not delete, terminate, or modify your
infrastructure.

> **Status: live.** Real Google sign-in, real Postgres-backed users and
> workspaces, running at <https://forge.harithkavish.com>. The inventory inside
> is still sample data — provider adapters are next. See
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/AUTH.md](docs/AUTH.md).

## Stack

Next.js 15 (App Router) · TypeScript · Postgres (Neon) · Drizzle ORM ·
Auth.js · Tailwind v4 · deployed on Vercel.

## Getting started

Requires Node 20+, a Postgres database ([Neon](https://neon.tech) free tier is
enough), and a Google OAuth client.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Neon → your database → pooled connection string |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | [docs/AUTH.md](docs/AUTH.md) walks through Google Cloud Console |

`FORGE_ENCRYPTION_KEYS` can stay empty for now — it is only needed once a
provider integration actually stores a credential.

The Google OAuth client needs this exact redirect URI for local development:

```
http://localhost:3000/api/auth/callback/google
```

Then apply the schema and run:

```bash
npm run db:migrate
npm run dev
```

## Layout

```
app/
  login/              Google sign-in
  api/auth/           Auth.js route handler (defines the OAuth callback URL)
  (app)/              authenticated shell — home, projects, resources,
                      integrations, alerts, settings
middleware.ts         route protection; unauthenticated requests never render
components/
  shell/              sidebar, drawer, brand, theme toggle
  ui/                 status badges, cards, tabs, filters, tables
  project/ resource/  domain components
lib/
  auth/               Auth.js config, session, workspace provisioning
  data/               the read API the UI talks to — swap for real queries
  mock/               demo inventory, mirroring the domain model
  db/                 Drizzle schema, client, migrations
  crypto/             credential envelope encryption
  providers/          ProviderAdapter interface + registry
docs/ARCHITECTURE.md  design decisions and build order
docs/AUTH.md          Google OAuth setup and the identity model
docs/DEPLOYMENT.md    how this goes live
```

## Current phase

**Authentication is real.** Google OAuth via Auth.js, with users, Google account
links and workspaces persisted in Postgres. Google is a sign-in *method*, not
Forge's identity model — the Google id lives only in `accounts`, while
`users.id` is a Forge uuid that everything else hangs off. See
[docs/AUTH.md](docs/AUTH.md).

**Provider integrations are not connected.** The inventory is generated sample
data, labelled as such in the product rather than implied to be real. These
still work against per-device cookies so the core loop stays testable:

- assigning resources to projects, services and environments
- ignoring and archiving resources
- creating projects
- connecting and disconnecting simulated accounts

`Settings → Preferences` resets them.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
