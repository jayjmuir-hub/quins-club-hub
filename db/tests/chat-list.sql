-- Harness for db/migrations/20260824_chat_list.sql.
-- Run with `npm run db:check -- chat-list`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- Asserts against the LIVE policies and functions (the inlined migration copy
-- was removed 31 Aug 2026 — see the tombstone below). Cast borrowed from
-- squad-chat-phase3.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. PARENT (squad A only) sees exactly: squad A, Whole club, and no staff row
--  2. COACH sees squad A, squad A · staff, Whole club — and NOT squad B
--  3. a coach post in squad A: PARENT's squad row shows it as last, unread 1;
--     COACH's own row shows unread 0 (own post); a read row clears PARENT's
--  4. a DM PARENT -> PARENT2: both get a dm row; PARENT2 unread 1, PARENT 0;
--     nobody else sees it
--  5. newest first: after the DM, PARENT's first row is the dm
--  6. the author removes an hour-old message (no 15-minute limit on delete)
--  7. words cannot be edited after 15 minutes (the trigger refuses)
--  8. delete chat: cleared for the one who cleared it, intact for the other,
--     relisted with only the new message when the other writes again
--  9. an outsider cannot clear somebody else's conversation

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Chats Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000c5','U16B ZZ Probe', 1001),
 ('f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000c5','U10 ZZ Probe', 1002);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000d1','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Sixteen'),
 ('f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Nodob'),
 ('f0000000-0000-4000-8000-0000000000d3','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Childseven'),
 ('f0000000-0000-4000-8000-0000000000d4','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','Zz Probe Childeight');

insert into player_private (player_id, date_of_birth) values
 ('f0000000-0000-4000-8000-0000000000d1', current_date - interval '16 years');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000041','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000042','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','parent','active'),
 ('f0000000-0000-4000-8000-000000000043','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d3','parent','active'),
 ('f0000000-0000-4000-8000-000000000044','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','player','active'),
 ('f0000000-0000-4000-8000-000000000045','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d2','player','active'),
 ('f0000000-0000-4000-8000-000000000046','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000d4','parent','active'),
 ('f0000000-0000-4000-8000-000000000047','f0000000-0000-4000-8000-0000000000c5', null, null, 'admin','active');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-chats-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-chats-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-chats-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-chats-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ⚠️ TOMBSTONE — the inlined migration is GONE, deliberately (31 Aug 2026).
-- From 24 Aug this file replayed 20260824_chat_list.sql verbatim here: the
-- "message edit"/"message read" policies, touch_message, conversation_clears,
-- cleared_before, clear_conversation and my_chats. Two things were wrong with
-- that. First, the replay MASKED production — every assertion below ran
-- against the harness's own copy, so a live policy could regress and this
-- file would stay green. Second, it rotted: when 20260828_my_chats_last_attachment
-- (then voice, then mentions) changed my_chats' return row, the replay's
-- `create or replace` died on "cannot change return type of existing function"
-- and the harness was red about its own fixture. The assertions below now run
-- against the LIVE policies, triggers and functions, which is what a harness
-- on production is for. The migration file itself remains the record of the
-- DDL as shipped.

create function pg_temp.assert_chats() returns void language plpgsql as $fn$
declare
  n int; post_id uuid; conv uuid; r record; caught text;
  coach constant uuid := 'f0000000-0000-4000-8000-000000000041';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000043';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000046';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fe';
  squad_b constant uuid := 'f0000000-0000-4000-8000-0000000000ff';
begin
  -- 1
  perform pg_temp.as_user(parent::text);
  select count(*) into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: parent squad rows = %', n; end if;
  select count(*) into n from public.my_chats() where kind = 'club';
  if n <> 1 then raise exception 'ASSERT 1 FAILED: club rows = %', n; end if;
  select count(*) into n from public.my_chats() where kind = 'staff' or team_id = squad_b;
  reset role;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: parent sees % staff/other rows', n; end if;
  insert into _log(line) values ('1 parent: squad A, Whole club, nothing else');

  -- 2
  perform pg_temp.as_user(coach::text);
  select count(*) into n from public.my_chats() where kind = 'staff' and team_id = squad_a;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: coach staff rows = %', n; end if;
  select count(*) into n from public.my_chats() where team_id = squad_b;
  reset role;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: coach sees squad B'; end if;
  insert into _log(line) values ('2 coach: squad A, its staff channel, the club; not squad B');

  -- 3
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Kick-off moved to 10:30') returning id into post_id;
  select unread into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: author unread = %', n; end if;
  perform pg_temp.as_user(parent::text);
  select * into r from public.my_chats() where kind = 'squad' and team_id = squad_a;
  if r.unread <> 1 or r.last_body <> 'Kick-off moved to 10:30' then raise exception 'ASSERT 3 FAILED: parent unread % last %', r.unread, r.last_body; end if;
  insert into message_reads (message_id, profile_id) values (post_id, parent);
  select unread into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: after read unread = %', n; end if;
  insert into _log(line) values ('3 a coach post: last line and unread 1 for the parent, 0 for the author, 0 once read');

  -- 4
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Two seats held');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  reset role;
  if r.unread <> 0 then raise exception 'ASSERT 4 FAILED: sender unread = %', r.unread; end if;
  perform pg_temp.as_user(parent2::text);
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  reset role;
  if r.unread <> 1 or r.last_body <> 'Two seats held' then raise exception 'ASSERT 4 FAILED: recipient unread % last %', r.unread, r.last_body; end if;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from public.my_chats() where kind = 'dm';
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: outsider sees % dm rows', n; end if;
  insert into _log(line) values ('4 a DM: a row for each side, unread for the recipient only, invisible to anyone else');

  -- 5
  perform pg_temp.as_user(parent::text);
  select kind into r from public.my_chats() limit 1;
  reset role;
  if r.kind <> 'dm' then raise exception 'ASSERT 5 FAILED: first row is %', r.kind; end if;
  insert into _log(line) values ('5 newest first: the DM just sent is at the top');

  -- 6. the author removes an OLD message (older than 15 minutes)
  select id into post_id from messages where conversation_id = conv limit 1;
  -- backdate as postgres; touch_message freezes created_at, so step round it
  alter table messages disable trigger messages_touch;
  update messages set created_at = now() - interval '1 hour' where id = post_id;
  alter table messages enable trigger messages_touch;
  perform pg_temp.as_user(parent::text);
  update messages set deleted_at = now() where id = post_id;
  reset role;
  select count(*) into n from messages where id = post_id and deleted_at is not null and body = '(removed)';
  if n <> 1 then raise exception 'ASSERT 6 FAILED: author could not remove an hour-old message'; end if;
  insert into _log(line) values ('6 the author removes their own hour-old message');

  -- 7. ...but cannot EDIT words after 15 minutes (the limit moved into the trigger)
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Second thought') returning id into post_id;
  reset role;
  alter table messages disable trigger messages_touch;
  update messages set created_at = now() - interval '1 hour' where id = post_id;
  alter table messages enable trigger messages_touch;
  perform pg_temp.as_user(parent::text);
  begin update messages set body = 'Rewritten' where id = post_id; caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 7 FAILED: an hour-old message was edited'; end if;
  insert into _log(line) values ('7 words cannot be edited after 15 minutes: ' || caught);

  -- 8. PARENT2 deletes the chat for themselves: hidden from them, not from PARENT, back on a new message
  perform pg_temp.as_user(parent2::text);
  perform public.clear_conversation(conv);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: after clearing, parent2 still reads % message(s)', n; end if;
  select count(*) into n from public.my_chats() where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: cleared chat still listed'; end if;
  reset role;
  -- one transaction, one now(): nudge the clear back so the next message is after it
  update conversation_clears set cleared_at = cleared_at - interval '1 millisecond' where conversation_id = conv;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 2 then raise exception 'ASSERT 8 FAILED: the other side lost messages (% left)', n; end if;
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Still on for Saturday?');
  reset role;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from messages where conversation_id = conv;
  select * into r from public.my_chats() where conversation_id = conv;
  reset role;
  if n <> 1 then raise exception 'ASSERT 8 FAILED: after a new message parent2 reads % (want only the new one)', n; end if;
  if r.unread <> 1 or r.last_body <> 'Still on for Saturday?' then raise exception 'ASSERT 8 FAILED: relisted row unread % last %', r.unread, r.last_body; end if;
  insert into _log(line) values ('8 delete chat: gone for the one who deleted it, intact for the other, back from the next message');

  -- 9. an outsider cannot clear somebody else''s conversation
  perform pg_temp.as_user(outsider::text);
  begin perform public.clear_conversation(conv); caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 9 FAILED: outsider cleared a conversation'; end if;
  insert into _log(line) values ('9 only a participant can clear a conversation');
end $fn$;

select pg_temp.assert_chats();
select line from _log order by seq;

rollback;
