-- Emoji reactions on messages — Jay, 24 Aug 2026 (evening): "emoji reactions
-- for messages would be nice to have", ruled "everywhere is fine": a reaction
-- lives exactly where its message lives — squad, staff, club, DM, group —
-- and is readable by exactly the people who can read the message. No new
-- audience machinery: the read policy defers to the MESSAGE's read policy by
-- running its subquery as the caller, so RLS on messages does the scoping.
--
-- A FIXED SET, not a picker: one tap, and the harness can enumerate it.
-- Toggle semantics live in the client (insert / delete own row); the primary
-- key makes a double-react a 23505 rather than a duplicate.
--
-- ⚠️ Realtime: subscribeMessages() watches the messages table only, so
-- reaction changes do NOT reload open screens by themselves — the UI half
-- subscribes to this table when it lands. Sketch:
-- claude/plans/2026-08-24-chat-feedback.md.
-- IDEMPOTENT: the harness (db/tests/message-reactions.sql) inlines this file
-- verbatim against a database that may already carry it.
begin;

create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '😂', '😮', '👏')),
  created_at  timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;
grant select, insert, delete on public.message_reactions to authenticated;

-- Readable wherever the MESSAGE is readable: the exists() runs as the
-- caller, so the messages read policy decides — squad visibility, staff
-- edit rights, DM/group participation, admin review, all of it, without
-- restating any of it here.
drop policy if exists "reaction read" on public.message_reactions;
create policy "reaction read" on public.message_reactions
  for select using (
    exists (select 1 from messages x where x.id = message_id));

-- Your own reaction, on a live message you can read.
drop policy if exists "reaction create" on public.message_reactions;
create policy "reaction create" on public.message_reactions
  for insert with check (
    profile_id = (select auth.uid())
    and exists (select 1 from messages x where x.id = message_id and x.deleted_at is null));

-- Un-react: your own row only.
drop policy if exists "reaction delete" on public.message_reactions;
create policy "reaction delete" on public.message_reactions
  for delete using (profile_id = (select auth.uid()));

commit;
