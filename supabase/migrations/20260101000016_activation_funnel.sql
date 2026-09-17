-- KeepYourStack: Phase 17 — admin activation funnel + retention (§21/§22).
--
-- Computed server-side in one function rather than pulling raw event rows
-- into the admin dashboard's JS to dedupe by hand — some of these are
-- DISTINCT-user counts over the whole event history, which could be many
-- thousands of rows at real scale. SECURITY DEFINER + explicit grant to
-- service_role, same posture as every other admin aggregation RPC in this
-- file's sibling migrations (search_resources, suggest_resource_
-- organization) — only ever called from src/lib/data/admin-analytics.ts
-- via the service-role client, itself gated by requireAdmin().
--
-- "Activated" here operationalizes the phase spec's own recommended
-- definition ("saved or imported at least one resource and successfully
-- accessed it again") using data that already exists: a user who has a
-- resource_created event AND a search_performed event that actually
-- returned something (metadata.resultCount > 0) has demonstrably saved
-- something and found it again through the product's own retrieval path.
create or replace function public.admin_activation_funnel()
returns table (
  visitors bigint,
  signups bigint,
  first_resource bigint,
  first_search bigint,
  activated bigint
)
language sql
stable
security definer set search_path = public
as $$
  select
    (select count(distinct anonymous_visitor_id) from public.analytics_events
       where event_type = 'page_view' and anonymous_visitor_id is not null) as visitors,
    (select count(*) from public.profiles) as signups,
    (select count(distinct user_id) from public.analytics_events
       where event_type = 'resource_created' and user_id is not null) as first_resource,
    (select count(distinct user_id) from public.analytics_events
       where event_type = 'search_performed' and user_id is not null
         and coalesce((metadata->>'resultCount')::int, 0) > 0) as first_search,
    (select count(distinct a.user_id) from public.analytics_events a
       where a.event_type = 'resource_created' and a.user_id is not null
         and exists (
           select 1 from public.analytics_events b
           where b.user_id = a.user_id and b.event_type = 'search_performed'
             and coalesce((b.metadata->>'resultCount')::int, 0) > 0
         )) as activated;
$$;

grant execute on function public.admin_activation_funnel() to service_role;

-- Retention + per-active-user usage signals (§22). "Returned on day N"
-- means: at least one event (any type) recorded on the calendar day that
-- is exactly N days after the user's signup — not "any time after," which
-- would just restate "hasn't churned instantly." A user who signed up too
-- recently to have reached that day yet is correctly excluded from both
-- the numerator and denominator (`eligible_for_dN`), not counted as
-- "didn't return."
create or replace function public.admin_retention_stats()
returns table (
  eligible_for_d1 bigint,
  returned_d1 bigint,
  eligible_for_d7 bigint,
  returned_d7 bigint,
  active_users_30d bigint,
  resources_per_active_user numeric,
  searches_per_active_user numeric
)
language sql
stable
security definer set search_path = public
as $$
  with eligible as (
    select id, created_at from public.profiles where created_at < now() - interval '1 day'
  ),
  eligible7 as (
    select id, created_at from public.profiles where created_at < now() - interval '7 days'
  ),
  active_30d as (
    select distinct user_id from public.analytics_events
    where user_id is not null and created_at >= now() - interval '30 days'
  ),
  resource_saves_30d as (
    select count(*) as n from public.analytics_events
    where event_type = 'resource_created' and created_at >= now() - interval '30 days'
  ),
  searches_30d as (
    select count(*) as n from public.analytics_events
    where event_type = 'search_performed' and created_at >= now() - interval '30 days'
  )
  select
    (select count(*) from eligible) as eligible_for_d1,
    (select count(*) from eligible e
       where exists (
         select 1 from public.analytics_events ev
         where ev.user_id = e.id
           and ev.created_at::date = (e.created_at + interval '1 day')::date
       )) as returned_d1,
    (select count(*) from eligible7) as eligible_for_d7,
    (select count(*) from eligible7 e
       where exists (
         select 1 from public.analytics_events ev
         where ev.user_id = e.id
           and ev.created_at::date = (e.created_at + interval '7 days')::date
       )) as returned_d7,
    (select count(*) from active_30d) as active_users_30d,
    case when (select count(*) from active_30d) = 0 then 0
      else round((select n from resource_saves_30d)::numeric / (select count(*) from active_30d), 2)
    end as resources_per_active_user,
    case when (select count(*) from active_30d) = 0 then 0
      else round((select n from searches_30d)::numeric / (select count(*) from active_30d), 2)
    end as searches_per_active_user;
$$;

grant execute on function public.admin_retention_stats() to service_role;
