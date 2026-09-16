-- Phase 15: personal organization suggestions for the Chrome extension.
--
-- Deterministic, no AI: aggregates the CALLING USER'S OWN existing
-- resources that share a domain, and returns the most common
-- category/stack/tags among them. `security invoker` (the default) means
-- this runs as the calling role, so RLS on resources/resource_stacks/
-- resource_tags/categories/stacks/tags still applies — the explicit
-- `user_id = auth.uid()` filters below are defense in depth on top of
-- that, not a substitute for it. No new tables, no new columns.
create or replace function public.suggest_resource_organization(p_domain text)
returns jsonb
language plpgsql
stable
as $$
declare
  domain_total int;
  category_suggestion jsonb;
  stack_suggestion jsonb;
  tag_suggestions jsonb;
begin
  if p_domain is null or length(trim(p_domain)) = 0 then
    return jsonb_build_object('domainTotal', 0, 'category', null, 'stack', null, 'tags', '[]'::jsonb);
  end if;

  select count(*) into domain_total
  from resources
  where user_id = auth.uid() and domain = p_domain;

  select jsonb_build_object('id', t.category_id, 'name', c.name, 'count', t.cnt)
  into category_suggestion
  from (
    select category_id, count(*) as cnt
    from resources
    where user_id = auth.uid() and domain = p_domain and category_id is not null
    group by category_id
    order by count(*) desc, category_id
    limit 1
  ) t
  join categories c on c.id = t.category_id;

  select jsonb_build_object('id', t.stack_id, 'name', s.name, 'icon', s.icon, 'count', t.cnt)
  into stack_suggestion
  from (
    select rs.stack_id, count(*) as cnt
    from resource_stacks rs
    join resources r on r.id = rs.resource_id
    where r.user_id = auth.uid() and r.domain = p_domain
    group by rs.stack_id
    order by count(*) desc, rs.stack_id
    limit 1
  ) t
  join stacks s on s.id = t.stack_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name, 'count', t.cnt) order by t.cnt desc, tg.name), '[]'::jsonb)
  into tag_suggestions
  from (
    select rt.tag_id, count(*) as cnt
    from resource_tags rt
    join resources r on r.id = rt.resource_id
    where r.user_id = auth.uid() and r.domain = p_domain
    group by rt.tag_id
    order by count(*) desc
    limit 5
  ) t
  join tags tg on tg.id = t.tag_id;

  return jsonb_build_object(
    'domainTotal', domain_total,
    'category', category_suggestion,
    'stack', stack_suggestion,
    'tags', tag_suggestions
  );
end;
$$;

grant execute on function public.suggest_resource_organization(text) to authenticated;
