-- Preserves the original Chrome/Firefox/Edge bookmark folder path for
-- imported resources (e.g. "Bookmarks bar / Development / Frontend"), so
-- it's available later for search, review, or improved organization —
-- without forcing it onto every resource card today.
alter table public.resources
  add column if not exists import_source text,
  add column if not exists import_folder text;
