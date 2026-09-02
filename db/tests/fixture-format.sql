-- db/tests/fixture-format.sql
-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — fixture format: events.format, teams.default_format, and the
--  rule that a league match is always 15s.
--  Paste into the Supabase SQL editor, or run `npm run db:check -- fixture-format`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260902_fixture_format.sql. Written BEFORE the
-- migration is applied (it fails until it is — that is the point).
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children.

begin;

-- ── STEP 0 — CONTROL: the probe can see a column that certainly exists ─────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'starts_at'
  ) then
    raise exception
      'CONTROL FAILED: cannot see events.starts_at. The probe is broken, not the column — every result below is meaningless.';
  end if;
end $$;

-- ── STEP 1 — both columns exist, smallint, nullable ───────────────────────
do $$
declare col record;
begin
  select data_type, is_nullable into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'format';
  if col is null then raise exception 'events.format is missing'; end if;
  if col.data_type <> 'smallint' or col.is_nullable <> 'YES' then
    raise exception 'events.format is % nullable=% — expected smallint, nullable', col.data_type, col.is_nullable;
  end if;

  select data_type, is_nullable into col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'teams' and column_name = 'default_format';
  if col is null then raise exception 'teams.default_format is missing'; end if;
  if col.data_type <> 'smallint' or col.is_nullable <> 'YES' then
    raise exception 'teams.default_format is % nullable=% — expected smallint, nullable', col.data_type, col.is_nullable;
  end if;
  raise notice 'STEP 1 ok: both columns exist';
end $$;

-- ── STEP 2 — a fixture to test against, on an invented squad ──────────────
-- Uses the first club and creates its own squad so nothing real is touched.
create temporary table _fx on commit drop as
  select c.id as club_id from public.clubs c order by c.created_at limit 1;

insert into public.teams (club_id, name, sort_order)
select club_id, 'Harness U18 Format', 999 from _fx;

create temporary table _team on commit drop as
  select id from public.teams where name = 'Harness U18 Format';

-- ── STEP 3 — the CHECK refuses 9 ─────────────────────────────────────────
do $$
begin
  insert into public.events (club_id, team_id, type, title, starts_at, format)
  select f.club_id, t.id, 'match', 'Harness 9s', now() + interval '7 days', 9 from _fx f, _team t;
  raise exception 'STEP 3 FAILED: events.format accepted 9';
exception
  when check_violation then raise notice 'STEP 3 ok: 9 refused';
end $$;

-- ── STEP 4 — a 7s LEAGUE row is refused ──────────────────────────────────
do $$
begin
  insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
  select f.club_id, t.id, 'match', 'Harness league 7s', now() + interval '7 days', 'league', 7 from _fx f, _team t;
  raise exception 'STEP 4 FAILED: a league match accepted format 7';
exception
  when check_violation then raise notice 'STEP 4 ok: league 7s refused';
end $$;

-- ── STEP 5 — CONTROL: a 7s TOURNAMENT row is accepted, and a 15 league row is ─
-- Without this, STEPS 3 and 4 could pass because the whole INSERT is broken.
insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
select f.club_id, t.id, 'match', 'Harness tournament 7s', now() + interval '7 days', 'tournament', 7 from _fx f, _team t;
insert into public.events (club_id, team_id, type, title, starts_at, competition_type, format)
select f.club_id, t.id, 'match', 'Harness league 15s', now() + interval '7 days', 'league', 15 from _fx f, _team t;
-- And a league row with NO format is still fine — null reads as 15 in the app.
insert into public.events (club_id, team_id, type, title, starts_at, competition_type)
select f.club_id, t.id, 'match', 'Harness league null', now() + interval '7 days', 'league' from _fx f, _team t;
do $$
declare n int;
begin
  select count(*) into n from public.events where title like 'Harness %';
  if n <> 3 then raise exception 'STEP 5 FAILED: expected 3 harness rows, found %', n; end if;
  raise notice 'STEP 5 ok: tournament 7s, league 15 and league null all accepted';
end $$;

-- ── STEP 6 — teams.default_format takes 12 and refuses 11 ────────────────
update public.teams set default_format = 12 where id in (select id from _team);
do $$
begin
  update public.teams set default_format = 11 where id in (select id from _team);
  raise exception 'STEP 6 FAILED: teams.default_format accepted 11';
exception
  when check_violation then raise notice 'STEP 6 ok: 11 refused, 12 accepted';
end $$;

rollback;
