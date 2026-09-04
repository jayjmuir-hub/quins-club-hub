-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — the senior section: who reads what across squads, with a MINOR
--  called up to a senior squad. SAFE ON PRODUCTION: one transaction, rolled
--  back. Run with `npm run db:check -- senior-section`.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260905_senior_section.sql. The one assertion that matters
-- is step 3: a section-mate gains a called-up 17-year-old's NAME on the
-- roster and nothing else — the private row (birthday, phone) stays refused.
-- Every child protection keys on the PERSON, not the squad, so a child in a
-- senior squad keeps them. Measured on the 3 Sep 2026 dry run.
--
-- Uses the club's real senior squads and sets their section INSIDE the
-- transaction, so it works before or after the admin sets it for real.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_men1 uuid; t_men2 uuid; t_women uuid; t_u10 uuid; ev_men1 uuid;
  u_men2 constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_minor constant uuid := 'd0000000-0000-4000-8000-000000000002';
  u_women constant uuid := 'd0000000-0000-4000-8000-000000000003';
  u_parent constant uuid := 'd0000000-0000-4000-8000-000000000004';
  u_captain constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_bare constant uuid := 'd0000000-0000-4000-8000-000000000006';
  p_men2 uuid; p_minor uuid; p_women uuid; p_child uuid;
  n int;
begin
  select id into t_men1 from public.teams where name = 'Senior Men - 1st XV';
  select id into t_men2 from public.teams where name = 'Senior Men - 2nd XV';
  select id into t_women from public.teams where name = 'Senior Women';
  select id into t_u10 from public.teams where name = 'U10 Mixed';
  if t_men1 is null or t_men2 is null or t_women is null or t_u10 is null then
    raise exception 'the club''s squads have been renamed — repoint this harness';
  end if;

  update public.teams set section = 'senior_men' where id in (t_men1, t_men2);
  update public.teams set section = 'senior_women' where id = t_women;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ss-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_men2, u_minor, u_women, u_parent, u_captain, u_bare]) as u
  on conflict (id) do nothing;
  -- A trigger on auth.users creates the profile; this is the fallback.
  insert into public.profiles (id, full_name, email)
  select u, 'Section Harness ' || u, 'ss-' || u || '@example.invalid' from unnest(array[u_men2, u_minor, u_women, u_parent, u_captain, u_bare]) as u
  on conflict (id) do nothing;

  insert into public.players (club_id, team_id, full_name) values (club, t_men2, 'Harness Adult Two') returning id into p_men2;
  insert into public.players (club_id, team_id, full_name) values (club, t_men1, 'Harness Minor One') returning id into p_minor;
  insert into public.players (club_id, team_id, full_name) values (club, t_women, 'Harness Adult Woman') returning id into p_women;
  insert into public.players (club_id, team_id, full_name) values (club, t_u10, 'Harness Child Ten') returning id into p_child;
  insert into public.player_private (player_id, date_of_birth) values (p_minor, current_date - interval '17 years');
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
    (u_men2, club, t_men2, 'player', 'active', p_men2),
    (u_minor, club, t_men1, 'player', 'active', p_minor),
    (u_women, club, t_women, 'player', 'active', p_women),
    (u_parent, club, t_u10, 'parent', 'active', p_child);
  -- The seniors right (20260911_seniors_right): an admin row carrying ONLY
  -- `seniors`, and a control admin row carrying no right at all.
  insert into public.memberships (profile_id, club_id, team_id, role, status, admin_rights) values
    (u_captain, club, null, 'admin', 'active', array['seniors']),
    (u_bare, club, null, 'admin', 'active', array[]::text[]);

  select id into ev_men1 from public.events where team_id = t_men1 order by starts_at limit 1;
  if ev_men1 is null then
    insert into public.events (club_id, team_id, type, starts_at, time_tbd, opponent, home, created_by)
    values (club, t_men1, 'match', now() + interval '7 days', true, 'Harness Opposition', true, u_men2) returning id into ev_men1;
  end if;
  insert into public.availability (event_id, player_id, status) values (ev_men1, p_minor, 'in');

  -- ── the 2nd XV adult, same section as the minor ──────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_men2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.players where id = p_minor;
  insert into _r values ('1 a section-mate reads the called-up minor''s roster row (name)', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.players where team_id = t_men1;
  insert into _r values ('2 a section-mate reads the whole 1st XV roster', case when n >= 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.player_private where player_id = p_minor;
  insert into _r values ('3 ⚠️ the minor''s PRIVATE row (birthday) stays refused to a section-mate', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.availability where event_id = ev_men1;
  insert into _r values ('4 a section-mate reads the 1st XV''s availability', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.players where team_id = t_women;
  insert into _r values ('5 a man does NOT read the women''s roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.events where team_id = t_women;
  insert into _r values ('6 a man DOES read the women''s fixtures', case when n >= 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.players where team_id = t_u10;
  insert into _r values ('7 CONTROL: a senior reads no junior roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- ── the women's player ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_women, 'role', 'authenticated')::text, true);
  select count(*) into n from public.players where team_id = t_men1;
  insert into _r values ('8 a woman does NOT read the men''s roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.availability where event_id = ev_men1;
  insert into _r values ('9 a woman does NOT read the men''s availability', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.events where team_id = t_men1;
  insert into _r values ('10 a woman DOES read the men''s fixtures', case when n >= 1 then 'PASS' else 'FAIL ' || n end);

  -- ── the junior parent: nothing senior at all ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_parent, 'role', 'authenticated')::text, true);
  select count(*) into n from public.players where team_id = t_men1;
  insert into _r values ('11 CONTROL: a junior parent reads no senior roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.events where team_id = t_men1;
  insert into _r values ('12 CONTROL: a junior parent reads no senior fixtures', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- ── the seniors right: both sections, nothing junior, nothing private ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_captain, 'role', 'authenticated')::text, true);
  select count(*) into n from public.players where team_id = t_men1;
  insert into _r values ('13 a seniors-right holder reads the men''s roster', case when n >= 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.players where team_id = t_women;
  insert into _r values ('14 a seniors-right holder reads the women''s roster', case when n >= 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.availability where event_id = ev_men1;
  insert into _r values ('15 a seniors-right holder reads the men''s availability', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.events where team_id = t_women;
  insert into _r values ('16 a seniors-right holder reads the women''s fixtures', case when n >= 1 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.players where team_id = t_u10;
  insert into _r values ('17 ⚠️ a seniors-right holder reads NO junior roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.player_private where player_id = p_minor;
  insert into _r values ('18 ⚠️ the minor''s PRIVATE row stays refused to a seniors-right holder', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- ── CONTROL: an admin row with no right reaches nothing senior ──────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_bare, 'role', 'authenticated')::text, true);
  select count(*) into n from public.players where team_id in (t_men1, t_women);
  insert into _r values ('19 CONTROL: a zero-rights admin reads no senior roster', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'postgres', true);

  -- ⚠️ A FAIL ROW MUST STOP THE RUN. scripts/db-check.mjs reports `ok` for
  -- any harness whose SQL executes without error, so a 'FAIL …' outcome in
  -- _r is otherwise visible only to a human reading the output — measured
  -- 4 Sep 2026 on this file's own first live run.
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'senior-section: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
