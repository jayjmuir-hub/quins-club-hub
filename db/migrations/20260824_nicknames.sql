-- Private nicknames — chat round 3, Jay, 24 Aug 2026 (night): "should be
-- able to create nicknames for people, not sure how this would work".
-- Ruled with him the same conversation: PRIVATE TO YOU, like renaming a
-- contact in your phone. Nobody else ever sees your labels, which is why
-- this needs no consent surface, no moderation queue, and no welfare
-- thinking — the group-wide alternative was parked for exactly that reason
-- (claude/plans/2026-08-24-chat-round-3-design.md).
--
-- One row per (owner, subject). The label is the owner's private business:
-- every policy is owner_id = auth.uid() and nothing else, so the table is
-- invisible across accounts by construction.
--
-- IDEMPOTENT: the harness (db/tests/nicknames.sql) inlines this file
-- verbatim against a database that may already carry it.
begin;

create table if not exists public.nicknames (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 40),
  created_at  timestamptz not null default now(),
  primary key (owner_id, profile_id)
);

alter table public.nicknames enable row level security;
grant select, insert, update, delete on public.nicknames to authenticated;
-- Supabase's default privileges can hand anon a grant on new tables;
-- revoke by name so the capture in db/schema/grants.sql states a fact.
revoke all on public.nicknames from public, anon;

drop policy if exists "nickname read own" on public.nicknames;
create policy "nickname read own" on public.nicknames
  for select using (owner_id = (select auth.uid()));

drop policy if exists "nickname write own" on public.nicknames;
create policy "nickname write own" on public.nicknames
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "nickname edit own" on public.nicknames;
create policy "nickname edit own" on public.nicknames
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "nickname remove own" on public.nicknames;
create policy "nickname remove own" on public.nicknames
  for delete using (owner_id = (select auth.uid()));

commit;
