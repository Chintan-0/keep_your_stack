-- KeepYourStack: resource enrichment provenance + status.
--
-- Lets automatic enrichment (metadata fetch + deterministic Useful-For/tag
-- rules — see src/lib/enrichment.ts) safely coexist with what a user typed
-- themselves: description/useful-for track who last set them, so a retry
-- or bulk re-enrichment can refill what's still empty/system-authored
-- without ever clobbering a manual edit. Tags need no such column — the
-- enrichment pipeline only ever adds tags (a set union), never replaces or
-- removes, so user-created tags can't be silently destroyed by design.
alter table public.resources
  add column if not exists description_source text check (description_source in ('system', 'user')),
  add column if not exists useful_for_source text check (useful_for_source in ('system', 'user')),
  add column if not exists enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending', 'enriched', 'partial', 'failed', 'user_completed')),
  add column if not exists enrichment_attempts integer not null default 0,
  add column if not exists enrichment_attempted_at timestamptz;

-- Existing rows (pre-dating this column) already have whatever description
-- a human or Phase-4/5 metadata fetch put there — treat it as user-owned
-- so this migration can't cause a later bulk-enrich to overwrite it.
update public.resources set description_source = 'user' where description_source is null and description <> '';
update public.resources set useful_for_source = 'user' where useful_for_source is null and array_length(use_cases, 1) > 0;
update public.resources set enrichment_status = 'enriched' where enrichment_status = 'pending' and (description <> '' or category_id is not null);
