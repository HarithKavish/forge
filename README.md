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

> **Status: product shell.** The full application — routing, dashboard,
> inventory, project views, integrations, alerts and settings — runs on a
> structured mock data layer. Provider adapters are next; see
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js 15 (App Router) · TypeScript · Postgres (Neon) · Drizzle ORM ·
Auth.js · Tailwind v4 · deployed on Vercel.

## Getting started

Requires Node 20+ and a Postgres database ([Neon](https://neon.tech) free tier
is enough).

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate the two secrets it needs:

```bash
# AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# FORGE_ENCRYPTION_KEYS — encrypts stored provider credentials
node -e "console.log('1:' + require('crypto').randomBytes(32).toString('base64'))"
```

Losing `FORGE_ENCRYPTION_KEYS` means every connected provider account has to be
reconnected. Back it up somewhere real.

Then apply the schema and run:

```bash
npm run db:migrate
npm run dev
```

## Layout

```
app/
  login/              sign-in, with per-device account resume
  (app)/              authenticated shell — home, projects, resources,
                      integrations, alerts, settings
middleware.ts         route protection; unauthenticated requests never render
components/
  shell/              sidebar, drawer, brand, theme toggle
  ui/                 status badges, cards, tabs, filters, tables
  project/ resource/  domain components
lib/
  auth/               session shape and actions (mock; Auth.js-shaped)
  data/               the read API the UI talks to — swap for real queries
  mock/               demo inventory, mirroring the domain model
  db/                 Drizzle schema, client, migrations
  crypto/             credential envelope encryption
  providers/          ProviderAdapter interface + registry
docs/ARCHITECTURE.md  design decisions and build order
docs/DEPLOYMENT.md    how this goes live
```

## Current phase

Provider integrations are **not** connected. The inventory is generated sample
data, and the sign-in is a mock credentials flow — both are labelled as such in
the product rather than implied to be real. What is genuinely wired:

- route protection, sign in/out, and per-device account resume
- assigning resources to projects, services and environments
- ignoring and archiving resources
- creating projects
- connecting and disconnecting simulated accounts

Those changes persist in cookies on your own device, so the core loop is
testable end to end. `Settings → Preferences` resets them.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
