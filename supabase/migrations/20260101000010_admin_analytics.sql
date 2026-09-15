-- KeepYourStack: Admin Panel & Analytics.
--
-- Admin membership deliberately lives in its OWN table, not a column on
-- profiles. profiles already has a permissive "update own row" RLS policy
-- (auth.uid() = id) with no column-level restriction — Postgres RLS can't
-- restrict which columns an allowed UPDATE touches, so an `is_admin`
-- column there would let any user grant themselves admin via a raw
-- Supabase client call, bypassing every app-level check entirely. Putting
-- it in a table with RLS enabled and ZERO policies makes that structurally
-- impossible instead of just discouraged: RLS enabled + no policy denies
-- every operation to every non-service-role request, full stop. Only the
-- service-role key (server-only, see src/lib/data/admin-auth.ts) can ever
-- read or write it.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  note text
);
alter table public.admin_users enable row level security;
-- No policies on purpose — see comment above.

-- ── analytics_events ───────────────────────────────────────────────────
-- One row per tracked event — a page view, a product action (resource
-- created, extension save, etc.), or an anonymous-visitor signal. Never
-- holds anything more sensitive than what's documented in
-- src/lib/data/analytics.ts's own header comment (no resource content, no
-- tokens, no raw IP).
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  anonymous_visitor_id text,
  session_id text,
  path text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_type_idx on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id) where user_id is not null;
create index if not exists analytics_events_visitor_id_idx on public.analytics_events (anonymous_visitor_id) where anonymous_visitor_id is not null;
create index if not exists analytics_events_session_id_idx on public.analytics_events (session_id) where session_id is not null;
alter table public.analytics_events enable row level security;
-- No policies — every read/write goes through server-side API routes using
-- the service-role client (POST /api/analytics/track for writes, requireAdmin()-
-- gated GET /api/admin/* routes for reads). No anon/authenticated role can
-- reach this table directly, by design.

-- ── visitor_sessions ────────────────────────────────────────────────────
-- One row per anonymous browsing session (see the session-timeout
-- definition in src/lib/data/analytics.ts). Upserted as a visitor's page
-- views come in, not one-row-per-page-view — analytics_events already
-- holds the individual page_view events.
create table if not exists public.visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_visitor_id text not null,
  session_id text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  landing_path text,
  referrer text,
  device_type text,
  browser text,
  operating_system text,
  country text,
  page_view_count integer not null default 0,
  is_returning boolean not null default false
);
create index if not exists visitor_sessions_visitor_id_idx on public.visitor_sessions (anonymous_visitor_id);
create index if not exists visitor_sessions_first_seen_idx on public.visitor_sessions (first_seen_at desc);
create index if not exists visitor_sessions_last_seen_idx on public.visitor_sessions (last_seen_at desc);
alter table public.visitor_sessions enable row level security;
-- No policies — same reasoning as analytics_events.

-- ── retention (§14) ─────────────────────────────────────────────────────
-- Raw analytics_events rows older than 180 days are deleted by this
-- function; visitor_sessions (already small — one row per session, not
-- per page view) are kept longer (400 days) since they're the basis for
-- any month-over-month visitor comparison. Never touches any user/resource
-- data — only these two analytics tables. Not scheduled automatically from
-- this migration (Supabase's pg_cron needs to be enabled per-project and
-- scheduling it is a deploy-time/dashboard decision, not something a
-- migration should silently turn on) — see the admin README note for how
-- to schedule it, e.g. `select cron.schedule('analytics-retention', '0 3
-- * * *', 'select public.purge_old_analytics()');` once pg_cron is enabled.
create or replace function public.purge_old_analytics()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.analytics_events where created_at < now() - interval '180 days';
  delete from public.visitor_sessions where last_seen_at < now() - interval '400 days';
$$;

-- ── admin aggregation RPCs ──────────────────────────────────────────────
-- All SECURITY DEFINER (need to read across every user's data — that's the
-- point of an admin view) but only ever called from the service-role
-- client after requireAdmin() has already verified the caller — see
-- src/lib/data/admin-analytics.ts. Not exposed to anon/authenticated via
-- any grant beyond the default (and nothing in the app ever calls these
-- except that one file). Aggregation happens in SQL, not by pulling raw
-- rows into Node, so this stays fast as analytics_events/resources grow —
-- every query here is a GROUP BY over an indexed column, never a full
-- table pull.

-- One row per day in [p_from, p_to] — powers all four trend charts
-- (visitors, user growth, resource growth, activity) from a single query
-- instead of four.
create or replace function public.admin_daily_timeseries(p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  visitors bigint,
  unique_visitors bigint,
  page_views bigint,
  new_users bigint,
  resources_created bigint,
  extension_saves bigint,
  searches bigint,
  imports_completed bigint
)
language sql
stable
security definer set search_path = public
as $$
  with days as (
    select generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day')::date as day
  )
  select
    d.day,
    -- "Visitors" here = total sessions/visits that day (not deduped);
    -- "unique_visitors" = distinct anonymous_visitor_id — the two
    -- genuinely differ whenever the same visitor returns same-day.
    coalesce((select count(*) from public.visitor_sessions vs where vs.first_seen_at::date = d.day), 0) as visitors,
    coalesce((select count(distinct anonymous_visitor_id) from public.visitor_sessions vs where vs.first_seen_at::date = d.day), 0) as unique_visitors,
    coalesce((select count(*) from public.analytics_events e where e.event_type = 'page_view' and e.created_at::date = d.day), 0) as page_views,
    coalesce((select count(*) from auth.users u where u.created_at::date = d.day), 0) as new_users,
    coalesce((select count(*) from public.resources r where r.created_at::date = d.day), 0) as resources_created,
    coalesce((select count(*) from public.analytics_events e where e.event_type = 'extension_save_success' and e.created_at::date = d.day), 0) as extension_saves,
    coalesce((select count(*) from public.analytics_events e where e.event_type = 'search_performed' and e.created_at::date = d.day), 0) as searches,
    coalesce((select count(*) from public.analytics_events e where e.event_type = 'import_completed' and e.created_at::date = d.day), 0) as imports_completed
  from days d
  order by d.day;
$$;

-- Current-vs-previous-period scalar KPIs for the overview cards.
create or replace function public.admin_overview(
  p_from timestamptz, p_to timestamptz,
  p_prev_from timestamptz, p_prev_to timestamptz
)
returns table (
  visitors bigint, prev_visitors bigint,
  unique_visitors bigint, prev_unique_visitors bigint,
  page_views bigint, prev_page_views bigint,
  new_users bigint, prev_new_users bigint,
  total_users bigint,
  resources_created bigint, prev_resources_created bigint,
  total_resources bigint,
  active_users bigint, prev_active_users bigint,
  extension_saves bigint, prev_extension_saves bigint,
  imports_completed bigint, prev_imports_completed bigint,
  failed_operations bigint, prev_failed_operations bigint
)
language sql
stable
security definer set search_path = public
as $$
  select
    (select count(*) from public.visitor_sessions where first_seen_at >= p_from and first_seen_at < p_to),
    (select count(*) from public.visitor_sessions where first_seen_at >= p_prev_from and first_seen_at < p_prev_to),
    (select count(distinct anonymous_visitor_id) from public.visitor_sessions where first_seen_at >= p_from and first_seen_at < p_to),
    (select count(distinct anonymous_visitor_id) from public.visitor_sessions where first_seen_at >= p_prev_from and first_seen_at < p_prev_to),
    (select count(*) from public.analytics_events where event_type = 'page_view' and created_at >= p_from and created_at < p_to),
    (select count(*) from public.analytics_events where event_type = 'page_view' and created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from auth.users where created_at >= p_from and created_at < p_to),
    (select count(*) from auth.users where created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from auth.users),
    (select count(*) from public.resources where created_at >= p_from and created_at < p_to),
    (select count(*) from public.resources where created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from public.resources),
    (select count(distinct user_id) from public.analytics_events where user_id is not null and created_at >= p_from and created_at < p_to),
    (select count(distinct user_id) from public.analytics_events where user_id is not null and created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from public.analytics_events where event_type = 'extension_save_success' and created_at >= p_from and created_at < p_to),
    (select count(*) from public.analytics_events where event_type = 'extension_save_success' and created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from public.analytics_events where event_type = 'import_completed' and created_at >= p_from and created_at < p_to),
    (select count(*) from public.analytics_events where event_type = 'import_completed' and created_at >= p_prev_from and created_at < p_prev_to),
    (select count(*) from public.analytics_events where event_type in ('extension_save_failure', 'import_failed', 'enrichment_failed') and created_at >= p_from and created_at < p_to),
    (select count(*) from public.analytics_events where event_type in ('extension_save_failure', 'import_failed', 'enrichment_failed') and created_at >= p_prev_from and created_at < p_prev_to);
$$;

-- Top categories/stacks/tags/pricing by resource count, across every
-- user's library (that's the point of an admin-level view) in the given
-- period. One function, one shared shape (label/count) — the API route
-- calls it four times with a different source query embedded via `p_kind`
-- rather than four near-identical functions.
create or replace function public.admin_top_dimension(p_kind text, p_from timestamptz, p_to timestamptz, p_limit int default 8)
returns table (label text, count bigint)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if p_kind = 'category' then
    return query
      select c.name, count(*)::bigint
      from public.resources r join public.categories c on c.id = r.category_id
      where r.created_at >= p_from and r.created_at < p_to
      group by c.name order by count(*) desc limit p_limit;
  elsif p_kind = 'stack' then
    return query
      select s.name, count(*)::bigint
      from public.resource_stacks rs
        join public.stacks s on s.id = rs.stack_id
        join public.resources r on r.id = rs.resource_id
      where r.created_at >= p_from and r.created_at < p_to
      group by s.name order by count(*) desc limit p_limit;
  elsif p_kind = 'tag' then
    return query
      select t.name, count(*)::bigint
      from public.resource_tags rt
        join public.tags t on t.id = rt.tag_id
        join public.resources r on r.id = rt.resource_id
      where r.created_at >= p_from and r.created_at < p_to
      group by t.name order by count(*) desc limit p_limit;
  elsif p_kind = 'pricing' then
    return query
      select coalesce(r.pricing, 'unset'), count(*)::bigint
      from public.resources r
      where r.created_at >= p_from and r.created_at < p_to
      group by r.pricing order by count(*) desc limit p_limit;
  end if;
end;
$$;

