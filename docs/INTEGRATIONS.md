# Provider integrations

Forge connects to a platform, discovers what exists there, and files it into the
inventory. Adapters are additive: nothing in `lib/core/` knows a provider name,
and no adapter imports the database.

Implemented: **GitHub**. Everything else in the catalogue is listed so the shape
of the product is visible, and is labelled *adapter not built yet* rather than
being offered as a connect button that cannot work.

---

## GitHub

### The callback URL

Determined by `app/api/integrations/github/callback/route.ts`:

```
https://forge.harithkavish.com/api/integrations/github/callback
```

> **GitHub OAuth Apps accept exactly one callback URL** — unlike Google, which
> takes a list. Local development therefore needs its *own* OAuth App with
> `http://localhost:3000/api/integrations/github/callback`. One app cannot serve
> both. If you only ever connect from production, one app is all you need.

### Creating the OAuth App

<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `Forge` |
| Homepage URL | `https://forge.harithkavish.com` |
| Application description | optional |
| Authorization callback URL | `https://forge.harithkavish.com/api/integrations/github/callback` |

Leave *Enable Device Flow* unchecked.

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

### What is stored

| Where | What |
|---|---|
| `connected_accounts` | GitHub's numeric user id, display name, granted scope. No secret. |
| `provider_credentials` | The access token, AES-256-GCM encrypted, bound to the connected account |
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
