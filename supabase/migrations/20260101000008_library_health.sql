-- KeepYourStack: Library Health (Phase 9).
--
-- Exact duplicates already can't exist — resources has a unique index on
-- (user_id, normalized_url) since Phase 3/4 — so this phase's "duplicate
-- detection" is about NEAR duplicates (different URLs, clearly the same
-- saved thing), computed on the fly from existing data (see
-- src/lib/duplicates.ts) rather than a stored table; no migration needed
-- for that half.
--
-- What genuinely needs storage is link-check history, kept in its own
-- normalized table rather than piling more columns onto resources.
create table public.resource_link_checks (
  resource_id uuid primary key references public.resources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('healthy', 'redirected', 'unavailable', 'timeout', 'blocked', 'unknown')),
  http_status integer,
  final_url text,
  redirect_count integer not null default 0,
  error text,
  consecutive_failures integer not null default 0,
  checked_at timestamptz
);
create index resource_link_checks_user_id_idx on public.resource_link_checks (user_id);

alter table public.resource_link_checks enable row level security;
create policy "resource_link_checks: select own" on public.resource_link_checks
  for select using (auth.uid() = user_id);
create policy "resource_link_checks: insert own" on public.resource_link_checks
  for insert with check (auth.uid() = user_id);
create policy "resource_link_checks: update own" on public.resource_link_checks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resource_link_checks: delete own" on public.resource_link_checks
  for delete using (auth.uid() = user_id);

-- Dismissing an issue in the review queue shouldn't bring it right back —
-- but any real edit to the resource (including a fresh link recheck)
-- clears this, since that's a natural point to re-evaluate. See
-- updateResource() and checkResourceLink() in src/lib/data.
alter table public.resources add column if not exists needs_review_dismissed boolean not null default false;
