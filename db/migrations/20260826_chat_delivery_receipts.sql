-- 26 Aug 2026 — WhatsApp-style ticks: sent / delivered / viewed.
-- Jay: "we also need delivered and viewed check marks for messages like
-- whatsapp has."
--
-- VIEWED already exists as data: message_reads, written when a person opens
-- the thread. What was missing:
--   1. DELIVERED — the recipient's device has RECEIVED the message without
--      necessarily opening it. New table below, same shape as message_reads.
--      The client writes it from the unread-badge fetch (useDockBadges →
--      countUnreadMessages), which every signed-in tab runs on mount and on
--      every realtime message event — so "delivered" genuinely means "their
--      app has it", not "they looked".
--   2. THE SENDER COULD NOT SEE EITHER TABLE. Both read policies were
--      own-rows-only, which is right for "what have I read" and useless for
--      ticks. Each table gains an AUTHOR arm: the author of a message may
--      read the receipt rows FOR THAT MESSAGE. Nothing else widens — a
--      third party still sees nothing.
--
-- ⚠️ ONLINE STATUS SHIPS IN THE SAME FEATURE AND DELIBERATELY HAS NO TABLE.
-- It is Supabase Realtime PRESENCE — ephemeral, gone when the tab closes,
-- never stored. A `last_seen` column was considered and rejected: it is a
-- location-adjacent fact about a person retained forever, and the club has
-- no need for it once the dot is gone.

create table if not exists public.message_deliveries (
  message_id   uuid        not null,
  profile_id   uuid        not null,
  delivered_at timestamptz not null default now(),
  constraint message_deliveries_pkey primary key (message_id, profile_id),
  constraint message_deliveries_message_id_fkey foreign key (message_id)
    references public.messages(id) on delete cascade,
  constraint message_deliveries_profile_id_fkey foreign key (profile_id)
    references public.profiles(id) on delete cascade
);

comment on table public.message_deliveries is
  'The recipient''s app has RECEIVED this message (WhatsApp''s second tick) - written by the client''s unread-badge fetch, not by opening the thread. message_reads is the third tick. The author of a message may read its receipt rows; everyone else sees only their own.';

alter table public.message_deliveries enable row level security;

-- Same INSERT shape as "message mark read": own rows only, and only for a
-- message the writer can see (RLS on messages scopes that EXISTS).
drop policy if exists "delivery record own" on public.message_deliveries;
create policy "delivery record own" on public.message_deliveries
  for insert
  with check (
    (profile_id = (select auth.uid()))
    and exists (select 1 from public.messages m where m.id = message_deliveries.message_id)
  );

drop policy if exists "delivery read own or author" on public.message_deliveries;
create policy "delivery read own or author" on public.message_deliveries
  for select
  using (
    (profile_id = (select auth.uid()))
    or exists (
      select 1 from public.messages m
       where m.id = message_deliveries.message_id
         and m.author_id = (select auth.uid())
    )
  );

revoke all on public.message_deliveries from anon;
grant select, insert on public.message_deliveries to authenticated;

-- The author arm on message_reads — a SECOND policy beside "message read own
-- reads" (policies OR together), so the existing own-rows behaviour is
-- untouched and the ticks can tell read from delivered.
drop policy if exists "message reads for author" on public.message_reads;
create policy "message reads for author" on public.message_reads
  for select
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_reads.message_id
         and m.author_id = (select auth.uid())
    )
  );

do $$
begin
  if (select count(*) from pg_policies where schemaname='public' and tablename='message_deliveries') <> 2 then
    raise exception 'ABORTING: expected 2 policies on message_deliveries.';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='message_reads') <> 3 then
    raise exception 'ABORTING: expected 3 policies on message_reads.';
  end if;
end $$;
