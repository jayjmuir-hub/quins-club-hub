-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — junior play-up parent consent. SAFE ON PRODUCTION: one
--  transaction, rolled back. `app.harness` = on so notify_junior_playup
--  sends nothing. Run with `npm run db:check -- junior-playup-consent`
--  after 20260914_junior_playup_consent is applied.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Invented people only. Uses the club's real U14B and U16B (or Contact
-- names). Does not apply the migration.

begin;
select set_config('app.harness', 'on', true);

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_home uuid; t_guest uuid;
  u_super constant uuid := 'd0000000-0000-4000-8000-000000000041';
  u_coach constant uuid := 'd0000000-0000-4000-8000-000000000042';
  u_parent constant uuid := 'd0000000-0000-4000-8000-000000000043';
  u_other constant uuid := 'd0000000-0000-4000-8000-000000000044';
  p_child uuid; p_other uuid; n int; consent text; ev uuid; lu uuid;
begin
  if to_regprocedure('public.answer_junior_playup(uuid, uuid, boolean)') is null
     or to_regprocedure('public.squad_guest_flags(uuid[])') is null then
    raise exception 'play-up consent RPCs are not on this database — apply db/migrations/20260914_junior_playup_consent.sql';
  end if;

  select id into t_home from public.teams where club_id = club and is_senior is not true and name like 'U14B%' order by name limit 1;
  select id into t_guest from public.teams where club_id = club and is_senior is not true and name like 'U16B%' order by name limit 1;
  if t_home is null or t_guest is null then
    raise exception 'the club''s U14B / U16B squads have been renamed — repoint this harness';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pc-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_super, u_coach, u_parent, u_other]) as u on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email)
  select u, 'Playup Consent Harness', 'pc-' || u || '@example.invalid' from unnest(array[u_super, u_coach, u_parent, u_other]) as u on conflict (id) do nothing;
  insert into public.players (club_id, team_id, full_name) values (club, t_home, 'Harness Consent Alderton') returning id into p_child;
  insert into public.players (club_id, team_id, full_name) values (club, t_home, 'Harness Other Brackwood') returning id into p_other;
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id, is_super) values
    (u_super, club, null, 'admin', 'active', null, true),
    (u_coach, club, t_guest, 'coach', 'active', null, false),
    (u_parent, club, t_home, 'parent', 'active', p_child, false),
    (u_other, club, t_home, 'parent', 'active', p_other, false);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  perform public.add_junior_playup(p_child, t_guest);

  perform set_config('role', 'postgres', true);
  select playup_consent into consent from public.memberships
   where profile_id = u_parent and team_id = t_guest and player_id = p_child;
  insert into _r values ('1 add starts guest memberships as playup_consent pending, status still active',
    case when consent = 'pending' then 'PASS' else 'FAIL ' || coalesce(consent, 'null') end);

  -- Lineup refused while pending
  insert into public.events (club_id, team_id, type, starts_at, opponent)
  values (club, t_guest, 'match', now() + interval '14 days', 'Harness Opposition')
  returning id into ev;
  insert into public.lineups (event_id) values (ev) returning id into lu;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  begin
    insert into public.lineup_players (lineup_id, player_id, role) values (lu, p_child, 'starter');
    insert into _r values ('2 ⚠️ a pending play-up cannot be placed in a lineup', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('2 ⚠️ a pending play-up cannot be placed in a lineup', 'PASS (42501)');
  end;

  -- Other parent cannot answer
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  begin
    perform public.answer_junior_playup(p_child, t_guest, true);
    insert into _r values ('3 ⚠️ another child''s parent cannot approve', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('3 ⚠️ another child''s parent cannot approve', 'PASS (42501)');
  end;

  -- Linked parent approves → lineup unlocks
  perform set_config('request.jwt.claims', json_build_object('sub', u_parent, 'role', 'authenticated')::text, true);
  perform public.answer_junior_playup(p_child, t_guest, true);
  perform set_config('role', 'postgres', true);
  select playup_consent into consent from public.memberships
   where profile_id = u_parent and team_id = t_guest and player_id = p_child;
  insert into _r values ('4 approve sets playup_consent to approved',
    case when consent = 'approved' then 'PASS' else 'FAIL ' || coalesce(consent, 'null') end);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  insert into public.lineup_players (lineup_id, player_id, role) values (lu, p_child, 'starter');
  insert into _r values ('5 after approve the guest can be placed in a lineup', 'PASS');

  -- Decline removes the guest
  delete from public.lineup_players where lineup_id = lu;
  perform set_config('role', 'postgres', true);
  update public.memberships set playup_consent = 'pending'
   where player_id = p_child and team_id = t_guest;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_parent, 'role', 'authenticated')::text, true);
  perform public.answer_junior_playup(p_child, t_guest, false);
  perform set_config('role', 'postgres', true);
  select count(*) into n from public.memberships where player_id = p_child and team_id = t_guest;
  insert into _r values ('6 decline removes the guest memberships',
    case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.memberships where profile_id = u_parent and team_id = t_home and player_id = p_child;
  insert into _r values ('7 ⚠️ decline leaves home memberships',
    case when n = 1 then 'PASS' else 'FAIL ' || n end);

  -- Coach cannot answer
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  perform public.add_junior_playup(p_child, t_guest);
  perform set_config('request.jwt.claims', json_build_object('sub', u_coach, 'role', 'authenticated')::text, true);
  begin
    perform public.answer_junior_playup(p_child, t_guest, true);
    insert into _r values ('8 ⚠️ a coach cannot answer for the family', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('8 ⚠️ a coach cannot answer for the family', 'PASS (42501)');
  end;

  -- squad_guest_flags: host coach sees the guest + pending
  select count(*) into n from public.squad_guest_flags(array[t_guest])
   where player_id = p_child and playup_consent = 'pending';
  insert into _r values ('9 host coach squad_guest_flags sees pending guest',
    case when n = 1 then 'PASS' else 'FAIL ' || n end);

  perform set_config('role', 'postgres', true);
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'junior-playup-consent: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
