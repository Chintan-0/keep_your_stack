-- KeepYourStack: where a category came from, and accurate stack counts.

-- Who set the category: the user, the deterministic rules, or the AI model.
alter table public.resources
  add column if not exists category_set_by text
  check (category_set_by in ('user', 'rules', 'ai'));

-- Member counts per stack over the caller's active resources. Runs as the
-- caller (invoker), so RLS still scopes it to their own rows.
create or replace function public.stack_resource_counts()
returns table (stack_id uuid, member_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select rs.stack_id, count(*)
  from public.resource_stacks rs
  join public.resources r on r.id = rs.resource_id
  where r.user_id = auth.uid() and not r.is_archived
  group by rs.stack_id;
$$;

grant execute on function public.stack_resource_counts() to authenticated;
