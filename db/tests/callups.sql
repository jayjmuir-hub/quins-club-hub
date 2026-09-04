-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — U18 call-ups: the list, the ask, the answer, the end, and who
--  is refused. SAFE ON PRODUCTION: one transaction, rolled back, and
--  `app.harness` = on so private.push_to_profiles sends nothing.
--  Run with `npm run db:check -- callups`.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260906_callups.sql. Measured on the 3–4 Sep 2026 dry run.
-- Uses the club's real 1st XV, U18B and Senior Women squads; every person
-- and player is synthetic.

begin;
select set_config('app.harness', 'on', true);

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_men1 uuid; t_u18 uuid; t_women uuid;
  u_coach constant uuid := 'd0000000-0000-4000-8000-000000000021';
  u_parent constant uuid := 'd0000000-0000-4000-8000-000000000022';
  u_other constant uuid := 'd0000000-0000-4000-8000-000000000023';
  u_woman constant uuid := 'd0000000-0000-4000-8000-000000000024';
  p_minor uuid; p_young uuid; p_other uuid; p_woman uuid; req record; n int; st text;
begin
  select id into t_men1 from public.teams where name = 'Senior Men - 1st XV';
  select id into t_u18 from public.teams where name = 'U18B';
  select id into t_women from public.teams where name = 'Senior Women';
  if t_men1 is null or t_u18 is null or t_women is null then
    raise exception 'the club''s squads have been renamed — repoint this harness';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cu-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_coach, u_parent, u_other, u_woman]) as u on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email)
  select u, 'Callup Harness', 'cu-' || u || '@example.invalid' from unnest(array[u_coach, u_parent, u_other, u_woman]) as u on conflict (id) do nothing;
  insert into public.players (club_id, team_id, full_name) values (club, t_u18, 'Harness Seventeen') returning id into p_minor;
  insert into public.players (club_id, team_id, full_name) values (club, t_u18, 'Harness Sixteen') returning id into p_young;
  insert into public.players (club_id, team_id, full_name) values (club, t_u18, 'Harness Other') returning id into p_other;
  insert into public.players (club_id, team_id, full_name) values (club, t_women, 'Harness Woman') returning id into p_woman;
  insert into public.player_private (player_id, date_of_birth) values
    (p_minor, current_date - interval '17 years 6 months'),
    (p_young, current_date - interval '16 years 11 months'),
    (p_other, current_date - interval '17 years 2 months');
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
    (u_coach, club, t_men1, 'coach', 'active', null),
    (u_parent, club, t_u18, 'parent', 'active', p_minor),
    (u_other, club, t_u18, 'parent', 'active', p_other),
    (u_woman, club, t_women, 'player', 'active', p_woman);

  -- ── the senior coach ─────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  select string_agg(full_name || '=' || state, ',' order by full_name) into st from public.callup_candidates(t_men1) where full_name like 'Harness%';
  insert into _r values ('1 the list shows the 17-year-olds, by name and state, and not the 16-year-old',
    case when st = 'Harness Other=consent_needed,Harness Seventeen=consent_needed' then 'PASS' else 'FAIL ' || coalesce(st, 'null') end);
  select * into req from public.request_callup(p_minor, t_men1);
  insert into _r values ('2 the ask is recorded as requested', case when req.status = 'requested' then 'PASS' else 'FAIL ' || req.status end);
  begin
    perform public.request_callup(p_young, t_men1);
    insert into _r values ('3 ⚠️ a player under the floor cannot be asked for', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('3 ⚠️ a player under the floor cannot be asked for', 'PASS (42501)');
  end;

  -- ── the wrong parent ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  begin
    perform public.answer_callup(req.id, true);
    insert into _r values ('4 ⚠️ another child''s parent cannot answer', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('4 ⚠️ another child''s parent cannot answer', 'PASS (42501)');
  end;

  -- ── the family ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_parent, 'role', 'authenticated')::text, true);
  select count(*) into n from public.callup_requests;
  insert into _r values ('5 the family reads the request', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select * into req from public.answer_callup(req.id, true);
  insert into _r values ('6 yes records consent', case when req.status = 'consented' then 'PASS' else 'FAIL ' || req.status end);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.memberships where profile_id = u_parent and team_id = t_men1 and player_id = p_minor;
  insert into _r values ('7 yes twins the family''s membership into the senior squad', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.player_private where player_id = p_minor and senior_callup_consent_at is not null;
  insert into _r values ('8 consent is stamped on the private row', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- ── the coach again: in squad, then ended ────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  select string_agg(full_name || '=' || state, ',' order by full_name) into st from public.callup_candidates(t_men1) where full_name like 'Harness%';
  insert into _r values ('9 the list now shows the player in the squad',
    case when st = 'Harness Other=consent_needed,Harness Seventeen=in_squad' then 'PASS' else 'FAIL ' || coalesce(st, 'null') end);
  select * into req from public.end_callup(req.id);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.memberships where profile_id = u_parent and team_id = t_men1;
  insert into _r values ('10 ending removes the senior twin', case when req.status = 'removed' and n = 0 then 'PASS' else 'FAIL ' || req.status || '/' || n end);
  select count(*) into n from public.memberships where profile_id = u_parent and team_id = t_u18;
  insert into _r values ('11 ⚠️ ending leaves the home squad untouched', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- ── a stranger ───────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_woman, 'role', 'authenticated')::text, true);
  begin
    perform public.callup_candidates(t_men1);
    insert into _r values ('12 ⚠️ a member of another squad cannot list the candidates', 'FAIL: listed');
  exception when insufficient_privilege then
    insert into _r values ('12 ⚠️ a member of another squad cannot list the candidates', 'PASS (42501)');
  end;
  select count(*) into n from public.callup_requests;
  insert into _r values ('13 a member of another squad reads no requests', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'postgres', true);
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
