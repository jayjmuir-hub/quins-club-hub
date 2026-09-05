-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — junior play-up RPCs. SAFE ON PRODUCTION: one transaction,
--  rolled back. Does not apply the migration; it exercises whatever live
--  currently has. Run with `npm run db:check -- junior-playup` after
--  20260913_junior_playup is applied.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260913_junior_playup.sql. Uses the club's real U14B and
-- U16B (or U14B Contact / U16B Contact) and a senior squad; every person
-- and player is synthetic.

begin;
select set_config('app.harness', 'on', true);

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_home uuid; t_guest uuid; t_senior uuid;
  u_super constant uuid := 'd0000000-0000-4000-8000-000000000031';
  u_coach constant uuid := 'd0000000-0000-4000-8000-000000000032';
  u_parent constant uuid := 'd0000000-0000-4000-8000-000000000033';
  p_child uuid; n int; home_n int;
begin
  if to_regprocedure('public.add_junior_playup(uuid, uuid)') is null
     or to_regprocedure('public.remove_junior_playup(uuid, uuid)') is null then
    raise exception 'add_junior_playup / remove_junior_playup are not on this database — apply db/migrations/20260913_junior_playup.sql';
  end if;

  select id into t_home from public.teams where club_id = club and is_senior is not true and name like 'U14B%' order by name limit 1;
  select id into t_guest from public.teams where club_id = club and is_senior is not true and name like 'U16B%' order by name limit 1;
  select id into t_senior from public.teams where club_id = club and is_senior is true order by sort_order limit 1;
  if t_home is null or t_guest is null or t_senior is null then
    raise exception 'the club''s U14B / U16B / senior squads have been renamed — repoint this harness';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jp-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_super, u_coach, u_parent]) as u on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email)
  select u, 'Playup Harness', 'jp-' || u || '@example.invalid' from unnest(array[u_super, u_coach, u_parent]) as u on conflict (id) do nothing;
  insert into public.players (club_id, team_id, full_name) values (club, t_home, 'Harness Playup Alderton') returning id into p_child;
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id, is_super) values
    (u_super, club, null, 'admin', 'active', null, true),
    (u_coach, club, t_home, 'coach', 'active', null, false),
    (u_parent, club, t_home, 'parent', 'active', p_child, false);

  -- ── a coach must not add ──────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  begin
    perform public.add_junior_playup(p_child, t_guest);
    insert into _r values ('1 ⚠️ a non-super cannot add a junior play-up', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('1 ⚠️ a non-super cannot add a junior play-up', 'PASS (42501)');
  end;

  -- ── super admin refusals ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  begin
    perform public.add_junior_playup(p_child, t_senior);
    insert into _r values ('2 ⚠️ a senior squad cannot be the play-up guest', 'FAIL: allowed');
  exception when invalid_parameter_value then
    insert into _r values ('2 ⚠️ a senior squad cannot be the play-up guest', 'PASS (22023)');
  end;
  begin
    perform public.add_junior_playup(p_child, t_home);
    insert into _r values ('3 ⚠️ home cannot be the play-up guest', 'FAIL: allowed');
  exception when invalid_parameter_value then
    insert into _r values ('3 ⚠️ home cannot be the play-up guest', 'PASS (22023)');
  end;

  perform public.add_junior_playup(p_child, t_guest);
  perform public.add_junior_playup(p_child, t_guest);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.memberships where profile_id = u_parent and team_id = t_guest and player_id = p_child and status = 'active';
  insert into _r values ('4 add twins the home membership onto the guest squad, and is idempotent',
    case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into home_n from public.memberships where profile_id = u_parent and team_id = t_home and player_id = p_child;
  insert into _r values ('5 home memberships stay', case when home_n = 1 then 'PASS' else 'FAIL ' || home_n end);
  select count(*) into n from public.players where id = p_child and team_id = t_home;
  insert into _r values ('6 players.team_id stays home', case when n = 1 then 'PASS' else 'FAIL' end);

  -- ── remove ────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  perform public.remove_junior_playup(p_child, t_guest);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.memberships where player_id = p_child and team_id = t_guest;
  insert into _r values ('7 remove clears only the guest twins', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into home_n from public.memberships where profile_id = u_parent and team_id = t_home and player_id = p_child;
  insert into _r values ('8 ⚠️ remove leaves home memberships and the players row',
    case when home_n = 1 then 'PASS' else 'FAIL ' || home_n end);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  begin
    perform public.remove_junior_playup(p_child, t_guest);
    insert into _r values ('9 ⚠️ a non-super cannot remove a junior play-up', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('9 ⚠️ a non-super cannot remove a junior play-up', 'PASS (42501)');
  end;

  perform set_config('role', 'postgres', true);
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'junior-playup: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
