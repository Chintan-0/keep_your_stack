-- KeepYourStack: dynamic, user-owned categories.
--
-- Previously `categories` was a single shared, read-only taxonomy (text
-- ids like "development"/"dev-frontend", seeded once via seed.sql) that no
-- user could create, rename, move, or delete. This migration turns it
-- into a normal per-user table — same self-referencing shape (parent_id
-- null = top-level "Category", parent_id set = "Subcategory"), just owned
-- and mutable like stacks/tags already are.
--
-- Existing category rows are copied into a scoped copy for every existing
-- auth user (rather than deleted), and every existing resource's
-- category_id is remapped to that user's own copy of the same category —
-- no resource ever loses its classification because of this migration.

-- ── 1. Build the new table shape alongside the old one ──────────────────
create table public.categories_new (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories_new (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Copy the old shared taxonomy into a scoped copy per existing user,
--       remembering (user_id, old_text_id) -> new_uuid so both parent_id
--       links and resources.category_id can be remapped afterward. ──────
create temporary table category_id_map (
  user_id uuid not null,
  old_id text not null,
  new_id uuid not null,
  primary key (user_id, old_id)
);

do $$
declare
  u record;
  c record;
  new_uuid uuid;
begin
  for u in select id from auth.users loop
    for c in select id, name from public.categories loop
      new_uuid := gen_random_uuid();
      insert into public.categories_new (id, user_id, name, parent_id, sort_order)
      values (new_uuid, u.id, c.name, null, 0);
      insert into category_id_map (user_id, old_id, new_id) values (u.id, c.id, new_uuid);
    end loop;

    update public.categories_new cn
    set parent_id = m2.new_id
    from public.categories co
    join category_id_map m1 on m1.old_id = co.id and m1.user_id = u.id
    join category_id_map m2 on m2.old_id = co.parent_id and m2.user_id = u.id
    where cn.id = m1.new_id and co.parent_id is not null;
  end loop;
end $$;

-- ── 3. Remap resources.category_id (text -> uuid) using the same map ────
alter table public.resources add column category_id_new uuid;
update public.resources r
set category_id_new = m.new_id
from category_id_map m
where m.user_id = r.user_id and m.old_id = r.category_id;

alter table public.resources drop column category_id;
alter table public.resources rename column category_id_new to category_id;

-- ── 4. Swap the tables ────────────────────────────────────────────────
drop table public.categories;
alter table public.categories_new rename to categories;

alter table public.resources
  add constraint resources_category_id_fkey foreign key (category_id) references public.categories (id) on delete set null;

create index categories_user_id_idx on public.categories (user_id);
create index categories_parent_id_idx on public.categories (parent_id);
-- Case-insensitive duplicate-name prevention among siblings — two
-- partial indexes because a plain unique index treats every null
-- parent_id as distinct from every other null (Postgres NULL semantics),
-- which would let a user create the same top-level name twice.
create unique index categories_unique_root_name on public.categories (user_id, lower(name)) where parent_id is null;
create unique index categories_unique_child_name on public.categories (user_id, parent_id, lower(name)) where parent_id is not null;
create index resources_category_idx on public.resources (category_id);

alter table public.categories enable row level security;

drop policy if exists "categories: read for everyone" on public.categories;
create policy "categories: select own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories: insert own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories: update own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories: delete own" on public.categories
  for delete using (auth.uid() = user_id);

-- ── 5. Seed the same default taxonomy for every NEW signup ──────────────
-- Mirrors src/lib/categories.ts — keep the two in sync if the default set
-- ever changes. Purely a starting point: every row it creates belongs to
-- that user like any other, and they can rename/move/delete it freely.
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  cat_dev uuid;
  cat_design uuid;
  cat_ai uuid;
  cat_utilities uuid;
begin
  insert into public.categories (user_id, name, parent_id, sort_order) values (p_user_id, 'Development', null, 0) returning id into cat_dev;
  insert into public.categories (user_id, name, parent_id, sort_order) values (p_user_id, 'Design', null, 1) returning id into cat_design;
  insert into public.categories (user_id, name, parent_id, sort_order) values (p_user_id, 'AI & ML', null, 2) returning id into cat_ai;
  insert into public.categories (user_id, name, parent_id, sort_order) values (p_user_id, 'Utilities', null, 3) returning id into cat_utilities;
  insert into public.categories (user_id, name, parent_id, sort_order) values (p_user_id, 'Learning', null, 4);

  insert into public.categories (user_id, name, parent_id, sort_order) values
    (p_user_id, 'Frontend', cat_dev, 0),
    (p_user_id, 'Backend', cat_dev, 1),
    (p_user_id, 'API Tools', cat_dev, 2),
    (p_user_id, 'Image Tools', cat_dev, 3),
    (p_user_id, 'DevOps', cat_dev, 4),
    (p_user_id, 'Database', cat_dev, 5),
    (p_user_id, 'UI Design', cat_design, 0),
    (p_user_id, 'Assets & Icons', cat_design, 1),
    (p_user_id, 'Models & Inference', cat_ai, 0),
    (p_user_id, 'Frameworks', cat_ai, 1),
    (p_user_id, 'Converters', cat_utilities, 0),
    (p_user_id, 'Formatters & Validators', cat_utilities, 1);
end;
$$;

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
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;
