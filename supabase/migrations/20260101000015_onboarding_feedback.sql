-- KeepYourStack: Phase 17 — onboarding dismissal + lightweight feedback.

-- Lets a user explicitly dismiss the onboarding checklist early (it also
-- auto-hides once they're activated — see the app-side logic — but "skip"
-- has to persist somewhere so it doesn't reappear on next login/device).
-- Nullable: null means "never dismissed," not "dismissed at epoch."
alter table public.profiles
  add column if not exists onboarding_dismissed_at timestamptz;

-- A short, low-friction feedback/bug-report mechanism (§23/§24) — one flat
-- table, no voting/threads/community features. `context` carries only the
-- safe, auto-collectable technical detail the phase spec allows (route,
-- browser, device category, app version) — never a password, token, or
-- private resource content, and it's a plain jsonb blob the API route
-- builds server-side from a fixed allowlist of keys, not arbitrary
-- client-supplied data.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('bug', 'idea', 'confusing', 'other')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- A signed-in user can submit their own feedback (server sets user_id from
-- the authenticated session, never trusts a client-supplied one — see
-- src/app/api/feedback/route.ts) but can never read any feedback back,
-- their own included — this is a one-way mailbox to the team, not a
-- support-ticket viewer. Reading it back is an admin-only, service-role
-- operation (src/lib/data/admin-analytics.ts), same posture as
-- analytics_events.
create policy "feedback: insert own"
  on public.feedback for insert
  with check (auth.uid() = user_id);
