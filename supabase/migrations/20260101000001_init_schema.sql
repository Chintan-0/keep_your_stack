-- KeepYourStack: core schema
-- Extensions needed for fuzzy/trigram search and UUID generation.
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ── profiles ────────────────────────────────────────────────────────────
-- One row per auth.users row, created automatically by a trigger (see
-- 20260101000003_functions.sql). Holds display data the app needs beyond
-- what auth.users exposes.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── categories ──────────────────────────────────────────────────────────
-- Shared taxonomy, not user-owned. Nested via parent_id. Seeded once
-- (see supabase/seed.sql) and only ever written by service-role tooling —
-- RLS below grants read-only access to authenticated users.
create table if not exists public.categories (
  id text primary key,
  name text not null,
  parent_id text references public.categories (id) on delete set null
);
create index if not exists categories_parent_id_idx on public.categories (parent_id);

-- ── stacks ──────────────────────────────────────────────────────────────
create table if not exists public.stacks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  icon text not null default '📦',
  color text not null default 'accent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stacks_user_id_idx on public.stacks (user_id);

-- ── tags ────────────────────────────────────────────────────────────────
-- User-specific (per spec) — the same word can exist independently for
-- different users, so uniqueness is scoped to (user_id, name).
create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists tags_user_id_idx on public.tags (user_id);

-- ── resources ───────────────────────────────────────────────────────────
create table if not exists public.resources (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  url text not null,
  -- Server-computed (see the metadata/resources routes) normalized form
  -- used for duplicate detection. Never trust a client-supplied value.
  normalized_url text not null,
  domain text not null default '',
  description text not null default '',
  favicon_url text,
  image_url text,
  resource_type text,
  pricing text check (pricing in ('free', 'freemium', 'paid', 'open-source')),
  platform text[] not null default '{}',
  use_cases text[] not null default '{}',
  notes text not null default '',
  category_id text references public.categories (id) on delete set null,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);
create index if not exists resources_user_id_idx on public.resources (user_id);
create index if not exists resources_user_favorite_idx on public.resources (user_id, is_favorite) where is_favorite;
create index if not exists resources_user_archived_idx on public.resources (user_id, is_archived);
create index if not exists resources_category_idx on public.resources (category_id);
create index if not exists resources_title_trgm_idx on public.resources using gin (title gin_trgm_ops);
create index if not exists resources_description_trgm_idx on public.resources using gin (description gin_trgm_ops);

-- ── resource_tags (junction) ───────────────────────────────────────────
create table if not exists public.resource_tags (
  resource_id uuid not null references public.resources (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (resource_id, tag_id)
);
create index if not exists resource_tags_tag_id_idx on public.resource_tags (tag_id);

-- ── resource_stacks (junction) ─────────────────────────────────────────
create table if not exists public.resource_stacks (
  resource_id uuid not null references public.resources (id) on delete cascade,
  stack_id uuid not null references public.stacks (id) on delete cascade,
  primary key (resource_id, stack_id)
);
create index if not exists resource_stacks_stack_id_idx on public.resource_stacks (stack_id);
