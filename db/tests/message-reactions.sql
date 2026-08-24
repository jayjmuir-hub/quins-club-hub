-- Harness for db/migrations/20260824_message_reactions.sql.
-- Run with `npm run db:check -- message-reactions`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. a squadmate reacts; double-react is refused; an emoji off the menu is
--     refused; reacting AS somebody else is refused
--  2. an outsider neither sees nor adds reactions (with a seeing control)
--  3. you can un-react yourself, and only yourself
--  4. DM reactions follow the DM's own audience
--  5. a removed message takes no new reactions
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c8','ZZ Reactprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000081','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-react-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-react-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000083','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-react-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000084','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-react-parent2@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000c8','U8 ZZ Reactprobe', 1031),
 ('f0000000-0000-4000-8000-0000000000e6','f0000000-0000-4000-8000-0000000000c8','U9 ZZ Reactprobe', 1032);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000dc','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e5','Zz Probe Reactone'),
 ('f0000000-0000-4000-8000-0000000000dd','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e5','Zz Probe Reacttwo'),
 ('f0000000-0000-4000-8000-0000000000de','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e6','Zz Probe Reactthree');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000081','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e5', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000082','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000dc','parent','active'),
 ('f0000000-0000-4000-8000-000000000084','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000dd','parent','active'),
 ('f0000000-0000-4000-8000-000000000083','f0000000-0000-4000-8000-0000000000c8','f0000000-0000-4000-8000-0000000000e6','f0000000-0000-4000-8000-0000000000de','parent','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260824_message_reactions.sql, verbatim ──
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

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_reactions() returns void language plpgsql as $fn$
declare
  n int; caught text; msg uuid; dmsg uuid; conv uuid;
  coach    constant uuid := 'f0000000-0000-4000-8000-000000000081';
  parent   constant uuid := 'f0000000-0000-4000-8000-000000000082';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000083';
  parent2  constant uuid := 'f0000000-0000-4000-8000-000000000084';
begin
  -- 1: react, double-react, off-menu emoji, impersonation
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values ('f0000000-0000-4000-8000-0000000000e5','squad','Zz probe: training moved') returning id into msg;
  reset role;
  perform pg_temp.as_user(parent::text);
  insert into message_reactions (message_id, profile_id, emoji) values (msg, parent, '👍');
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (msg, parent, '👍');
    caught := null;
  exception when unique_violation then caught := 'dup'; end;
  if caught is distinct from 'dup' then raise exception 'ASSERT 1 FAILED: double-react was %', coalesce(caught, 'accepted'); end if;
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (msg, parent, '🔥');
    caught := null;
  exception when check_violation then caught := 'menu'; end;
  if caught is distinct from 'menu' then raise exception 'ASSERT 1 FAILED: off-menu emoji was %', coalesce(caught, 'accepted'); end if;
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (msg, coach, '❤️');
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 1 FAILED: reacting as somebody else was accepted'; end if;
  select count(*) into n from message_reactions where message_id = msg;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: % reaction row(s)', n; end if;
  insert into _log(line) values ('1 one tap, one row: duplicates, off-menu emoji and impersonation all refused');

  -- 2: the outsider
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from message_reactions where message_id = msg;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: outsider sees % reaction(s)', n; end if;
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (msg, outsider, '👏');
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 2 FAILED: outsider reacted to an unreadable message'; end if;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from message_reactions where message_id = msg;
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: control — squadmate sees % reaction(s)', n; end if;
  insert into _log(line) values ('2 outsider blind both ways; a squadmate (control) sees the tally');

  -- 3: un-react is yours alone
  perform pg_temp.as_user(coach::text);
  insert into message_reactions (message_id, profile_id, emoji) values (msg, coach, '👏');
  reset role;
  perform pg_temp.as_user(parent::text);
  delete from message_reactions where message_id = msg and profile_id = coach;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: deleted somebody else''s reaction'; end if;
  delete from message_reactions where message_id = msg and profile_id = parent;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: could not un-react (% row(s))', n; end if;
  insert into _log(line) values ('3 un-react removes your row and never anyone else''s');

  -- 4: DMs follow the DM's audience
  perform pg_temp.as_user(coach::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe dm line') returning id into dmsg;
  reset role;
  perform pg_temp.as_user(parent2::text);
  insert into message_reactions (message_id, profile_id, emoji) values (dmsg, parent2, '❤️');
  reset role;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from message_reactions where message_id = dmsg;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: outsider sees a DM reaction'; end if;
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (dmsg, outsider, '👍');
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 4 FAILED: outsider reacted in a DM'; end if;
  insert into _log(line) values ('4 a DM reaction lives and dies with the DM''s audience');

  -- 5: a removed message takes no new reactions
  perform pg_temp.as_user(coach::text);
  update messages set deleted_at = now() where id = msg;
  reset role;
  perform pg_temp.as_user(parent2::text);
  begin
    insert into message_reactions (message_id, profile_id, emoji) values (msg, parent2, '😮');
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 5 FAILED: reacted to a removed message'; end if;
  insert into _log(line) values ('5 a removed message takes no new reactions');
end $fn$;

select pg_temp.assert_reactions();

select line from _log order by seq;

rollback;
