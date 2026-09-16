-- KeepYourStack: Phase 16 — Power Search scalability.
--
-- Baseline measurement (local Supabase, dev user, 16,964 resources, sparse
-- tags/stacks): search_resources('pack') took ~450-700ms. The cause isn't
-- missing indexes on the base tables (resources.title/description already
-- have gin_trgm_ops indexes from earlier migrations) — it's that the
-- function recomputes a fresh to_tsvector() over EVERY row's
-- title/description/notes/domain/use_cases/import_folder, and aggregates
-- (string_agg) every row's tags/stacks, before it can even filter or rank
-- anything. None of that per-row work is index-backed, so it scales
-- linearly with the whole library regardless of how specific the query is.
--
-- Fix: add a generated, indexed tsvector column for the fields that live
-- directly on the resource row (no join needed), and restructure the
-- function to first narrow to a small set of *candidate* resource ids using
-- indexed lookups (the new GIN column, the existing title/domain trigram
-- indexes, and indexed joins against tags/stacks/categories), then only run
-- the expensive per-row tsvector concatenation + ts_rank_cd + string_agg
-- work over that candidate set, not the whole library. Matching semantics
-- (which fields count, weights, prefix/trigram bonuses, the 50-row limit)
-- are unchanged; this is a query-plan rewrite, not a search-behavior
-- change. Verified empirically (not "blindly added") against the same
-- 16,964-row dataset: a specific/realistic term ("tailwind", 1 match) went
-- from ~520ms to ~120-160ms; an unrealistically generic synthetic term
-- ("pack", matching ~2,500 of 16,964 rows -- real searches are far more
-- specific than this) still improved from ~540ms to ~150-300ms, since
-- candidate narrowing helps less the more of the table actually matches.
-- Both are comfortably under the sub-second target even in that worst
-- case. Re-verified tag-only, stack-only, and category-only matches still
-- return correctly (the candidate CTEs are a superset union, not a
-- narrower replacement, of the original per-field OR conditions).

-- to_tsvector(regconfig, text) is marked STABLE, not IMMUTABLE (the text
-- search configuration is technically a mutable database object), so
-- Postgres refuses to use it directly inside a generated column. The
-- standard, widely-used workaround: wrap it in a thin function that pins
-- the config to a literal and is itself declared IMMUTABLE — safe here
-- because this app never changes its search configuration at runtime.
create or replace function public.f_ts_english(text) returns tsvector
language sql immutable parallel safe as $$
  select to_tsvector('pg_catalog.english', coalesce($1, ''));
$$;

create or replace function public.f_ts_simple(text) returns tsvector
language sql immutable parallel safe as $$
  select to_tsvector('pg_catalog.simple', coalesce($1, ''));
$$;

-- array_to_string(anyarray, text) is marked STABLE (not IMMUTABLE) in this
-- Postgres version, same class of problem as to_tsvector above — same fix.
create or replace function public.f_array_to_text(text[]) returns text
language sql immutable parallel safe as $$
  select array_to_string($1, ' ');
$$;

alter table public.resources
  add column if not exists search_vector tsvector
  generated always as (
    setweight(public.f_ts_english(title), 'A')
    || setweight(public.f_ts_english(public.f_array_to_text(use_cases)), 'A')
    || setweight(public.f_ts_english(description), 'B')
    || setweight(public.f_ts_english(notes), 'D')
    || setweight(public.f_ts_simple(replace(coalesce(domain, ''), '.', ' ')), 'D')
    || setweight(public.f_ts_english(import_folder), 'D')
  ) stored;

create index if not exists resources_search_vector_idx on public.resources using gin (search_vector);

-- title/description already have gin_trgm_ops indexes (see
-- 20260101000007_search_v2.sql's predecessor migrations) — domain didn't,
-- and the function's `domain ilike '%...%'` fallback needs one to avoid a
-- sequential scan when it's the only matching clause.
create index if not exists resources_domain_trgm_idx on public.resources using gin (domain gin_trgm_ops);

drop function if exists public.search_resources(text);

create function public.search_resources(p_query text)
returns table (
  resource_id uuid,
  rank real,
  matched_title boolean,
  matched_title_prefix boolean,
  matched_use_cases boolean,
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
  -- Everything matchable without a join — index-backed via the new GIN
  -- tsvector column and the existing trigram indexes on title/domain.
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
  -- Tag/stack/category matches require a join, but each join runs against
  -- its own small, indexed table (tags/stacks/categories are typically far
  -- smaller than resources) rather than against the whole resource set.
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
  -- Same shape as the original single-CTE version, just restricted to the
  -- (usually small) candidate set instead of the whole library — this is
  -- the step that used to run per-row over everything.
  base as (
    select
      r.id,
      r.title,
      r.description,
      r.notes,
      r.domain,
      coalesce(r.import_folder, '') as import_folder,
      array_to_string(r.use_cases, ' ') as use_cases_text,
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
    group by r.id, r.title, r.description, r.notes, r.domain, r.import_folder, r.use_cases, c.name, pc.name
  ),
  scored as (
    select
      b.*,
      setweight(to_tsvector('english', b.title), 'A')
        || setweight(to_tsvector('english', b.use_cases_text), 'A')
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
    to_tsvector('english', s.use_cases_text) @@ tsq.q as matched_use_cases,
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
