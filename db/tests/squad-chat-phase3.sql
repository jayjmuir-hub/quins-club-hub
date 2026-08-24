-- ══════════════════════════════════════════════════════════════════════════
--  SQUAD CHAT PHASE 3 HARNESS — the staff channel, DMs, reports, welfare
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260823_squad_chat_phase3.sql.
--
-- THE CAST (squad A is U16B; squad B is U10)
--   COACH     coach of A
--   PARENT    parent of MINOR in A (the guardian)
--   PARENT2   another parent in A
--   MINOR     a self-registered U16 player in A, DOB 16 years ago
--   UNKNOWN   a self-registered player in A with NO date of birth
--   OUTSIDER  a parent in B
--   ADMIN     club admin, on no squad
--
-- WHAT THIS ASSERTS
--   1. staff channel: coach posts; parent cannot read it                <- the second stream
--   2. staff post pushes the squad's STAFF only (not the families)
--   3. parent ↔ parent in the same squad: can_dm                        <- Jay's ruling
--   4. parent ↔ outsider (no shared squad): cannot
--   5. minor ↔ guardian: can; parent2 ↔ minor: cannot                   <- the guardian line
--   6. coach ↔ minor: cannot until the guardian opts in; then can       <- the opt-in
--   7. the MINOR cannot set their own opt-in; the guardian can          <- who consents
--   8. unknown DOB is a minor: coach cannot, even with no opt-in row
--   9. minor ↔ minor: never
--  10. a DM message pushes the other side only; the audience is 1
--  11. a block stops a DM, both directions
--  12. an ADMIN can read a DM they are not in; PARENT2 cannot
--  13. an admin may REMOVE a DM message, not edit its words
--  14. a report stamps club/reporter; admins see it; a parent sees only their own
--  15. welfare_overview: rows for an admin; none for a parent
--  16. dm_candidates for the coach lists PARENT, PARENT2, ADMIN — not MINOR (no opt-in), not OUTSIDER
--
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Chat3 Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat3-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

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
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-chat3-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-chat3-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-chat3-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-chat3-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.can(_me uuid, _other uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.as_user(_me::text);
  r := private.can_dm(_other);
  reset role;
  return r;
end $$;

create function pg_temp.assert_chat3() returns void language plpgsql as $fn$
declare
  n int; caught text; q_before int; q_after int; post_id uuid; conv uuid; msg uuid; body_now text;
  coach constant uuid := 'f0000000-0000-4000-8000-000000000041';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000043';
  minor constant uuid := 'f0000000-0000-4000-8000-000000000044';
  unknown constant uuid := 'f0000000-0000-4000-8000-000000000045';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000046';
  admin constant uuid := 'f0000000-0000-4000-8000-000000000047';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fe';
  minor_player constant uuid := 'f0000000-0000-4000-8000-0000000000d1';
begin
  -- 1. staff channel
  select count(*) into q_before from net.http_request_queue;
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values (squad_a, 'staff', 'Selection for Saturday — thoughts?') returning id into post_id;
  reset role;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from messages where id = post_id;
  begin insert into messages (team_id, channel, body) values (squad_a, 'staff', 'hello?'); caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if n <> 0 or caught is null then raise exception 'ASSERT 1 FAILED: parent sees % staff row(s), post %', n, coalesce(caught,'accepted'); end if;
  insert into _log(line) values ('1 staff channel: coach posts; a parent can neither read nor post');

  -- 2. staff post pushes staff only
  select count(*) into q_after from net.http_request_queue;
  if q_after - q_before <> 1 then raise exception 'ASSERT 2 FAILED: % queued', q_after - q_before; end if;
  select count(*) into n from public.message_push_subscriptions(post_id);
  if n <> 0 then raise exception 'ASSERT 2 FAILED: staff post reached % device(s); the only other staff device is none (coach is author)', n; end if;
  insert into _log(line) values ('2 staff post queued one push; audience is the squad''s staff minus the author (0 here — no family device counted)');

  -- 3 & 4. adults
  if not pg_temp.can(parent, parent2) then raise exception 'ASSERT 3 FAILED'; end if;
  insert into _log(line) values ('3 parent <-> parent in the same squad: can_dm');
  if pg_temp.can(parent, outsider) then raise exception 'ASSERT 4 FAILED'; end if;
  insert into _log(line) values ('4 parent <-> a parent in another squad: cannot');

  -- 5. guardian
  if not pg_temp.can(parent, minor) or not pg_temp.can(minor, parent) then raise exception 'ASSERT 5 FAILED: guardian'; end if;
  if pg_temp.can(parent2, minor) then raise exception 'ASSERT 5 FAILED: non-guardian parent reached the minor'; end if;
  insert into _log(line) values ('5 minor <-> own guardian: can, both ways; another parent <-> minor: cannot');

  -- 6. coach needs the opt-in
  if pg_temp.can(coach, minor) then raise exception 'ASSERT 6 FAILED: coach reached the minor before opt-in'; end if;
  perform pg_temp.as_user(parent::text);
  update player_private set staff_dm_opt_in = true where player_id = minor_player;
  reset role;
  select count(*) into n from player_private where player_id = minor_player and staff_dm_opt_in and staff_dm_opt_in_by = parent and staff_dm_opt_in_at is not null;
  if n <> 1 then raise exception 'ASSERT 6 FAILED: opt-in not recorded with who/when'; end if;
  if not pg_temp.can(coach, minor) or not pg_temp.can(minor, coach) then raise exception 'ASSERT 6 FAILED: coach still cannot after opt-in'; end if;
  insert into _log(line) values ('6 coach <-> U16 minor: cannot before the guardian opts in; can after, recorded by/at');

  -- 7. the minor cannot consent for themselves
  perform pg_temp.as_user(minor::text);
  begin update player_private set staff_dm_opt_in = false where player_id = minor_player; caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  select count(*) into n from player_private where player_id = minor_player and staff_dm_opt_in;
  if n <> 1 then raise exception 'ASSERT 7 FAILED: the minor changed their own opt-in'; end if;
  insert into _log(line) values ('7 the minor cannot change the opt-in (' || coalesce(left(caught, 50), 'silently ignored') || ')');

  -- 8. unknown DOB is a minor
  if pg_temp.can(coach, unknown) then raise exception 'ASSERT 8 FAILED: unknown DOB treated as adult'; end if;
  insert into _log(line) values ('8 a player with no date of birth is a minor: coach cannot');

  -- 9. minor <-> minor never
  if pg_temp.can(minor, unknown) then raise exception 'ASSERT 9 FAILED'; end if;
  insert into _log(line) values ('9 minor <-> minor: never');

  -- 10. a DM pushes the other side only
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  select count(*) into q_before from net.http_request_queue;
  insert into messages (conversation_id, body) values (conv, 'Lift on Saturday?') returning id into msg;
  reset role;
  select count(*) into q_after from net.http_request_queue;
  if q_after - q_before <> 1 then raise exception 'ASSERT 10 FAILED: % queued', q_after - q_before; end if;
  select count(*) into n from public.message_push_subscriptions(msg);
  if n <> 1 then raise exception 'ASSERT 10 FAILED: audience %', n; end if;
  select count(*) into n from public.message_push_subscriptions(msg) s where s.endpoint like '%parent2';
  if n <> 1 then raise exception 'ASSERT 10 FAILED: audience is not parent2'; end if;
  -- the same conversation from the other side resolves to the same row
  perform pg_temp.as_user(parent2::text);
  if public.open_conversation(parent) <> conv then raise exception 'ASSERT 10 FAILED: a second conversation row'; end if;
  reset role;
  insert into _log(line) values ('10 a DM queues one push to the other side only; open_conversation is symmetric');

  -- 11. a block stops it both ways
  perform pg_temp.as_user(parent2::text);
  insert into dm_blocks (blocker_id, blocked_id) values (parent2, parent);
  reset role;
  if pg_temp.can(parent, parent2) or pg_temp.can(parent2, parent) then raise exception 'ASSERT 11 FAILED'; end if;
  perform pg_temp.as_user(parent::text);
  begin insert into messages (conversation_id, body) values (conv, 'still there?'); caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 11 FAILED: message accepted after block'; end if;
  perform pg_temp.as_user(parent2::text);
  delete from dm_blocks where blocker_id = parent2;
  reset role;
  insert into _log(line) values ('11 a block refuses the DM both ways, and an existing conversation stops accepting messages');

  -- 12. admin reads, parent2-not-in-it does not (use a minor<->guardian DM)
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(minor);
  insert into messages (conversation_id, body) values (conv, 'Bring your boots.') returning id into msg;
  reset role;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where id = msg;
  reset role;
  if n <> 1 then raise exception 'ASSERT 12 FAILED: admin cannot read the DM'; end if;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from messages where id = msg;
  reset role;
  if n <> 0 then raise exception 'ASSERT 12 FAILED: a non-participant parent read the DM'; end if;
  perform pg_temp.as_user(admin::text);
  perform public.log_welfare_access(conv);
  reset role;
  select count(*) into n from welfare_access_log where conversation_id = conv and admin_id = admin;
  if n <> 1 then raise exception 'ASSERT 12 FAILED: access not logged'; end if;
  insert into _log(line) values ('12 an admin can read a DM they are not in (and the open is logged); another parent cannot');

  -- 13. admin may remove, not edit
  perform pg_temp.as_user(admin::text);
  begin update messages set body = 'rewritten' where id = msg; caught := null; exception when others then caught := sqlerrm; end;
  if caught is null then reset role; raise exception 'ASSERT 13 FAILED: admin rewrote a DM'; end if;
  update messages set deleted_at = now() where id = msg;
  reset role;
  select body into body_now from messages where id = msg;
  if body_now <> '(removed)' then raise exception 'ASSERT 13 FAILED: remove did not blank (%)', body_now; end if;
  insert into _log(line) values ('13 an admin may remove a DM message (blanked), not edit its words');

  -- 14. reports
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, body) values (conv, 'Second message') returning id into msg;
  insert into message_reports (message_id, reason) values (msg, 'testing the report route');
  select count(*) into n from message_reports;
  reset role;
  if n <> 1 then raise exception 'ASSERT 14 FAILED: reporter sees % own report(s)', n; end if;
  select count(*) into n from message_reports r where r.message_id = msg and r.reporter_id = parent and r.club_id = 'f0000000-0000-4000-8000-0000000000c5';
  if n <> 1 then raise exception 'ASSERT 14 FAILED: provenance not stamped'; end if;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from message_reports;
  reset role;
  if n <> 0 then raise exception 'ASSERT 14 FAILED: another parent sees the report'; end if;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from message_reports where resolved_at is null;
  update message_reports set resolved_at = now() where message_id = msg;
  reset role;
  select count(*) into n from message_reports where message_id = msg and resolved_by = admin;
  if n <> 1 then raise exception 'ASSERT 14 FAILED: resolve not stamped'; end if;
  insert into _log(line) values ('14 a report is stamped, visible to its reporter and to admins, and resolving stamps the resolver');

  -- 15. welfare overview
  -- ⚠️ REPOINTED 24 Aug 2026. This asserted `n < 2` — BOTH DMs listed — and
  -- was written before the 23 Aug adult-DMs-private ruling narrowed the
  -- overview to REVIEWABLE conversations only (a minor involved, or
  -- reported). The minor<->guardian DM qualifies; the adult<->adult one must
  -- now be ABSENT, and that absence is the ruling working — asserted in both
  -- directions rather than deleted (CLAUDE.md rule 7).
  -- msg is done with after assert 14; it carries the adult DM's id here.
  select c.id into msg from conversations c
   where (c.profile_a = parent and c.profile_b = parent2)
      or (c.profile_a = parent2 and c.profile_b = parent);
  perform pg_temp.as_user(admin::text);
  select count(*) into n from public.welfare_overview() o where o.kind = 'dm' and o.id = conv;
  reset role;
  if n <> 1 then raise exception 'ASSERT 15 FAILED: the minor DM is not on the overview'; end if;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from public.welfare_overview() o where o.kind = 'dm' and o.id = msg;
  reset role;
  if n <> 0 then raise exception 'ASSERT 15 FAILED: an adult-only unreported DM is on the overview'; end if;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from public.welfare_overview();
  reset role;
  if n <> 0 then raise exception 'ASSERT 15 FAILED: a parent got % overview row(s)', n; end if;
  insert into _log(line) values ('15 welfare_overview: rows for an admin (DMs flagged when a minor is involved); none for a parent');

  -- 16. candidates for the coach: parent, parent2, admin, and the opted-in minor; never outsider or unknown
  perform pg_temp.as_user(coach::text);
  select count(*) into n from public.dm_candidates() where profile_id in (parent, parent2, admin, minor);
  if n <> 4 then reset role; raise exception 'ASSERT 16 FAILED: coach candidates %', n; end if;
  select count(*) into n from public.dm_candidates() where profile_id in (outsider, unknown);
  reset role;
  if n <> 0 then raise exception 'ASSERT 16 FAILED: outsider or unknown-DOB minor offered'; end if;
  insert into _log(line) values ('16 dm_candidates for the coach: the squad''s adults, the admin, the opted-in minor; never the outsider or the no-DOB player');
end $fn$;

select pg_temp.assert_chat3();

select line from _log order by seq;

-- ⚠️ NOT OPTIONAL. A club, seven people, four players, DMs, a report and queued
-- pushes all went into production above.
rollback;
