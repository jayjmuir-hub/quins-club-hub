-- Harness for db/migrations/20260831_group_chat_mentions.sql — APPLIED live;
-- this asserts the LIVE trigger, no inlining.
-- Run with `npm run db:check -- group-mentions`.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. a group message keeps a MEMBER's mention (positive control — a filter
--     that strips everything cannot pass this)
--  2. the same insert strips a NON-member and the author
--  3. a 1:1 DM's mentions are zeroed entirely
--  4. NO PUNCH-THROUGH (Jay's ruling, 31 Aug 2026): a mentioned member who
--     opted out of direct_messages pushes stays un-buzzed, while an
--     un-opted-out member is buzzed (control), and the author never is
--  5. SELF-TEST: make the outsider a member and prove check 2 goes red —
--     the probe demonstrably measures what the database stored
begin;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000001c0','ZZ Mentionprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000171','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-mention-owner@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000172','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-mention-memb2@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000173','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-mention-memb3@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000174','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-mention-outsider@example.invalid',now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000001e0','f0000000-0000-4000-8000-0000000001c0','U10 ZZ Mentionprobe', 1021);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000001d1','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','Zz Probe Mentionchild'),
 ('f0000000-0000-4000-8000-0000000001d2','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','Zz Probe Mentiontwo'),
 ('f0000000-0000-4000-8000-0000000001d3','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','Zz Probe Mentionthree'),
 ('f0000000-0000-4000-8000-0000000001d4','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','Zz Probe Mentionfour');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000171','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','f0000000-0000-4000-8000-0000000001d1','parent','active'),
 ('f0000000-0000-4000-8000-000000000172','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','f0000000-0000-4000-8000-0000000001d2','parent','active'),
 ('f0000000-0000-4000-8000-000000000173','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','f0000000-0000-4000-8000-0000000001d3','parent','active'),
 ('f0000000-0000-4000-8000-000000000174','f0000000-0000-4000-8000-0000000001c0','f0000000-0000-4000-8000-0000000001e0','f0000000-0000-4000-8000-0000000001d4','parent','active');

-- Devices for the push half. memb3 has a device AND an opt-out below.
insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000171','https://push.example.invalid/zz-mention-owner','k','a'),
 ('f0000000-0000-4000-8000-000000000172','https://push.example.invalid/zz-mention-memb2','k','a'),
 ('f0000000-0000-4000-8000-000000000173','https://push.example.invalid/zz-mention-memb3','k','a');
insert into notification_opt_outs (profile_id, category) values
 ('f0000000-0000-4000-8000-000000000173','direct_messages');

-- The group (owner, memb2, memb3) and a 1:1 DM (owner ↔ memb2), planted as
-- postgres — creation RPCs are proven by db/tests/group-chats.sql.
insert into conversations (id, club_id, kind, title, profile_a, profile_b, created_by) values
 ('f0000000-0000-4000-8000-0000000001a0','f0000000-0000-4000-8000-0000000001c0','group','Zz Mention Probe Group', null, null,
  'f0000000-0000-4000-8000-000000000171'),
 ('f0000000-0000-4000-8000-0000000001a1','f0000000-0000-4000-8000-0000000001c0','dm', null,
  'f0000000-0000-4000-8000-000000000171','f0000000-0000-4000-8000-000000000172',
  'f0000000-0000-4000-8000-000000000171');
insert into conversation_members (conversation_id, profile_id, is_owner) values
 ('f0000000-0000-4000-8000-0000000001a0','f0000000-0000-4000-8000-000000000171', true),
 ('f0000000-0000-4000-8000-0000000001a0','f0000000-0000-4000-8000-000000000172', false),
 ('f0000000-0000-4000-8000-0000000001a0','f0000000-0000-4000-8000-000000000173', false);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- The checks, callable twice: once clean, once after the injected fault.
-- _expect_outsider_stripped flips for the self-test.
create function pg_temp.checks(_tag text, _expect_outsider_stripped boolean) returns void
language plpgsql as $$
declare
  kept uuid[];
  buzzed text[];
begin
  -- 1+2: a member's mention survives; the outsider and the author are gone.
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000171');
  insert into messages (conversation_id, body, mentions) values
    ('f0000000-0000-4000-8000-0000000001a0', format('probe %s', _tag),
     array['f0000000-0000-4000-8000-000000000172',  -- member: keep
           'f0000000-0000-4000-8000-000000000174',  -- outsider: strip
           'f0000000-0000-4000-8000-000000000171'   -- author: strip
          ]::uuid[])
    returning mentions into kept;
  reset role;

  if not kept @> array['f0000000-0000-4000-8000-000000000172']::uuid[] then
    raise exception 'GROUP-MENTIONS(%): the MEMBER mention was stripped — the positive control failed, the filter eats everything', _tag;
  end if;
  if kept @> array['f0000000-0000-4000-8000-000000000171']::uuid[] then
    raise exception 'GROUP-MENTIONS(%): the AUTHOR survived their own mention', _tag;
  end if;
  if _expect_outsider_stripped and kept @> array['f0000000-0000-4000-8000-000000000174']::uuid[] then
    raise exception 'GROUP-MENTIONS(%): a NON-member mention survived into a group message', _tag;
  end if;
  if not _expect_outsider_stripped and not kept @> array['f0000000-0000-4000-8000-000000000174']::uuid[] then
    raise exception 'GROUP-MENTIONS(%): self-test expected the (now-member) outsider to be KEPT and it was stripped', _tag;
  end if;

  -- 3: a 1:1 DM zeroes mentions entirely.
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000171');
  insert into messages (conversation_id, body, mentions) values
    ('f0000000-0000-4000-8000-0000000001a1', format('dm probe %s', _tag),
     array['f0000000-0000-4000-8000-000000000172']::uuid[])
    returning mentions into kept;
  reset role;
  if coalesce(array_length(kept, 1), 0) <> 0 then
    raise exception 'GROUP-MENTIONS(%): a 1:1 DM kept a mention — the zeroing arm is gone', _tag;
  end if;

  -- 4: NO PUNCH-THROUGH. The last group message above mentions nobody
  -- opted-out; post one mentioning memb3 (opted out of direct_messages) and
  -- read who message_push_subscriptions would buzz.
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000171');
  insert into messages (conversation_id, body, mentions) values
    ('f0000000-0000-4000-8000-0000000001a0', format('push probe %s', _tag),
     array['f0000000-0000-4000-8000-000000000173']::uuid[]);
  reset role;
  select coalesce(array_agg(s.endpoint order by s.endpoint), '{}') into buzzed
    from public.message_push_subscriptions(
      (select id from messages where body = format('push probe %s', _tag))) s;
  if not ('https://push.example.invalid/zz-mention-memb2' = any(buzzed)) then
    raise exception 'GROUP-MENTIONS(%): the un-opted-out member was NOT buzzed — the push control failed', _tag;
  end if;
  if 'https://push.example.invalid/zz-mention-memb3' = any(buzzed) then
    raise exception 'GROUP-MENTIONS(%): a mention PUNCHED THROUGH the direct_messages opt-out — 31 Aug ruling violated', _tag;
  end if;
  if 'https://push.example.invalid/zz-mention-owner' = any(buzzed) then
    raise exception 'GROUP-MENTIONS(%): the author would be buzzed about their own message', _tag;
  end if;

  raise notice 'GROUP-MENTIONS(%): all checks passed.', _tag;
end $$;

select pg_temp.checks('clean', true);

-- ── SELF-TEST: inject the fault and prove the probe sees it ────────────────
-- Make the outsider a member. Their mention now legitimately SURVIVES, so
-- the clean-run expectation must go red — proving the outsider assertion
-- measures the stored row and is not vacuously green.
insert into conversation_members (conversation_id, profile_id, is_owner) values
 ('f0000000-0000-4000-8000-0000000001a0','f0000000-0000-4000-8000-000000000174', false);
do $$
begin
  perform pg_temp.checks('self-test-must-fail', true);
  raise exception 'GROUP-MENTIONS: SELF-TEST DID NOT FIRE — the outsider check is vacuous';
exception when others then
  if sqlerrm like '%SELF-TEST DID NOT FIRE%' then raise; end if;
  raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
end $$;
-- And the flipped expectation passes, so the survival was real, not an error.
select pg_temp.checks('outsider-now-member', false);

rollback;
