-- KeepYourStack Phase 13: Quick Access + Shareable Stacks.
--
-- Public identity (profiles.username), stack visibility (private/unlisted/
-- public), unlisted share tokens (stack_share_links), and Quick Access
-- device bookkeeping (trusted_devices). Extends existing tables where
-- appropriate (profiles, stacks) rather than introducing duplicate user/
-- stack systems — only two genuinely new tables are added.

-- ── profiles.username ───────────────────────────────────────────────────
-- Nullable — existing users have no username until they set one in
-- Settings (Part A). Case-insensitive uniqueness via a unique index on
-- lower(username), not a case-sensitive unique constraint, so "Chintan"
-- and "chintan" can't both be claimed. Format enforced by both this check
-- constraint (defense in depth at the DB layer) and application-level
-- validation (src/lib/username-validation.ts) that also rejects reserved
-- routes — the DB alone can't know "admin"/"settings"/etc. are reserved
-- app routes, only that the shape is otherwise valid.
alter table public.profiles add column if not exists username text;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_-]{3,30}$');
create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username));

-- ── stacks.visibility / stacks.slug ─────────────────────────────────────
-- Every existing and newly created stack defaults to 'private' — nothing
-- becomes public without the owner explicitly changing it (Part G).
-- slug is nullable (only needed once a stack is shared) and unique per
-- user (not globally — "frontend" can be any number of different users'
-- slug, disambiguated by the username in the URL, /@user/slug).
alter table public.stacks add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'unlisted', 'public'));
alter table public.stacks add column if not exists slug text;
create unique index if not exists stacks_user_slug_unique_idx on public.stacks (user_id, slug) where slug is not null;
create index if not exists stacks_visibility_idx on public.stacks (visibility) where visibility <> 'private';

-- ── stack_share_links ───────────────────────────────────────────────────
-- One row per currently-valid unlisted share token for a stack — not a
-- column on stacks, so "regenerate" (Part H) is just inserting a new row
-- and revoking the old one, keeping a real (if short) history rather than
-- silently overwriting. `token` is generated application-side via
-- crypto.randomBytes (see src/lib/data/stack-sharing.ts) — 32 bytes,
-- base64url-encoded, cryptographically random, never a sequential id, a
-- user id, a timestamp, or an encoded database id, matching Part H's
-- explicit requirement. Looked up by exact token match only (indexed),
-- never enumerated.
create table if not exists public.stack_share_links (
  id uuid primary key default gen_random_uuid(),
  stack_id uuid not null references public.stacks (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists stack_share_links_token_idx on public.stack_share_links (token);
create index if not exists stack_share_links_stack_id_idx on public.stack_share_links (stack_id) where revoked_at is null;

-- ── trusted_devices ──────────────────────────────────────────────────────
-- Quick Access (Part I/J) bookkeeping ONLY — device_id is a random,
-- non-secret identifier the browser stores in localStorage (see
-- src/components/quick-access.tsx), carries no authentication power of
-- its own, and is never sufficient to access the account. Real
-- authentication continues to be Supabase's own session (already
-- persisted securely via httpOnly cookies) — this table just lets the
-- owner see which devices have a persisted session and when, and gives
-- "sign out other devices" a real target
-- (supabase.auth.signOut({scope:"others"}) on the current session, which
-- Supabase itself enforces server-side by revoking those refresh tokens —
-- not something this table does on its own).
create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists trusted_devices_user_device_idx on public.trusted_devices (user_id, device_id);

alter table public.stack_share_links enable row level security;
alter table public.trusted_devices enable row level security;

-- stack_share_links: owner can manage links for their own stacks. Reading
-- a link BY TOKEN (the actual unlisted-access path) deliberately does NOT
-- go through this policy or any authenticated/anon RLS grant — it's
-- served by a Next.js API route using the service-role client after
-- validating the token in application code (see
-- src/app/api/public/share/[token]/route.ts), the same "safe server/API
-- mechanism" pattern this project already uses for admin analytics.
-- Postgres RLS has no concept of "the caller supplied token X in a URL,"
-- so this table is intentionally NOT readable by anon/authenticated at
-- all except by the owner managing their own stack's links.
create policy "stack_share_links: select own" on public.stack_share_links
  for select using (exists (select 1 from public.stacks s where s.id = stack_id and s.user_id = auth.uid()));
create policy "stack_share_links: insert own" on public.stack_share_links
  for insert with check (exists (select 1 from public.stacks s where s.id = stack_id and s.user_id = auth.uid()));
create policy "stack_share_links: update own" on public.stack_share_links
  for update using (exists (select 1 from public.stacks s where s.id = stack_id and s.user_id = auth.uid()));

-- trusted_devices: strictly owner-only, both ways — no admin/service
-- carve-out is needed since this is pure UI bookkeeping, never used to
-- authorize anything.
create policy "trusted_devices: select own" on public.trusted_devices
  for select using (auth.uid() = user_id);
create policy "trusted_devices: insert own" on public.trusted_devices
  for insert with check (auth.uid() = user_id);
create policy "trusted_devices: update own" on public.trusted_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trusted_devices: delete own" on public.trusted_devices
  for delete using (auth.uid() = user_id);

-- ── narrow, additive public-read policies (§M) ──────────────────────────
-- These ADD a second way to read a row — Postgres RLS policies are OR'd
-- together — they never replace or weaken the existing owner-only
-- policies above. A private stack/resource is completely unaffected: the
-- condition below is only ever true when visibility is actually 'public'.
-- Unlisted is deliberately excluded from RLS entirely (see the
-- stack_share_links comment above) — it's enforced at the API layer via
-- the share token instead, since RLS has no way to check that.
create policy "stacks: select public" on public.stacks
  for select using (visibility = 'public');

-- Reaching from resources/categories/tags/resource_tags to "is this
-- visible via a public stack" needs a SECURITY DEFINER helper function,
-- not a direct EXISTS join against resource_stacks/resources — a direct
-- join here would be mutually recursive with resource_stacks' own
-- pre-existing "select via owned resource" policy (which joins back
-- against resources), which Postgres correctly refuses to evaluate
-- ("infinite recursion detected in policy"). A SECURITY DEFINER
-- function's internal queries run as the function owner (this migration
-- role, which owns these tables) and so never re-trigger the caller's own
-- RLS — the same reason search_resources() (20260101000007) can already
-- read across a whole library without recursing through per-row policies.
create or replace function public.resource_is_in_public_stack(p_resource_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.resource_stacks rs
    join public.stacks s on s.id = rs.stack_id
    where rs.resource_id = p_resource_id and s.visibility = 'public'
  );
$$;

create or replace function public.category_is_in_public_stack(p_category_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.resources r
    join public.resource_stacks rs on rs.resource_id = r.id
    join public.stacks s on s.id = rs.stack_id
    where r.category_id = p_category_id and s.visibility = 'public'
  );
$$;

create or replace function public.tag_is_in_public_stack(p_tag_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.resource_tags rt
    join public.resources r on r.id = rt.resource_id
    join public.resource_stacks rs on rs.resource_id = r.id
    join public.stacks s on s.id = rs.stack_id
    where rt.tag_id = p_tag_id and s.visibility = 'public'
  );
$$;

create policy "resources: select via public stack" on public.resources
  for select using (public.resource_is_in_public_stack(id));

-- resource_stacks only ever needs to reach `stacks` (which has no policy
-- referencing resource_stacks back) — no cycle risk, a plain join is fine.
create policy "resource_stacks: select via public stack" on public.resource_stacks
  for select using (exists (select 1 from public.stacks s where s.id = stack_id and s.visibility = 'public'));

create policy "categories: select via public stack resource" on public.categories
  for select using (public.category_is_in_public_stack(id));

create policy "tags: select via public stack resource" on public.tags
  for select using (public.tag_is_in_public_stack(id));

create policy "resource_tags: select via public stack" on public.resource_tags
  for select using (public.resource_is_in_public_stack(resource_id));

-- profiles: a public profile page needs to read the owning user's
-- username/name for any user who has at least one public stack — narrowly
-- scoped to exactly that condition, never "anyone can read all profiles."
create policy "profiles: select via public stack owner" on public.profiles
  for select using (
    exists (select 1 from public.stacks s where s.user_id = profiles.id and s.visibility = 'public')
  );
