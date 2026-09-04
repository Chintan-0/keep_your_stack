-- KeepYourStack: Row Level Security
-- Every table a user can reach is locked down so a request can only ever
-- see or touch rows that belong to auth.uid(). Junction tables have no
-- user_id of their own, so their policies check ownership through the
-- resource/stack/tag they reference.

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.stacks enable row level security;
alter table public.tags enable row level security;
alter table public.resources enable row level security;
alter table public.resource_tags enable row level security;
alter table public.resource_stacks enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- No insert/delete policy: profile rows are created by the
-- handle_new_user trigger (runs as the trigger owner) and removed via the
-- auth.users cascade — never directly by a client.

-- ── categories ──────────────────────────────────────────────────────────
-- Shared, read-only taxonomy. Any authenticated (or anonymous) user can
-- read it; nothing but the service role (which bypasses RLS) can write.
create policy "categories: read for everyone" on public.categories
  for select using (true);

-- ── stacks ──────────────────────────────────────────────────────────────
create policy "stacks: select own" on public.stacks
  for select using (auth.uid() = user_id);
create policy "stacks: insert own" on public.stacks
  for insert with check (auth.uid() = user_id);
create policy "stacks: update own" on public.stacks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stacks: delete own" on public.stacks
  for delete using (auth.uid() = user_id);

-- ── tags ────────────────────────────────────────────────────────────────
create policy "tags: select own" on public.tags
  for select using (auth.uid() = user_id);
create policy "tags: insert own" on public.tags
  for insert with check (auth.uid() = user_id);
create policy "tags: update own" on public.tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags: delete own" on public.tags
  for delete using (auth.uid() = user_id);

-- ── resources ───────────────────────────────────────────────────────────
create policy "resources: select own" on public.resources
  for select using (auth.uid() = user_id);
create policy "resources: insert own" on public.resources
  for insert with check (auth.uid() = user_id);
create policy "resources: update own" on public.resources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resources: delete own" on public.resources
  for delete using (auth.uid() = user_id);

-- ── resource_tags ───────────────────────────────────────────────────────
-- Ownership is proven by owning the resource AND the tag being linked —
-- this stops a user from tagging their own resource with someone else's
-- tag id, or tagging a resource that isn't theirs.
create policy "resource_tags: select via owned resource" on public.resource_tags
  for select using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  );
create policy "resource_tags: insert via owned resource and tag" on public.resource_tags
  for insert with check (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = auth.uid())
  );
create policy "resource_tags: delete via owned resource" on public.resource_tags
  for delete using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  );

-- ── resource_stacks ─────────────────────────────────────────────────────
create policy "resource_stacks: select via owned resource" on public.resource_stacks
  for select using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  );
create policy "resource_stacks: insert via owned resource and stack" on public.resource_stacks
  for insert with check (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
    and exists (select 1 from public.stacks s where s.id = stack_id and s.user_id = auth.uid())
  );
create policy "resource_stacks: delete via owned resource" on public.resource_stacks
  for delete using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  );
