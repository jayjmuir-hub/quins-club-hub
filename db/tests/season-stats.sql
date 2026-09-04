-- db/tests/season-stats.sql
-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — senior season stats: who may count, what is counted, and the
--  season boundary in Dubai time. SAFE ON PRODUCTION: one transaction, rolled
--  back. Run with `npm run db:check -- season-stats`.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260906_senior_season_stats.sql. Spec:
-- claude/plans/2026-09-04-senior-season-stats.md §4.
--
-- Uses the club's real senior squads and sets their section INSIDE the
-- transaction, the senior-section harness's pattern. Every person here is
-- invented. Two fixtures straddle the 31 Aug / 1 Sep boundary in Dubai time
-- and are stored in UTC where the naive reading lands them in the same season
-- — that is the discriminating half of assertion 4.

begin;


create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  t_men1 uuid; t_men2 uuid; t_women uuid; t_u10 uuid;
  u_mate   constant uuid := 'd0000000-0000-4000-8000-000000000011'; -- 2nd XV player, same section
  u_women  constant uuid := 'd0000000-0000-4000-8000-000000000012';
  u_parent constant uuid := 'd0000000-0000-4000-8000-000000000013';
  u_staff  constant uuid := 'd0000000-0000-4000-8000-000000000014'; -- coach of 1st XV AND of U10
  p_a uuid; p_b uuid; p_c uuid; p_child uuid; p_women uuid;
  ev_old uuid; ev_new uuid; ev_future uuid; ev_u10 uuid;
  ms_old uuid; ms_new uuid; ms_future uuid; ms_u10 uuid;
  n int; r record; ok boolean;
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
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'st-' || u || '@example.invalid', now(), '{}'::jsonb, now(), now()
    from unnest(array[u_mate, u_women, u_parent, u_staff]) as u
  on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email)
  select u, 'Stats Harness ' || u, 'st-' || u || '@example.invalid' from unnest(array[u_mate, u_women, u_parent, u_staff]) as u
  on conflict (id) do nothing;

  insert into public.players (club_id, team_id, full_name) values (club, t_men1, 'Harness Fly Half') returning id into p_a;
  insert into public.players (club_id, team_id, full_name) values (club, t_men1, 'Harness Hooker') returning id into p_b;
  insert into public.players (club_id, team_id, full_name) values (club, t_men2, 'Harness Cover Wing') returning id into p_c;
  insert into public.players (club_id, team_id, full_name) values (club, t_u10, 'Harness Child Ten') returning id into p_child;
  insert into public.players (club_id, team_id, full_name) values (club, t_women, 'Harness Women Player') returning id into p_women;
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
    (u_mate,   club, t_men2, 'player', 'active', p_c),
    (u_women,  club, t_women, 'player', 'active', p_women),
    (u_parent, club, t_u10,  'parent', 'active', p_child),
    (u_staff,  club, t_men1, 'coach',  'active', null),
    (u_staff,  club, t_u10,  'coach',  'active', null);

  -- 31 Aug 2026 23:30 Dubai = 19:30Z (old season); 1 Sep 2026 00:30 Dubai = 20:30Z (new season).
  insert into public.events (club_id, team_id, type, starts_at, time_tbd, opponent, home, created_by, tries_us, conversions_us)
    values (club, t_men1, 'match', '2026-08-31T19:30:00Z', false, 'Harness Old', true, u_staff, null, null) returning id into ev_old;
  insert into public.events (club_id, team_id, type, starts_at, time_tbd, opponent, home, created_by, tries_us, conversions_us)
    values (club, t_men1, 'match', '2026-08-31T20:30:00Z', false, 'Harness New', true, u_staff, 3, 1) returning id into ev_new;
  insert into public.events (club_id, team_id, type, starts_at, time_tbd, opponent, home, created_by)
    values (club, t_men1, 'match', now() + interval '7 days', true, 'Harness Future', true, u_staff) returning id into ev_future;
  insert into public.events (club_id, team_id, type, starts_at, time_tbd, opponent, home, created_by)
    values (club, t_u10, 'match', '2026-09-02T05:00:00Z', false, 'Harness Junior', true, u_staff) returning id into ev_u10;

  insert into public.match_sheets (event_id, status) values (ev_old, 'draft') returning id into ms_old;
  insert into public.match_sheets (event_id, status) values (ev_new, 'draft') returning id into ms_new;
  insert into public.match_sheets (event_id, status) values (ev_future, 'draft') returning id into ms_future;
  insert into public.match_sheets (event_id, status) values (ev_u10, 'complete') returning id into ms_u10;

  insert into public.match_sheet_slots (match_sheet_id, slot, player_id, full_name) values
    (ms_old, 10, p_a, 'Harness Fly Half'),
    (ms_new, 10, p_a, 'Harness Fly Half'),
    (ms_new, 2,  p_b, 'Harness Hooker'),
    (ms_new, 19, p_c, 'Harness Cover Wing'),
    (ms_future, 10, p_a, 'Harness Fly Half'),
    (ms_u10, 1, p_child, 'Harness Child Ten');
  insert into public.match_sheet_scores (match_sheet_id, kind, slot, full_name, qty) values
    (ms_new, 'tries', 10, 'Harness Fly Half', 2),
    (ms_new, 'conversions', 2, 'Harness Hooker', 1);
  insert into public.match_sheet_cards (match_sheet_id, colour, slot, full_name) values
    (ms_new, 'yellow', 19, 'Harness Cover Wing'),
    (ms_new, 'red', 10, 'Harness Fly Half');

  -- A rename AFTER filing: the stats must still find p_a through the slot.
  update public.players set full_name = 'Harness Renamed' where id = p_a;

  -- ── the section-mate (a player, never staff) ─────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_mate, 'role', 'authenticated')::text, true);

  select * into r from public.senior_season_stats(t_men1, '2026-27') where player_id = p_a;
  insert into _r values ('1 a section-mate reads the 1st XV table: fly half 1 game, 1 start, 2 tries, 1 red',
    case when r.games = 1 and r.starts = 1 and r.bench = 0 and r.tries = 2 and r.reds = 1 and r.yellows = 0 then 'PASS' else 'FAIL ' || coalesce(row_to_json(r)::text, 'no row') end);
  insert into _r values ('2 ⚠️ resolved through the SLOT: the renamed player still keys on player_id, name as filed',
    case when r.player_id = p_a and r.full_name = 'Harness Fly Half' then 'PASS' else 'FAIL ' || coalesce(r.full_name, 'no row') end);

  select * into r from public.senior_season_stats(t_men1, '2026-27') where player_id = p_c;
  insert into _r values ('3 slot 19 is bench, not a start; the yellow lands on him; a 2nd XV member counts on the 1st XV table',
    case when r.games = 1 and r.starts = 0 and r.bench = 1 and r.yellows = 1 and r.reds = 0 then 'PASS' else 'FAIL ' || coalesce(row_to_json(r)::text, 'no row') end);

  select * into r from public.senior_season_stats(t_men1, '2026-27') where player_id = p_b;
  insert into _r values ('4a the hooker: 1 start, 1 conversion, no tries',
    case when r.starts = 1 and r.conversions = 1 and r.tries = 0 then 'PASS' else 'FAIL ' || coalesce(row_to_json(r)::text, 'no row') end);

  select games into n from public.senior_season_stats(t_men1, '2025-26') where player_id = p_a;
  insert into _r values ('4b ⚠️ 23:30 on 31 Aug DUBAI is the OLD season (stored 19:30Z — the UTC date agrees, the control)',
    case when n = 1 then 'PASS' else 'FAIL ' || coalesce(n::text, 'no row') end);
  -- ev_new is 20:30Z on 31 Aug: by UTC date it is the old season; by Dubai it is the new one.
  select count(*) into n from public.senior_season_stats(t_men1, '2025-26') where player_id = p_b;
  insert into _r values ('4c ⚠️ 00:30 on 1 Sep DUBAI is the NEW season although its UTC date is 31 Aug — the discriminating half',
    case when n = 0 then 'PASS' else 'FAIL ' || n end);

  select count(*) into n from public.senior_season_stats(t_men1, '2026-27') where games > 1;
  insert into _r values ('5 a fixture next week does not count (fly half would have 2 games)', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  select * into r from public.senior_season_stats_gaps(t_men1, '2026-27');
  insert into _r values ('6 gaps: 1 played, 1 with more tries recorded (3) than named (2)',
    case when r.played = 1 and r.unnamed = 1 then 'PASS' else 'FAIL ' || coalesce(row_to_json(r)::text, 'no row') end);
  select * into r from public.senior_season_stats_gaps(t_men1, '2025-26');
  insert into _r values ('7 gaps: a blank try count is not a gap', case when r.played = 1 and r.unnamed = 0 then 'PASS' else 'FAIL ' || coalesce(row_to_json(r)::text, 'no row') end);

  select count(*) into n from public.senior_season_stats(t_men1, 'nonsense');
  insert into _r values ('8 a malformed season label returns nothing', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  select count(*) into n from public.match_sheet_scores;
  insert into _r values ('9 ⚠️ a player reads NO score rows directly — only the counted result', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  ok := false;
  begin
    insert into public.match_sheet_scores (match_sheet_id, kind, slot, qty) values (ms_new, 'tries', 10, 1);
  exception when others then ok := true;
  end;
  insert into _r values ('10 a player cannot write a score row', case when ok then 'PASS' else 'FAIL inserted' end);

  -- ── the women's player: other section ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_women, 'role', 'authenticated')::text, true);
  select count(*) into n from public.senior_season_stats(t_men1, '2026-27');
  insert into _r values ('11 the other section gets no rows', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- ── the junior parent ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_parent, 'role', 'authenticated')::text, true);
  select count(*) into n from public.senior_season_stats(t_men1, '2026-27');
  insert into _r values ('12 a junior parent gets no rows', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- ── the coach of BOTH the 1st XV and the U10 ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  select count(*) into n from public.senior_season_stats(t_men1, '2026-27');
  insert into _r values ('13 CONTROL: staff of the squad read the senior table', case when n = 3 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.senior_season_stats(t_u10, '2026-27');
  insert into _r values ('14 ⚠️ a junior squad returns nothing even to its own coach, with a sheet on file', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  select count(*) into n from public.match_sheet_scores where match_sheet_id = ms_new;
  insert into _r values ('15 CONTROL: staff read the score rows (the RLS mirror of cards)', case when n = 2 then 'PASS' else 'FAIL ' || n end);

  perform set_config('role', 'postgres', true);

  -- ⚠️ A FAIL ROW MUST STOP THE RUN. scripts/db-check.mjs reports `ok` for
  -- any harness whose SQL executes without error, so a 'FAIL …' outcome in
  -- _r is otherwise visible only to a human reading the output — measured
  -- 4 Sep 2026 on this file's own first live run. Proven against an injected
  -- fault (row 3's expected bench changed to 2 → the runner printed FAIL and
  -- this message named the row).
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'season-stats: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
