-- ══════════════════════════════════════════════════════════════════════════
--  Competitions, results and standings — a league table per division, computed
--  from confirmed results; and the season import that fills the fixture grid
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-standings-and-results.md, step 1 of its order of
-- work, plus the season import that Jay's 3 Sep 2026 answer turned from a
-- one-off seed into a route: "the rcm will eventually publish the fixtures
-- list and we will import it when it comes out for juniors."
--
-- Five tables and three functions:
--   competitions          one row per division per season, with its POINTS
--                         RULES as columns — a setting, never code.
--   competition_sides     every side in the division, ours flagged by the
--                         league_teams row it maps to.
--   competition_fixtures  the season's grid, one row per game; ours linked to
--                         the events row on the squad schedule. This is what
--                         makes "N results missing" exact.
--   competition_results   every confirmed score, with its SOURCE and a
--                         supersedes chain for corrections. Never deleted.
--   competition_keepers   who keeps a division's results besides the admins.
--   competition_standings(uuid)   the table, computed on every read.
--   import_season(uuid, jsonb, jsonb)   the grid in, atomically.
--   private.sheet_result_to_competition()   our own score, from the sheet.
--
-- ⚠️ STANDINGS ARE COMPUTED, NEVER STORED (Jay, 2 Sep 2026). A corrected
-- result fixes the table by itself. A division is a few hundred rows a season;
-- a stored table would need a recompute job, and the job is what breaks.
--
-- ⚠️ NOTHING REACHES competition_results WITHOUT A PERSON. The insert policy
-- requires `confirmed_by = auth.uid()` and the keeper or admin. A later reader
-- (route 2) writes PROPOSALS, never results — that table is not in this
-- migration because nothing consumes it yet.
--
-- ⚠️ A CORRECTION IS A NEW ROW. `supersedes` points at the old one, which is
-- marked `superseded_at` and stays. Standings read only unsuperseded confirmed
-- rows. No DELETE policy exists on results, on purpose: "who changed the
-- score" is answered by the chain, not by a log.
--
-- ⚠️ OUR OWN SCORE COMES FROM THE MATCH SHEET, AUTOMATICALLY. The trigger on
-- events writes a `sheet` row for the linked fixture whenever result_us and
-- result_them are both known, superseding any earlier sheet row. Staff typed
-- it on the sheet; that is the confirmation. A keeper may still supersede it
-- with a typed correction, which wins by being newer — until the sheet is
-- saved again. Both directions are the same rule: newest unsuperseded row.
--
-- ⚠️ KEEPERS ARE A TABLE, NOT A SCOPED ADMIN RIGHT — a deliberate deviation
-- from the spec's "first scoped right". ADMIN_RIGHTS is a flat text[] on
-- memberships read in a dozen places; giving one entry a scope would touch
-- every reader for one feature. A join table costs nothing and reads as what
-- it is. Admins can do everything a keeper can (private.is_keeper).
--
-- ⚠️ READ IS DELIBERATELY WIDE — any signed-in member, the league_teams shape.
-- Every row here is a club side and a score; no player, no child, no contact.
--
-- ⚠️ THE IMPORT CREATES OUR FIXTURES' EVENTS IN ONE STATEMENT, ON PURPOSE.
-- fixture_added_push is a per-statement trigger that pushes only when exactly
-- one row was inserted; a season import must not wake a squad thirty times.
--
-- ⚠️ NO TABLE GRANTS ARE WRITTEN: Supabase's default privileges grant ALL to
-- anon/authenticated on a new table, RLS keeps anon out (auth.uid() is null),
-- and db/schema/grants.sql records the shape. Function grants are explicit.

-- ── competitions ───────────────────────────────────────────────────────────
create table if not exists public.competitions (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null references public.clubs(id) on delete cascade,
  name                 text not null,
  season               text not null,
  division             text,
  is_senior            boolean not null default false,
  age_band             smallint,
  results_url          text,
  points_win           smallint not null default 4,
  points_draw          smallint not null default 2,
  points_loss          smallint not null default 0,
  bonus_try_threshold  smallint,
  bonus_losing_margin  smallint,
  created_at           timestamptz not null default now(),
  constraint competitions_name_season_unique unique (club_id, season, name),
  constraint competitions_division_check
    check (division is null or division in ('A', 'B', 'C', 'WAP', 'D1', 'D2', 'W7s', 'WXV'))
);
comment on table public.competitions is
  'One league division for one season, with its points rules as columns (a setting, never code). Standings are computed from competition_results on every read.';

alter table public.league_teams
  add column if not exists competition_id uuid references public.competitions(id) on delete set null;

-- ── competition_sides ──────────────────────────────────────────────────────
create table if not exists public.competition_sides (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  name            text not null,
  code            text,
  league_team_id  uuid references public.league_teams(id) on delete set null,
  sort_order      integer not null default 0,
  constraint competition_sides_name_unique unique (competition_id, name)
);
comment on column public.competition_sides.league_team_id is
  'Set on OUR side only: the league_teams row it is. Every other side in the division has null here.';

-- ── competition_fixtures ───────────────────────────────────────────────────
create table if not exists public.competition_fixtures (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  round           smallint,
  played_on       date,
  home_side_id    uuid not null references public.competition_sides(id) on delete cascade,
  away_side_id    uuid not null references public.competition_sides(id) on delete cascade,
  event_id        uuid references public.events(id) on delete set null,
  constraint competition_fixtures_distinct_sides check (home_side_id <> away_side_id),
  constraint competition_fixtures_unique unique (competition_id, round, home_side_id, away_side_id)
);
create index if not exists competition_fixtures_event_idx on public.competition_fixtures(event_id);
comment on column public.competition_fixtures.event_id is
  'Our squad-schedule row for this game, when one of the sides is ours. What lets the match sheet''s score reach the table, and what makes "results missing" exact.';

-- ── competition_results ────────────────────────────────────────────────────
create table if not exists public.competition_results (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  fixture_id      uuid references public.competition_fixtures(id) on delete set null,
  round           smallint,
  played_on       date,
  home_side_id    uuid not null references public.competition_sides(id) on delete cascade,
  away_side_id    uuid not null references public.competition_sides(id) on delete cascade,
  home_score      smallint not null,
  away_score      smallint not null,
  home_tries      smallint,
  away_tries      smallint,
  source          text not null,
  source_note     text,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  confirmed_at    timestamptz,
  supersedes      uuid references public.competition_results(id) on delete set null,
  superseded_at   timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint competition_results_source_check check (source in ('sheet', 'typed', 'read', 'fetched')),
  constraint competition_results_scores_check check (home_score >= 0 and away_score >= 0),
  constraint competition_results_distinct_sides check (home_side_id <> away_side_id)
);
create index if not exists competition_results_competition_idx
  on public.competition_results(competition_id) where superseded_at is null;

-- ── competition_keepers ────────────────────────────────────────────────────
create table if not exists public.competition_keepers (
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  primary key (competition_id, profile_id)
);

-- ── who may keep results ───────────────────────────────────────────────────
create or replace function private.is_keeper(_competition uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.competitions c
     where c.id = _competition
       and (private.is_admin(c.club_id)
            or exists (select 1 from public.competition_keepers k
                        where k.competition_id = c.id and k.profile_id = auth.uid()))
  );
$$;
revoke execute on function private.is_keeper(uuid) from public;
grant execute on function private.is_keeper(uuid) to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.competitions          enable row level security;
alter table public.competition_sides     enable row level security;
alter table public.competition_fixtures  enable row level security;
alter table public.competition_results   enable row level security;
alter table public.competition_keepers   enable row level security;

drop policy if exists "competition read" on public.competitions;
create policy "competition read" on public.competitions
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "competition manage" on public.competitions;
create policy "competition manage" on public.competitions
  for all to authenticated using (private.is_admin(club_id)) with check (private.is_admin(club_id));

drop policy if exists "competition side read" on public.competition_sides;
create policy "competition side read" on public.competition_sides
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "competition side manage" on public.competition_sides;
create policy "competition side manage" on public.competition_sides
  for all to authenticated
  using (private.is_keeper(competition_id)) with check (private.is_keeper(competition_id));

drop policy if exists "competition fixture read" on public.competition_fixtures;
create policy "competition fixture read" on public.competition_fixtures
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "competition fixture manage" on public.competition_fixtures;
create policy "competition fixture manage" on public.competition_fixtures
  for all to authenticated
  using (private.is_keeper(competition_id)) with check (private.is_keeper(competition_id));

drop policy if exists "competition result read" on public.competition_results;
create policy "competition result read" on public.competition_results
  for select to authenticated using (auth.uid() is not null);
-- ⚠️ THE POLICY THAT MATTERS. A person, confirming, who keeps this division.
drop policy if exists "competition result confirm" on public.competition_results;
create policy "competition result confirm" on public.competition_results
  for insert to authenticated
  with check (private.is_keeper(competition_id)
              and confirmed_by = auth.uid()
              and created_by = auth.uid()
              and confirmed_at is not null
              and source in ('typed', 'read', 'fetched'));
-- Supersede only; there is no delete. The UI writes superseded_at and nothing
-- else, and RLS cannot narrow to a column, so the keeper trust covers it.
drop policy if exists "competition result supersede" on public.competition_results;
create policy "competition result supersede" on public.competition_results
  for update to authenticated
  using (private.is_keeper(competition_id)) with check (private.is_keeper(competition_id));

drop policy if exists "competition keeper read" on public.competition_keepers;
create policy "competition keeper read" on public.competition_keepers
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "competition keeper manage" on public.competition_keepers;
create policy "competition keeper manage" on public.competition_keepers
  for all to authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and private.is_admin(c.club_id)))
  with check (exists (select 1 from public.competitions c where c.id = competition_id and private.is_admin(c.club_id)));

-- ── the table ──────────────────────────────────────────────────────────────
-- Ties: points, then difference, then points for — World Rugby's default.
create or replace function public.competition_standings(_competition uuid)
-- ⚠️ `pos`, NOT `position` — a reserved word in a RETURNS TABLE column list
-- (syntax error at or near "position", measured 3 Sep 2026). Same trap as
-- `placing` on events.
returns table (
  pos             integer,
  side_id         uuid,
  side            text,
  is_ours         boolean,
  played          integer,
  won             integer,
  drawn           integer,
  lost            integer,
  points_for      integer,
  points_against  integer,
  difference      integer,
  bonus           integer,
  points          integer
)
language sql
stable security definer
set search_path = public
as $$
  with comp as (
    select * from public.competitions where id = _competition
  ),
  live as (
    select r.* from public.competition_results r
     where r.competition_id = _competition
       and r.superseded_at is null
       and r.confirmed_at is not null
  ),
  legs as (
    select home_side_id as side_id, home_score as pf, away_score as pa, home_tries as tries from live
    union all
    select away_side_id, away_score, home_score, away_tries from live
  ),
  tally as (
    select s.id as side_id, s.name as side, (s.league_team_id is not null) as is_ours,
           count(l.side_id)::int as played,
           count(*) filter (where l.pf > l.pa)::int as won,
           count(*) filter (where l.pf = l.pa)::int as drawn,
           count(*) filter (where l.pf < l.pa)::int as lost,
           coalesce(sum(l.pf), 0)::int as points_for,
           coalesce(sum(l.pa), 0)::int as points_against,
           (count(*) filter (where c.bonus_try_threshold is not null and l.tries >= c.bonus_try_threshold)
            + count(*) filter (where c.bonus_losing_margin is not null and l.pf < l.pa and l.pa - l.pf <= c.bonus_losing_margin))::int as bonus,
           (count(*) filter (where l.pf > l.pa) * c.points_win
            + count(*) filter (where l.pf = l.pa) * c.points_draw
            + count(*) filter (where l.pf < l.pa) * c.points_loss)::int as base
      from public.competition_sides s
      cross join comp c
      left join legs l on l.side_id = s.id
     where s.competition_id = _competition
     group by s.id, s.name, s.league_team_id, s.sort_order, c.points_win, c.points_draw, c.points_loss
  )
  select (row_number() over (order by base + bonus desc, points_for - points_against desc, points_for desc, side))::int as pos,
         side_id, side, is_ours, played, won, drawn, lost, points_for, points_against,
         points_for - points_against as difference, bonus, base + bonus as points
    from tally
   order by 1;
$$;
revoke execute on function public.competition_standings(uuid) from public;
grant execute on function public.competition_standings(uuid) to authenticated;

-- ── our score, from the match sheet ────────────────────────────────────────
create or replace function private.sheet_result_to_competition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.competition_fixtures;
  ours_home boolean;
begin
  if new.result_us is null or new.result_them is null then return null; end if;
  if new.result_us is distinct from old.result_us
     or new.result_them is distinct from old.result_them
     or new.tries_us is distinct from old.tries_us
     or new.tries_them is distinct from old.tries_them then
    for f in select * from public.competition_fixtures where event_id = new.id loop
      select (s.league_team_id is not null) into ours_home
        from public.competition_sides s where s.id = f.home_side_id;
      update public.competition_results
         set superseded_at = now()
       where fixture_id = f.id and source = 'sheet' and superseded_at is null;
      insert into public.competition_results
        (competition_id, fixture_id, round, played_on, home_side_id, away_side_id,
         home_score, away_score, home_tries, away_tries,
         source, source_note, confirmed_by, confirmed_at, created_by)
      values
        (f.competition_id, f.id, f.round, f.played_on, f.home_side_id, f.away_side_id,
         case when ours_home then new.result_us else new.result_them end,
         case when ours_home then new.result_them else new.result_us end,
         case when ours_home then new.tries_us else new.tries_them end,
         case when ours_home then new.tries_them else new.tries_us end,
         'sheet', 'From the match sheet', coalesce(auth.uid(), new.created_by), now(),
         coalesce(auth.uid(), new.created_by));
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists sheet_result_to_competition on public.events;
create trigger sheet_result_to_competition
  after update of result_us, result_them, tries_us, tries_them on public.events
  for each row execute function private.sheet_result_to_competition();

-- ── the season import ──────────────────────────────────────────────────────
-- _sides:    [{ "name": "Dubai Exiles", "code": "DEX", "league_team_id": null }, …]
-- _fixtures: [{ "round": 2, "played_on": "2026-10-10", "home": "ADH", "away": "TUS" }, …]
-- Sides are matched by name; fixtures by (round, home, away) — re-importing
-- the same grid changes nothing. Our side's fixtures are linked to the squad's
-- existing event for that round, or an event is created (Saturday, Time TBD).
create or replace function public.import_season(_competition uuid, _sides jsonb, _fixtures jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  comp public.competitions;
  sides_added integer := 0;
  fixtures_added integer := 0;
  events_linked integer := 0;
  events_created integer := 0;
begin
  select * into comp from public.competitions where id = _competition;
  if comp.id is null then
    raise exception 'No such competition.' using errcode = '22023';
  end if;
  if not private.is_admin(comp.club_id) then
    raise exception 'Only a club admin can import a season.' using errcode = '42501';
  end if;

  -- Sides, by name. A side already present keeps its row; ours gets its
  -- league team set if the payload names one.
  with incoming as (
    select trim(s->>'name') as name, nullif(trim(s->>'code'), '') as code,
           nullif(s->>'league_team_id', '')::uuid as league_team_id,
           ordinality::int as sort_order
      from jsonb_array_elements(_sides) with ordinality as t(s, ordinality)
  ), inserted as (
    insert into public.competition_sides (competition_id, name, code, league_team_id, sort_order)
    select _competition, name, code, league_team_id, sort_order from incoming
    on conflict (competition_id, name) do update
      set code = coalesce(excluded.code, public.competition_sides.code),
          league_team_id = coalesce(excluded.league_team_id, public.competition_sides.league_team_id)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into sides_added from inserted;

  -- Fixtures, by round + sides. Codes resolve through the sides just written.
  with incoming as (
    select (f->>'round')::smallint as round, (f->>'played_on')::date as played_on,
           f->>'home' as home, f->>'away' as away
      from jsonb_array_elements(_fixtures) as f
  ), resolved as (
    select i.round, i.played_on, h.id as home_side_id, a.id as away_side_id
      from incoming i
      join public.competition_sides h on h.competition_id = _competition and (h.code = i.home or h.name = i.home)
      join public.competition_sides a on a.competition_id = _competition and (a.code = i.away or a.name = i.away)
  ), inserted as (
    insert into public.competition_fixtures (competition_id, round, played_on, home_side_id, away_side_id)
    select _competition, round, played_on, home_side_id, away_side_id from resolved
    on conflict (competition_id, round, home_side_id, away_side_id) do update
      set played_on = coalesce(excluded.played_on, public.competition_fixtures.played_on)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into fixtures_added from inserted;

  -- Our fixtures: link the squad's existing event for that league team and
  -- round, where one exists …
  with ours as (
    select f.id as fixture_id, f.round, lt.id as league_team_id
      from public.competition_fixtures f
      join public.competition_sides s on s.id in (f.home_side_id, f.away_side_id) and s.league_team_id is not null
      join public.league_teams lt on lt.id = s.league_team_id
     where f.competition_id = _competition and f.event_id is null
  ), linked as (
    update public.competition_fixtures f
       set event_id = e.id
      from ours o
      join public.events e on e.league_team_id = o.league_team_id and e.round = o.round
                          and e.competition_type = 'league' and e.type = 'match'
     where f.id = o.fixture_id
    returning f.id
  )
  select count(*) into events_linked from linked;

  -- … and create the event where none exists: the Saturday, Time TBD, the
  -- other side as the opponent, home/away from the fixture. ONE statement.
  with ours as (
    select f.id as fixture_id, f.round, f.played_on,
           lt.id as league_team_id, lt.team_id, lt.division, t.club_id,
           (s.id = f.home_side_id) as is_home,
           (select name from public.competition_sides o
             where o.id = case when s.id = f.home_side_id then f.away_side_id else f.home_side_id end) as opponent
      from public.competition_fixtures f
      join public.competition_sides s on s.id in (f.home_side_id, f.away_side_id) and s.league_team_id is not null
      join public.league_teams lt on lt.id = s.league_team_id
      join public.teams t on t.id = lt.team_id
     where f.competition_id = _competition and f.event_id is null and f.played_on is not null
  ), created as (
    insert into public.events
      (club_id, team_id, type, starts_at, time_tbd, all_day, opponent, home, round, tier,
       league_team_id, league_team_tbd, competition_type, format, created_by)
    select club_id, team_id, 'match', (played_on::timestamp) at time zone 'Asia/Dubai', true, false,
           opponent, is_home, round, division, league_team_id, false, 'league', 15, auth.uid()
      from ours
    returning id, league_team_id, round
  ), relinked as (
    update public.competition_fixtures f
       set event_id = c.id
      from ours o join created c on c.league_team_id = o.league_team_id and c.round = o.round
     where f.id = o.fixture_id
    returning f.id
  )
  select count(*) into events_created from relinked;

  return jsonb_build_object(
    'sides_added', sides_added, 'fixtures_added', fixtures_added,
    'events_linked', events_linked, 'events_created', events_created);
end;
$$;
revoke execute on function public.import_season(uuid, jsonb, jsonb) from public;
grant execute on function public.import_season(uuid, jsonb, jsonb) to authenticated;

-- ── Assert it landed ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'competition_standings') then
    raise exception 'competition_standings was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'sheet_result_to_competition') then
    raise exception 'sheet_result_to_competition trigger was not created';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'competition_results' and policyname = 'competition result confirm') then
    raise exception 'competition result confirm policy was not created';
  end if;
end $$;
