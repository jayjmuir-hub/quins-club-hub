-- Scoring components on a fixture, and the club's per-squad scoring set.
-- Plan: claude/plans/2026-08-12-scoring-model.md
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so this reasoning
-- lives in the file and never in the database. A re-capture cannot bring it
-- back. That is why it is written at length here.

-- ── 1. The components, four per side ────────────────────────────────────────
--
-- ⚠️ NULL MEANS "NOT RECORDED", NEVER ZERO. A side that scored no penalties and
-- a side whose penalties nobody wrote down are different facts. The register
-- already makes this distinction (a missing row, not an `absent`), and merging
-- the two is how a statistic becomes a lie.
--
-- ⚠️ NO DEFAULT 0, DELIBERATELY. A default would make every existing fixture
-- claim it scored nothing, which is exactly the confusion above, applied
-- retroactively to real data.
alter table public.events
  add column if not exists tries_us smallint,
  add column if not exists conversions_us smallint,
  add column if not exists penalties_us smallint,
  add column if not exists drops_us smallint,
  add column if not exists tries_them smallint,
  add column if not exists conversions_them smallint,
  add column if not exists penalties_them smallint,
  add column if not exists drops_them smallint;

-- ── 2. The club's override, on the squad ────────────────────────────────────
--
-- Jay, 12 Aug 2026: scoring should be selectable "in the area where teams are
-- created".
--
-- ⚠️ A COLUMN, NEVER THE SQUAD'S NAME — the same rule teams.is_senior and
-- teams.self_registration_allowed already carry, for the same reason: renaming
-- a squad must not silently change what may be recorded against it.
--
-- ⚠️ NULL MEANS "USE THE BAND DEFAULT", not "nothing is scoreable". Every squad
-- is null today and every squad must still work.
alter table public.teams
  add column if not exists scoring_kinds text[];

-- ── 3. The scoring set, in SQL ──────────────────────────────────────────────
--
-- ⚠️ THIS IS A FOURTH COPY OF A MODEL THAT IS ALREADY CARRIED THREE TIMES, AND
-- IT IS HERE ON PURPOSE. adhjrt holds it twice; src/lib/scoring.js is the third.
-- The alternative was worse: if the trigger summed every component while
-- scoring.js ignores the ones a squad may not score, the FORM would show one
-- total and the DATABASE would store another. That is precisely the failure
-- adhjrt's own test file exists to catch, and it would arrive silently.
--
-- ⚠️ WHAT IS COPIED IS THREE THRESHOLDS, NOT FIFTEEN ROWS. The upstream table
-- collapses onto the band number with no exceptions (checked row by row in
-- tests/scoring.test.js), so the copy is `<= 11`, `<= 13`, else — small enough
-- to keep honest, and db/tests/scoring.sql asserts it agrees with the JS.
--
-- ⚠️ THE BAND IS THE DIGITS, AND THE TRAILING LETTER IS GENDER. `U14B` is U14
-- Boys. The regex mirrors src/lib/ageGroup.js's YOUTH_NAME, including its
-- refusal to read `U123` as U12.
create or replace function private.scoring_kinds_for_team(p_team_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_override text[];
  v_band int;
begin
  select name, scoring_kinds into v_name, v_override
  from public.teams where id = p_team_id;

  -- An empty override is a mistake or a half-finished edit, not a squad that
  -- cannot score. Same fail-open reasoning as the unknown band below.
  if v_override is not null and array_length(v_override, 1) > 0 then
    return v_override;
  end if;

  v_band := nullif(substring(v_name from '^[Uu]([0-9]{1,2})(?![0-9])'), '')::int;

  -- ⚠️ AN UNKNOWN BAND GETS THE FULL SET, deliberately the OPPOSITE of
  -- allowsOwnContact, which fails closed. The harm is asymmetric in opposite
  -- directions: there it is a twelve-year-old's phone number, here it is a
  -- coach who cannot record a drop goal that was genuinely kicked.
  if v_band is null then
    return array['tries','conversions','penalties','drops'];
  elsif v_band <= 11 then
    return array['tries'];
  elsif v_band <= 13 then
    return array['tries','conversions'];
  else
    return array['tries','conversions','penalties','drops'];
  end if;
end;
$$;

-- ── 4. The total is DERIVED, and must not eat what is already there ─────────
--
-- adhjrt: "Totals are always computed from the components, never taken from the
-- client. That is what stops a typo - or a tampered request - producing a score
-- that does not match the tries and kicks recorded beside it." Enforced here
-- rather than in the app, because RLS is already the boundary and the app is
-- not the only possible writer.
--
-- ⚠️ AND THE GUARD IS THE WHOLE POINT OF THIS FUNCTION. There is live data that
-- an unconditional recompute would destroy: the U16B fixture holds
-- result_us = 22, result_them = 12 with EVERY component null, typed by hand
-- before components existed. Recomputing that from nothing yields 0-0, silently,
-- with no error anywhere.
--
-- ⚠️ THE GUARD IS PER SIDE, NOT PER ROW. A fixture where our components are
-- recorded and the opposition's are not is the normal case at half-time.
create or replace function private.events_result_from_components()
returns trigger
language plpgsql
as $$
declare
  v_kinds text[];
  v_us int;
  v_them int;
begin
  v_kinds := private.scoring_kinds_for_team(new.team_id);

  if new.tries_us is not null or new.conversions_us is not null
     or new.penalties_us is not null or new.drops_us is not null then
    v_us := 0;
    if 'tries'       = any(v_kinds) then v_us := v_us + coalesce(new.tries_us, 0) * 5; end if;
    if 'conversions' = any(v_kinds) then v_us := v_us + coalesce(new.conversions_us, 0) * 2; end if;
    if 'penalties'   = any(v_kinds) then v_us := v_us + coalesce(new.penalties_us, 0) * 3; end if;
    if 'drops'       = any(v_kinds) then v_us := v_us + coalesce(new.drops_us, 0) * 3; end if;
    new.result_us := v_us;
  end if;

  if new.tries_them is not null or new.conversions_them is not null
     or new.penalties_them is not null or new.drops_them is not null then
    v_them := 0;
    if 'tries'       = any(v_kinds) then v_them := v_them + coalesce(new.tries_them, 0) * 5; end if;
    if 'conversions' = any(v_kinds) then v_them := v_them + coalesce(new.conversions_them, 0) * 2; end if;
    if 'penalties'   = any(v_kinds) then v_them := v_them + coalesce(new.penalties_them, 0) * 3; end if;
    if 'drops'       = any(v_kinds) then v_them := v_them + coalesce(new.drops_them, 0) * 3; end if;
    new.result_them := v_them;
  end if;

  return new;
end;
$$;

drop trigger if exists events_result_from_components on public.events;
create trigger events_result_from_components
  before insert or update on public.events
  for each row execute function private.events_result_from_components();

-- ⚠️ NO NEW GRANTS. `authenticated` already holds table-level UPDATE on
-- public.events and public.teams, and a table-level privilege in Postgres
-- covers columns added later. Only public.profiles carries column-level grants
-- in this schema (see db/schema/grants.sql §4), and nothing here touches it.
-- Adding a redundant grant here would also trip scripts/docs-check.mjs, which
-- fails a build when a migration grants on a table the capture does not name.
