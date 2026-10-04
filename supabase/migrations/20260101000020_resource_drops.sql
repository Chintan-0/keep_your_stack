-- KeepYourStack: Drops (Phase 2) — send one resource to one existing user.
--
-- Like resource_shares, a drop stores a snapshot of the public fields at send
-- time, so the recipient never reads the sender's live resource or notes.
-- The recipient is resolved server-side by exact (case-insensitive) email
-- match; the recipient's email is never stored on the drop or returned to the
-- sender.
--
-- The recipient may change only status/responded_at (column-level grant), so
-- they can't rewrite the snapshot the sender sent.

create table if not exists public.resource_drops (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  title text not null,
  url text not null,
  domain text not null,
  description text not null default '',
  tag_names text[] not null default '{}',
  pricing text,
  platform text[] not null default '{}',
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists resource_drops_recipient_idx on public.resource_drops (recipient_id, created_at desc);
create index if not exists resource_drops_sender_idx on public.resource_drops (sender_id, created_at desc);
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

alter table public.resource_drops enable row level security;

create policy "resource_drops_participant_select" on public.resource_drops
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "resource_drops_sender_insert" on public.resource_drops
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and status = 'pending'
    and (
      resource_id is null
      or exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
    )
  );

create policy "resource_drops_recipient_update" on public.resource_drops
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Supabase grants anon and authenticated full table privileges by default, and
-- table-level privileges override column-level grants, so revoke first.
-- Column-level grants: the recipient never reads resource_id or sender_id, and
-- neither participant reads recipient_id, so no internal UUIDs leave the database.
revoke all on public.resource_drops from anon, authenticated;
grant select (id, status, created_at, responded_at, title, url, domain, description, tag_names, pricing, platform, message)
  on public.resource_drops to authenticated;
grant insert (sender_id, recipient_id, resource_id, title, url, domain, description, tag_names, pricing, platform, message)
  on public.resource_drops to authenticated;
grant update (status, responded_at) on public.resource_drops to authenticated;
