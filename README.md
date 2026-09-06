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

Any Next.js host works (e.g. Vercel). Set the three environment variables
above to a real Supabase project's values, run `supabase db push` against
that project, and make sure its Auth settings (Settings → Authentication →
URL Configuration) include your deployed domain as a redirect URL — the
password-reset and email-confirmation links depend on it.
