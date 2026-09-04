-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — competitions and standings: the table adds up, a correction
--  changes it, an unconfirmed row does not count, the match sheet's score
--  reaches it, the import is idempotent, and a stranger cannot write a result.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS
--  BACK. Run with `npm run db:check -- standings` (claude/runbooks/db-harnesses.md).
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260905_competitions_and_standings.sql. Expected numbers are
-- worked by hand in the comments so a wrong expectation is findable: 4/2/0,
-- try bonus at 4, losing bonus within 7.
--
-- ⚠️ THE SHEET STEP GOES THROUGH events_result_from_components. Setting
-- tries_us = 3 recomputes result_us to 15 (three tries, no conversions) before
-- our trigger sees it, so the expected sheet score is 15, not whatever the
-- update statement typed into result_us. Measured 3 Sep 2026 on the dry run.
--
-- ⚠️ THE STRANGER STEP IS THE SECURITY ASSERTION. `set local role
-- authenticated` with a synthetic user who is neither admin nor keeper must be
-- refused with 42501 on insert. As postgres RLS is bypassed, so a run that
-- forgets the role change passes while proving nothing.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-0000000005d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','standings-stranger@example.invalid', now(), '{}'::jsonb, now(), now())
on conflict (id) do nothing;
insert into profiles (id, full_name, email) values ('c0000000-0000-4000-8000-0000000005d1','Standings Stranger','standings-stranger@example.invalid')
on conflict (id) do nothing;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  keeper uuid := 'c0000000-0000-4000-8000-0000000005d1';
  cid uuid; sa uuid; sb uuid; sc uuid; lt uuid; team uuid; fx uuid; ev uuid; old_id uuid;
  got text; imp jsonb;
begin
  select id, team_id into lt, team from public.league_teams where is_active limit 1;

  insert into public.competitions (club_id, name, season, is_senior, bonus_try_threshold, bonus_losing_margin)
  values (club, 'Harness Division', 'harness', true, 4, 7) returning id into cid;
  insert into public.competition_sides (competition_id, name, code, league_team_id) values (cid, 'Alpha', 'A', lt) returning id into sa;
  insert into public.competition_sides (competition_id, name, code) values (cid, 'Bravo', 'B') returning id into sb;
  insert into public.competition_sides (competition_id, name, code) values (cid, 'Charlie', 'C') returning id into sc;

  -- Alpha 30-10 Bravo (Alpha 5 tries: try bonus) · Charlie 20-19 Alpha (Alpha
  -- losing bonus) · Bravo 15-15 Charlie.
  -- Alpha: W1 L1, 49-30, bp 2, pts 4+2 = 6. Charlie: W1 D1, 35-34, pts 6.
  -- Bravo: D1 L1, 25-45, pts 2. Alpha above Charlie on difference (+19 v +1).
  insert into public.competition_results (competition_id, round, home_side_id, away_side_id, home_score, away_score, home_tries, away_tries, source, confirmed_by, confirmed_at, created_by)
  values (cid, 1, sa, sb, 30, 10, 5, 1, 'typed', keeper, now(), keeper),
         (cid, 2, sc, sa, 20, 19, 2, 3, 'typed', keeper, now(), keeper),
         (cid, 3, sb, sc, 15, 15, 2, 2, 'typed', keeper, now(), keeper);
  select string_agg(format('%s:%s/%s/%s', pos, side, points, bonus), ' ' order by pos) into got from public.competition_standings(cid);
  insert into _r values ('1 the table adds up, ties broken by difference',
    case when got = '1:Alpha/6/2 2:Charlie/6/0 3:Bravo/2/0' then 'PASS' else 'FAIL ' || got end);

  -- A correction: Charlie v Alpha becomes 20-25. Alpha W2, no losing bonus:
  -- 8 + 1 = 9. Charlie L1 D1, lost by 5: 2 + 1 = 3.
  select id into old_id from public.competition_results where competition_id = cid and round = 2;
  insert into public.competition_results (competition_id, round, home_side_id, away_side_id, home_score, away_score, home_tries, away_tries, source, source_note, supersedes, confirmed_by, confirmed_at, created_by)
  values (cid, 2, sc, sa, 20, 25, 2, 3, 'typed', 'corrected', old_id, keeper, now(), keeper);
  update public.competition_results set superseded_at = now() where id = old_id;
  select string_agg(format('%s:%s/%s', pos, side, points), ' ' order by pos) into got from public.competition_standings(cid);
  insert into _r values ('2 a superseding correction changes the table',
    case when got = '1:Alpha/9 2:Charlie/3 3:Bravo/2' then 'PASS' else 'FAIL ' || got end);

  -- An unconfirmed row (a reader's proposal that never got its tap) is ignored.
  insert into public.competition_results (competition_id, round, home_side_id, away_side_id, home_score, away_score, source, created_by)
  values (cid, 4, sb, sc, 50, 0, 'read', keeper);
  select string_agg(format('%s:%s/%s', pos, side, points), ' ' order by pos) into got from public.competition_standings(cid);
  insert into _r values ('3 an unconfirmed result does not count',
    case when got = '1:Alpha/9 2:Charlie/3 3:Bravo/2' then 'PASS' else 'FAIL ' || got end);

  -- The match sheet: our event linked to a fixture; saving the score writes a
  -- sheet row. tries_us = 3 recomputes result_us to 15 (see header).
  insert into public.events (club_id, team_id, type, starts_at, time_tbd, league_team_id, round, competition_type, opponent, home, created_by)
  values (club, team, 'match', now(), true, lt, 9, 'league', 'Bravo', true, keeper) returning id into ev;
  insert into public.competition_fixtures (competition_id, round, played_on, home_side_id, away_side_id, event_id)
  values (cid, 9, current_date, sa, sb, ev) returning id into fx;
  update public.events set result_us = 21, result_them = 7, tries_us = 3 where id = ev;
  select format('%s/%s-%s/%s', count(*), min(home_score), min(away_score), min(source)) into got
    from public.competition_results where fixture_id = fx and superseded_at is null;
  insert into _r values ('4 the match sheet score reaches the table as a sheet row',
    case when got = '1/15-7/sheet' then 'PASS' else 'FAIL ' || got end);
  -- Saving the sheet again supersedes the first sheet row rather than adding a second live one.
  update public.events set tries_us = 4 where id = ev;
  select format('%s live, %s total, %s', count(*) filter (where superseded_at is null), count(*), max(home_score) filter (where superseded_at is null)) into got
    from public.competition_results where fixture_id = fx;
  insert into _r values ('5 a re-saved sheet supersedes its own earlier row',
    case when got = '1 live, 2 total, 20' then 'PASS' else 'FAIL ' || got end);

  -- The import, as an admin (whoever holds is_super in this club).
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.memberships where club_id = club and role = 'admin' and is_super and status = 'active' limit 1), 'role', 'authenticated')::text, true);
  imp := public.import_season(cid, '[{"name":"Alpha","code":"A"},{"name":"Bravo","code":"B"},{"name":"Delta","code":"D"}]'::jsonb,
    '[{"round":10,"played_on":"2099-05-01","home":"A","away":"D"},{"round":10,"played_on":"2099-05-01","home":"B","away":"C"}]'::jsonb);
  insert into _r values ('6 import adds the new side and fixtures, and our game to the schedule',
    case when imp = '{"sides_added":1,"fixtures_added":2,"events_linked":0,"events_created":1}'::jsonb then 'PASS' else 'FAIL ' || imp::text end);
  imp := public.import_season(cid, '[{"name":"Alpha","code":"A"},{"name":"Bravo","code":"B"},{"name":"Delta","code":"D"}]'::jsonb,
    '[{"round":10,"played_on":"2099-05-01","home":"A","away":"D"},{"round":10,"played_on":"2099-05-01","home":"B","away":"C"}]'::jsonb);
  insert into _r values ('7 the same grid imported twice changes nothing',
    case when imp = '{"sides_added":0,"fixtures_added":0,"events_linked":0,"events_created":0}'::jsonb then 'PASS' else 'FAIL ' || imp::text end);
  select format('%s/%s/%s', opponent, home, time_tbd) into got from public.events where league_team_id = lt and round = 10 and starts_at > '2099-01-01';
  insert into _r values ('8 the created event names the opponent, home, Time TBD',
    case when got = 'Delta/t/t' then 'PASS' else 'FAIL ' || got end);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ── The stranger: signed in, neither admin nor keeper ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c0000000-0000-4000-8000-0000000005d1', 'role', 'authenticated')::text, true);
do $$
declare cid uuid; sa uuid; sb uuid; n int;
begin
  select id into cid from public.competitions where season = 'harness';
  select id into sa from public.competition_sides where competition_id = cid and code = 'A';
  select id into sb from public.competition_sides where competition_id = cid and code = 'B';
  select count(*) into n from public.competition_standings(cid);
  insert into _r values ('9 a signed-in member can READ the table', case when n = 4 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.competition_results (competition_id, round, home_side_id, away_side_id, home_score, away_score, source, confirmed_by, confirmed_at, created_by)
    values (cid, 11, sa, sb, 1, 0, 'typed', 'c0000000-0000-4000-8000-0000000005d1', now(), 'c0000000-0000-4000-8000-0000000005d1');
    insert into _r values ('10 a stranger cannot write a result', 'FAIL: insert allowed');
  exception when insufficient_privilege then
    insert into _r values ('10 a stranger cannot write a result', 'PASS (42501)');
  end;
  begin
    perform public.import_season(cid, '[]'::jsonb, '[]'::jsonb);
    insert into _r values ('11 a stranger cannot import a season', 'FAIL: allowed');
  exception when insufficient_privilege then
    insert into _r values ('11 a stranger cannot import a season', 'PASS (42501)');
  end;
end $$;
reset role;

-- ⚠️ A FAIL ROW MUST STOP THE RUN. scripts/db-check.mjs reports `ok` for
-- any harness whose SQL executes without error, so a 'FAIL …' outcome in
-- _r is otherwise visible only to a human reading the output — measured
-- 4 Sep 2026, when this file had no `raise exception` anywhere and the
-- runner refused the whole suite ("cannot FAIL").
do $$
begin
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'standings: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by step;
rollback;
