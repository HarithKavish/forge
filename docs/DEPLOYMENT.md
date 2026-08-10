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

Then attach the domain:

```bash
npx vercel domains add forge.harithkavish.com
```

Vercel prints the DNS record to create. For `harithkavish.com` managed
elsewhere, add a `CNAME` for the `forge` subdomain pointing at
`cname.vercel-dns.com`.

## Subsequent deploys

If the GitHub repository is linked to the Vercel project, pushing to `main`
deploys automatically. Otherwise `npx vercel --prod` from the repo root.

## Verify after deploying

The redirect behaviour is the part most worth checking, because it is enforced
in middleware rather than in the pages:

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
