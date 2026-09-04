-- Shared category taxonomy, mirroring src/lib/mock-data.ts categories[].
-- These are global (no user_id) and read-only from the client.
insert into public.categories (id, name, parent_id) values
  ('development', 'Development', null),
  ('dev-frontend', 'Frontend', 'development'),
  ('dev-backend', 'Backend', 'development'),
  ('dev-api', 'API Tools', 'development'),
  ('dev-web-images', 'Image Tools', 'development'),
  ('dev-devops', 'DevOps', 'development'),
  ('dev-database', 'Database', 'development'),
  ('design', 'Design', null),
  ('design-ui', 'UI Design', 'design'),
  ('design-assets', 'Assets & Icons', 'design'),
  ('ai', 'AI & ML', null),
  ('ai-models', 'Models & Inference', 'ai'),
  ('ai-frameworks', 'Frameworks', 'ai'),
  ('utilities', 'Utilities', null),
  ('utilities-converters', 'Converters', 'utilities'),
  ('utilities-formatters', 'Formatters & Validators', 'utilities'),
  ('learning', 'Learning', null)
on conflict (id) do update set name = excluded.name, parent_id = excluded.parent_id;
