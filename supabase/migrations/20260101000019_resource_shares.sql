-- KeepYourStack: single-resource share links (Drops Phase 1).
--
-- One row per share. The fields a viewer sees are copied into the row at
-- share time (a snapshot), so the public page never reads the owner's live
-- resource, and private fields (notes, library structure, stacks) can't
-- leak through it. Tokens are 32 random bytes, base64url-encoded, generated
-- in application code (src/lib/data/resource-shares.ts), and looked up by
-- exact match only.
--
-- Owners can read and manage their own shares under RLS. Public viewers
-- never query this table directly: the app's service-role path resolves a
-- token and checks revoked_at itself, matching the existing stack share
-- links.

create table if not exists public.resource_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  token text not null,
  visibility text not null check (visibility in ('unlisted', 'public')),
  message text not null default '' check (char_length(message) <= 500),
  title text not null,
  url text not null,
  domain text not null,
  description text not null default '',
  tag_names text[] not null default '{}',
  pricing text,
  platform text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists resource_shares_token_idx on public.resource_shares (token);
create index if not exists resource_shares_resource_active_idx
  on public.resource_shares (resource_id) where revoked_at is null;
create index if not exists resource_shares_user_idx on public.resource_shares (user_id);

alter table public.resource_shares enable row level security;

create policy "resource_shares_owner_select" on public.resource_shares
  for select to authenticated
  using (user_id = auth.uid());

create policy "resource_shares_owner_insert" on public.resource_shares
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  );

create policy "resource_shares_owner_update" on public.resource_shares
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.resource_shares to authenticated;
