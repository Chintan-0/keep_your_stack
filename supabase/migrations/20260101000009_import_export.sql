-- KeepYourStack Phase 11: migration, import & data portability.
--
-- Three additions, all additive — nothing existing is renamed or dropped:
--
-- 1. resources.import_source_id: the original record's own ID at the
--    source (a KeepYourStack backup's resource id, a Raindrop/Linkwarden
--    item id, etc.) — provenance only, never used for lookups or trust
--    decisions. Chrome/Firefox/Edge HTML bookmarks don't carry a stable
--    per-bookmark ID, so this stays null for those; a JSON backup import
--    is the main thing that populates it.
--
-- 2. remembered_import_mappings: "this folder path always means this
--    category" per user, so a repeat import of the same export doesn't
--    require re-deciding every folder. Matched by exact folder-path text
--    (case-sensitive on the stored value, matched case-insensitively at
--    query time) — never silently reapplied without the user having set
--    it explicitly at least once.
--
-- 3. import_history: a lightweight per-import record (counts + the
--    source file's name, never the file's own content) so a user can see
--    what they've imported before and roughly how it went, without this
--    table ever growing into a second copy of their library.
alter table public.resources
  add column if not exists import_source_id text;

create table if not exists public.remembered_import_mappings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_path text not null,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, folder_path)
);
create index if not exists remembered_import_mappings_user_id_idx on public.remembered_import_mappings (user_id);

alter table public.remembered_import_mappings enable row level security;
create policy "remembered_import_mappings: select own" on public.remembered_import_mappings
  for select using (auth.uid() = user_id);
create policy "remembered_import_mappings: insert own" on public.remembered_import_mappings
  for insert with check (auth.uid() = user_id);
create policy "remembered_import_mappings: update own" on public.remembered_import_mappings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remembered_import_mappings: delete own" on public.remembered_import_mappings
  for delete using (auth.uid() = user_id);

create table if not exists public.import_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  filename text,
  total integer not null default 0,
  imported integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  -- Small, bounded — the failed items' own title/url/reason, capped
  -- client-side to a reasonable count before this is written. Never the
  -- full imported file.
  failed_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_history_user_id_idx on public.import_history (user_id, created_at desc);

alter table public.import_history enable row level security;
create policy "import_history: select own" on public.import_history
  for select using (auth.uid() = user_id);
create policy "import_history: insert own" on public.import_history
  for insert with check (auth.uid() = user_id);
create policy "import_history: delete own" on public.import_history
  for delete using (auth.uid() = user_id);
