-- KeepYourStack: remove the "Useful for" (use_cases) field.
--
-- search_vector is a generated column that reads use_cases, so it has to go
-- first, then be recreated without that term. search_resources is rebuilt
-- without the use_cases term and without its matched_use_cases output.

drop function if exists public.search_resources(text);

drop index if exists public.resources_search_vector_idx;

alter table public.resources drop column if exists search_vector;

alter table public.resources drop column if exists use_cases;
alter table public.resources drop column if exists useful_for_source;

alter table public.resources
  add column search_vector tsvector
  generated always as (
    setweight(public.f_ts_english(title), 'A')
    || setweight(public.f_ts_english(description), 'B')
    || setweight(public.f_ts_english(notes), 'D')
    || setweight(public.f_ts_simple(replace(coalesce(domain, ''), '.', ' ')), 'D')
    || setweight(public.f_ts_english(import_folder), 'D')
  ) stored;

create index resources_search_vector_idx on public.resources using gin (search_vector);

create function public.search_resources(p_query text)
returns table (
  resource_id uuid,
  rank real,
  matched_title boolean,
  matched_title_prefix boolean,
  matched_tags boolean,
  matched_category boolean,
  matched_stacks boolean,
  matched_description boolean,
  matched_notes boolean,
  matched_domain boolean,
  matched_folder boolean
)
language sql
stable
security definer set search_path = public
as $$
  with tsq as (
    select websearch_to_tsquery('english', p_query) as q
  ),
  local_candidates as (
    select r.id
    from public.resources r, tsq
    where r.user_id = auth.uid() and not r.is_archived
      and (
        r.search_vector @@ tsq.q
        or r.title ilike '%' || p_query || '%'
        or r.domain ilike '%' || p_query || '%'
        or similarity(r.title, p_query) > 0.25
      )
  ),
  tag_candidates as (
    select rt.resource_id as id
    from public.resource_tags rt
    join public.tags t on t.id = rt.tag_id
    join public.resources r on r.id = rt.resource_id, tsq
    where r.user_id = auth.uid() and not r.is_archived
      and to_tsvector('english', t.name) @@ tsq.q
  ),
  stack_candidates as (
    select rs.resource_id as id
    from public.resource_stacks rs
    join public.stacks s on s.id = rs.stack_id
    join public.resources r on r.id = rs.resource_id, tsq
    where r.user_id = auth.uid() and not r.is_archived
      and to_tsvector('english', s.name) @@ tsq.q
  ),
  category_candidates as (
    select r.id
    from public.resources r
    join public.categories c on c.id = r.category_id
    left join public.categories pc on pc.id = c.parent_id, tsq
    where r.user_id = auth.uid() and not r.is_archived
      and to_tsvector('english', trim(coalesce(c.name, '') || ' ' || coalesce(pc.name, ''))) @@ tsq.q
  ),
  candidate_ids as (
    select id from local_candidates
    union
    select id from tag_candidates
    union
    select id from stack_candidates
    union
    select id from category_candidates
  ),
  base as (
    select
      r.id,
      r.title,
      r.description,
      r.notes,
      r.domain,
      coalesce(r.import_folder, '') as import_folder,
      coalesce(c.name, '') as category_name,
      trim(coalesce(c.name, '') || ' ' || coalesce(pc.name, '')) as category_path_text,
      coalesce(string_agg(distinct t.name, ' '), '') as tags_text,
      coalesce(string_agg(distinct s.name, ' '), '') as stacks_text
    from public.resources r
    join candidate_ids ci on ci.id = r.id
    left join public.categories c on c.id = r.category_id
    left join public.categories pc on pc.id = c.parent_id
    left join public.resource_tags rt on rt.resource_id = r.id
    left join public.tags t on t.id = rt.tag_id
    left join public.resource_stacks rs on rs.resource_id = r.id
    left join public.stacks s on s.id = rs.stack_id
    where r.user_id = auth.uid() and not r.is_archived
    group by r.id, r.title, r.description, r.notes, r.domain, r.import_folder, c.name, pc.name
  ),
  scored as (
    select
      b.*,
      setweight(to_tsvector('english', b.title), 'A')
        || setweight(to_tsvector('english', b.tags_text), 'B')
        || setweight(to_tsvector('english', b.description), 'B')
        || setweight(to_tsvector('english', b.category_path_text), 'C')
        || setweight(to_tsvector('english', b.stacks_text), 'C')
        || setweight(to_tsvector('english', b.notes), 'D')
        || setweight(to_tsvector('simple', replace(b.domain, '.', ' ')), 'D')
        || setweight(to_tsvector('english', b.import_folder), 'D') as full_vector
    from base b
  )
  select
    s.id,
    (
      ts_rank_cd(s.full_vector, tsq.q)
      + (case when s.title ilike p_query || '%' then 0.5 else 0 end)
      + greatest(similarity(s.title, p_query), word_similarity(p_query, s.title)) * 0.3
      + (case when s.domain ilike '%' || p_query || '%' then 0.15 else 0 end)
    )::real as rank,
    (to_tsvector('english', s.title) @@ tsq.q or s.title ilike '%' || p_query || '%') as matched_title,
    (s.title ilike p_query || '%') as matched_title_prefix,
    to_tsvector('english', s.tags_text) @@ tsq.q as matched_tags,
    to_tsvector('english', s.category_path_text) @@ tsq.q as matched_category,
    to_tsvector('english', s.stacks_text) @@ tsq.q as matched_stacks,
    to_tsvector('english', s.description) @@ tsq.q as matched_description,
    to_tsvector('english', s.notes) @@ tsq.q as matched_notes,
    (s.domain ilike '%' || p_query || '%' or to_tsvector('simple', replace(s.domain, '.', ' ')) @@ tsq.q) as matched_domain,
    to_tsvector('english', s.import_folder) @@ tsq.q as matched_folder
  from scored s, tsq
  where
    s.full_vector @@ tsq.q
    or similarity(s.title, p_query) > 0.25
    or s.title ilike '%' || p_query || '%'
    or s.domain ilike '%' || p_query || '%'
  order by rank desc
  limit 50;
$$;

grant execute on function public.search_resources(text) to authenticated;
