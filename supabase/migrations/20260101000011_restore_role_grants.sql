-- KeepYourStack: restore anon/authenticated/service_role grants.
--
-- Found live in production (§ incident, 2026-09-16): every API route
-- started returning "permission denied for table X" immediately after an
-- API-key rotation in the Supabase dashboard. That specific error is a
-- Postgres GRANT failure, evaluated BEFORE row level security ever runs —
-- distinct from an RLS policy denial (which returns zero rows, not an
-- error) and distinct from an invalid API key (which fails at the
-- Auth/PostgREST layer, before even reaching Postgres). The anon/
-- authenticated/service_role roles had lost their base table-level grants
-- entirely, which a key/JWT-secret rotation can apparently trigger on some
-- Supabase projects. This restores exactly the standard grants block every
-- new Supabase project bootstraps with — pure GRANTs, touches no data, and
-- is idempotent (safe to run again).
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
