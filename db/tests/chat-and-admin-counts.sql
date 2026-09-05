-- ══════════════════════════════════════════════════════════════════════════
--  COUNTS HARNESS — count_unread_messages, mark_unread_delivered,
--  count_admin_waiting (db/migrations/20260917_chat_and_admin_counts.sql)
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- The three functions replace arithmetic the browser used to do over whole
-- tables. The migration header carries the finding; this file carries the
-- proof that the SQL gives the SAME answers the JavaScript gave, and that it
-- runs as the caller — an author does not count their own posts, a coach
-- does not see the admin's number.
--
-- WHAT THIS ASSERTS
--
--   1. a parent with three fresh squad posts counts 3 unread
--   2. marking delivered adds 3 rows the first time …
--   3. … and 0 the second time — nothing is re-sent
--   4. a read receipt removes that post from the count
--   5. a post older than 14 days drops out
--   6. a deleted post drops out
--   7. CONTROL: the AUTHOR counts 0 — own posts are never unread
--   8. the admin's badge is waiting(1) + pending(1) + reports(2) = 4
--   9. CONTROL: an admin answering the in-progress report drops it → 3
--  10. CONTROL: dismissing the stranger drops them → 2
--  11. anon can execute none of the three
--
-- ⚠️ 7, 9, 10 AND 11 ARE NOT PADDING. Without 7 a count that ignores
-- `author_id` passes 1-6. Without 9 and 10 a badge that returns a constant
-- passes 8. Without 11 a function granted to `public` passes everything.
-- CLAUDE.md rule 6.
--
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   A   club admin (active, club-wide row)
--   K   coach of the probe squad — posts the messages
--   P   parent in the probe squad — reads them
--   W   parent whose membership is PENDING — one approval card
--   S   a stranger: profile, no membership, no request — "waiting"
--   D   a dismissed stranger: a BARE profile, auto-dismissed on signup — NOT waiting

insert into clubs (id, name) values
 ('c1000000-0000-4000-8000-0000000000c1','ZZ Counts Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('c1000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-admin@example.invalid',    now(), '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-coach@example.invalid',    now(), '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-parent@example.invalid',   now(), '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-0000000000a4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-pending@example.invalid',  now(), '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-0000000000a5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-stranger@example.invalid', now(), '{"full_name":"ZZ Counts Stranger"}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-0000000000a6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-counts-dismissed@example.invalid',now(), '{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('c1000000-0000-4000-8000-0000000000f1','c1000000-0000-4000-8000-0000000000c1','ZZ Counts Squad', 997);

insert into players (id, club_id, team_id, full_name) values
 ('c1000000-0000-4000-8000-0000000000e1','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000f1','ZZ Counts Childone'),
 ('c1000000-0000-4000-8000-0000000000e2','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000f1','ZZ Counts Childtwo');

-- ⚠️ THE ADMIN CARRIES THE `clubadmin` RIGHT. Under the admin split
-- (20260904_admin_team_reach) a bare admin row reaches no squad, so it cannot
-- see W's pending membership and the badge reads one short — which is what
-- the first run of this file measured. Same RLS the app's badge runs under.
insert into memberships (profile_id, club_id, team_id, player_id, role, status, admin_rights) values
 ('c1000000-0000-4000-8000-0000000000a1','c1000000-0000-4000-8000-0000000000c1', null, null,'admin','active', array['clubadmin']);
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('c1000000-0000-4000-8000-0000000000a2','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000f1', null,'coach','active'),
 ('c1000000-0000-4000-8000-0000000000a3','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000f1','c1000000-0000-4000-8000-0000000000e1','parent','active'),
 ('c1000000-0000-4000-8000-0000000000a4','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000f1','c1000000-0000-4000-8000-0000000000e2','parent','pending');

-- ⚠️ D NEEDS NO access_requests ROW OF ITS OWN, AND S NEEDS A NAME. A profile
-- created with no full_name is a bare signup, and private.hold_bare_signup
-- (20260829) dismisses it on the spot — so D, created bare above, is already
-- 'dismissed', while S carries a name in its metadata precisely so that it is
-- NOT. The first run of this file created S bare too, found it auto-dismissed,
-- and read "waiting = 0" as a defect in the function.

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── The messages: three squad posts by the coach ──────────────────────────

select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a2');
insert into messages (id, team_id, channel, body) values
 ('c1000000-0000-4000-8000-0000000000d1','c1000000-0000-4000-8000-0000000000f1','squad','Zz counts: post one'),
 ('c1000000-0000-4000-8000-0000000000d2','c1000000-0000-4000-8000-0000000000f1','squad','Zz counts: post two'),
 ('c1000000-0000-4000-8000-0000000000d3','c1000000-0000-4000-8000-0000000000f1','squad','Zz counts: post three');
reset role;

-- ── The reports: one new, one in progress with the reporter last, one in
--    progress with the admin last ────────────────────────────────────────

select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a3');
insert into feedback (id, kind, body) values
 ('c1000000-0000-4000-8000-0000000000b1','bug','Zz counts: new report'),
 ('c1000000-0000-4000-8000-0000000000b2','bug','Zz counts: reporter spoke last'),
 ('c1000000-0000-4000-8000-0000000000b3','bug','Zz counts: admin spoke last');
reset role;

update feedback set status = 'in-progress'
 where id in ('c1000000-0000-4000-8000-0000000000b2','c1000000-0000-4000-8000-0000000000b3');
insert into feedback_messages (feedback_id, club_id, author_id, body, created_at) values
 ('c1000000-0000-4000-8000-0000000000b2','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000a1','Looking into it', now() - interval '2 hours'),
 ('c1000000-0000-4000-8000-0000000000b2','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000a3','Still broken',    now() - interval '1 hour'),
 ('c1000000-0000-4000-8000-0000000000b3','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000a3','It happened again', now() - interval '2 hours'),
 ('c1000000-0000-4000-8000-0000000000b3','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000a1','Fixed on Monday',   now() - interval '1 hour');

-- ── 1-6: the parent's unread count, step by step ──────────────────────────

select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a3');
do $$
declare n integer;
begin
  n := public.count_unread_messages();
  insert into _r values ('01 three fresh posts unread', case when n = 3 then 'PASS' else 'FAIL ' || n end);

  n := public.mark_unread_delivered();
  insert into _r values ('02 first delivery marks 3', case when n = 3 then 'PASS' else 'FAIL ' || n end);

  n := public.mark_unread_delivered();
  insert into _r values ('03 second delivery marks 0', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  insert into message_reads (message_id, profile_id)
  values ('c1000000-0000-4000-8000-0000000000d1', 'c1000000-0000-4000-8000-0000000000a3');
  n := public.count_unread_messages();
  insert into _r values ('04 a read receipt removes one', case when n = 2 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

-- ⚠️ `messages_touch` FREEZES EVERY COLUMN BUT `body` ON UPDATE (see
-- db/schema/triggers.sql), so an ordinary update here would silently keep the
-- row fresh and steps 5-6 would measure the trigger, not the count — which is
-- what the first run of this file did. Disabled for the rest of this
-- transaction only; the rollback puts it back.
alter table messages disable trigger messages_touch;
update messages set created_at = now() - interval '20 days' where id = 'c1000000-0000-4000-8000-0000000000d2';
select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a3');
do $$
declare n integer;
begin
  n := public.count_unread_messages();
  insert into _r values ('05 an old post drops out', case when n = 1 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

update messages set deleted_at = now() where id = 'c1000000-0000-4000-8000-0000000000d3';
select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a3');
do $$
declare n integer;
begin
  n := public.count_unread_messages();
  insert into _r values ('06 a deleted post drops out', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

-- ── 7: CONTROL — the author never counts their own posts ──────────────────

update messages set deleted_at = null, created_at = now()
 where id in ('c1000000-0000-4000-8000-0000000000d2','c1000000-0000-4000-8000-0000000000d3');
select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a2');
do $$
declare n integer;
begin
  n := public.count_unread_messages();
  insert into _r values ('07 CONTROL author counts 0', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

-- ── 8-10: the admin badge ─────────────────────────────────────────────────

select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a1');
do $$
declare n integer;
begin
  n := public.count_admin_waiting();
  insert into _r values ('08 admin badge 1+1+2', case when n = 4 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

insert into feedback_messages (feedback_id, club_id, author_id, body) values
 ('c1000000-0000-4000-8000-0000000000b2','c1000000-0000-4000-8000-0000000000c1','c1000000-0000-4000-8000-0000000000a1','Answered');
select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a1');
do $$
declare n integer;
begin
  n := public.count_admin_waiting();
  insert into _r values ('09 CONTROL admin reply drops report', case when n = 3 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

insert into access_requests (profile_id, status) values
 ('c1000000-0000-4000-8000-0000000000a5','dismissed');
select pg_temp.as_user('c1000000-0000-4000-8000-0000000000a1');
do $$
declare n integer;
begin
  n := public.count_admin_waiting();
  insert into _r values ('10 CONTROL dismissal drops stranger', case when n = 2 then 'PASS' else 'FAIL ' || n end);
end $$;
reset role;

-- ── 11: anon holds nothing ────────────────────────────────────────────────

do $$
begin
  insert into _r values ('11 anon cannot execute',
    case when has_function_privilege('anon', 'public.count_unread_messages()', 'execute')
           or has_function_privilege('anon', 'public.mark_unread_delivered()', 'execute')
           or has_function_privilege('anon', 'public.count_admin_waiting()', 'execute')
         then 'FAIL' else 'PASS' end);
end $$;

-- ── The verdict ───────────────────────────────────────────────────────────

do $$
declare
  failures text;
  all_rows text;
begin
  select string_agg(step || ' -> ' || outcome, E'\n' order by step) into all_rows from _r;
  raise notice E'COUNTS HARNESS:\n%', all_rows;
  select string_agg(step || ' -> ' || outcome, '; ' order by step) into failures
    from _r where outcome not like 'PASS%';
  if failures is not null then
    raise exception 'COUNTS HARNESS: assertion(s) FAILED — %', failures;
  end if;
  raise notice 'COUNTS HARNESS: all 11 checks passed.';
end $$;

rollback;
