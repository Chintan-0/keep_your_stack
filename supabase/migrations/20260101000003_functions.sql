-- KeepYourStack: triggers + the search function.

-- ── updated_at maintenance ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.resources;
create trigger set_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.stacks;
create trigger set_updated_at before update on public.stacks
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── auto-create a profile row on signup ────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── search_resources ────────────────────────────────────────────────────
-- Full-text search (weighted: title/use_cases > tags/category >
-- stacks/description > notes) combined with trigram similarity on the
-- title so near-misses ("prisma" -> "Prisma", minor typos) still surface,
-- without letting weak fuzzy matches outrank a real text match. Returns
-- which fields actually matched so the UI can render an honest
-- "Matches: ..." explanation instead of a fabricated one.
--
-- Security: this is SECURITY DEFINER (it needs to run the aggregate joins
-- as the owner so it isn't bogged down re-checking RLS per row), which
-- means it does NOT take a user id parameter — that would let any caller
-- pass someone else's id and read their data. It always scopes to
-- auth.uid() internally, so a caller can only ever search their own
-- resources no matter what they pass over the client.
create or replace function public.search_resources(p_query text)
returns table (
  resource_id uuid,
  rank real,
  matched_title boolean,
  matched_use_cases boolean,
  matched_tags boolean,
  matched_category boolean,
  matched_stacks boolean,
  matched_description boolean,
  matched_notes boolean
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
      array_to_string(r.use_cases, ' ') as use_cases_text,
      coalesce(c.name, '') as category_name,
      coalesce(string_agg(distinct t.name, ' '), '') as tags_text,
      coalesce(string_agg(distinct s.name, ' '), '') as stacks_text
    from public.resources r
    left join public.categories c on c.id = r.category_id
    left join public.resource_tags rt on rt.resource_id = r.id
    left join public.tags t on t.id = rt.tag_id
    left join public.resource_stacks rs on rs.resource_id = r.id
    left join public.stacks s on s.id = rs.stack_id
    where r.user_id = auth.uid() and not r.is_archived
    group by r.id, r.title, r.description, r.notes, r.use_cases, c.name
  ),
  scored as (
    select
      b.*,
      setweight(to_tsvector('english', b.title), 'A')
        || setweight(to_tsvector('english', b.use_cases_text), 'A')
        || setweight(to_tsvector('english', b.tags_text), 'B')
        || setweight(to_tsvector('english', b.category_name), 'B')
        || setweight(to_tsvector('english', b.stacks_text), 'C')
        || setweight(to_tsvector('english', b.description), 'C')
        || setweight(to_tsvector('english', b.notes), 'D') as full_vector
    from base b
  )
  select
    s.id,
    (
      ts_rank_cd(s.full_vector, tsq.q)
      + greatest(similarity(s.title, p_query), word_similarity(p_query, s.title)) * 0.3
    )::real as rank,
    (to_tsvector('english', s.title) @@ tsq.q or s.title ilike '%' || p_query || '%') as matched_title,
    to_tsvector('english', s.use_cases_text) @@ tsq.q as matched_use_cases,
    to_tsvector('english', s.tags_text) @@ tsq.q as matched_tags,
    to_tsvector('english', s.category_name) @@ tsq.q as matched_category,
    to_tsvector('english', s.stacks_text) @@ tsq.q as matched_stacks,
    to_tsvector('english', s.description) @@ tsq.q as matched_description,
    to_tsvector('english', s.notes) @@ tsq.q as matched_notes
  from scored s, tsq
  where
    s.full_vector @@ tsq.q
    or similarity(s.title, p_query) > 0.25
    or s.title ilike '%' || p_query || '%'
  order by rank desc
  limit 50;
$$;

-- Callable by any authenticated user. It's SECURITY DEFINER (see the
-- function comment above), so it does NOT accept a user id parameter at
-- all — it reads auth.uid() itself — which is what actually prevents a
-- caller from ever seeing another user's resources here.
grant execute on function public.search_resources(text) to authenticated;
