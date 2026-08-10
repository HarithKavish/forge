# Deploying Forge

Target: **https://forge.harithkavish.com**

## What this build needs

**No environment variables.** The UI phase runs entirely on the mock data layer
in `lib/mock/` — nothing in the page graph imports `lib/db`, `lib/env` or
`lib/crypto`, so `DATABASE_URL`, `AUTH_SECRET` and `FORGE_ENCRYPTION_KEYS` are
not read at build or request time. They become required when the database and
provider adapters are wired up.

Optional now, worth setting so metadata and absolute URLs are right:

```
NEXT_PUBLIC_APP_URL = https://forge.harithkavish.com
```

## First deploy

Vercel auto-detects Next.js; there is no `vercel.json` to maintain.

```bash
npx vercel login          # interactive, needs a browser
npx vercel link           # pick or create the "forge" project
npx vercel --prod
```

## Status

Deployed and live on Vercel:

- Project: `harith-kavishs-projects/forge`
- Production: `https://forge-egwzqm24s-harith-kavishs-projects.vercel.app`
- `forge.harithkavish.com` is attached to the project but **not yet resolving
  to it** — see below.

The `*.vercel.app` URL sits behind Vercel Authentication, which is the default
for new projects. That is fine and does not need changing: the setting is

```
ssoProtection: { deploymentType: "all_except_custom_domains" }
```

so the custom domain is exempt and will serve publicly the moment DNS points at
Vercel. Use `npx vercel curl <url>` to fetch the protected `*.vercel.app` URL
from a terminal.

## The one remaining step: DNS

`forge.harithkavish.com` currently resolves through Cloudflare to **GitHub
Pages**, which 404s because no Pages site is bound to that hostname:

```
$ curl -sI https://forge.harithkavish.com/
HTTP/2 404
server: cloudflare
x-github-request-id: ...      <- GitHub Pages, not Vercel
```

In Cloudflare DNS for `harithkavish.com`, change the `forge` record to what
Vercel asks for:

```
Type: A
Name: forge
Value: 76.76.21.21
Proxy: DNS only (grey cloud)
```

Vercel names the A record specifically; a `CNAME` to `cname.vercel-dns.com`
also works for a subdomain if preferred. The proxy must be off at least until
the certificate is issued, or the challenge fails.

Then confirm:

```bash
npx vercel domains inspect forge.harithkavish.com
```

Nameservers are currently Cloudflare's (`bailey`/`rustam.ns.cloudflare.com`).
Vercel will suggest moving them to `ns1/ns2.vercel-dns.com` — that is not
necessary, and would move DNS for the whole apex domain off Cloudflare. The
single A record is the smaller, correct change.

## Subsequent deploys

If the GitHub repository is linked to the Vercel project, pushing to `main`
deploys automatically. Otherwise `npx vercel --prod` from the repo root.

## Verify after deploying

The redirect behaviour is the part most worth checking, because it is enforced
in middleware rather than in the pages:

Already verified against the live Vercel deployment; repeat on the custom
domain once DNS is switched.

| Check | Expected |
|---|---|
| `https://forge.harithkavish.com/` signed out | 307 → `/login` |
| `/home` signed out | 307 → `/login` |
| `/projects` signed out | 307 → `/login?next=%2Fprojects` |
| Sign in with any email + a 6-character password | 303 → `/home` |
| Refresh `/home` | stays on `/home` |
| `/login` while signed in | 307 → `/home` |
| Sign out | → `/login`, account offered under "Continue as" |
| `/projects/does-not-exist` | 404 page with routes out |

A quick scripted pass:

```bash
for p in / /home /projects /resources /integrations /alerts /settings; do
  printf '%-16s %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "https://forge.harithkavish.com$p")"
done
```

Every one should be `307` to `/login` while signed out.

## Notes

- `robots` is set to `noindex` in `app/layout.tsx`. Forge is an application, not
  a site to be crawled — remove that when there is a public surface worth
  indexing.
- Demo state (project assignments, created projects, simulated connections)
  lives in cookies on the visitor's own device. Nothing is shared between
  visitors and nothing is stored server-side.
- Sessions in this build are unsigned cookies. That is safe only because there
  are no real credentials or customer data behind them; see
  `docs/ARCHITECTURE.md` before putting anything real behind this login.
