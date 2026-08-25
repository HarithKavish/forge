# Authentication

Forge signs users in with **Google OAuth 2.0**, handled by **Auth.js (NextAuth
v5)**, with users persisted in Postgres through the Drizzle adapter.

Google is a *sign-in method*, not Forge's identity model — see
[Why this survives replacing Google](#why-this-survives-replacing-google).

---

## The callback URL

This is the value Google Cloud must be told about. It is determined by the
location of the Auth.js route handler (`app/api/auth/[...nextauth]/route.ts`) —
do not guess it, and do not move that file without updating Google:

| Environment | Authorized redirect URI |
|---|---|
| Production | `https://forge.harithkavish.com/api/auth/callback/google` |
| Local development | `http://localhost:3000/api/auth/callback/google` |

Google requires an **exact** match, including scheme, host, port and path. No
trailing slash.

---

## Google Cloud Console setup

One OAuth client can serve both environments — Google allows several redirect
URIs on a single client — so separate dev and prod clients are only needed if
you want the credentials isolated.

### 1. Project

<https://console.cloud.google.com/> → create or select a project (e.g. `forge`).

### 2. OAuth consent screen

**APIs & Services → OAuth consent screen**

| Field | Value |
|---|---|
| User type | **External** |
| App name | Forge |
| User support email | your address |
| App logo | optional — `assets/brand/HK Forge.png` |
| Application home page | `https://forge.harithkavish.com` |
| Authorized domain | `harithkavish.com` |
| Developer contact | your address |

**Scopes** — add only these three. Forge reads identity and nothing else, so
anything more would request access it never uses:

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

**Publishing status.** While the app is in *Testing*, only accounts listed
under **Test users** can sign in, and sessions expire after 7 days. Add your own
Google account as a test user. Since none of the requested scopes are
sensitive, you can press **Publish app** to move to *In production* without
Google's verification review.

### 3. OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**

| Field | Value |
|---|---|
| Application type | **Web application** |
| Name | Forge Web |

**Authorized JavaScript origins** — Auth.js performs the exchange server-side,
so these are not strictly required. Adding them costs nothing and avoids
confusion later:

- `https://forge.harithkavish.com`
- `http://localhost:3000`

**Authorized redirect URIs** — required, exactly:

- `https://forge.harithkavish.com/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`

Press **Create**. Google shows the **Client ID** and **Client secret**; the
secret can be retrieved again later from the same credentials page.

---

## Environment variables

| Variable | Where it comes from | Where it goes |
|---|---|---|
| `AUTH_GOOGLE_ID` | Google Cloud → Credentials → your OAuth client → Client ID | `.env.local` and Vercel |
| `AUTH_GOOGLE_SECRET` | same screen → Client secret | `.env.local` and Vercel |
| `AUTH_SECRET` | `npx auth secret` | `.env.local` and Vercel |
| `DATABASE_URL` | Neon → the Forge database → pooled connection string | `.env.local` and Vercel |

Auth.js infers `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from the provider name
automatically; neither is referenced anywhere in source.

Setting them on Vercel:

```bash
npx vercel env add AUTH_GOOGLE_ID production
npx vercel env add AUTH_GOOGLE_SECRET production
npx vercel env add AUTH_SECRET production
npx vercel env add DATABASE_URL production
```

`AUTH_URL` is not needed. Auth.js derives the origin from the request, and
`trustHost: true` in `lib/auth/config.ts` makes that safe behind Vercel's proxy.

**Never** commit any of these. `.gitignore` covers `.env*` with an explicit
exception for `.env.example`.

---

## How sign-in works

```
/projects  (no session)
   ↓ middleware
/login?next=%2Fprojects
   ↓ "Continue with Google"
Google consent
   ↓ redirect
/api/auth/callback/google      ← Auth.js verifies state + PKCE
   ↓ Drizzle adapter
users row (internal uuid)  +  accounts row (provider=google)
   ↓ jwt callback
ensureWorkspaceForUser()   → workspaces + workspace_members
   ↓
/projects
```

### First sign-in

1. Auth.js verifies the Google response.
2. The adapter creates a `users` row with a **Forge-generated uuid**.
3. The adapter creates an `accounts` row: `provider = 'google'`,
   `provider_account_id = <Google's subject id>`, `user_id = <the Forge uuid>`.
4. `ensureWorkspaceForUser()` creates one personal `workspaces` row and an owner
   `workspace_members` row.
5. The session carries `userId`, `workspaceId` and `workspaceName`.

### Returning sign-in

The adapter matches on `(provider, provider_account_id)` — **not** on email —
and reuses the existing user. `ensureWorkspaceForUser()` finds the existing
membership and returns immediately, so no duplicate user or workspace is ever
created.

Provisioning is idempotent by construction rather than by a check: the workspace
slug is derived deterministically from the user id, so a concurrent second
sign-in collides with a unique index instead of creating a duplicate. That
matters because the Neon HTTP driver has no interactive transactions.

---

## Sessions

Strategy: **JWT**, 30 days.

Middleware verifies the session token itself, in the edge runtime, with no
database round trip per navigation. The alternative — database sessions —
cannot be verified at the edge, so middleware could only check that *some*
cookie existed while the real check happened later in the request. A stale
cookie would then bounce between `/login` and `/home` forever. Verifying in one
place removes that entire class of bug.

The cost: signing out clears the cookie rather than deleting a server-side row,
so there is no central revocation list.

**To switch to database sessions later**, if revocation becomes necessary: set
`session.strategy` to `"database"` in `lib/auth/config.ts`, and change
middleware to a cookie-presence check that never redirects *away* from
`/login`. The `sessions` table is already in the schema and already wired into
the adapter, so no migration is required.

---

## Why this survives replacing Google

Forge never uses a Google id as its own. The identity chain is:

```
accounts.provider_account_id   ← Google's id lives here, and only here
        ↓ user_id
users.id                       ← Forge's own uuid: the canonical identity
        ↓
workspace_members.user_id → workspaces.id → projects, resources, everything
```

When the HarithKavish identity platform becomes Forge's identity provider, it is
added as another entry in the `providers` array in `lib/auth/config.ts`, and
existing users gain a second `accounts` row. Their `users.id` does not change,
so every project, resource and workspace stays attached to the same person.

Nothing outside `lib/auth/` knows which provider was used. Pages call
`requireSession()` and receive a `ForgeSession`. That contract has already
survived one swap — from the mock cookie session to Google — without a single
page changing.

---

## Security notes

- The client secret is server-side only. It is never imported into a client
  component and never reaches the browser bundle.
- The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- State, PKCE and nonce verification on the callback are Auth.js's, not
  reimplemented here.
- Tokens and secrets are never logged.
- `next.config.ts` sends `X-Frame-Options: DENY`, `nosniff`, a referrer policy
  and a permissions policy on every response.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI registered in Google Cloud does not match exactly. Compare scheme, host, port, path, trailing slash. |
| `?error=Configuration` on `/login` | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` or `AUTH_SECRET` missing or wrong in that environment. |
| `?error=AccessDenied` | Consent was cancelled, or the account is not on the Test users list while the app is unpublished. |
| Signed in but bounced back to `/login` | The session has no `workspaceId` — workspace provisioning failed, usually a `DATABASE_URL` problem. Check the function logs. |
| `Unsupported database type` at build | Something is wrapping the Drizzle client. The adapter inspects it to detect the dialect, so it must be the real client. |
