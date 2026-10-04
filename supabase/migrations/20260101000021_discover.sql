-- KeepYourStack: Discover (Phase 3) — public shares become browsable, with
-- save counts, reports, and moderation.
--
-- Public = listed in Discover. Unlisted stays link-only.

-- Discover needs a category label and moderation state on each share.
alter table public.resource_shares add column if not exists category_name text;
alter table public.resource_shares add column if not exists hidden_at timestamptz;
alter table public.resource_shares add column if not exists hidden_reason text;

create index if not exists resource_shares_discover_idx
  on public.resource_shares (created_at desc)
  where visibility = 'public' and revoked_at is null and hidden_at is null;

-- One row per (share, user) that saved it, so save counts can't be inflated by repeats.
create table if not exists public.share_saves (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.resource_shares (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (share_id, user_id)
);
create index if not exists share_saves_share_created_idx on public.share_saves (share_id, created_at desc);

create table if not exists public.share_reports (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.resource_shares (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (share_id, reporter_id)
);
create index if not exists share_reports_open_idx on public.share_reports (status, created_at desc);

alter table public.share_saves enable row level security;
alter table public.share_reports enable row level security;

-- Saves are written only by the server (service role, see saveSharedResource),
-- so a client can never inflate a Discover count directly.
create policy "share_saves_own_select" on public.share_saves
  for select to authenticated using (user_id = auth.uid());

-- Reports may target only a share that is currently listed in Discover and is
-- not the reporter's own. The check runs as definer because the reporter can't
-- read other users' shares under RLS.
create or replace function public.share_is_reportable_by(p_share uuid, p_user uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.resource_shares s
    where s.id = p_share
      and s.visibility = 'public'
      and s.revoked_at is null
      and s.hidden_at is null
      and s.user_id <> p_user
  );
$$;
revoke all on function public.share_is_reportable_by(uuid, uuid) from public, anon;
grant execute on function public.share_is_reportable_by(uuid, uuid) to authenticated;

create policy "share_reports_own_select" on public.share_reports
  for select to authenticated using (reporter_id = auth.uid());
create policy "share_reports_own_insert" on public.share_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.share_is_reportable_by(share_id, auth.uid()));

-- Supabase's default grants give anon/authenticated full table privileges.
-- Tighten resource_shares too: owners may only set revoked_at, and nothing
-- else about a share (snapshot, token, visibility) is editable by the client.
revoke all on public.resource_shares from anon, authenticated;
grant select on public.resource_shares to authenticated;
grant insert (user_id, resource_id, token, visibility, message, title, url, domain, description, tag_names, pricing, platform, category_name)
  on public.resource_shares to authenticated;
grant update (revoked_at) on public.resource_shares to authenticated;

revoke all on public.share_saves from anon, authenticated;
grant select on public.share_saves to authenticated;

revoke all on public.share_reports from anon, authenticated;
grant select, insert on public.share_reports to authenticated;

-- Discover listing with save counts. Reads only through the service role
-- (see src/lib/data/discover.ts); the function is not granted to clients.
create or replace function public.discover_shares(p_sort text, p_category text, p_limit int)
returns table (
  share_id uuid,
  title text,
  url text,
  domain text,
  description text,
  tag_names text[],
  pricing text,
  platform text[],
  message text,
  category_name text,
  created_at timestamptz,
  save_count bigint,
  recent_saves bigint
)
language sql
stable
security definer set search_path = public
as $$
  select
    s.id,
    s.title,
    s.url,
    s.domain,
    s.description,
    s.tag_names,
    s.pricing,
    s.platform,
    s.message,
    s.category_name,
    s.created_at,
    (select count(*) from public.share_saves ss where ss.share_id = s.id) as save_count,
    (select count(*) from public.share_saves ss
       where ss.share_id = s.id and ss.created_at > now() - interval '7 days') as recent_saves
  from public.resource_shares s
  where s.visibility = 'public'
    and s.revoked_at is null
    and s.hidden_at is null
    and (p_category is null or s.category_name = p_category)
  order by
    case when p_sort = 'trending' then (select count(*) from public.share_saves ss
       where ss.share_id = s.id and ss.created_at > now() - interval '7 days') end desc nulls last,
    s.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.discover_shares(text, text, int) from public, anon, authenticated;
grant execute on function public.discover_shares(text, text, int) to service_role;
