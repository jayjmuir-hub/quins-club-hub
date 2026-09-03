-- Harness for db/migrations/20260904_channel_seats_and_committee.sql.
-- Run with `npm run db:check -- channel-seats`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ⚠️ THE MIGRATION IS NOT INLINED HERE — it re-creates three long functions
-- verbatim (set_message_provenance, channel_members, my_chats) and a copy
-- would be a second thing to keep in step. This harness asserts the DEPLOYED
-- state and goes green only once the migration is applied; the 3 Sep 2026
-- pre-apply run pasted the migration body above this file's `begin;`.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- Personas: 30 super (no title) · 31 officer (head coach + Club Captain) ·
--           32 coach A (to be seated) · 33 plain admin (clubadmin + welfare) ·
--           35 coach B (never seated — the control)
--
--  1. Committee is titles only: the officer reads and posts; the SUPER reads
--     0 committee messages (control: the same super reads Club Staff)
--  2. the committee member sheet's reason is the title
--  3. a seat is additive: coach A reads 0 head-coach messages before the
--     seat, 1 after; coach B still 0 (control); sheet says "Seated by the
--     club — <reason>"
--  4. ⚠️ a plain admin's seat insert is refused; a coach's is refused
--  5. unseat → coach A reads 0 again
--  6. ⚠️ a seat in `welfare` grants the CHANNEL only: coach A gains the
--     welfare row in my_chats but can_review_dm stays false (control: the
--     admin holding the welfare right IS true)
--  7. the audit carries seated / unseated / seated, actor = the super
--  8. an invented channel key is refused by the CHECK
--  9. revoke the title → out of Committee the same instant (control: the
--     officer is still in Club Staff via the coach row)
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-000000000300','ZZ Seatprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select ('f0000000-0000-4000-8000-0000000003' || n::text)::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'zz-seat-' || n || '@example.invalid', now(), '{}'::jsonb, now(), now()
  from generate_series(30, 35) n;

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000301','f0000000-0000-4000-8000-000000000300','U15 ZZ Seatprobe', 1501);

insert into memberships (profile_id, club_id, team_id, role, status, is_super, is_head_coach, admin_rights) values
 ('f0000000-0000-4000-8000-000000000330','f0000000-0000-4000-8000-000000000300', null, 'admin', 'active', true,  false, array[]::text[]),
 ('f0000000-0000-4000-8000-000000000331','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301', 'coach', 'active', false, true,  array[]::text[]),
 ('f0000000-0000-4000-8000-000000000332','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301', 'coach', 'active', false, false, array[]::text[]),
 ('f0000000-0000-4000-8000-000000000333','f0000000-0000-4000-8000-000000000300', null, 'admin', 'active', false, false, array['clubadmin','welfare']),
 ('f0000000-0000-4000-8000-000000000335','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301', 'coach', 'active', false, false, array[]::text[]);

insert into club_officers (club_id, profile_id, title) values
 ('f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000331','Club Captain');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.assert_seats() returns void language plpgsql as $fn$
declare
  club    constant uuid := 'f0000000-0000-4000-8000-000000000300';
  super_  constant uuid := 'f0000000-0000-4000-8000-000000000330';
  officer constant uuid := 'f0000000-0000-4000-8000-000000000331';
  coacha  constant uuid := 'f0000000-0000-4000-8000-000000000332';
  plainad constant uuid := 'f0000000-0000-4000-8000-000000000333';
  coachb  constant uuid := 'f0000000-0000-4000-8000-000000000335';
  n int; n2 int; refused boolean; seat uuid; why text;
begin
  -- 1: the officer posts in Committee (and Club Staff, and Head Coaches as
  --    the head coach); the super reads Club Staff but NOT Committee
  perform pg_temp.as_user(officer::text);
  insert into messages (club_id, channel, body) values
    (club, 'committee',   'zz committee probe'),
    (club, 'clubstaff',   'zz staff probe'),
    (club, 'headcoaches', 'zz hc probe');
  select count(*) into n from messages x where x.club_id = club and x.channel = 'committee';
  reset role;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: the officer reads % committee messages, wanted 1', n; end if;
  perform pg_temp.as_user(super_::text);
  select count(*) into n  from messages x where x.club_id = club and x.channel = 'committee';
  select count(*) into n2 from messages x where x.club_id = club and x.channel = 'clubstaff';
  reset role;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: the super reads % committee messages without a title, wanted 0', n; end if;
  if n2 <> 1 then raise exception 'ASSERT 1 CONTROL FAILED: the super reads % Club Staff messages, wanted 1', n2; end if;
  insert into _log(line) values ('1 committee is titles only: officer posts and reads; super reads 0 (control: 1 in Club Staff)');

  -- 2: the sheet explains itself with the title
  perform pg_temp.as_user(officer::text);
  select cm.reason into why from public.channel_members('committee') cm where cm.profile_id = officer;
  reset role;
  if why is distinct from 'Club Captain' then raise exception 'ASSERT 2 FAILED: committee sheet reason = %, wanted Club Captain', why; end if;
  insert into _log(line) values ('2 committee sheet reason is the title');

  -- 3: a seat is additive
  perform pg_temp.as_user(coacha::text);
  select count(*) into n from messages x where x.club_id = club and x.channel = 'headcoaches';
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 BASELINE FAILED: coach A reads % head-coach messages before any seat', n; end if;
  perform pg_temp.as_user(super_::text);
  insert into channel_seats (club_id, profile_id, channel, reason)
    values (club, coacha, 'headcoaches', 'Club Captain, senior side') returning id into seat;
  reset role;
  perform pg_temp.as_user(coacha::text);
  select count(*) into n from messages x where x.club_id = club and x.channel = 'headcoaches';
  select cm.reason into why from public.channel_members('headcoaches') cm where cm.profile_id = coacha;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: seated coach A reads % head-coach messages, wanted 1', n; end if;
  if why is distinct from 'Seated by the club — Club Captain, senior side' then
    raise exception 'ASSERT 3 FAILED: seated reason = %', why; end if;
  perform pg_temp.as_user(coachb::text);
  select count(*) into n from messages x where x.club_id = club and x.channel = 'headcoaches';
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 CONTROL FAILED: unseated coach B reads % head-coach messages', n; end if;
  insert into _log(line) values ('3 seat is additive: coach A 0 -> 1 with the reason in the sheet; coach B still 0');

  -- 4: only a super seats
  refused := false;
  perform pg_temp.as_user(plainad::text);
  begin
    insert into channel_seats (club_id, profile_id, channel, reason) values (club, coachb, 'headcoaches', 'zz');
  exception when insufficient_privilege then refused := true;
  end;
  reset role;
  if not refused then raise exception 'ASSERT 4 FAILED: a plain admin seated someone'; end if;
  refused := false;
  perform pg_temp.as_user(coacha::text);
  begin
    insert into channel_seats (club_id, profile_id, channel, reason) values (club, coachb, 'headcoaches', 'zz');
  exception when insufficient_privilege then refused := true;
  end;
  reset role;
  if not refused then raise exception 'ASSERT 4 FAILED: a coach seated someone'; end if;
  insert into _log(line) values ('4 plain admin and coach both refused a seat insert');

  -- 5: unseat
  perform pg_temp.as_user(super_::text);
  delete from channel_seats s where s.id = seat;
  reset role;
  perform pg_temp.as_user(coacha::text);
  select count(*) into n from messages x where x.club_id = club and x.channel = 'headcoaches';
  reset role;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: unseated coach A still reads % head-coach messages', n; end if;
  insert into _log(line) values ('5 unseat: coach A back to 0');

  -- 6: a welfare seat is the channel only, never DM review
  perform pg_temp.as_user(super_::text);
  insert into channel_seats (club_id, profile_id, channel, reason) values (club, coacha, 'welfare', 'zz welfare probe');
  reset role;
  perform pg_temp.as_user(coacha::text);
  select count(*) into n from public.my_chats() c where c.kind = 'welfare';
  reset role;
  if n <> 1 then raise exception 'ASSERT 6 FAILED: welfare-seated coach A has % welfare rows in my_chats, wanted 1', n; end if;
  -- auth.uid() is still coach A here (the claim outlives reset role); the
  -- owner may call the private helper directly.
  if private.can_review_dm(club) then raise exception 'ASSERT 6 FAILED: a welfare SEAT granted DM review'; end if;
  perform pg_temp.as_user(plainad::text);
  reset role;
  if not private.can_review_dm(club) then raise exception 'ASSERT 6 CONTROL FAILED: the admin holding the welfare right cannot review'; end if;
  insert into _log(line) values ('6 welfare seat: channel yes, DM review no (control: the right holder reviews)');

  -- 7: the audit
  select count(*) into n from channel_seat_audit a where a.club_id = club;
  select count(*) into n2 from channel_seat_audit a where a.club_id = club and a.actor_id = super_;
  if n <> 3 or n2 <> 3 then raise exception 'ASSERT 7 FAILED: audit rows = % (by the super: %), wanted 3 and 3', n, n2; end if;
  select count(*) into n from channel_seat_audit a where a.club_id = club and a.action = 'unseated';
  if n <> 1 then raise exception 'ASSERT 7 FAILED: unseated rows = %, wanted 1', n; end if;
  insert into _log(line) values ('7 audit: seated, unseated, seated — all by the super');

  -- 8: the vocabulary is closed
  refused := false;
  perform pg_temp.as_user(super_::text);
  begin
    insert into channel_seats (club_id, profile_id, channel, reason) values (club, coachb, 'zz-nope', 'zz');
  exception when check_violation then refused := true;
  end;
  reset role;
  if not refused then raise exception 'ASSERT 8 FAILED: an invented channel key was accepted'; end if;
  insert into _log(line) values ('8 invented channel key refused by the CHECK');

  -- 9: lose the title, leave the Committee
  delete from club_officers o where o.profile_id = officer;
  perform pg_temp.as_user(officer::text);
  select count(*) into n  from public.my_chats() c where c.kind = 'committee';
  select count(*) into n2 from public.my_chats() c where c.kind = 'clubstaff';
  reset role;
  if n <> 0 then raise exception 'ASSERT 9 FAILED: title revoked but Committee row still present'; end if;
  if n2 <> 1 then raise exception 'ASSERT 9 CONTROL FAILED: the ex-officer lost Club Staff too (%), wanted 1', n2; end if;
  insert into _log(line) values ('9 title revoked: out of Committee the same instant (control: still in Club Staff)');
end $fn$;

select pg_temp.assert_seats();
select line from _log order by seq;
rollback;
