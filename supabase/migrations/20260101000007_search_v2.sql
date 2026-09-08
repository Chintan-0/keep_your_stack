-- KeepYourStack: Power Search (Phase 6).
--
-- Upgrades search_resources() in place (same function signature and
-- SECURITY DEFINER/RLS posture as the original — see
-- 20260101000003_functions.sql's comment, unchanged) rather than
-- introducing a parallel search system. Changes:
--
--   1. Reweighted fields per the phase spec's model:
--        A (very high): title, Useful For
--        B (high):      tags, description
--        C (medium):    category (+ its parent, so "development" finds
--                        Frontend-categorized resources too), stack
--        D (low):       personal note, domain, original import folder
--   2. Domain and import folder are now searchable at all (previously
--      not indexed) — "github" finds github.com resources, "frontend"
--      finds a bookmark imported from ".../Development/Frontend".
--   3. Explicit prefix-match boost ("react" ranks "React Bits" above a
--      resource that merely mentions react mid-sentence) on top of the
--      existing substring/trigram fallback.
--   4. Reports which fields matched — including the two new ones — so
--      the UI's "Why it matched" stays honest (generated from this real
--      data, never a separate hardcoded explanation).
-- The return row shape changed (new matched_* columns), which Postgres
-- won't let create-or-replace do in place — drop first.
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
      -- Parent's name folded in too, so a query for the parent
      -- ("development") still finds resources filed under one of its
      -- subcategories ("Frontend") without needing the child name.
      trim(coalesce(c.name, '') || ' ' || coalesce(pc.name, '')) as category_path_text,
      coalesce(string_agg(distinct t.name, ' '), '') as tags_text,
      coalesce(string_agg(distinct s.name, ' '), '') as stacks_text
    from public.resources r
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
      -- Prefix match ("react" -> "React Bits") beats a same-strength
      -- substring/fuzzy hit elsewhere in the title — a deliberately
      -- larger, separate bonus rather than folding it into the fuzzy term.
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

-- ── did-you-mean vocabulary ──────────────────────────────────────────────
-- Trigram similarity against the user's OWN real title/tag words — never a
-- generic dictionary — so a zero-result search like "grapql" can honestly
-- suggest "graphql" because that word actually exists in their library.
create or replace function public.search_suggest_terms(p_query text)
returns table (term text, similarity real)
language sql
stable
security definer set search_path = public
as $$
  with vocab as (
    select distinct lower(word) as word
    from (
      select unnest(string_to_array(r.title, ' ')) as word
      from public.resources r
      where r.user_id = auth.uid() and not r.is_archived
      union all
      select t.name
      from public.tags t
      where t.user_id = auth.uid()
    ) words
    where length(word) > 2
  )
  select v.word, similarity(v.word, p_query)
  from vocab v
  where similarity(v.word, p_query) > 0.3
  order by similarity(v.word, p_query) desc
  limit 5;
$$;

grant execute on function public.search_suggest_terms(text) to authenticated;
