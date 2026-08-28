# Provider integrations

Forge connects to a platform, discovers what exists there, and files it into the
inventory. Adapters are additive: nothing in `lib/core/` knows a provider name,
and no adapter imports the database.

Implemented: **GitHub**, **Cloudflare**, **Vercel**, **Neon**. Everything else
in the catalogue is listed so the shape of the product is visible, and is
labelled *adapter not built yet* rather than being offered as a connect button
that cannot work.

**GitHub, Cloudflare and Vercel connect over OAuth** — each user authorises
their own account, and nothing has to be pasted.

**Neon takes an API key**, entered on the connect page. Neon's OAuth is real and
has a proper read-only scope (`urn:neoncloud:projects:read`), but registration
requires a commercial partnership: *"We only provide OAuth integrations for
partners we have active commercial relationships with."* Applying is the path if
you want it; the adapter would not change, only how the credential is obtained.

Token entry is still per-user and multi-tenant — each person creates their own —
and Forge verifies the key with Neon before storing anything, so a bad one is
rejected without ever reaching the database.

---

## GitHub

**Connects over OAuth**, using a GitHub OAuth App.

### Creating the OAuth App

<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `Forge` |
| Homepage URL | `https://forge.harithkavish.com` |
| Redirect URI | `https://forge.harithkavish.com/api/integrations/github/callback` |

GitHub accepts up to 10 redirect URIs, so one app covers production and
localhost. Leave **Allow wildcard matching** off.

```
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
```

### Scopes, and a caveat worth reading

| Scope | Why |
|---|---|
| `repo` | Private repositories are invisible without it |
| `read:org` | Org-owned repositories |
| `read:user` | Labels the connection |

`repo` grants **read and write**. GitHub's OAuth Apps have no read-only variant
of it, so the grant is broader than what Forge uses — Forge only ever issues GET
requests. The connect screen states this rather than burying it.

A GitHub **App** (rather than an OAuth App) supports `Contents: Read-only` and
per-repository selection, and is what Vercel's GitHub integration uses. It was
built and then reverted here in favour of the OAuth App: a deliberate choice to
keep the credential shape consistent with Cloudflare and Vercel. The trade-off
is the write grant above.

### Discovery

`GET /user/repos` with `affiliation=owner,collaborator,organization_member`,
paginated by `Link` header.

| Forge field | From |
|---|---|
| `provider_resource_id` | `id` — stable across renames and transfers |
| `name` | `full_name` |
| `health_status` | `disabled` → error, `archived` → warning, else healthy |
| `last_activity_at` | **`pushed_at`** |
| `management_url` | `html_url` |

`pushed_at` rather than `updated_at`: the latter moves when a description
changes, which would make an untouched repository look active.

**Cost:** none. GitHub bills per seat, not per repository.


---

## Cloudflare

**Connects over OAuth.** Cloudflare shipped self-managed OAuth clients in June
2026, so Forge registers its own client and asks each user for scoped access —
no token pasting, and no reuse of Wrangler's first-party client id.

This is the best credential story of the four: Cloudflare's scopes are genuinely
fine-grained, so the connection is properly read-only. Forge is granted exactly
what it uses.

### Creating the OAuth client

Cloudflare dashboard → **Manage Account** → **OAuth clients** → **Create client**

| Field | Value |
|---|---|
| Client name | `Forge` |
| Grant type | Authorization code |
| Redirect URL | `https://forge.harithkavish.com/api/integrations/cloudflare/callback` |

**Scopes** — read-only. Scope names match Cloudflare API token permission names:

- Account Settings: Read
- Zone: Read
- Workers Scripts: Read
- Workers R2 Storage: Read
- Cloudflare Pages: Read
- `offline_access` — so the connection can refresh rather than expire

Then:

```
CLOUDFLARE_OAUTH_CLIENT_ID
CLOUDFLARE_OAUTH_CLIENT_SECRET
CLOUDFLARE_OAUTH_SCOPES     # space-separated, matching the client
```

Scopes are configurable rather than hardcoded because the set a client may
request is fixed when the client is registered — Forge mirrors whatever was
chosen there instead of guessing at names.

The endpoints (`dash.cloudflare.com/oauth2/auth` and `/oauth2/token`) are
overridable via `CLOUDFLARE_OAUTH_AUTHORIZE_URL` / `CLOUDFLARE_OAUTH_TOKEN_URL`,
since Cloudflare's OAuth guide does not publish them.

PKCE (S256) is used on every request. The verifier is generated server-side and
kept in the same HttpOnly cookie as the state, so it never reaches the browser.

**Discovers:** zones, Workers, R2 buckets, Pages projects.

**Activity:** only Pages projects have one — their latest deployment. Zones,
Workers and R2 expose no usage signal over REST, and say so per resource rather
than being reported as quiet. `modified_on` is deliberately *not* used: it moves
on configuration changes, which would make a dormant zone look busy.

**Cost:** none. Cloudflare bills per account and plan, never per zone.


---

## Vercel

**Connects over OAuth**, via a Vercel *Integration*. You register the
integration once; every user then installs it against their own account or team.

### Creating the integration

<https://vercel.com/integrations/console> → **Create Integration**

| Field | Value |
|---|---|
| Name | `Forge` |
| Slug | `forge` (this becomes `VERCEL_INTEGRATION_SLUG`) |
| Redirect URL | `https://forge.harithkavish.com/api/integrations/vercel/callback` |

**Permissions** — read-only:

| Scope | Access |
|---|---|
| Projects | Read |
| Deployments | Read |
| Domains | Read |

Then copy the **Client ID** and **Client Secret**:

```
VERCEL_OAUTH_CLIENT_ID
VERCEL_OAUTH_CLIENT_SECRET
VERCEL_INTEGRATION_SLUG
```

Unlike a pasted token, permissions are fixed by the integration rather than by
whoever creates the credential — so no user can accidentally grant Forge more
than it needs. The installer chooses personal account or a specific team, and
the connection only ever sees what they picked.

**Discovers:** projects and domains.

**Activity:** a project's latest **production deployment**. Not `updatedAt`,
which moves when a setting changes. This makes Vercel one of the few providers
where "potentially unused" can be said with confidence.

**Cost:** none. Billing is team-level, so there is no per-project figure.


---

## Neon

**Credential:** API key from
<https://console.neon.tech/app/settings/api-keys>. Neon's OAuth is limited to
approved partners, so each person connects with their own key.

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

Token providers (Cloudflare, Neon) share one form, driven by `credentialFields` in the catalogue,
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
