# Phase 17: V1 Launch & Growth Foundation

Final report. This phase built the first-time-user activation loop (onboarding, empty
states, activation funnel), a lightweight feedback/bug-report mechanism, real Open
Graph images, and closed several real bugs found during a genuine, unscripted
end-to-end walkthrough as a brand-new user — the single most valuable exercise in
this phase, per its own instruction. No large new product feature was added.

---

## Executive Summary

Most of the "growth loop" this phase asked for was already real and working before
any code was written: server-side pagination, Power Search with an honest "why it
matched," a genuinely well-designed public-stack page with a working Save/Clone flow,
a real Import/Export/Backup section already messaged as "your data belongs to you."
The inspection-first mandate paid off — several things the spec assumed might need
building (public Stack polish, share terminology, data-portability UI) were already
done correctly and needed no touching.

What this phase actually built: a compact, skippable onboarding welcome + checklist
(gated so it can never resurface for an established account), matching product
copy education for empty Stacks and empty search results, a real activation funnel
and retention dashboard backed by two new SQL aggregation functions, a one-way
feedback mailbox, and Open Graph images for the homepage and shared Stacks.

What this phase found and fixed by actually using the product as a stranger would:
a real bug where typed "Useful For" / tag context was silently discarded if a user
didn't explicitly press Enter or an Add button before saving — directly undermining
the "give it context, future-you will thank you" promise this same phase's copy
makes — and a real mobile horizontal-overflow bug on the Stack detail page. Both are
fixed and verified live, not just reasoned about.

**Verdict: READY WITH KNOWN LIMITATIONS.** See §Deployment Status.

---

## Completed

- **Onboarding** (`src/components/onboarding-panel.tsx`): a welcome card for a
  brand-new empty library (`"Welcome to your new toolbox."` + Add a resource /
  Import bookmarks / Start empty, with a Chrome extension link) that transitions
  into a compact, dismissible checklist (`Save your first resource` → `Give it
  context` → `Create your first Stack` → `Find something with Search`) once the
  first resource lands, and disappears entirely — auto-marking itself completed —
  once all four are true. Gated on both an explicit dismissal flag
  (`profiles.onboarding_dismissed_at`) and a resource-count ceiling
  (`GRADUATED_RESOURCE_COUNT = 15`), specifically so an account that already has
  a real library (verified live against the 16,963-resource dev account) never
  sees it, regardless of whether it was ever dismissed.
- **Empty states rewritten**: empty Stack detail page now explains the concept
  ("A Stack is where a resource fits into the way you build," with the spec's own
  Frontend Stack → React → Next.js → Tailwind → Figma example) instead of a bare
  "no resources yet"; zero-result search now shows concrete recovery guidance
  ("Try: another phrase / a tag / a category / what the tool does," with the
  Hoppscotch → "test APIs" example) instead of a bare "no results," reinforcing the
  product's actual intent-based search rather than just apologizing.
- **Activation funnel + retention** (`supabase/migrations/20260101000016_activation_funnel.sql`,
  `getActivationFunnel`/`getRetentionStats` in `admin-analytics.ts`, new sections in
  the admin dashboard): Visitors → Signups → First Resource → First Search →
  Activated, with real conversion percentages (and an honest "—" instead of a
  fabricated number where a prior step is zero); D1/D7 return rate, resources/active
  user, searches/active user. "Activated" operationalizes the spec's own recommended
  definition — saved a resource *and* found it again via Search — from data that
  already exists, rather than inventing new instrumentation for it.
- **New/fixed analytics events**: `stack_created`, `first_resource_saved`,
  `first_stack_created`, `first_import_completed`, `first_favorite`,
  `onboarding_started/completed/skipped`, `feedback_submitted`. Also fixed two
  events that were declared but never fired before this phase: `import_started`
  (now wired into `/api/import`) and `export_performed` for CSV/HTML exports (was
  JSON-only).
- **Feedback** (`src/components/feedback-modal.tsx`, `/api/feedback`,
  `feedback` table + RLS): four categories (bug/idea/confusing/other), a message
  field, and auto-collected safe context (route, browser, OS, device category, app
  version) built server-side from a fixed allowlist — never a password, token, or
  resource content. One-way mailbox — a user can submit but never read feedback
  back; an admin reads it via the service-role client only. Reachable from the
  sidebar on every authenticated screen, verified working on both desktop and mobile
  (see §Verified).
- **Open Graph images** (`src/app/opengraph-image.tsx`,
  `src/app/u/[username]/[slug]/opengraph-image.tsx`): a branded default image for the
  homepage, and a real per-Stack image (name, owner, resource count) generated from
  the same server-trusted lookup the page itself uses — never fabricated, never
  exposing a private Stack (only ever renders for a Stack `getPublicStackBySlug`
  already resolves as public/unlisted). Metadata upgraded to
  `summary_large_image`/canonical URLs on both the Stack and profile pages.
- **Two real bugs found and fixed via the mandated end-to-end test** (§35 — see
  next section for how each was found):
  1. Typing a "Useful For" phrase or a tag and saving without first pressing
     Enter/Add silently discarded it, in both Add Resource and Edit Resource. Fixed
     by flushing the pending draft into the real list at save time
     (`add-resource-modal.tsx`, `edit-resource-modal.tsx`), and by committing a
     tag's draft on blur, not only Enter/comma (`tag-input.tsx`).
  2. The Stack detail page's header row (title + Share/Manage/Delete buttons)
     didn't wrap at 375px, overflowing the viewport by ~100px. Fixed with
     `flex-wrap` on both the outer row and the button group.
- **Copy fix**: Settings' Browser Extension card said "Coming next — not installed
  yet" / "Preview" — inaccurate, since a real, working, downloadable extension has
  existed since Phase 15. Changed to "Chrome extension available now" / "Get the
  extension."
- **Documentation**: `README.md` gained a "Why it exists," "Core features," and
  "Getting started" section aimed at a developer discovering the project, not just
  the existing ops-focused Setup/Deployment sections (kept, unchanged).

## Verified

Via a genuine, unscripted end-to-end walkthrough as a brand-new user (§35), starting
at `/` with cookies cleared, a real signup (`journey-tester@keepyourstack.local`),
through: homepage comprehension → signup → onboarding welcome shown correctly for
the empty account → adding a real resource (Hoppscotch) with the metadata
auto-fetch working → discovering and fixing the "Useful For" drop bug (see above) →
onboarding checklist correctly ticking off "Save your first resource" and "Give it
context" the moment both were true → creating a real Stack → the empty-Stack
education copy rendering correctly → adding the resource to it → Power Search
actually finding it by "test APIs" (not by name) with the correct "why it matched"
label, *after* the context bug was fixed → favoriting it → refreshing and confirming
persistence → the admin dashboard's Activation Funnel showing the exact real numbers
this walkthrough produced (Visitors 6, Signups 2, First Resource 1, First Search 1,
Activated 1, with correct 33%/50%/100%/100% conversion) → Retention Signals showing
real, non-fabricated D1/resources-per-user numbers → making the test Stack public and
using the real "Save to my KeepYourStack" clone flow from a second (still
authenticated, see limitation below) account, confirmed via direct database query to
have created a genuinely separate resource row for the cloning account, not a
reference to the original → the Stack detail mobile-overflow bug found and fixed at
375px, re-verified at 0px overflow → the Feedback modal tested at 375px, submitted
for real, and confirmed in the database with correct auto-captured context
(`{"os":"Android","browser":"Chrome","deviceType":"mobile","route":"/home","appVersion":"0.1.0"}`).

Also verified: full regression — `eslint` clean, `tsc --noEmit` clean, `vitest run`
— **293/293 tests passing** (291 pre-existing + 2 new), `next build` clean, both new
`opengraph-image` routes present in the build output.

## Not independently re-verified this phase / known limitation in the test itself

- **The "logged-out visitor hits Save, sees a signup wall" path was not exercised
  live.** This local dev environment auto-signs back in as a fixed dev account the
  moment a session is cleared (a documented local-dev-only convenience, absent in
  production), which made it impossible to hold a genuinely anonymous session long
  enough to click through to the redirect. Verified instead by reading the actual
  code path: `public-stack-view.tsx` redirects to `/auth/login?next=...` on an
  unauthenticated Save click, and the middleware's `isPublicSharingPath` already
  lets the page itself render without auth. The clone mechanics themselves (dedup,
  separate resource ownership, no mutation of the source) *were* verified live, via
  a real cross-account clone and a direct database check.
- Chrome extension live re-testing (real webpage save, duplicate detection, slow
  network) — not repeated this phase; no extension code changed. Verified only that
  its Settings-page entry point now describes it accurately.
- Full accessibility audit (screen reader pass, contrast audit) — not performed this
  phase; the new interactive elements (onboarding checklist dismiss button, feedback
  modal) reuse the existing `Modal`/`Button` components' established focus/Escape/
  aria handling rather than introducing new patterns, but this wasn't independently
  re-audited with a screen reader.
- Screenshots/launch visual assets (§28) — not produced. This environment's browser
  tool can capture on-screen images for inspection but has no mechanism to save them
  to disk as committed files, and the README was written to say so honestly (a "not
  yet checked in, here's the live URL instead" note) rather than reference
  nonexistent image files.

## Deployment Status

**READY WITH KNOWN LIMITATIONS.**

The core V1 growth loop — understand the product, sign up, save something, add
context, organize it, find it again, see why you'd come back — was tested as a real
stranger would experience it, on a real database, and one real, meaningful bug in
that exact loop (the silently-dropped context) was found and fixed as a direct
result. The admin funnel and retention dashboards are backed by real, verified,
non-fabricated data.

One item needs action outside this repository, blocked here the same way Phase 16's
was: **the two new migrations
(`20260101000015_onboarding_feedback.sql`, `20260101000016_activation_funnel.sql`)
have not been pushed to the production Supabase project** — `supabase db push
--linked` requires explicit user approval this environment correctly withholds from
an autonomous session. Until pushed, the onboarding-dismissal column and the
feedback table/funnel RPCs don't exist in production, and the onboarding
panel/feedback modal/admin funnel section would error against the live database.
Everything else in this phase ships with the next normal Vercel deploy.
