-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — junior play-up request/nominate. SAFE ON PRODUCTION: one
--  transaction, rolled back. `app.harness` = on so notify_junior_playup
--  sends nothing. Run with `npm run db:check -- junior-playup-request`
--  after 20260916_playup_requests is applied.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Invented people only. Uses the club's real U14B and U16B. Does not apply
-- the migration.

begin;
select set_config('app.harness', 'on', true);

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_home uuid; t_host uuid;
  u_super constant uuid := 'e0000000-0000-4000-8000-000000000041';
  u_hc    constant uuid := 'e0000000-0000-4000-8000-000000000042';
  u_assist constant uuid := 'e0000000-0000-4000-8000-000000000043';
  u_medic constant uuid := 'e0000000-0000-4000-8000-000000000044';
  u_mgr   constant uuid := 'e0000000-0000-4000-8000-000000000045';
  u_home_hc constant uuid := 'e0000000-0000-4000-8000-000000000046';
  p_child uuid; p_other uuid; n int; st text; req uuid;
begin
  if to_regprocedure('public.request_junior_playups(uuid[], uuid, text)') is null
     or to_regprocedure('public.nominate_junior_playups(uuid[], uuid, text)') is null
     or to_regprocedure('public.decide_playup_request(uuid, boolean, text)') is null
     or to_regprocedure('private.can_request_playup(uuid)') is null then
    raise exception 'play-up request RPCs are not on this database — apply db/migrations/20260916_playup_requests.sql';
  end if;
  if to_regprocedure('public.add_junior_playup(uuid, uuid)') is null then
    raise exception 'add_junior_playup is not on this database — apply 20260913 / 20260914 first';
  end if;

  select id into t_home from public.teams where club_id = club and is_senior is not true and name like 'U14B%' order by name limit 1;
  select id into t_host from public.teams where club_id = club and is_senior is not true and name like 'U16B%' order by name limit 1;
  if t_home is null or t_host is null then
    raise exception 'the club''s U14B / U16B squads have been renamed — repoint this harness';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pr-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_super, u_hc, u_assist, u_medic, u_mgr, u_home_hc]) as u on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email)
  select u, 'Playup Request Harness', 'pr-' || u || '@example.invalid'
    from unnest(array[u_super, u_hc, u_assist, u_medic, u_mgr, u_home_hc]) as u on conflict (id) do nothing;
  insert into public.players (club_id, team_id, full_name) values (club, t_home, 'Harness Request Alderton') returning id into p_child;
  insert into public.players (club_id, team_id, full_name) values (club, t_home, 'Harness Request Brackwood') returning id into p_other;
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id, is_super, is_head_coach) values
    (u_super, club, null, 'admin', 'active', null, true, false),
    (u_hc, club, t_host, 'coach', 'active', null, false, true),
    (u_assist, club, t_host, 'coach', 'active', null, false, false),
    (u_medic, club, t_host, 'medic', 'active', null, false, false),
    (u_mgr, club, t_host, 'manager', 'active', null, false, false),
    (u_home_hc, club, t_home, 'coach', 'active', null, false, true);

  perform set_config('role', 'authenticated', true);

  -- assistant coach (host) cannot request
  perform set_config('request.jwt.claims', json_build_object('sub', u_assist, 'role', 'authenticated')::text, true);
  begin
    perform public.request_junior_playups(array[p_child], t_host, null);
    insert into _r values ('1 ⚠️ an assistant coach cannot request a play-up', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('1 ⚠️ an assistant coach cannot request a play-up', 'PASS (42501)');
  end;

  -- medic cannot request
  perform set_config('request.jwt.claims', json_build_object('sub', u_medic, 'role', 'authenticated')::text, true);
  begin
    perform public.request_junior_playups(array[p_child], t_host, null);
    insert into _r values ('2 ⚠️ a medic cannot request a play-up', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('2 ⚠️ a medic cannot request a play-up', 'PASS (42501)');
  end;

  -- assistant cannot list source players
  perform set_config('request.jwt.claims', json_build_object('sub', u_assist, 'role', 'authenticated')::text, true);
  begin
    perform public.playup_source_players(t_home, t_host);
    insert into _r values ('3 ⚠️ an assistant coach cannot list request candidates', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('3 ⚠️ an assistant coach cannot list request candidates', 'PASS (42501)');
  end;

  -- head coach of HOST can request
  perform set_config('request.jwt.claims', json_build_object('sub', u_hc, 'role', 'authenticated')::text, true);
  perform public.request_junior_playups(array[p_child], t_host, 'Need cover this Saturday');
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.playup_requests
   where player_id = p_child and guest_team_id = t_host and status = 'requested' and kind = 'host_request';
  insert into _r values ('4 host head coach files a requested row (does not create a guest)',
    case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.memberships where player_id = p_child and team_id = t_host;
  insert into _r values ('5 ⚠️ a request does not twin a guest membership',
    case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- duplicate open request refused
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_hc, 'role', 'authenticated')::text, true);
  begin
    perform public.request_junior_playups(array[p_child], t_host, null);
    insert into _r values ('6 a second open request for the same player is refused', 'FAIL: allowed');
  exception when unique_violation then
    insert into _r values ('6 a second open request for the same player is refused', 'PASS (unique)');
  end;

  -- manager of HOST can request a different player
  perform set_config('request.jwt.claims', json_build_object('sub', u_mgr, 'role', 'authenticated')::text, true);
  perform public.request_junior_playups(array[p_other], t_host, null);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.playup_requests
   where player_id = p_other and guest_team_id = t_host and status = 'requested' and requested_by = u_mgr;
  insert into _r values ('7 age-group manager of the host can request',
    case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- home head coach can nominate — close the other player's request first so
  -- the unique open index is free, then re-file as a nomination.
  delete from public.playup_requests where player_id = p_other;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_home_hc, 'role', 'authenticated')::text, true);
  perform public.nominate_junior_playups(array[p_other], t_host, 'Ready for contact');
  perform set_config('role', 'postgres', true);
  select kind into st from public.playup_requests
   where player_id = p_other and guest_team_id = t_host and status = 'requested';
  insert into _r values ('8 home head coach nominates (kind home_nominate)',
    case when st = 'home_nominate' then 'PASS' else 'FAIL ' || coalesce(st, 'null') end);

  -- assistant of HOST cannot nominate from HOME
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_assist, 'role', 'authenticated')::text, true);
  begin
    perform public.nominate_junior_playups(array[p_child], t_host, null);
    insert into _r values ('9 ⚠️ host assistant cannot nominate a home player', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('9 ⚠️ host assistant cannot nominate a home player', 'PASS (42501)');
  end;

  -- super declines the first request
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  select id into req from public.playup_requests where player_id = p_child and status = 'requested';
  perform public.decide_playup_request(req, false, 'Already have numbers');
  perform set_config('role', 'postgres', true);
  select status into st from public.playup_requests where id = req;
  insert into _r values ('10 super admin decline closes the request',
    case when st = 'declined' then 'PASS' else 'FAIL ' || coalesce(st, 'null') end);
  select count(*) into n from public.memberships where player_id = p_child and team_id = t_host;
  insert into _r values ('11 decline does not create a guest',
    case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- assistant cannot approve
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_hc, 'role', 'authenticated')::text, true);
  select id into req from public.playup_requests where player_id = p_other and status = 'requested';
  begin
    perform public.decide_playup_request(req, true, null);
    insert into _r values ('12 ⚠️ a head coach cannot approve a request', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('12 ⚠️ a head coach cannot approve a request', 'PASS (42501)');
  end;

  -- super approves → add_junior_playup
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  perform public.decide_playup_request(req, true, null);
  perform set_config('role', 'postgres', true);
  select status into st from public.playup_requests where id = req;
  insert into _r values ('13 super admin approve marks the request approved',
    case when st = 'approved' then 'PASS' else 'FAIL ' || coalesce(st, 'null') end);
  select count(*) into n from public.memberships where player_id = p_other and team_id = t_host and status = 'active';
  insert into _r values ('14 approve calls add_junior_playup (guest row exists)',
    case when n > 0 then 'PASS' else 'FAIL ' || n end);

  perform set_config('role', 'postgres', true);
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'junior-playup-request: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
