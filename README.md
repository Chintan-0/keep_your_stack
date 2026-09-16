# KeepYourStack

A personal toolbox for developers: save useful sites and tools, add context
about why they're worth keeping, organize them into stacks, and find them
again later by what they *do* rather than what they're called.

Built with Next.js (App Router), TypeScript, Tailwind, Zustand, and Supabase
(Postgres + Auth).

## Setup

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Public — safe to expose in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Public — RLS is what actually protects data, not this key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (`/api/account`) | **Never** prefix this with `NEXT_PUBLIC_` — it bypasses RLS entirely. Only used for account deletion (Supabase's admin API). Optional: without it, deleting an account returns a clear error instead of working. |

`.env.example`'s values are Supabase's fixed local-dev demo keys (identical
for every `supabase start` on any machine) — safe to commit, not a secret.

### Supabase (local development)

This project uses the [Supabase CLI](https://supabase.com/docs/guides/local-development)
for local development. It needs Docker running.

```bash
npx supabase start   # starts Postgres, Auth (GoTrue), PostgREST, Studio, Mailpit
```

This applies everything in `supabase/migrations/` and seeds the shared
category taxonomy from `supabase/seed.sql`. Useful URLs it prints:

- **Studio** (`http://127.0.0.1:54323`) — browse tables, run SQL, inspect auth users.
- **Mailpit** (`http://127.0.0.1:54324`) — catches confirmation/reset emails sent locally.

Useful commands:

```bash
npx supabase status      # show URLs/keys again
npx supabase db reset    # wipe and re-seed the local database
npx supabase stop        # stop the local stack
```

### Supabase (a real project)

Create a project at [supabase.com](https://supabase.com), then either:

- **Link and push migrations**: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
- Paste the contents of `supabase/migrations/*.sql` (in order) and `supabase/seed.sql` into the SQL editor.

Then set `.env.local`'s two `NEXT_PUBLIC_*` values to that project's
**Settings → API** URL and anon key (and `SUPABASE_SERVICE_ROLE_KEY` from
the same page if you want account deletion to work).

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on the
sign-up/login screen — create an account, then optionally click **Load Demo
Data** in Settings (or from the empty dashboard) to populate it with
realistic sample resources instead of starting from a blank toolbox.

## Project structure

```
src/
  app/
    (app)/            # authenticated app shell — dashboard, resources, stacks, settings, ...
    auth/              # login, sign-up, forgot/reset password, email callback
    api/               # Next.js Route Handlers — the only place that talks to Supabase for data
  components/          # UI components (client-side, backend-agnostic)
  lib/
    data/              # server-only data-access functions, used only by src/app/api/*
    supabase/          # Supabase client factories (browser, server, middleware)
    store.ts           # Zustand — application/UI state, hydrated from the API, not the database
    types.ts           # shared domain types (Resource, Stack, Tag, Category)
supabase/
  migrations/          # schema + RLS policies + the search_resources() function
  seed.sql             # shared category taxonomy (global, not user data)
```

The UI never calls Supabase directly for resource/stack/tag data — it goes
through `src/lib/store.ts`, which calls `src/app/api/*`, which calls
`src/lib/data/*`. Auth itself (sign in/up/out) is the one exception; that's
the standard place for it with Supabase's client SDK.

## Testing

```bash
npm run lint
npx tsc --noEmit
npm test          # vitest — URL normalization, bookmark parsing
npm run build
```

Vitest covers pure logic (URL normalization/duplicate detection input,
Chrome bookmark HTML parsing). Auth, RLS, and cross-user isolation are
verified manually against a running Supabase instance — see the "Manual
verification" checklist below rather than an automated suite, since that
needs a real (or local) Postgres + Auth backend to mean anything.

### Manual verification checklist

With `npx supabase start` and `npm run dev` running:

1. Sign up as user A, add a resource, refresh — it's still there.
2. Favorite it, archive it, refresh — state persists both times.
3. Create a stack, add the resource to it, refresh — persists.
4. Search for something you saved by what it *does*, not its name — check
   the "Matches:" line names real fields (title/tags/useful for/etc.).
5. Sign out, sign up as a second user B — dashboard is empty.
6. As user B, try `GET /api/resources/<user A's resource id>` — expect 404,
   not the resource.
7. Sign back in as user A — all data from steps 1–3 is still there.
8. Import a Chrome bookmarks HTML export — check duplicate detection
   against what's already saved.

## Demo data

`Load Demo Data` (Settings → Data, or the empty-dashboard prompt) seeds the
realistic sample dataset from `src/lib/mock-data.ts` into the *current
signed-in account* via `/api/demo-data`. It's additive and dedupes by URL,
so it's safe to click more than once. It never runs automatically — a new
account starts empty.

## Deployment

Any Next.js host works; production runs on Vercel at
`https://keep-your-stack.vercel.app`, backed by a hosted Supabase project.

### Environment variables (production)

Set these in Vercel → Project Settings → Environment Variables (Production):

| Variable | Scope | Required | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | The Supabase project's API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | RLS protects data, not this key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Recommended | Powers account deletion, the admin dashboard, and all `trackEvent`/`logServerError` analytics writes. Without it, those features degrade (analytics silently no-ops; account deletion returns a clear error) rather than breaking the rest of the app. **Never** add a `NEXT_PUBLIC_` prefix to this. |

No other environment variables are required. The Chrome extension does not
read any server env var directly — its production origin is baked into the
built manifest at package time (see "Chrome extension" below), and it never
holds a Supabase key of any kind, service-role or otherwise.

### Supabase (production project)

1. `npx supabase link --project-ref <ref>`, then `npx supabase db push` to
   apply every migration in `supabase/migrations/` in order. Never run
   `supabase db reset` against a linked production project — it wipes data.
   A schema change always ships as a new migration file, never a manual edit
   to an existing one.
2. **Project Settings → API → Max Rows** must be raised to match
   `MAX_RESOURCES_PER_LIST` in `src/lib/data/resources.ts` (currently
   **20,000**) — PostgREST silently truncates any unpaginated query at
   whichever of the two is lower, with no error. `supabase/config.toml`'s
   own `max_rows` only controls local dev; this dashboard setting is the
   real one for the hosted project. This bit the project once already (a
   10,000-resource account got back exactly 1,000 rows with no indication
   anything was missing) — worth double-checking after any migration.
3. **Authentication → URL Configuration**: add the production domain as a
   redirect URL — password-reset and email-confirmation links depend on it.
4. **Analytics retention**: `purge_old_analytics()` (in
   `20260101000010_admin_analytics.sql`) deletes `analytics_events` older
   than 180 days and `visitor_sessions` older than 400 days — it only ever
   touches those two tables, never resource/user data, and is safe to run
   repeatedly. It is *not* scheduled automatically (enabling `pg_cron` is a
   per-project dashboard decision, not something a migration should do
   silently). To schedule it: enable the `pg_cron` extension
   (Database → Extensions), then run once in the SQL editor:
   ```sql
   select cron.schedule('analytics-retention', '0 3 * * *', 'select public.purge_old_analytics()');
   ```
   Until this is done, analytics tables grow unbounded — not a correctness
   problem, just a storage one worth revisiting before it matters.

### Admin dashboard

`/admin` is gated by `requireAdmin()` (`src/lib/data/admin-auth.ts`) —
an allowlist of user ids/emails, never a client-supplied flag. Update that
list to grant access; there is no self-service "become admin" path by
design.

### Health & monitoring

- `GET /api/health` — no auth required, returns `{status:"ok",latencyMs}`
  with a 200, or `{status:"unavailable"}` with a 503 if Postgres/PostgREST
  can't be reached. Point an uptime monitor (or Vercel's own) at it. Never
  returns connection strings, hostnames, or any other internal detail.
- Server-side failures in the highest-traffic routes (resource create/list,
  search, the admin dashboard) are recorded as a `server_error` analytics
  event (route name + truncated error message only — never a stack trace
  or request body); this is a representative subset, not every API route.
  Client-side runtime errors (uncaught exceptions, unhandled promise
  rejections, and React render errors caught by
  `src/app/(app)/error.tsx`/`src/app/global-error.tsx`) are recorded as
  `client_error` the same way. Both show up labeled in the admin
  dashboard's Recent Activity feed. This is intentionally simple —
  event-log-based, reusing the existing first-party analytics
  infrastructure — not a dedicated error-tracking platform (no Sentry or
  equivalent is configured; revisit if error volume ever warrants it).

### Security headers

`next.config.ts` sets a Content-Security-Policy, `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options: DENY`, and a `Permissions-Policy` on
every page route (a lighter `nosniff` + `Referrer-Policy` pair on API
routes, where CSP has no meaning). The CSP allows `'unsafe-inline'` for
scripts/styles (Next.js's own hydration/RSC payload and Tailwind both need
it; a strict nonce-based policy is a larger follow-up, not part of this
pass) and `'unsafe-eval'` in development only (React's dev-mode debugging
tooling needs it; production never uses `eval()`). `connect-src` is scoped
to the app's own Supabase project URL — no other third-party API is called
from the browser.

### Chrome extension (production build)

```bash
npm run package:extension:prod
```

This sets `EXTENSION_APP_ORIGINS=https://keep-your-stack.vercel.app` at
build time (via `extension/scripts/package-prod.js`, a cross-platform
wrapper — a plain `VAR=value npm run ...` breaks on Windows) and writes the
zip to `public/downloads/keepyourstack-chrome-extension.zip`, the same file
`/extension`'s download button serves. Verify before shipping a new build:

```bash
unzip -p public/downloads/keepyourstack-chrome-extension.zip manifest.json | grep host_permissions
```

should show `https://keep-your-stack.vercel.app/*`, never `localhost`. The
extension holds no Supabase key of any kind (service-role or anon) and no
long-lived secret — it authenticates as the signed-in user via a bearer
token obtained through the web app's own session, scoped to the minimum
Chrome permissions the popup/background flow actually needs.

### Rollback

Every deploy is a normal Vercel deployment — roll back from the Vercel
dashboard (Deployments → \[previous\] → Promote to Production) same as any
other release. Database migrations are additive-by-design throughout this
project (new columns/indexes/functions, never a destructive rewrite of an
existing one in place) specifically so a Vercel rollback to older
application code keeps working against the current schema without also
needing a database rollback. There is no automated migration-down path;
reversing a migration means writing and applying a new one.

### Known limitations

- Filtering/sorting on the main list screens (All Resources, Favorites,
  Archive) only applies to whatever page of results is already loaded
  client-side — the UI says so explicitly ("Load more of your library to
  see additional matches") rather than silently under-reporting, but a
  filter combination that only matches resources past the first page or
  two requires clicking "Load more" first. Power Search (`/search`) does
  not have this limitation — it's a real server-side query across the
  whole library.
- No automated load-testing harness is checked into the repo; the
  10,000-resource-scale numbers in `PHASE_16_REPORT.md` come from a
  real local Supabase instance seeded with ~17,000 resources (left over
  from Phase 14.1's own testing), not a synthetic benchmark script.
- Server-error observability (`logServerError`) is wired into a
  representative subset of routes (resource create/list, search, admin
  dashboard) — not exhaustively across all ~47 API routes.
- No dedicated error-tracking service (Sentry, etc.) — errors are recorded
  as analytics events, which is enough to see that something broke and
  roughly where, not to get a full stack trace or source map.
