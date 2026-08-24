-- Pinned chats and archive — chat round 6, the two ideas offered with the
-- navigation set and parked "for a later round"
-- (claude/plans/2026-08-24-chat-navigation.md); Jay's "keep going" picked
-- them up the same night. Both are PRIVATE, per-person preferences about
-- the shape of YOUR list — the nicknames pattern: owner-only policies, so
-- the table is invisible across accounts by construction.
--
-- ⚠️ THE KEY IS THE CLIENT'S ROW KEY, ON PURPOSE. A chat is one of five
-- kinds keyed by team_id, conversation_id or nothing (the club channel) —
-- a relational spelling needs two nullable FKs and a synthetic primary
-- key. A preference is not worth that: `chat_key` is the same
-- '<kind>-<id>' string the list already keys its rows by, and an orphaned
-- preference for a deleted chat is a no-op row nobody can see but its
-- owner. Owner rows cascade with the profile.
--
-- IDEMPOTENT: the harness (db/tests/chat-prefs.sql) inlines this file
-- verbatim against a database that may already carry it.
begin;

create table if not exists public.chat_prefs (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  chat_key    text not null check (length(chat_key) between 1 and 80),
  pinned      boolean not null default false,
  archived    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, chat_key)
);

alter table public.chat_prefs enable row level security;
grant select, insert, update, delete on public.chat_prefs to authenticated;
revoke all on public.chat_prefs from public, anon;

drop policy if exists "chat pref read own" on public.chat_prefs;
create policy "chat pref read own" on public.chat_prefs
  for select using (owner_id = (select auth.uid()));

drop policy if exists "chat pref write own" on public.chat_prefs;
create policy "chat pref write own" on public.chat_prefs
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "chat pref edit own" on public.chat_prefs;
create policy "chat pref edit own" on public.chat_prefs
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "chat pref remove own" on public.chat_prefs;
create policy "chat pref remove own" on public.chat_prefs
  for delete using (owner_id = (select auth.uid()));

commit;
