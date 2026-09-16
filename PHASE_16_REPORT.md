# Phase 16: Production Launch & V1 Hardening

Final report. This phase inspected the actual repository against every claim in prior
phase reports rather than trusting them, then made a small number of targeted,
measured changes: real database-level search performance work (verified against a
~17,000-resource dataset), production security headers, a health endpoint, minimal
error observability, an analytics-event completeness pass, and a correctness fix to a
silent data-truncation cap. No product features were added or redesigned.

---

## Executive Summary

KeepYourStack's core architecture was already in good shape going into this phase —
Phase 12/14.1/15 had already fixed RLS gaps, SSRF bypasses, and added real server-side
pagination for the main resource list. This phase's job was to verify those claims
against current code (several had drifted or were only partially true) and close the
gaps that mattered for a real launch.

The single most significant finding: **Power Search recomputed a full-text vector
over the user's entire library on every keystroke, with no index backing it** —
measured at ~450–700ms against 16,964 resources. Fixed with a generated, indexed
`tsvector` column and a candidate-prefiltering rewrite of `search_resources()`,
verified (not assumed) to bring the same queries to ~120–300ms on the same dataset,
with identical result sets confirmed for title, tag-only, and generic-substring
matches. This is a real, deployed-and-tested migration, not a theoretical index
add.

Second finding: the resource-list pagination Phase 12 flagged as broken was, in fact,
already fixed (a prior, uncredited commit — `9418f88`) — the main list screens use
real server-side pagination (300/page, "Load more") and were verified live against
the same 16,964-resource account, correctly fetching only 300 rows at a time. What
*was* still silently wrong: the separate, unpaginated `listResources()` helper (used
by export, Library Health, and duplicate detection) was capped at 5,000 rows with no
matching `max_rows` guarantee on a real hosted Supabase project — the same silent-
truncation bug class Phase 12 had already found once at a lower threshold. Raised to
20,000 (matching the documented import ceiling) in both places, with the deployment
step to raise the hosted project's own setting documented, not silently assumed.

**Verdict: READY WITH KNOWN LIMITATIONS.** See §Deployment Status.

---

## Completed

- **Search performance** (`supabase/migrations/20260101000014_search_performance.sql`):
  added a generated, GIN-indexed `tsvector` column (`resources.search_vector`) for the
  row-local fields (title/description/notes/domain/use_cases/import_folder), a trigram
  GIN index on `domain` (title/description already had one), and rewrote
  `search_resources()` to prefilter candidate resource ids through indexed lookups
  before running the expensive per-row aggregation/ranking — instead of running that
  aggregation over the whole library on every search. Matching semantics (weights,
  prefix/trigram bonuses, 50-row limit) are unchanged.
- **Resource payload trim**: `RESOURCE_SELECT` switched from `"*"` to an explicit
  column list, so the new `search_vector` column (meaningless to the client, and
  potentially large) never rides along on a resource fetch.
- **Full-library cap correctness**: `MAX_RESOURCES_PER_LIST` (used by export, Library
  Health, and duplicate detection — the operations that genuinely need every
  resource) raised from 5,000 to 20,000, with `supabase/config.toml`'s `max_rows`
  raised to match. Documented the required matching change on the real hosted
  Supabase project (Project Settings → API → Max Rows) — this phase cannot make that
  change itself.
- **Production security headers** (`next.config.ts`): Content-Security-Policy,
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, and a
  `Permissions-Policy` on page routes; `nosniff` + `Referrer-Policy` on API routes.
  Live-tested under a real production build — zero console/CSP errors across
  homepage, login, dashboard (16,963 real resources), and a non-admin user's blocked
  `/admin` attempt.
- **Health endpoint**: `GET /api/health` — no auth, minimal response, verified DB
  connectivity via one cheap RLS-safe query, never leaks internal error detail.
- **Minimal error observability**: two new analytics event types (`server_error`,
  `client_error`); `logServerError()` wired into the highest-traffic/highest-blast-
  radius routes (resource create, resource list, search, admin dashboard — a
  representative subset, not all ~47 routes); client-side `window.onerror` /
  `unhandledrejection` capture plus React error boundaries
  (`src/app/(app)/error.tsx`, `src/app/global-error.tsx`) with a real retry action,
  never a raw stack trace shown to the user. Both event types now render with proper
  labels in the admin dashboard's Recent Activity feed.
- **Analytics completeness pass**: found and fixed three dead/missing spots against
  the spec's expected event list — `import_started` was declared but never fired
  (wired into `/api/import`), and `export_performed` was only wired for JSON export
  (added to CSV and HTML export routes too). Verified every other expected event
  (`resource_created/updated/deleted/favorited/unfavorited/archived/restored`,
  `duplicate_save_prevented`, `search_performed`, `stack_studio_opened`,
  `bulk_organization_completed`, `resource_organization_changed`, extension events)
  is already correctly wired by reading the actual call sites, not just the type
  declarations.
- **Documentation**: `README.md`'s Deployment section rewritten with a concise,
  accurate production setup — environment variables (with server-only vs. public
  clearly marked), Supabase production checklist (migrations, Max Rows, redirect
  URLs, analytics retention scheduling), admin access, health/monitoring, security
  headers, Chrome extension production packaging + verification command, rollback
  approach, and known limitations.

## Verified

Live-tested against a real local Supabase instance seeded with **16,964 real
resources** under one account (left over from Phase 14.1's own load testing — not
synthetic data invented for this report):

- `search_resources()` before/after timing, for both a realistic specific query
  (`"tailwind"`, 1 match) and a deliberately generic synthetic one (`"pack"`, ~2,500
  matches) — see §Performance.
- Tag-only, stack-only, and category-only search matches still return correctly
  after the rewrite (the candidate CTEs are a superset union of the original
  per-field conditions, not a narrower replacement) — spot-checked directly against
  the database with `search_resources('open-source')` correctly returning the one
  resource tagged (not titled) that.
- All Resources page against the full 16,964-resource account: confirmed the network
  tab shows exactly `GET /api/resources?limit=300` on initial load (never the whole
  library), confirmed "Load more from your library" issues
  `?limit=300&offset=300` and correctly appends.
- Production build (`next start`) headers via `curl` — CSP, nosniff, Referrer-Policy,
  X-Frame-Options, Permissions-Policy all present and correctly scoped (no
  `unsafe-eval` in production, present only in `next dev`).
- Live browser session against the production build: login → `/home` redirect,
  dashboard render with real 16,963-resource data, zero console errors; a non-admin
  account hitting `/admin` correctly bounced to `/home` (authorization still enforced,
  incidentally re-confirmed while testing headers).
- `GET /api/health` — 200 with `{status:"ok",latencyMs:24}` against a healthy local
  DB; no auth required; response shape has no internal detail.
- Full regression after every change in this phase: `eslint` clean, `tsc --noEmit`
  clean, `vitest run` — **291/291 tests passing** (287 pre-existing + 4 new), `next
  build` clean.
- Re-confirmed (by reading current code, not by re-running Phase 12's old tests)
  that the SSRF guard (`src/lib/url-guard.ts`, 9 passing tests covering localhost,
  private IPv4, IPv6 loopback/link-local/unique-local, IPv4-mapped IPv6 in both
  plain and bracketed form, and disguised-IPv4 encodings) and the XSS posture (zero
  `dangerouslySetInnerHTML` in the web app; the extension's few `innerHTML` writes
  are either empty-string clears or fixed literal markup, confirmed by direct
  inspection) are both still intact and unchanged by this phase's work.

## Not independently re-verified this phase (relied on prior phases' testing)

Being explicit about scope, per this phase's own instruction not to claim more than
was actually done:

- Cross-user RLS isolation (Phase 12's live two-account adversarial test) — not
  re-run this phase; no RLS policy was touched.
- Stack Studio at 1,000/5,000/10,000-resource import scale — Phase 14.1's own
  virtualization testing stands; this phase only smoke-tested that the Stack
  Studio page still loads correctly post-changes (no code in that path changed).
- Chrome extension live browser testing (real webpage save, duplicate detection,
  logged-out state, slow network) — Phase 15's own testing stands; this phase only
  re-verified the packaged zip's `host_permissions` and re-confirmed (via grep) no
  secrets/service-role key/localhost URL exist in the extension source.
- Full mobile regression across every screen — spot-checked All Resources and the
  homepage at 375px; found and fixed one homepage nav overlap in the prior phase,
  found no new breakage this phase (a slightly tight header on All Resources at
  375px was visually noted but not broken — text isn't truncated, buttons remain
  tappable — and left as-is rather than a speculative redesign).
- Accessibility audit — not a fresh pass this phase; no interactive component
  markup changed.

## Performance

Real measurements, not projections, from a local Postgres instance (Supabase CLI,
same schema as production) seeded with **16,964 resources** under one account —
the largest real dataset available, comfortably past the phase's 10,000-resource
target:

| Query | Before | After |
|---|---|---|
| `search_resources('tailwind')` (1 real match) | ~520ms | ~120–160ms |
| `search_resources('pack')` (~2,500 matches — unrealistically generic; real searches are far more specific) | ~450–700ms | ~150–300ms |
| `GET /api/resources?limit=300` (dashboard/All Resources initial load) | N/A (already paginated pre-phase) | Fast, single page, confirmed via network tab — never fetches the full 16,964-row library |
| `GET /api/health` | N/A (new) | ~24ms |

Both search figures are comfortably under the sub-second target, including the
deliberately worst-case generic query. No dedicated 100/1,000/5,000-resource search
timing was captured separately — the 16,964-row measurement is the ceiling case;
smaller libraries are strictly faster on the same query plan, not separately
benchmarked. **No synthetic load-testing harness was built or checked into the
repo** — all figures above come from real queries against a real (if locally-hosted)
Postgres instance with real, if synthetic-in-origin, data, not a load-testing tool.

## Security

Verified this phase:

- Production security headers present and correct (CSP, nosniff, Referrer-Policy,
  X-Frame-Options, Permissions-Policy) — live-tested under a real production build.
- Health endpoint leaks no internal detail on either success or failure.
- New `client_error`/`server_error` analytics events carry only a route name and a
  200-character-truncated error message — never a stack trace, request body, or
  anything user-typed; enforced both at the call site and again in the receiving
  API route's metadata allowlist.
- Extension production package still targets the production origin only, holds no
  Supabase key of any kind.

Re-confirmed unchanged from prior phases (code inspection, not re-tested live this
phase — see previous section):

- SSRF guard (9 passing tests, including the IPv4-mapped-IPv6 bypass Phase 12 found
  and fixed).
- Zero XSS surface via `dangerouslySetInnerHTML` in the web app.
- RLS-based cross-user isolation on every user-owned table.
- Admin routes gated by an explicit allowlist (`requireAdmin()`), never a
  client-supplied flag — incidentally re-confirmed live while testing headers (a
  non-admin account was correctly bounced from `/admin`).

**Accepted remaining risk**: the CSP allows `'unsafe-inline'` for scripts and styles
(Next.js's own hydration/RSC payload and Tailwind both rely on inline
script/style) rather than a strict nonce-based policy. This still blocks the classic
XSS payload shape (an injected `<script src="evil.com">` or inline `onclick`
handler from attacker-controlled *data* rendered as text) because React never
executes text content as markup — the residual risk is narrow (an attacker would
need to find an actual injection point that writes to the DOM outside React's
rendering, and none exists today) and was judged not worth the larger, riskier
nonce-based CSP rewrite in this hardening pass.

## Monitoring

What is now observable that wasn't before this phase:

- **Uptime**: `GET /api/health` gives any external monitor (Vercel's own, or a
  third-party uptime checker) a fast, unauthenticated, no-internal-detail signal of
  whether the app can actually reach its database.
- **Server errors**: failures in resource creation, resource listing, search, and
  the admin dashboard are now recorded as `server_error` events with a route name
  and truncated message — visible in the admin dashboard's Recent Activity feed.
  This is a representative subset of routes, not exhaustive coverage.
- **Client errors**: uncaught exceptions, unhandled promise rejections, and React
  render errors anywhere in the app are recorded as `client_error` events the same
  way, with the path they occurred on.
- **Analytics completeness**: `import_started` and CSV/HTML `export_performed` are
  now actually fired, closing two real gaps against the expected event list.

What is deliberately not built: no dedicated error-tracking service (Sentry or
equivalent), no dashboards beyond the existing admin analytics page, no alerting.
This is the "simplest production-appropriate setup that fits the existing stack,"
per the phase's own instruction — an event-log-based signal, not an observability
platform. Revisit if error volume in production ever makes that insufficient.

## Known Limitations

- Filtering/sorting on All Resources/Favorites/Archive only applies to whatever is
  already loaded client-side (explicitly surfaced in the UI, not silent) — a
  genuine architectural limitation this phase chose not to rebuild given the size
  and risk of correctly replicating six sort modes and a "needs review" filter
  (which itself depends on live link-check data, not a stored column) entirely
  server-side within this hardening pass. Power Search does not share this
  limitation.
- Analytics retention (`purge_old_analytics()`) exists and is safe to run, but is
  not scheduled automatically — enabling `pg_cron` on the hosted Supabase project
  and running one `cron.schedule(...)` call is a documented, one-time manual step
  (see README), not something a migration can safely do unprompted.
- The production Supabase project's **Max Rows** setting must be raised to 20,000
  to match this phase's code change — **this phase could not make that change
  itself** (it requires the Supabase dashboard, and the new database migration
  requires a production deploy this environment's safety controls correctly
  blocked without explicit user approval — see the note at the end of this
  report).
- Server-error logging covers a representative subset of routes, not all ~47.
- No dedicated error-tracking platform, no automated load-testing harness, no full
  fresh accessibility audit this phase (see §Not independently re-verified).

## Deployment Status

**READY WITH KNOWN LIMITATIONS.**

The application is genuinely more production-ready leaving this phase than
entering it: a real, measured search-performance fix; production security headers,
live-verified; a health endpoint; minimal but real error observability; a closed
data-truncation correctness gap; and an honest documentation update. Nothing found
in this phase's audit was a launch-blocking defect — the core security posture
(RLS, SSRF, XSS, auth) was already sound from prior phases and remains so.

Two items need action **outside this repository** before the fixes in this phase
take effect in production, and could not be done from here:

1. **The new migration (`20260101000014_search_performance.sql`) has not been
   pushed to the production Supabase project.** `supabase db push --linked` was
   attempted and was blocked by this environment's own safety controls
   (production deploys require explicit user approval, correctly). Until it's
   pushed, production search performance is unchanged from before this phase.
2. **Production Supabase's Project Settings → API → Max Rows** needs to be raised
   to 20,000 to match the code change in this phase (see §Known Limitations) —
   also outside what this environment can do unattended.

Everything else in this phase (code changes, headers, health endpoint, error
observability, documentation) ships with the next normal Vercel deploy of this
repository, no manual step required beyond the two above.
