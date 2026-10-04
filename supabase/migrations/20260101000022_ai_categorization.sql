-- KeepYourStack: opt-in AI categorization.
--
-- Off by default. When a user turns it on, enrichment may send a saved page's
-- title, domain, URL, and description to the model provider to suggest a
-- category and tags. Notes, stacks, and identity are never sent.

alter table public.profiles
  add column if not exists ai_categorization_enabled boolean not null default false;
