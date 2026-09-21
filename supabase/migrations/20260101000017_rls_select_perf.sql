-- KeepYourStack: Phase 15.6 — fix a real RLS performance bug found while
-- measuring Home dashboard load time.
--
-- resources/categories/tags/resource_tags each carry TWO permissive SELECT
-- policies (the original "select own" from early migrations, plus a
-- "select via public stack" policy added in 20260101000012 for Phase 13's
-- shareable stacks). Postgres combines multiple permissive policies for
-- the same command with OR, and — critically — the "select via public
-- stack" policy's expression (a SECURITY DEFINER function that joins
-- resource_stacks/stacks) is evaluated on the LEFT side of that OR, before
-- the cheap "auth.uid() = user_id" check. Boolean OR short-circuits
-- left-to-right, so Postgres was running the expensive join-backed
-- function for *every row*, even for the overwhelmingly common case of a
-- user reading their own resources — verified live with EXPLAIN ANALYZE
-- against a 16,964-resource account: every plain "list my resources"
-- query was a full Seq Scan evaluating that function per row, at
-- ~350-400ms for a query that should be a sub-millisecond indexed lookup.
--
-- Fix: merge each pair into a single policy with the cheap ownership
-- check written first, so the expensive public-stack check only runs for
-- rows that aren't the caller's own — which, in every real code path
-- today, is actually zero rows (see below), making this pure upside.
--
-- This changes nothing about *which rows are visible* — same access
-- control outcome, purely a performance restructuring of how the same
-- boolean condition is written and evaluated. Re-verified after this
-- migration: cross-user isolation still blocks (a second account can't
-- see the first's resources) and public Stack viewing still works
-- (getPublicStackBySlug and friends read via the service-role client,
-- which bypasses RLS entirely and was never affected by this either way —
-- these policies exist purely as defense-in-depth for a direct
-- anon/authenticated-key query, which the app doesn't currently make, but
-- kept intact rather than removed).

drop policy if exists "resources: select own" on public.resources;
drop policy if exists "resources: select via public stack" on public.resources;
create policy "resources: select own or via public stack" on public.resources
  for select using ((auth.uid() = user_id) or public.resource_is_in_public_stack(id));

drop policy if exists "categories: select own" on public.categories;
drop policy if exists "categories: select via public stack resource" on public.categories;
create policy "categories: select own or via public stack" on public.categories
  for select using ((auth.uid() = user_id) or public.category_is_in_public_stack(id));

drop policy if exists "tags: select own" on public.tags;
drop policy if exists "tags: select via public stack resource" on public.tags;
create policy "tags: select own or via public stack" on public.tags
  for select using ((auth.uid() = user_id) or public.tag_is_in_public_stack(id));

drop policy if exists "resource_tags: select via owned resource" on public.resource_tags;
drop policy if exists "resource_tags: select via public stack" on public.resource_tags;
create policy "resource_tags: select via owned resource or public stack" on public.resource_tags
  for select using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
    or public.resource_is_in_public_stack(resource_id)
  );

-- Same pair-of-permissive-policies pattern on resource_stacks (Phase
-- 15.6's audit found this one too, while fixing the others above) —
-- merged for the same reason, owned-resource check first.
drop policy if exists "resource_stacks: select via owned resource" on public.resource_stacks;
drop policy if exists "resource_stacks: select via public stack" on public.resource_stacks;
create policy "resource_stacks: select via owned resource or public stack" on public.resource_stacks
  for select using (
    exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
    or exists (select 1 from public.stacks s where s.id = stack_id and s.visibility = 'public')
  );

-- stacks and profiles have the same two-permissive-policies shape too.
-- Both sides here are cheap (no join/function on stacks; profiles' public
-- side is a single EXISTS against stacks), so the performance stakes are
-- lower than resources/categories/tags/resource_tags above — merged
-- anyway for consistency and because Postgres's order for combining
-- multiple permissive policies isn't something to rely on implicitly (the
-- resources case above measurably had the *expensive* side evaluated
-- first despite being the newer policy) — an explicit single USING
-- clause makes the intended order guaranteed, not incidental.
drop policy if exists "stacks: select own" on public.stacks;
drop policy if exists "stacks: select public" on public.stacks;
create policy "stacks: select own or public" on public.stacks
  for select using ((auth.uid() = user_id) or visibility = 'public');

drop policy if exists "profiles: select own" on public.profiles;
drop policy if exists "profiles: select via public stack owner" on public.profiles;
create policy "profiles: select own or via public stack" on public.profiles
  for select using (
    (auth.uid() = id)
    or exists (select 1 from public.stacks s where s.user_id = profiles.id and s.visibility = 'public')
  );
