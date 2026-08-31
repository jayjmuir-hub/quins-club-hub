-- Harness for db/migrations/20260824_group_chats.sql.
-- Run with `npm run db:check -- group-chats`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- Asserts against the LIVE schema (the inlined migration copy was removed
-- 31 Aug 2026 — see the tombstone below). Cast borrowed from adult-dms-private.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. OWNER creates a 3-person group; members and the owner flag are right
--  2. a 2-person "group" is refused — the floor holds at birth
--  3. an outsider cannot be picked, and group_candidates agrees (with a
--     positive control: the MINOR is offered)
--  4. THE RULING: the MINOR joins with no opt-in, while dm_candidates still
--     refuses that same minor to their coach — both measured
--  5. an outsider sees nothing; a member (control) sees everything
--  6. a member can post; an outsider cannot
--  7. review fork: minor + NO report → admin blind; after a report → admin
--     reads and the overview lists it; adults + report → still private
--  8. rename is the owner's alone
--  9. leaving: above the floor the group survives; below it, an UNREPORTED
--     group closes for everyone, a REPORTED one is kept (evidence)
-- 10. my_chats lists a group with its title and member count, members only
-- 11. push fans out to the other members, never the author
-- 12. clear_conversation hides the past for the clearer only, until the
--     next message
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c6','ZZ Groupchat Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-owner@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-memb2@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000063','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-memb3@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000064','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000065','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000066','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-admin@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000067','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-groupchat-coach@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000c6','U10 ZZ Groupprobe', 1011),
 ('f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000c6','U16 ZZ Groupprobe', 1012),
 ('f0000000-0000-4000-8000-0000000000e3','f0000000-0000-4000-8000-0000000000c6','U7 ZZ Groupprobe', 1013);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000d5','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','Zz Probe Childone'),
 ('f0000000-0000-4000-8000-0000000000d6','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','Zz Probe Childtwo'),
 ('f0000000-0000-4000-8000-0000000000d7','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','Zz Probe Childthree'),
 ('f0000000-0000-4000-8000-0000000000d8','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e2','Zz Probe Fifteen'),
 ('f0000000-0000-4000-8000-0000000000d9','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e2','Zz Probe Sixteener'),
 ('f0000000-0000-4000-8000-0000000000da','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e3','Zz Probe Childseven');

-- d8 is 15: a minor by birthday, playing in a U16-band squad.
insert into player_private (player_id, date_of_birth) values
 ('f0000000-0000-4000-8000-0000000000d8', current_date - interval '15 years');

-- ⚠️ THE ADMIN HOLDS `welfare` — repointed 31 Aug 2026. 20260828_dm_review_welfare
-- moved group/DM review from every admin to the explicit welfare grant; a
-- plain admin persona can no longer read a reported group. The negative is
-- proven in db/tests/dm-review-welfare.sql.
insert into memberships (profile_id, club_id, team_id, player_id, role, status, admin_rights) values
 -- OWNER: parent in U10 and in U16 (second child), so OWNER shares a squad
 -- with the MINOR without being their guardian.
 ('f0000000-0000-4000-8000-000000000061','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000d7','parent','active', '{}'),
 ('f0000000-0000-4000-8000-000000000061','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000d9','parent','active', '{}'),
 ('f0000000-0000-4000-8000-000000000062','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000d5','parent','active', '{}'),
 ('f0000000-0000-4000-8000-000000000063','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000d6','parent','active', '{}'),
 ('f0000000-0000-4000-8000-000000000064','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000d8','player','active', '{}'),
 ('f0000000-0000-4000-8000-000000000065','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e3','f0000000-0000-4000-8000-0000000000da','parent','active', '{}'),
 ('f0000000-0000-4000-8000-000000000066','f0000000-0000-4000-8000-0000000000c6', null, null, 'admin','active', array['welfare']),
 ('f0000000-0000-4000-8000-000000000067','f0000000-0000-4000-8000-0000000000c6','f0000000-0000-4000-8000-0000000000e2', null, 'coach','active', '{}');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000061','https://push.example.invalid/zz-groupchat-owner','k','a'),
 ('f0000000-0000-4000-8000-000000000062','https://push.example.invalid/zz-groupchat-memb2','k','a'),
 ('f0000000-0000-4000-8000-000000000063','https://push.example.invalid/zz-groupchat-memb3','k','a'),
 ('f0000000-0000-4000-8000-000000000064','https://push.example.invalid/zz-groupchat-minor','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ⚠️ TOMBSTONE — the inlined 20260824_group_chats.sql is GONE, deliberately
-- (31 Aug 2026). It replayed ~700 lines of the migration verbatim here —
-- tables, thirteen functions, five policies — which masked production (every
-- assertion ran against the replay's copy, so a live regression stayed green)
-- and then rotted: my_chats' return row grew (attachments, voice, mentions)
-- and the replay's `create or replace` died on "cannot change return type of
-- existing function". The assertions below now run against the LIVE schema.
-- The migration file remains the record of the DDL as shipped.

create function pg_temp.assert_groupchats() returns void language plpgsql as $fn$
declare
  n int; caught text; d text; b boolean; t text;
  conv uuid; conv_adults uuid; conv_close uuid; conv_list uuid;
  msg uuid; msg_adults uuid; msg_list uuid;
  owner_id constant uuid := 'f0000000-0000-4000-8000-000000000061';
  memb2    constant uuid := 'f0000000-0000-4000-8000-000000000062';
  memb3    constant uuid := 'f0000000-0000-4000-8000-000000000063';
  minor    constant uuid := 'f0000000-0000-4000-8000-000000000064';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000065';
  admin    constant uuid := 'f0000000-0000-4000-8000-000000000066';
  coach    constant uuid := 'f0000000-0000-4000-8000-000000000067';
begin
  -- 1: create, members, owner flag
  perform pg_temp.as_user(owner_id::text);
  conv := public.create_group('Zz Probe Carpool', array[memb2, memb3]);
  reset role;
  select count(*) into n from conversation_members where conversation_id = conv;
  if n <> 3 then raise exception 'ASSERT 1 FAILED: % member row(s)', n; end if;
  select count(*) into n from conversation_members where conversation_id = conv and profile_id = owner_id and is_owner;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: creator is not the owner'; end if;
  insert into _log(line) values ('1 create_group: three rows, creator owns it');

  -- 2: the floor at birth
  perform pg_temp.as_user(owner_id::text);
  begin
    perform public.create_group('Zz Too Small', array[memb2]);
    caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is distinct from 'a group is three people or more' then
    raise exception 'ASSERT 2 FAILED: got %', coalesce(caught, 'no error');
  end if;
  insert into _log(line) values ('2 two people is a DM: create_group refuses');

  -- 3: outsider unpickable; candidates agree, with a positive control
  perform pg_temp.as_user(owner_id::text);
  begin
    perform public.create_group('Zz Strangers', array[memb2, outsider]);
    caught := null;
  exception when others then caught := sqlerrm; end;
  if caught is null then raise exception 'ASSERT 3 FAILED: an outsider was accepted'; end if;
  select count(*) into n from public.group_candidates() where profile_id = outsider;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: group_candidates offers the outsider'; end if;
  select count(*) into n from public.group_candidates() where profile_id = minor;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: control — the minor should be offered, got %', n; end if;
  insert into _log(line) values ('3 no shared squad, no pick — and the candidate list can find the minor it should offer');

  -- 4: THE RULING — the minor joins with no opt-in; dm_candidates still refuses them
  perform pg_temp.as_user(owner_id::text);
  perform public.add_group_members(conv, array[minor]);
  reset role;
  select count(*) into n from conversation_members where conversation_id = conv and profile_id = minor;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: the minor did not join'; end if;
  perform pg_temp.as_user(coach::text);
  select count(*) into n from public.dm_candidates() where profile_id = minor;
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: dm_candidates offers the un-opted-in minor to their coach'; end if;
  insert into _log(line) values ('4 the ruling, both halves: groups open to the minor, DMs still gated');

  -- 5: outsider blind, member sees (control)
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from conversations where id = conv;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: outsider sees the conversation'; end if;
  select count(*) into n from conversation_members where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: outsider sees % member row(s)', n; end if;
  b := public.conversation_involves_minor(conv);
  reset role;
  if b is not null then raise exception 'ASSERT 5 FAILED: involves_minor answered % to an outsider', b; end if;
  perform pg_temp.as_user(memb2::text);
  select count(*) into n from conversation_members where conversation_id = conv;
  b := public.conversation_involves_minor(conv);
  reset role;
  if n <> 4 then raise exception 'ASSERT 5 FAILED: control — member sees % member row(s)', n; end if;
  if b is distinct from true then raise exception 'ASSERT 5 FAILED: control — involves_minor = %', b; end if;
  insert into _log(line) values ('5 outsider sees nothing; a member sees all four and the true involves_minor');

  -- 6: members post, outsiders cannot
  perform pg_temp.as_user(memb2::text);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe: seats in the car Saturday') returning id into msg;
  reset role;
  perform pg_temp.as_user(outsider::text);
  begin
    insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe intrusion');
    caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is distinct from 'not your conversation' then
    raise exception 'ASSERT 6 FAILED: got %', coalesce(caught, 'no error');
  end if;
  insert into _log(line) values ('6 a member posts; an outsider is refused by the trigger');

  -- 7: the review fork — minor AND report, not OR
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 7 FAILED: admin reads an unreported group (% message(s))', n; end if;
  select count(*) into n from public.welfare_overview() where kind = 'group' and id = conv;
  if n <> 0 then raise exception 'ASSERT 7 FAILED: overview lists an unreported group'; end if;
  reset role;
  perform pg_temp.as_user(memb3::text);
  insert into message_reports (message_id, reason) values (msg, 'Zz probe report');
  reset role;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 1 then raise exception 'ASSERT 7 FAILED: after a report admin sees % message(s)', n; end if;
  select detail into d from public.welfare_overview() where kind = 'group' and id = conv;
  if d is distinct from 'Group · reported, involves a minor' then
    raise exception 'ASSERT 7 FAILED: overview detail = %', coalesce(d, '(absent)');
  end if;
  reset role;
  -- adults + report: still private
  perform pg_temp.as_user(owner_id::text);
  conv_adults := public.create_group('Zz Probe Adults', array[memb2, memb3]);
  reset role;
  perform pg_temp.as_user(memb2::text);
  insert into messages (conversation_id, channel, body) values (conv_adults, 'dm', 'Zz probe adults only') returning id into msg_adults;
  reset role;
  perform pg_temp.as_user(memb3::text);
  insert into message_reports (message_id, reason) values (msg_adults, 'Zz probe adults report');
  reset role;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where conversation_id = conv_adults;
  reset role;
  if n <> 0 then raise exception 'ASSERT 7 FAILED: admin reads a reported adults-only group (% message(s))', n; end if;
  insert into _log(line) values ('7 review needs a minor AND a report: blind before the report, reading after, adults stay private');

  -- 8: rename is the owner's alone
  perform pg_temp.as_user(memb2::text);
  update conversations set title = 'Zz Hijacked' where id = conv;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: a non-owner renamed the group'; end if;
  perform pg_temp.as_user(owner_id::text);
  update conversations set title = 'Zz Probe Renamed' where id = conv;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 8 FAILED: the owner could not rename (% row(s))', n; end if;
  select title into t from conversations where id = conv;
  if t is distinct from 'Zz Probe Renamed' then raise exception 'ASSERT 8 FAILED: title = %', t; end if;
  insert into _log(line) values ('8 rename: 0 rows for a member, 1 for the owner');

  -- 9: leaving — survive above the floor; close below it unless reported
  perform pg_temp.as_user(owner_id::text);
  conv_close := public.create_group('Zz Probe Closes', array[memb2, memb3]);
  reset role;
  perform pg_temp.as_user(minor::text);
  perform public.leave_group(conv);           -- 4 -> 3, survives
  reset role;
  select count(*) into n from conversation_members where conversation_id = conv;
  if n <> 3 then raise exception 'ASSERT 9 FAILED: % member(s) after one leaves a four', n; end if;
  perform pg_temp.as_user(memb3::text);
  perform public.leave_group(conv);           -- 3 -> 2, REPORTED: kept
  reset role;
  select count(*) into n from conversations where id = conv;
  if n <> 1 then raise exception 'ASSERT 9 FAILED: a reported group was deleted below the floor'; end if;
  select count(*) into n from messages where id = msg;
  if n <> 1 then raise exception 'ASSERT 9 FAILED: the reported message went with it'; end if;
  perform pg_temp.as_user(memb3::text);
  perform public.leave_group(conv_close);     -- 3 -> 2, unreported: closes
  reset role;
  select count(*) into n from conversations where id = conv_close;
  if n <> 0 then raise exception 'ASSERT 9 FAILED: an unreported group survived below the floor'; end if;
  insert into _log(line) values ('9 leave: survives at three, closes below it, evidence keeps a reported one alive');

  -- 10: my_chats lists groups for members only
  perform pg_temp.as_user(owner_id::text);
  conv_list := public.create_group('Zz Probe List', array[memb2, memb3]);
  select detail into d from public.my_chats() where kind = 'group' and conversation_id = conv_list;
  reset role;
  if d is distinct from '3 people' then raise exception 'ASSERT 10 FAILED: detail = %', coalesce(d, '(absent)'); end if;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from public.my_chats() where kind = 'group';
  reset role;
  if n <> 0 then raise exception 'ASSERT 10 FAILED: outsider''s list carries % group row(s)', n; end if;
  insert into _log(line) values ('10 my_chats: title and member count for members, nothing for outsiders');

  -- 11: push fans out to the other members, never the author
  perform pg_temp.as_user(owner_id::text);
  insert into messages (conversation_id, channel, body) values (conv_list, 'dm', 'Zz probe list hello') returning id into msg_list;
  reset role;
  select count(*) into n from public.message_push_subscriptions(msg_list)
   where endpoint in ('https://push.example.invalid/zz-groupchat-memb2',
                      'https://push.example.invalid/zz-groupchat-memb3');
  if n <> 2 then raise exception 'ASSERT 11 FAILED: % member subscription(s) returned', n; end if;
  select count(*) into n from public.message_push_subscriptions(msg_list)
   where endpoint = 'https://push.example.invalid/zz-groupchat-owner';
  if n <> 0 then raise exception 'ASSERT 11 FAILED: the author would be pushed'; end if;
  insert into _log(line) values ('11 push: both other members, not the author');

  -- 12: clear-for-me.
  -- ⚠️ Everything in this harness shares ONE transaction, so now() is a
  -- single constant and "last_at > cleared_at" could never be true. Real use
  -- has real clock gaps; the superuser backdates the pre-clear state to
  -- reintroduce them (replica mode, because touch_message pins created_at).
  set local session_replication_role = replica;
  update messages set created_at = created_at - interval '1 minute' where id = msg_list;
  update conversations set last_at = last_at - interval '1 minute' where id = conv_list;
  set local session_replication_role = origin;
  perform pg_temp.as_user(memb2::text);
  perform public.clear_conversation(conv_list);
  select count(*) into n from public.my_chats() where kind = 'group' and conversation_id = conv_list;
  if n <> 0 then raise exception 'ASSERT 12 FAILED: cleared group still listed'; end if;
  select count(*) into n from messages where conversation_id = conv_list;
  reset role;
  if n <> 0 then raise exception 'ASSERT 12 FAILED: clearer still reads % message(s)', n; end if;
  perform pg_temp.as_user(owner_id::text);
  select count(*) into n from messages where conversation_id = conv_list;
  if n <> 1 then raise exception 'ASSERT 12 FAILED: control — owner reads % message(s)', n; end if;
  reset role;
  -- The same one-clock problem, other direction: the clear and the next post
  -- share now(), so nudge the clear a moment earlier before the owner posts.
  update conversation_clears set cleared_at = cleared_at - interval '1 millisecond'
   where conversation_id = conv_list and profile_id = memb2;
  perform pg_temp.as_user(owner_id::text);
  insert into messages (conversation_id, channel, body) values (conv_list, 'dm', 'Zz probe after the clear');
  reset role;
  perform pg_temp.as_user(memb2::text);
  select count(*) into n from public.my_chats() where kind = 'group' and conversation_id = conv_list;
  if n <> 1 then raise exception 'ASSERT 12 FAILED: group did not reappear after a new message'; end if;
  select count(*) into n from messages where conversation_id = conv_list;
  reset role;
  if n <> 1 then raise exception 'ASSERT 12 FAILED: clearer reads % message(s) after the clear', n; end if;
  insert into _log(line) values ('12 clear: hidden for the clearer only, back with the next message');
end $fn$;

select pg_temp.assert_groupchats();

select line from _log order by seq;

rollback;
