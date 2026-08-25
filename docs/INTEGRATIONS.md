# Provider integrations

Forge connects to a platform, discovers what exists there, and files it into the
inventory. Adapters are additive: nothing in `lib/core/` knows a provider name,
and no adapter imports the database.

Implemented: **GitHub**, **Cloudflare**, **Vercel**, **Neon**. Everything else
in the catalogue is listed so the shape of the product is visible, and is
labelled *adapter not built yet* rather than being offered as a connect button
that cannot work.

GitHub connects over OAuth. The other three take an API token, entered on the
connect page — Forge verifies it with the provider before storing anything, so a
bad token is rejected without ever reaching the database.

---

## GitHub

### The callback URL

Determined by `app/api/integrations/github/callback/route.ts`:

```
https://forge.harithkavish.com/api/integrations/github/callback
```

GitHub's current form accepts **up to 10 redirect URIs**, so one OAuth App can
serve production and local development. Add both:

```
https://forge.harithkavish.com/api/integrations/github/callback
http://localhost:3000/api/integrations/github/callback
```

Leave **Allow wildcard matching** off. It would let tokens be sent to any
subdomain or path under the URI, which is far more surface than this needs.

### Creating the OAuth App

<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `Forge` |
| Homepage URL | `https://forge.harithkavish.com` |
| Application description | optional |
| Redirect URI | `https://forge.harithkavish.com/api/integrations/github/callback` |

Leave **Enable Device Flow** unchecked and **Allow wildcard matching** off.

Leave **Expire user access tokens** *checked*. Access tokens then last 8 hours
and come with a refresh token good for 6 months, which Forge handles
automatically — see [Token lifetime](#token-lifetime). Unchecking it would
issue a permanent token instead, which is a worse thing to be holding.

Press **Register application**, then **Generate a new client secret**. GitHub
shows the secret once.

### Environment variables

```
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
```

Deliberately not named `AUTH_*`. Those belong to Auth.js and answer *who is this
person*; these answer *which GitHub account may Forge read on their behalf*.
Keeping the names apart keeps the two concerns from being confused.

```bash
npx vercel env add GITHUB_OAUTH_CLIENT_ID production
npx vercel env add GITHUB_OAUTH_CLIENT_SECRET production
```

### Scopes, and why each one

| Scope | What it grants | Why Forge needs it |
|---|---|---|
| `repo` | Read **and write** access to repositories, including private | Private repositories are invisible without it. GitHub's OAuth Apps have **no read-only variant** for private repos, so this grant is broader than what Forge uses. Forge only ever issues GET requests. |
| `read:org` | See organisation membership | Without it, org-owned repositories do not appear |
| `read:user` | Read your public profile | Labels the connection with the account it belongs to |

The connect screen states the `repo` caveat plainly rather than burying it. If
that grant is more than you want, a GitHub **App** (rather than an OAuth App)
supports fine-grained read-only repository permissions — noted below as the
eventual path.

### Token lifetime

With **Expire user access tokens** enabled, GitHub issues:

| Token | Lifetime | Stored |
|---|---|---|
| Access token | 8 hours | encrypted, with its expiry in `provider_credentials.expires_at` |
| Refresh token | 6 months, rotated on each use | encrypted alongside it |

Before a discovery run, the sync layer checks the stored expiry. If the access
token is within five minutes of expiring, it calls
`adapter.refreshCredentials()`, persists the new pair, and proceeds. The margin
matters: without it a token could pass the check and then expire mid-run,
halfway through pagination.

Refreshing happens *before* a call rather than in response to a 401, so a sync
is never spent discovering that the credential died. GitHub rotates the refresh
token on every use, and the new one replaces the old.

If the OAuth App does **not** expire tokens, no refresh token is issued, no
expiry is stored, and the refresh path is simply never taken —
`refreshCredentials` is optional on the adapter interface precisely because a
static API key or an IAM role has nothing to refresh.

If the refresh token itself expires (6 months unused), the next sync fails with
an auth error and the account is marked *needs re-auth*.

### What is stored

| Where | What |
|---|---|
| `connected_accounts` | GitHub's numeric user id, display name, granted scope. No secret. |
| `provider_credentials` | Access token, refresh token and expiry — AES-256-GCM encrypted, bound to the connected account |
| `resources` | One row per repository |

The token is decrypted in memory only for the duration of a call to GitHub. It
is never logged, never returned by an API, and never reaches the browser.

GitHub's numeric id — not the login — identifies the account, because a login
can be renamed and an id cannot.

### What discovery collects

`GET /user/repos` with `affiliation=owner,collaborator,organization_member`,
paginated by `Link` header until exhausted.

| Forge field | From |
|---|---|
| `provider_resource_id` | `id` — stable across renames and transfers |
| `name` | `full_name` |
| `health_status` | `disabled` → error, `archived` → warning, else healthy |
| `last_activity_at` | **`pushed_at`** |
| `management_url` | `html_url` |
| `metadata` | visibility, owner, default branch, language, fork, stars, open issues |

`pushed_at` is used rather than `updated_at` on purpose: `updated_at` moves when
metadata like a description changes, which would make an untouched repository
look active. Activity has to mean activity.

`cost` is `false`. GitHub bills per seat, not per repository, so there is no
per-resource figure and Forge will not invent one.

### Activity classification

| State | Rule |
|---|---|
| Active | a push within 30 days |
| Recently inactive | no push for 30–59 days |
| Potentially unused | no push for 60+ days |
| Unknown | no usage signal at all |

The measurement is stored in `activity_reason` and the conclusion in
`activity_state`, so the UI can show them as separate things. A provider that
exposes no signal yields *unknown*, never *unused* — absence of evidence is not
evidence of disuse.

### Re-running discovery

Discovery runs on connect, and on demand via **Synchronize now** on the
integration page. There is no scheduled background sync yet.

Reconciliation is non-destructive:

- new repositories are inserted
- existing ones are updated **except** their project, environment and service —
  a resync must never undo your own organisation of the inventory
- repositories the API no longer returns are marked `presence = 'missing'`,
  never deleted

That last rule matters: a revoked token, a narrowed scope or a GitHub outage
would otherwise look identical to "all your repositories were deleted".

### Disconnecting

Destroys the stored credential and removes that account's resources. Nothing at
GitHub is changed. You can also revoke Forge's access from
<https://github.com/settings/applications> at any time — the next sync then
fails with an auth error and the account is marked *needs re-auth*.

---

## Cloudflare

**Credential:** API token, created at
<https://dash.cloudflare.com/profile/api-tokens>.

The best-behaved provider Forge talks to: Cloudflare's tokens are genuinely
fine-grained, so this connection is properly read-only. Grant only the products
you want discovered — Forge skips what the token cannot see rather than failing
the run.

| Permission | Needed for |
|---|---|
| Account · Account Settings · Read | identifying the account |
| Zone · Zone · Read | zones |
| Account · Workers Scripts · Read | Workers |
| Account · Workers R2 Storage · Read | R2 buckets |
| Account · Cloudflare Pages · Read | Pages projects |

**Discovers:** zones, Workers, R2 buckets, Pages projects.

**Activity:** only Pages projects have one — their latest deployment. Zones,
Workers and R2 expose no usage signal over REST, and say so per resource rather
than being reported as quiet. `modified_on` is deliberately *not* used as
activity: it moves when configuration changes, which would make a dormant zone
look busy. Real traffic figures need the GraphQL analytics API, which this
adapter does not use yet.

**Cost:** none. Cloudflare bills per account and plan, never per zone.

---

## Vercel

**Credential:** access token from <https://vercel.com/account/tokens>.

> Vercel tokens are **not** scope-limited — a token carries the same rights you
> have. Set the shortest expiry you can live with, and scope it to a single team
> rather than your whole account where the option exists.

Add the **Team ID** field if you want a team's projects; leave it empty for a
personal account. It is sent on every request, not just the first.

**Discovers:** projects and domains.

**Activity:** a project's latest **production deployment**. Not `updatedAt`,
which moves when a setting changes. This makes Vercel one of the few providers
where "potentially unused" can be said with confidence — a project nobody has
deployed in months genuinely is idle.

**Cost:** none. Billing is team-level, so there is no per-project figure.

---

## Neon

**Credential:** API key from
<https://console.neon.tech/app/settings/api-keys>.

> Neon API keys are **not** scope-limited either. Forge only issues GET
> requests, but the key itself can do more.

**Discovers:** projects and branches. Compute endpoints are folded into their
branch rather than listed separately — an endpoint on its own is not a thing you
reason about, but a branch is.

**Activity:** the compute endpoint's `last_active`. A genuine signal: it is when
a client last connected, so a branch nobody has touched in months is really
idle.

**Cost:** declared **false**, deliberately. Neon's consumption API returns
compute hours and storage, not currency. Turning those into money needs the
account's plan pricing, which the API does not expose — Forge would have to
hardcode a rate card and present the result as fact, which is exactly what the
cost model forbids. Usage appears in resource metadata instead.

---

## Credential entry

Token providers share one form, driven by `credentialFields` in the catalogue,
so a new provider needs no new form code. The order of operations matters:

```
validate shape (zod)  →  authenticate with the provider  →  persist account  →  encrypt credential  →  discover
```

Nothing is written until the provider confirms the credential works and says who
it belongs to. A rejected token touches no table, and a valid one cannot be
filed under the wrong account.

Secret inputs are `type="password"` with `autoComplete="off"` — these are not
passwords and should not end up in a password manager's autofill.

---

## Adding another provider

1. Implement `ProviderAdapter` in `lib/providers/<name>/adapter.ts`.
2. `register(<name>Adapter)` in `lib/providers/registry.ts`.
3. Add a catalogue entry in `lib/providers/catalogue.ts`.
4. Build the connect flow if it needs OAuth.

Nothing in `lib/core/`, `lib/data/` or any page changes. Declare capabilities
honestly — a `false` renders as "not supported", which is information; a `true`
that throws is a bug.

---

## Known limitations

- **No scheduled sync.** Discovery is on connect and on demand. The `sync_jobs`
  table exists for a queue that is not yet drained.
- **Discovery runs inline in the callback**, inside a serverless function with a
  45-second abort. A GitHub account with thousands of repositories would need
  the background queue instead.
- **OAuth App, not GitHub App.** A GitHub App would allow fine-grained
  read-only repository access rather than the broad `repo` scope, and per-org
  installation. It needs private-key handling and an installation flow; the
  adapter itself would not change, only how a credential is obtained.
