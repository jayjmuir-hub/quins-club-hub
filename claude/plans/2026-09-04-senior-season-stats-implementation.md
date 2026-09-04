# Senior Season Stats Implementation Plan

**Status: SHIPPED — #695, 4 Sep 2026, all ten tasks; executed subagent-driven with a review per task and a final whole-branch review.** The spec it
implements is `claude/plans/2026-09-04-senior-season-stats.md`; where the two
disagree, the spec's *intent* wins and this file says where it deviates.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who scored on a senior match sheet, and show every senior player's season line (games, starts, bench, tries, conversions, penalties, drop goals, yellows, reds) to their own section.

**Architecture:** One new table beside the sheet (`match_sheet_scores`, the cards table's twin), two `security definer` functions that count sheets for a squad and season behind the section gate, one data module and one table component, wired into the match sheet editor and three existing screens. Nothing is stored that can be derived; the sheet stays the record.

**Tech Stack:** Postgres 17 on Supabase (SQL functions, RLS), Vite + React, Tailwind, vitest + Testing Library, the repo's rolled-back SQL harnesses (`npm run db:check`).

## Global Constraints

- **Seniors only.** A squad with `teams.section` null gets no scorers block, no stats card, and no rows from the functions.
- **Score kinds are the plural words the fixture already uses:** `tries`, `conversions`, `penalties`, `drops` (`SCORE_KINDS` in `src/lib/scoring.js`). ⚠️ The spec's table lists singulars; the plurals win because the soft note compares against `events.tries_us` etc. by name.
- **The quantity column is `qty`, not `count`.** `count` is legal as a column name but `sum(count)` reads as a bug to everyone who sees it. The spec says `count`; this is the one deliberate deviation.
- **Season label is `YYYY-YY`**, window 1 Sep to 31 Aug inclusive in `Asia/Dubai`. Malformed label returns no rows.
- **The scorers block is NOT rendered into the facsimile** that Share photographs. It lives in `MatchSheetEntry` only.
- **"Bench" on screen, never "sub appearances".** The sheet records selection, not minutes.
- **Never a real person's name in a test, harness or comment.** Invent names; keep the shape.
- **Stage explicit paths. Never `git add -A`.** Commit before injecting any fault.
- **Do not push to `main`.** The branch is `claude/senior-season-stats`; the pull request is opened at the end and Jay merges.
- **Working tree:** the worktree ships without `.env` or its own `node_modules`. Run `npm install --include=dev` once, and copy `.env` from the parent clone (`cp ../../../.env .env` from the worktree root) — it holds only public values plus, if Jay has set it, `SUPABASE_DB_URL` for the harness runner. ⚠️ If `SUPABASE_DB_URL` is absent, `npm run db:check` cannot run; ask Jay to add it to `.env` himself. Never ask for the value in chat.

---

## File map

| File | Responsibility |
|---|---|
| `db/migrations/20260906_senior_season_stats.sql` | Create: table, RLS, index, grants, the two functions. |
| `db/tests/season-stats.sql` | Create: the rolled-back harness. Carries the migration inline for its dry run; that block is deleted once the migration is applied. |
| `db/schema/tables.sql`, `policies.sql`, `functions.sql`, `grants.sql` | Modify: capture what the migration created (docs:check rule 7 needs the grants row). |
| `src/lib/season.js` | Create: `seasonLabelFor(date)` — the one place the 1 Sep rule is turned into a label. |
| `src/data/seasonStats.js` | Create: `seasonStats(teamId, season)`, `seasonStatsGaps(teamId, season)` — the two RPC wrappers. |
| `src/data/matchSheets.js` | Modify: `getMatchSheet` embeds `scores`; new `saveMatchSheetScores`. |
| `src/data/events.js:120` | Modify: `getEvent` embeds `section` on `team` so the sheet screen knows it is senior. |
| `src/components/MatchSheetEntry.jsx` | Modify: the "Scorers" block, with the soft note. |
| `src/screens/MatchSheet.jsx` | Modify: `scoreRows` state, draft, load, save; passes props to the entry. |
| `src/components/SeasonStatsTable.jsx` | Create: the sortable table. |
| `src/screens/SquadHub.jsx` | Modify: "Season stats" card for a senior squad. |
| `src/screens/SeniorSection.jsx` | Modify: "Season stats" section after "Season record". |
| `src/screens/PlayerDetail.jsx` | Modify: "This season" block for a senior player. |
| `tests/season-label.test.js`, `tests/season-stats-data.test.js`, `tests/match-sheet-scorers.test.jsx`, `tests/season-stats-table.test.jsx`, `tests/squad-hub-season-stats.test.jsx`, `tests/senior-section-stats.test.jsx`, `tests/player-detail-season.test.jsx` | Create: one test file per unit. |
| `claude/changelog.md`, `claude/state-of-play.md`, both plans | Modify: the paperwork. |

---

### Task 1: The migration and its harness (database)

**Files:**
- Create: `db/migrations/20260906_senior_season_stats.sql`
- Create: `db/tests/season-stats.sql`

**Interfaces:**
- Produces: table `public.match_sheet_scores(id, match_sheet_id, kind, slot, full_name, qty, created_at)`; `public.senior_season_stats(_team uuid, _season text)` returning `(player_id uuid, full_name text, games int, starts int, bench int, tries int, conversions int, penalties int, drops int, yellows int, reds int)`; `public.senior_season_stats_gaps(_team uuid, _season text)` returning `(played int, unnamed int)`.

- [ ] **Step 1: Write the migration file**

```sql
-- db/migrations/20260906_senior_season_stats.sql
-- Senior season stats: scorers on the match sheet, and a count per player per
-- season. Spec: claude/plans/2026-09-04-senior-season-stats.md.
--
-- ⚠️ WHY A NEW TABLE AND NOT COLUMNS ON THE SLOT ROW. A slot is a person on
-- the sheet; a score is an event that happened to them. Two tries and one
-- conversion by the same player are three facts, and "qty" per kind on the
-- slot would be four nullable columns of which most are null. The cards table
-- already made this call for the same reason, so this table is its twin.
--
-- ⚠️ THE PLAYER IS RESOLVED THROUGH THE SLOT, NEVER STORED HERE. Same rule as
-- match_sheet_cards: the sheet is a filed document, and a player renamed,
-- moved or removed next month must not change what was filed. `full_name` is
-- the name as filed, kept beside the slot for the day the slot's player is
-- gone.
--
-- ⚠️ `qty`, NOT `count`. Legal, but `sum(count)` reads as a bug forever.

create table if not exists public.match_sheet_scores (
  id             uuid        primary key default gen_random_uuid(),
  match_sheet_id uuid        not null references public.match_sheets(id) on delete cascade,
  -- The four RCM score components, in the fixture's own words (events.tries_us …).
  kind           text        not null,
  slot           smallint,
  full_name      text,
  qty            smallint    not null default 1,
  created_at     timestamptz not null default now(),
  constraint match_sheet_scores_kind_check check (kind in ('tries', 'conversions', 'penalties', 'drops')),
  constraint match_sheet_scores_slot_check check (slot is null or (slot >= 1 and slot <= 22)),
  constraint match_sheet_scores_qty_check  check (qty > 0)
);

create index if not exists match_sheet_scores_sheet_idx on public.match_sheet_scores (match_sheet_id);

alter table public.match_sheet_scores enable row level security;

-- The postgres default ACL is closed to anon since 20260814, so this is
-- belt-and-braces; db/tests/anon-table-grants.sql is the check.
revoke all on public.match_sheet_scores from anon;
grant select, insert, update, delete on public.match_sheet_scores to authenticated, service_role;

-- The cards policy, verbatim: staff of the squad, through the sheet.
drop policy if exists "match sheet score manage" on public.match_sheet_scores;
create policy "match sheet score manage" on public.match_sheet_scores
  for all
  using (private.can_edit_match_sheet(match_sheet_id))
  with check (private.can_edit_match_sheet(match_sheet_id));

-- ── the count ──────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because match_sheets is staff-only by RLS and stays that
-- way: a player never reads a sheet row, only this counted result. The gate is
-- therefore INSIDE the function, first, and it is the section's own gate:
-- private.same_section_member (roster reach) or private.can_edit_team (staff
-- and admins). A junior squad — section null — returns nothing to anyone.
--
-- A player on the sheet counts for THIS squad whether or not they are a member
-- of it: a 2nd XV player covering for the 1st XV shows on the 1st XV table.
--
-- Draft or complete: the sheet is the record whether or not Submit was pressed.
-- Only fixtures already started count (starts_at < now()).
--
-- ⚠️ Asia/Dubai is hard-coded to match CLUB_TIME_ZONE in src/lib/eventFormat.js,
-- as 20260810_update_series_from.sql already does. A fixture at 23:30 on
-- 31 Aug is in the OLD season; the UTC date would say otherwise.
create or replace function public.senior_season_stats(_team uuid, _season text)
returns table (
  player_id   uuid,
  full_name   text,
  games       integer,
  starts      integer,
  bench       integer,
  tries       integer,
  conversions integer,
  penalties   integer,
  drops       integer,
  yellows     integer,
  reds        integer
)
language sql
stable security definer
set search_path = public
as $$
  with gate as (
    select 1
      from public.teams t
     where t.id = _team
       and t.section is not null
       and (private.same_section_member(_team) or private.can_edit_team(_team))
  ),
  win as (
    -- '2026-27' → 2026-09-01 .. 2027-08-31. Anything else → no row → no rows.
    select make_date(y, 9, 1) as from_date, make_date(y + 1, 8, 31) as to_date
      from (select substring(_season from '^(\d{4})-(\d{2})$')::int as y,
                   substring(_season from '^\d{4}-(\d{2})$')::int as yy) s
     where y is not null and yy = (y + 1) % 100
  ),
  sheets as (
    select ms.id, e.starts_at
      from public.match_sheets ms
      join public.events e on e.id = ms.event_id
      cross join win
     where exists (select 1 from gate)
       and e.team_id = _team
       and e.starts_at < now()
       and (e.starts_at at time zone 'Asia/Dubai')::date between win.from_date and win.to_date
  ),
  -- One identity per person: the player id when the slot has one, else the
  -- filed name. A deleted player's rows still count under the name.
  appearances as (
    select coalesce(sl.player_id::text, 'name:' || lower(trim(sl.full_name))) as k,
           sl.player_id, sl.full_name, sl.slot, sh.starts_at
      from public.match_sheet_slots sl
      join sheets sh on sh.id = sl.match_sheet_id
  ),
  people as (
    select k,
           (array_agg(player_id order by starts_at desc))[1] as player_id,
           (array_agg(full_name order by starts_at desc))[1] as full_name,
           count(*)::int                                     as games,
           count(*) filter (where slot <= 15)::int           as starts,
           count(*) filter (where slot >= 16)::int           as bench
      from appearances
     group by k
  ),
  scored as (
    select coalesce(sl.player_id::text, 'name:' || lower(trim(coalesce(sl.full_name, sc.full_name)))) as k,
           sc.kind, sc.qty
      from public.match_sheet_scores sc
      join sheets sh on sh.id = sc.match_sheet_id
      left join public.match_sheet_slots sl on sl.match_sheet_id = sc.match_sheet_id and sl.slot = sc.slot
  ),
  scores as (
    select k,
           coalesce(sum(qty) filter (where kind = 'tries'), 0)::int       as tries,
           coalesce(sum(qty) filter (where kind = 'conversions'), 0)::int as conversions,
           coalesce(sum(qty) filter (where kind = 'penalties'), 0)::int   as penalties,
           coalesce(sum(qty) filter (where kind = 'drops'), 0)::int       as drops
      from scored
     group by k
  ),
  carded as (
    select coalesce(sl.player_id::text, 'name:' || lower(trim(coalesce(sl.full_name, c.full_name)))) as k,
           c.colour
      from public.match_sheet_cards c
      join sheets sh on sh.id = c.match_sheet_id
      left join public.match_sheet_slots sl on sl.match_sheet_id = c.match_sheet_id and sl.slot = c.slot
  ),
  cards as (
    select k,
           count(*) filter (where colour = 'yellow')::int as yellows,
           count(*) filter (where colour = 'red')::int    as reds
      from carded
     group by k
  )
  select p.player_id, p.full_name, p.games, p.starts, p.bench,
         coalesce(s.tries, 0), coalesce(s.conversions, 0), coalesce(s.penalties, 0), coalesce(s.drops, 0),
         coalesce(c.yellows, 0), coalesce(c.reds, 0)
    from people p
    left join scores s on s.k = p.k
    left join cards  c on c.k = p.k
   order by p.games desc, coalesce(s.tries, 0) desc, p.full_name;
$$;

revoke execute on function public.senior_season_stats(uuid, text) from public;
grant execute on function public.senior_season_stats(uuid, text) to authenticated;

-- ── the gap ────────────────────────────────────────────────────────────────
-- Played games with a sheet, and how many of those have MORE tries recorded
-- on the fixture than named on the sheet. A blank (null) try count is not a
-- gap: nobody recorded a score, so there is nothing to name.
create or replace function public.senior_season_stats_gaps(_team uuid, _season text)
returns table (played integer, unnamed integer)
language sql
stable security definer
set search_path = public
as $$
  with gate as (
    select 1
      from public.teams t
     where t.id = _team
       and t.section is not null
       and (private.same_section_member(_team) or private.can_edit_team(_team))
  ),
  win as (
    select make_date(y, 9, 1) as from_date, make_date(y + 1, 8, 31) as to_date
      from (select substring(_season from '^(\d{4})-(\d{2})$')::int as y,
                   substring(_season from '^\d{4}-(\d{2})$')::int as yy) s
     where y is not null and yy = (y + 1) % 100
  ),
  sheets as (
    select ms.id, e.tries_us
      from public.match_sheets ms
      join public.events e on e.id = ms.event_id
      cross join win
     where exists (select 1 from gate)
       and e.team_id = _team
       and e.starts_at < now()
       and (e.starts_at at time zone 'Asia/Dubai')::date between win.from_date and win.to_date
  ),
  named as (
    select sh.id, sh.tries_us,
           coalesce((select sum(qty) from public.match_sheet_scores sc
                      where sc.match_sheet_id = sh.id and sc.kind = 'tries'), 0) as tries_named
      from sheets sh
  )
  select count(*)::int as played,
         count(*) filter (where coalesce(tries_us, 0) > tries_named)::int as unnamed
    from named
  having exists (select 1 from gate);
$$;

revoke execute on function public.senior_season_stats_gaps(uuid, text) from public;
grant execute on function public.senior_season_stats_gaps(uuid, text) to authenticated;
```

- [ ] **Step 2: Write the harness, with the migration inline for the dry run**

```sql
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

-- ── DRY RUN ONLY: the migration, inline. DELETE THIS BLOCK once the migration
--    is applied to live, so the harness tests the live function and not a copy.
-- <paste the whole of db/migrations/20260906_senior_season_stats.sql here>
-- ── end dry-run block ──

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
  p_a uuid; p_b uuid; p_c uuid; p_child uuid;
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
  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
    (u_mate,   club, t_men2, 'player', 'active', p_c),
    (u_women,  club, t_women, 'player', 'active', null),
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
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
```

- [ ] **Step 3: Run the dry run**

Run: `npm run db:check -- season-stats`
Expected: fifteen rows, every outcome `PASS`. If the runner says it cannot connect, `.env` lacks `SUPABASE_DB_URL` — stop and ask Jay to add it (see Global Constraints).

- [ ] **Step 4: Prove the harness discriminates (three injected faults, one at a time, each reverted)**

In the inline copy of the migration inside the harness:

1. Change `count(*) filter (where slot <= 15)` to `slot <= 19`. Run. Expected: row 3 `FAIL` (bench 0). Revert.
2. Change `at time zone 'Asia/Dubai'` to `at time zone 'UTC'` in `senior_season_stats`. Run. Expected: row 4c `FAIL 1`. Revert.
3. Delete the line `and t.section is not null` from the gate in `senior_season_stats`. Run. Expected: row 14 `FAIL 1`. Revert.

Run once more: all `PASS`.

- [ ] **Step 5: Commit the dry-run state**

```bash
git add db/migrations/20260906_senior_season_stats.sql db/tests/season-stats.sql
git commit -m "feat(db): match_sheet_scores and the senior season stats functions, with the rolled-back harness (dry run)"
```

- [ ] **Step 6: Apply the migration to live**

In the Supabase MCP: `apply_migration` with name `senior_season_stats` and the file's contents verbatim. Then in the harness delete the dry-run block (from `-- ── DRY RUN ONLY` to `-- ── end dry-run block ──`).

- [ ] **Step 7: Run the harness against the live function, and the whole suite**

Run: `npm run db:check -- season-stats` — Expected: all `PASS`.
Run: `npm run db:check` — Expected: every harness green, in particular `anon-table-grants` (the new table must show no anon privilege) and `grants`. ⚠️ Run the whole thing, not the filtered form: your harness passing says nothing about the ones you may have broken.

- [ ] **Step 8: Commit**

```bash
git add db/tests/season-stats.sql
git commit -m "test(db): season-stats harness now runs against the applied migration"
```

---

### Task 2: Capture the schema

**Files:**
- Modify: `db/schema/tables.sql` (after the `match_sheet_cards` block, ~line 1545)
- Modify: `db/schema/policies.sql` (after "match sheet card manage", ~line 1082)
- Modify: `db/schema/functions.sql` (append)
- Modify: `db/schema/grants.sql:209` (a row after `match_sheet_cards`)

- [ ] **Step 1: Capture from live, not from the migration**

In the Supabase MCP, `execute_sql`:

```sql
select pg_get_functiondef('public.senior_season_stats(uuid, text)'::regprocedure)
union all
select pg_get_functiondef('public.senior_season_stats_gaps(uuid, text)'::regprocedure);
```

and

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'match_sheet_scores' order by ordinal_position;
```

- [ ] **Step 2: Add the captures**

`tables.sql`, after the cards block:

```sql
-- public.match_sheet_scores
-- Added 2026-09-06 (migration senior_season_stats). Who scored, on a SENIOR
-- sheet. The cards table's twin: the slot is the link and full_name is the
-- name as filed; no player_id of its own. `qty`, not `count`.
CREATE TABLE public.match_sheet_scores (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  match_sheet_id uuid        NOT NULL,
  kind           text        NOT NULL,
  slot           smallint,
  full_name      text,
  qty            smallint    NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_sheet_scores_pkey PRIMARY KEY (id),
  CONSTRAINT match_sheet_scores_match_sheet_id_fkey FOREIGN KEY (match_sheet_id) REFERENCES match_sheets(id) ON DELETE CASCADE,
  CONSTRAINT match_sheet_scores_kind_check CHECK ((kind = ANY (ARRAY['tries'::text, 'conversions'::text, 'penalties'::text, 'drops'::text]))),
  CONSTRAINT match_sheet_scores_slot_check CHECK (((slot IS NULL) OR ((slot >= 1) AND (slot <= 22)))),
  CONSTRAINT match_sheet_scores_qty_check CHECK ((qty > 0))
);
ALTER TABLE public.match_sheet_scores ENABLE ROW LEVEL SECURITY;
CREATE INDEX match_sheet_scores_sheet_idx ON public.match_sheet_scores USING btree (match_sheet_id);
```

`policies.sql`, after the cards policy:

```sql
CREATE POLICY "match sheet score manage" ON public.match_sheet_scores
  FOR ALL USING (private.can_edit_match_sheet(match_sheet_id))
  WITH CHECK (private.can_edit_match_sheet(match_sheet_id));
```

`functions.sql`: append both `pg_get_functiondef` outputs verbatim under a header
`-- Added 2026-09-06 (senior_season_stats, senior_season_stats_gaps). Spec: claude/plans/2026-09-04-senior-season-stats.md`.

`grants.sql`, after line 209:

```
--   match_sheet_scores authenticated, postgres, service_role         ALL 8 (anon revoked)
--                     ⚠️ ADDED 6 Sep 2026 (db/migrations/20260906_senior_season_stats.sql).
--                     Explicit grant to authenticated and service_role; anon
--                     revoked in the migration. Harness: db/tests/season-stats.sql.
```

- [ ] **Step 3: Run docs:check**

Run: `npm run docs:check`
Expected: `ok    table and column grants captured`. (The changelog-coverage line may fail for a pre-existing short-SHA reason unrelated to this branch; see the spawned task "Fix docs-check short-SHA length mismatch". Every other line must be `ok`.)

- [ ] **Step 4: Commit**

```bash
git add db/schema/tables.sql db/schema/policies.sql db/schema/functions.sql db/schema/grants.sql
git commit -m "docs(schema): capture match_sheet_scores and the season stats functions"
```

---

### Task 3: The season label

**Files:**
- Create: `src/lib/season.js`
- Test: `tests/season-label.test.js`

**Interfaces:**
- Consumes: `CUTOFF_MONTH`, `CUTOFF_DAY` from `src/lib/ageGrade.js`; `CLUB_TIME_ZONE` from `src/lib/eventFormat.js`.
- Produces: `seasonLabelFor(date: Date = new Date()): string` → `'2026-27'`.

- [ ] **Step 1: Write the failing test**

```js
// tests/season-label.test.js
import { describe, it, expect } from 'vitest'
import { seasonLabelFor } from '../src/lib/season.js'

describe('seasonLabelFor — 1 Sep to 31 Aug, in club time', () => {
  it('a September date is the season that starts that year', () => {
    expect(seasonLabelFor(new Date('2026-09-04T08:00:00Z'))).toBe('2026-27')
  })
  it('a January date belongs to the season that started the previous September', () => {
    expect(seasonLabelFor(new Date('2027-01-15T08:00:00Z'))).toBe('2026-27')
  })
  it('⚠️ 23:30 on 31 Aug DUBAI is still the old season', () => {
    // 19:30Z — the UTC date agrees, so this is the control.
    expect(seasonLabelFor(new Date('2026-08-31T19:30:00Z'))).toBe('2025-26')
  })
  it('⚠️ 00:30 on 1 Sep DUBAI is the new season although the UTC date is 31 Aug', () => {
    // 20:30Z on 31 Aug. A UTC reading says 2025-26; the club says 2026-27.
    expect(seasonLabelFor(new Date('2026-08-31T20:30:00Z'))).toBe('2026-27')
  })
  it('pads the second year: 2099 → 2099-00', () => {
    expect(seasonLabelFor(new Date('2099-10-01T08:00:00Z'))).toBe('2099-00')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/season-label.test.js`
Expected: FAIL — cannot resolve `../src/lib/season.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/season.js
//
// The season a date belongs to, as the label the league import uses
// ('2026-27'). ⚠️ NOT A SECOND COPY OF THE CUT-OFF: the month and day come from
// ageGrade.js, where the club's 31 August rule already lives, and the zone is
// CLUB_TIME_ZONE. The database function senior_season_stats applies the same
// window in SQL; if either side changes, db/tests/season-stats.sql and
// tests/season-label.test.js both carry the 31 Aug 23:30 / 1 Sep 00:30 pair.
import { CUTOFF_MONTH, CUTOFF_DAY } from './ageGrade.js'
import { CLUB_TIME_ZONE } from './eventFormat.js'

/** Year, month (1-12) and day of `date` in the club's zone. */
function clubParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** '2026-27' for any date from 1 Sep 2026 to 31 Aug 2027, club time. */
export function seasonLabelFor(date = new Date()) {
  const { year, month, day } = clubParts(date)
  const afterCutoff = month > CUTOFF_MONTH || (month === CUTOFF_MONTH && day > CUTOFF_DAY)
  const start = afterCutoff ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/season-label.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season.js tests/season-label.test.js
git commit -m "feat(lib): seasonLabelFor — the 1 Sep to 31 Aug label, in club time"
```

---

### Task 4: The data layer — scores on the sheet, and the two RPC wrappers

**Files:**
- Modify: `src/data/matchSheets.js` (the `getMatchSheet` select at line 51; append `saveMatchSheetScores` after `saveMatchSheetCards`, line 189)
- Modify: `src/data/events.js:120`
- Create: `src/data/seasonStats.js`
- Test: `tests/season-stats-data.test.js`

**Interfaces:**
- Produces: `saveMatchSheetScores(matchSheetId, rows)` — `rows` are `{ kind, slot, full_name, qty }`; rows with no kind or no numeric slot are dropped; `qty` blank → 1. `getMatchSheet` now returns `scores: [{ id, kind, slot, full_name, qty }]`. `seasonStats(teamId, season)` → the function's rows, `[]` on none. `seasonStatsGaps(teamId, season)` → `{ played, unnamed }`, zeros on none. `getEvent(...).team.section` is present.

- [ ] **Step 1: Write the failing tests**

```js
// tests/season-stats-data.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const del = vi.fn()
const insert = vi.fn()
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({
      delete: () => ({ eq: (...a) => del(...a) }),
      insert: (rows) => ({ select: () => insert(rows) }),
    }),
  },
}))

import { seasonStats, seasonStatsGaps } from '../src/data/seasonStats.js'
import { saveMatchSheetScores } from '../src/data/matchSheets.js'

beforeEach(() => {
  vi.clearAllMocks()
  del.mockResolvedValue({ error: null })
  insert.mockImplementation(async (rows) => ({ data: rows, error: null }))
})

describe('seasonStats', () => {
  it('calls the function with the squad and season, and returns its rows', async () => {
    rpc.mockResolvedValue({ data: [{ player_id: 'p1', games: 3 }], error: null })
    const rows = await seasonStats('t-men1', '2026-27')
    expect(rpc).toHaveBeenCalledWith('senior_season_stats', { _team: 't-men1', _season: '2026-27' })
    expect(rows).toEqual([{ player_id: 'p1', games: 3 }])
  })
  it('returns [] when the database refuses (no rows)', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await seasonStats('t-u10', '2026-27')).toEqual([])
  })
})

describe('seasonStatsGaps', () => {
  it('unwraps the single row', async () => {
    rpc.mockResolvedValue({ data: [{ played: 7, unnamed: 2 }], error: null })
    expect(await seasonStatsGaps('t-men1', '2026-27')).toEqual({ played: 7, unnamed: 2 })
    expect(rpc).toHaveBeenCalledWith('senior_season_stats_gaps', { _team: 't-men1', _season: '2026-27' })
  })
  it('is zeros when the database returns nothing', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await seasonStatsGaps('t-u10', '2026-27')).toEqual({ played: 0, unnamed: 0 })
  })
})

describe('saveMatchSheetScores', () => {
  it('replaces the sheet’s rows, dropping rows with no kind or no slot, and defaulting qty to 1', async () => {
    const rows = await saveMatchSheetScores('ms-1', [
      { kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 },
      { kind: '', slot: 3, full_name: 'Nobody', qty: 1 },
      { kind: 'conversions', slot: '', full_name: '', qty: '' },
      { kind: 'penalties', slot: 15, full_name: 'Harness Full Back', qty: '' },
    ])
    expect(del).toHaveBeenCalledWith('match_sheet_id', 'ms-1')
    expect(insert).toHaveBeenCalledWith([
      { match_sheet_id: 'ms-1', kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 },
      { match_sheet_id: 'ms-1', kind: 'penalties', slot: 15, full_name: 'Harness Full Back', qty: 1 },
    ])
    expect(rows).toHaveLength(2)
  })
  it('refuses without a sheet id', async () => {
    await expect(saveMatchSheetScores(null, [])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/season-stats-data.test.js`
Expected: FAIL — `seasonStats.js` not found; `saveMatchSheetScores` is not exported.

- [ ] **Step 3: Implement**

`src/data/seasonStats.js`:

```js
// Season stats for a SENIOR squad — the two database functions from
// db/migrations/20260906_senior_season_stats.sql, and nothing computed here.
//
// ⚠️ THE GATE IS IN THE DATABASE, not in these wrappers. A caller outside the
// section, or asking about a junior squad, gets [] — the same shape as "no
// games yet", on purpose: a screen must not be able to tell "refused" from
// "nothing", because that difference is the leak.
import { supabase } from '../lib/supabase'

/** Rows of { player_id, full_name, games, starts, bench, tries, conversions, penalties, drops, yellows, reds }. */
export async function seasonStats(teamId, season) {
  const { data, error } = await supabase.rpc('senior_season_stats', { _team: teamId, _season: season })
  if (error) throw error
  return data ?? []
}

/** { played, unnamed } — played games with a sheet, and those with more tries recorded than named. */
export async function seasonStatsGaps(teamId, season) {
  const { data, error } = await supabase.rpc('senior_season_stats_gaps', { _team: teamId, _season: season })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { played: row?.played ?? 0, unnamed: row?.unnamed ?? 0 }
}
```

`src/data/matchSheets.js` — the select in `getMatchSheet` becomes:

```js
    .select(
      '*, league_team:league_teams(id, rcm_name, division), slots:match_sheet_slots(*), cards:match_sheet_cards(*), scores:match_sheet_scores(*)',
    )
```

and the returned object gains, after `cards:`:

```js
    scores: [...(data.scores ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
```

Append after `saveMatchSheetCards`:

```js
/**
 * Replaces the scorer rows for a match sheet — the cards pattern, verbatim.
 *
 * A row with no kind or no numeric slot is not a scorer; it is an empty box on
 * the editor, and is dropped rather than refused. `qty` blank means one.
 * ⚠️ NO player_id IS WRITTEN. The slot is the link (see match_sheet_scores in
 * db/schema/tables.sql); full_name is the name as filed, beside it.
 */
export async function saveMatchSheetScores(matchSheetId, rows) {
  if (!matchSheetId) throw new Error(REFUSED)

  const kept = (rows ?? [])
    .filter((row) => row?.kind && Number.isFinite(Number(row.slot)) && String(row.slot).trim() !== '')
    .map((row) => {
      const qty = Number(row.qty)
      return {
        match_sheet_id: matchSheetId,
        kind: row.kind,
        slot: Number(row.slot),
        full_name: row.full_name ? String(row.full_name).trim() : null,
        qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
      }
    })

  const { error: clearError } = await supabase
    .from('match_sheet_scores')
    .delete()
    .eq('match_sheet_id', matchSheetId)
  if (clearError) throw wrapDbError(clearError, REFUSED)

  if (kept.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_scores').insert(kept).select()
  if (error) throw wrapDbError(error, REFUSED)
  return data ?? []
}
```

`src/data/events.js:120` — add `section` to the team embed:

```js
      '*, league_team:league_teams(id, rcm_name, division), team:teams(id, name, sort_order, scoring_kinds, section)',
```

- [ ] **Step 4: Run to verify they pass, plus the sheet suites that embed the select**

Run: `npx vitest run tests/season-stats-data.test.js tests/match-sheets.test.jsx tests/match-sheet-draft.test.jsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/seasonStats.js src/data/matchSheets.js src/data/events.js tests/season-stats-data.test.js
git commit -m "feat(data): saveMatchSheetScores, the season stats RPC wrappers, and section on the sheet's team embed"
```

---

### Task 5: The scorers block on the match sheet editor

**Files:**
- Modify: `src/components/MatchSheetEntry.jsx` (new props; block between Cards and Medical, after line 234)
- Modify: `src/screens/MatchSheet.jsx` (state near line 401; draft at 434 and 524; load at 498; save at 763; props at 1209)
- Test: `tests/match-sheet-scorers.test.jsx`

**Interfaces:**
- Consumes: `saveMatchSheetScores` (Task 4); `getMatchSheet(...).scores`; `event.team.section`; `SCORE_KINDS`, `SCORE_LABELS` from `src/lib/scoring.js`.
- Produces: `MatchSheetEntry` props `scoreRows`, `onScore(index, key)`, `scoreKinds`, `scorerGaps`, `showScorers`. State shape `scoreRows: [{ kind, slot, full_name, qty }]`, `SCORE_ROWS = 6`.

- [ ] **Step 1: Write the failing tests**

```jsx
// tests/match-sheet-scorers.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const useMembershipsMock = vi.fn()
const useMyProfileMock = vi.fn()
const upsertEventMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
const saveScoresMock = vi.fn()
const setStatusMock = vi.fn()
const listLineupsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/useMyProfile.js', () => ({ default: () => useMyProfileMock() }))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...a) => upsertEventMock(...a),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  subscribePlayers: () => () => {},
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    ...actual,
    getMatchSheet: (...a) => getMatchSheetMock(...a),
    saveMatchSheet: (...a) => saveMatchSheetMock(...a),
    saveMatchSheetSlots: (...a) => saveSlotsMock(...a),
    saveMatchSheetCards: (...a) => saveCardsMock(...a),
    saveMatchSheetScores: (...a) => saveScoresMock(...a),
    setMatchSheetStatus: (...a) => setStatusMock(...a),
  }
})

import MatchSheet from '../src/screens/MatchSheet.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const MEN1 = { id: 't-men1', club_id: CLUB, name: 'Senior Men - 1st XV', sort_order: 16, section: 'senior_men', is_senior: true }
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9, section: null }

function matchFor(team) {
  return {
    id: 'e-1',
    club_id: CLUB,
    team_id: team.id,
    type: 'match',
    competition_type: 'league',
    opponent: 'Harness Opposition',
    home: true,
    starts_at: '2026-10-10T11:00:00.000Z',
    ends_at: '2026-10-10T12:30:00.000Z',
    round: 1,
    league_team_id: null,
    league_team: null,
    team,
    tries_us: 3,
    conversions_us: 1,
  }
}

function mount(team) {
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: team.id, club_id: CLUB }],
    teams: [team],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  getEventMock.mockResolvedValue(matchFor(team))
  render(
    <MemoryRouter initialEntries={['/match-sheet/e-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={<MatchSheet />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  upsertEventMock.mockImplementation(async (patch) => ({ ...patch }))
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 't-men1', full_name: 'Harness Fly Half' },
    { id: 'p2', team_id: 't-men1', full_name: 'Harness Hooker' },
  ])
  getMatchSheetMock.mockResolvedValue(null)
  listLineupsMock.mockResolvedValue([])
  saveMatchSheetMock.mockResolvedValue({ id: 'ms-1', status: 'draft', league_team_id: null, league_team: null })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  saveScoresMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
})

describe('the scorers block — seniors only', () => {
  it('is absent on a junior squad’s sheet', async () => {
    mount(U14B)
    await screen.findByTestId('match-sheet-facsimile')
    expect(screen.queryByRole('heading', { name: 'Scorers' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Scorer 1 kind')).not.toBeInTheDocument()
  })

  it('is present on a senior squad’s sheet, lists the filled slots by name, and saves the rows', async () => {
    const user = mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    expect(screen.getByRole('heading', { name: 'Scorers' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Player 10'), 'Harness Fly Half')
    await user.selectOptions(screen.getByLabelText('Scorer 1 kind'), 'tries')
    // The player select offers the slot by its number and filed name.
    await user.selectOptions(screen.getByLabelText('Scorer 1 player'), '10')
    await user.clear(screen.getByLabelText('Scorer 1 how many'))
    await user.type(screen.getByLabelText('Scorer 1 how many'), '2')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveScoresMock).toHaveBeenCalled())
    const [sheetId, rows] = saveScoresMock.mock.calls[0]
    expect(sheetId).toBe('ms-1')
    expect(rows[0]).toMatchObject({ kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 })
  })

  it('shows a soft note when the fixture records more tries than are named, and never blocks the save', async () => {
    const user = mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    // The fixture arrives with 3 tries and 1 conversion recorded; nothing named yet.
    expect(await screen.findByText('3 tries scored, 0 named')).toHaveAttribute('role', 'status')
    expect(screen.getByText('1 conversion scored, 0 named')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Player 10'), 'Harness Fly Half')
    await user.selectOptions(screen.getByLabelText('Scorer 1 kind'), 'tries')
    await user.selectOptions(screen.getByLabelText('Scorer 1 player'), '10')
    await user.clear(screen.getByLabelText('Scorer 1 how many'))
    await user.type(screen.getByLabelText('Scorer 1 how many'), '3')
    expect(screen.queryByText(/tries scored/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save draft/i }))
    await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
  })

  it('a blank score produces no note', async () => {
    getEventMock.mockResolvedValue({ ...matchFor(MEN1), tries_us: null, conversions_us: null })
    mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    expect(screen.queryByText(/scored, /)).not.toBeInTheDocument()
  })

  it('prefills from stored rows and keeps them in the draft', async () => {
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1', status: 'draft', league_team_id: null, league_team: null,
      slots: [{ slot: 10, player_id: 'p1', full_name: 'Harness Fly Half', front_row: false }],
      cards: [],
      scores: [{ id: 's1', kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 }],
    })
    mount(MEN1)
    await screen.findByTestId('match-sheet-facsimile')
    expect(await screen.findByLabelText('Scorer 1 kind')).toHaveValue('tries')
    expect(screen.getByLabelText('Scorer 1 player')).toHaveValue('10')
    expect(screen.getByLabelText('Scorer 1 how many')).toHaveValue(2)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/match-sheet-scorers.test.jsx`
Expected: the first passes (nothing is rendered yet); the other four FAIL on missing labels.

- [ ] **Step 3: Implement in `MatchSheet.jsx`**

Near line 87, beside `CARD_ROWS`:

```js
/** Scorer rows offered by default. A row with no kind or player is ignored on save. */
const SCORE_ROWS = 6
```

After `emptyCards()` (line 382):

```js
function emptyScoreRows() {
  return Array.from({ length: SCORE_ROWS }, () => ({ kind: '', slot: '', full_name: '', qty: '' }))
}

/**
 * "3 tries scored, 2 named" — one line per kind where the fixture RECORDS a
 * number and the named scorers do not add up to it. A blank on the fixture is
 * not a mismatch: nobody recorded a score, so there is nothing to name.
 * ⚠️ A NOTE, NEVER A GATE. The RCM sheet is complete without scorers.
 */
function scorerGapsFor(score, scoreRows, kinds) {
  const gaps = []
  for (const kind of kinds) {
    const text = String(score?.[`${kind}_us`] ?? '').trim()
    const recorded = text === '' ? null : Number(text)
    if (recorded == null || !Number.isFinite(recorded)) continue
    const named = scoreRows
      .filter((row) => row.kind === kind && String(row.slot).trim() !== '')
      .reduce((sum, row) => sum + (Number(row.qty) > 0 ? Math.floor(Number(row.qty)) : 1), 0)
    if (named === recorded) continue
    const word = SCORE_LABELS[kind].toLowerCase()
    const singular = { tries: 'try', conversions: 'conversion', penalties: 'penalty', drops: 'drop goal' }[kind]
    gaps.push({ kind, text: `${recorded} ${recorded === 1 ? singular : word} scored, ${named} named` })
  }
  return gaps
}
```

(Import `SCORE_LABELS` from `'../lib/scoring.js'` beside `SCORE_KINDS` at line 32.)

State, after `cardRows` (line 401):

```js
  const [scoreRows, setScoreRows] = useState(emptyScoreRows)
```

The draft write (line 434) becomes:

```js
    writeDraft(eventId, { fields, slots, cardRows, scoreRows, score, savedAt: Date.now() })
  }, [dirty, fields, slots, cardRows, scoreRows, score, eventId])
```

The load, after the cards prefill inside `if (existing)` (after line 509):

```js
          if (existing.scores?.length) {
            const filled = existing.scores.map((row) => ({
              kind: row.kind ?? '',
              slot: row.slot ?? '',
              full_name: row.full_name ?? '',
              qty: row.qty ?? '',
            }))
            while (filled.length < SCORE_ROWS) filled.push(emptyScoreRows()[0])
            setScoreRows(filled)
          }
```

The draft restore (after line 524):

```js
            if (Array.isArray(draft.scoreRows) && draft.scoreRows.length) setScoreRows(draft.scoreRows)
```

A setter beside `setCard` (line 621):

```js
  const setScore_ = (index, key) => (e) => {
    const value = e.target.value
    markEdited()
    setScoreRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row
        // Picking a player stamps the name as filed, from the slot above.
        if (key === 'slot') {
          const slotRow = slots.find((s) => String(s.slot) === String(value))
          return { ...row, slot: value, full_name: slotRow?.full_name ?? '' }
        }
        return { ...row, [key]: value }
      }),
    )
  }
```

(Name it `setScorer` if `setScore` already exists as the score setter — it does, so use `setScorer`.)

In the save, after `saveMatchSheetCards` (line 772) and only for a senior squad:

```js
        if (event?.team?.section) {
          await saveMatchSheetScores(
            row.id,
            scoreRows.map((r) => ({ ...r, slot: numeric(r.slot), qty: numeric(r.qty) })),
          )
        }
```

Add `scoreRows` to that callback's dependency array, and import `saveMatchSheetScores` at line 14.

Derived, beside `kinds` (line 638):

```js
  const showScorers = Boolean(event?.team?.section)
  const scorerGaps = showScorers ? scorerGapsFor(score, scoreRows, kinds) : []
```

Props (line 1209):

```jsx
        <MatchSheetEntry
          slots={slots}
          onName={nameChanged}
          onSlot={setSlot}
          cardRows={cardRows}
          onCard={setCard}
          fields={fields}
          onField={setField}
          showScorers={showScorers}
          scoreRows={scoreRows}
          onScorer={setScorer}
          scoreKinds={kinds}
          scorerGaps={scorerGaps}
        />
```

- [ ] **Step 4: Implement in `MatchSheetEntry.jsx`**

Props: add `showScorers = false, scoreRows = [], onScorer = () => () => {}, scoreKinds = [], scorerGaps = []`. Import `SCORE_LABELS` from `'../lib/scoring.js'`. Insert between the Cards block and Medical (after line 234):

```jsx
      {/* ── Scorers. SENIOR SQUADS ONLY, and NOT on the facsimile. ──────────
          The club's own record beside RCM's form: who scored, picked from the
          22 above so the slot is the link (match_sheet_scores). A note when the
          fixture's score and the names disagree — never a gate. Spec:
          claude/plans/2026-09-04-senior-season-stats.md §1. */}
      {showScorers && (
        <div className="mt-4" data-testid="scorers-block">
          <h4 className="text-[13px] font-bold text-ink">Scorers</h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Who scored, for the season stats. Not part of the RCM sheet. Leave a row blank if there was nothing.
          </p>
          {scorerGaps.map((gap) => (
            <p key={gap.kind} role="status" className="mt-1.5 text-[12.5px] font-semibold text-warn">
              {gap.text}
            </p>
          ))}
          {scoreRows.map((row, index) => (
            <div key={index} className="mt-2.5 rounded-[11px] border-[1.5px] border-line p-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_64px] gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Kind</span>
                  <select aria-label={`Scorer ${index + 1} kind`} value={row.kind} onChange={onScorer(index, 'kind')} className={FIELD}>
                    <option value="">—</option>
                    {scoreKinds.map((kind) => (
                      <option key={kind} value={kind}>{SCORE_LABELS[kind]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">Player</span>
                  <select aria-label={`Scorer ${index + 1} player`} value={row.slot} onChange={onScorer(index, 'slot')} className={FIELD}>
                    <option value="">—</option>
                    {slots.filter((s) => s.full_name).map((s) => (
                      <option key={s.slot} value={String(s.slot)}>{s.slot} · {s.full_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-bold text-ink-muted">How many</span>
                  <input type="number" min="1" inputMode="numeric" aria-label={`Scorer ${index + 1} how many`} value={row.qty} onChange={onScorer(index, 'qty')} className={FIELD} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
```

⚠️ `text-warn` must exist in `tailwind.config.js`; if it does not, use `text-ink-muted` and say so in the commit.

- [ ] **Step 5: Run the new file and every existing sheet suite**

Run: `npx vitest run tests/match-sheet-scorers.test.jsx tests/match-sheets.test.jsx tests/match-sheet-draft.test.jsx tests/match-sheet-format.test.jsx tests/match-sheet-leavers.test.jsx`
Expected: all pass. If `toHaveValue(2)` fails on the number input, assert `toHaveValue(2)` against `type="number"` — jsdom returns a number for it; if the input is text, assert `'2'`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/MatchSheet.jsx src/components/MatchSheetEntry.jsx tests/match-sheet-scorers.test.jsx
git commit -m "feat(sheet): the Scorers block on senior sheets — rows from the 22, a soft note, saved beside the cards"
```

---

### Task 6: The table component

**Files:**
- Create: `src/components/SeasonStatsTable.jsx`
- Test: `tests/season-stats-table.test.jsx`

**Interfaces:**
- Produces: `<SeasonStatsTable rows={[...]} limit={n?} testId="season-stats-table" />`. Sorts by a tapped heading (desc for numbers, asc for the name), default games desc, tries desc, name asc. `limit` shows the first N after sorting and the parent renders its own "Show all".

- [ ] **Step 1: Write the failing test**

```jsx
// tests/season-stats-table.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeasonStatsTable from '../src/components/SeasonStatsTable.jsx'

const ROWS = [
  { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 3, bench: 0, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 0, reds: 0 },
  { player_id: 'p2', full_name: 'Harness Wing', games: 3, starts: 2, bench: 1, tries: 5, conversions: 0, penalties: 0, drops: 0, yellows: 1, reds: 0 },
  { player_id: 'p3', full_name: 'Harness Prop', games: 1, starts: 0, bench: 1, tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 1 },
]

function names() {
  return screen.getAllByTestId('season-stats-row').map((tr) => within(tr).getAllByRole('cell')[0].textContent)
}

describe('SeasonStatsTable', () => {
  it('defaults to games desc, then tries desc', () => {
    render(<SeasonStatsTable rows={ROWS} />)
    expect(names()).toEqual(['Harness Wing', 'Harness Fly Half', 'Harness Prop'])
  })
  it('a tapped heading sorts by that column, desc, and says so', async () => {
    const user = userEvent.setup()
    render(<SeasonStatsTable rows={ROWS} />)
    await user.click(screen.getByRole('button', { name: 'Conversions' }))
    expect(names()[0]).toBe('Harness Fly Half')
    expect(screen.getByRole('columnheader', { name: /conversions/i })).toHaveAttribute('aria-sort', 'descending')
  })
  it('the abbreviated headings carry the full word for assistive tech', () => {
    render(<SeasonStatsTable rows={ROWS} />)
    expect(screen.getByRole('button', { name: 'Drop goals' })).toHaveTextContent('DG')
    expect(screen.getByRole('button', { name: 'Bench' })).toBeInTheDocument()
  })
  it('limit shows the first N after sorting', () => {
    render(<SeasonStatsTable rows={ROWS} limit={2} />)
    expect(names()).toEqual(['Harness Wing', 'Harness Fly Half'])
  })
  it('says so when there is nothing', () => {
    render(<SeasonStatsTable rows={[]} />)
    expect(screen.getByText('No games on a sheet yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/season-stats-table.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// src/components/SeasonStatsTable.jsx
//
// One table for the squad page, the Seniors overview and (as a single row) the
// player sheet, so the three cannot drift. Rows are senior_season_stats rows.
//
// ⚠️ "BENCH", NEVER "SUB APPEARANCES". The sheet records who was selected on
// the bench, not who came on; the heading must not claim more than it knows.
import { useMemo, useState } from 'react'

const COLUMNS = [
  { key: 'games', short: 'G', label: 'Games' },
  { key: 'starts', short: 'St', label: 'Starts' },
  { key: 'bench', short: 'B', label: 'Bench' },
  { key: 'tries', short: 'T', label: 'Tries' },
  { key: 'conversions', short: 'C', label: 'Conversions' },
  { key: 'penalties', short: 'P', label: 'Penalties' },
  { key: 'drops', short: 'DG', label: 'Drop goals' },
  { key: 'yellows', short: 'YC', label: 'Yellow cards' },
  { key: 'reds', short: 'RC', label: 'Red cards' },
]

export function sortStats(rows, key) {
  const copy = [...rows]
  if (key === 'full_name') return copy.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  return copy.sort(
    (a, b) =>
      (b[key] ?? 0) - (a[key] ?? 0) ||
      (b.games ?? 0) - (a.games ?? 0) ||
      (b.tries ?? 0) - (a.tries ?? 0) ||
      (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  )
}

export default function SeasonStatsTable({ rows, limit, testId = 'season-stats-table' }) {
  const [sortKey, setSortKey] = useState('games')
  const sorted = useMemo(() => sortStats(rows ?? [], sortKey), [rows, sortKey])
  const shown = typeof limit === 'number' ? sorted.slice(0, limit) : sorted

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-ink-faint">No games on a sheet yet.</p>
  }

  const TH = 'px-1.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[.6px] text-ink-muted'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] tabular-nums" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} text-left`} aria-sort={sortKey === 'full_name' ? 'ascending' : 'none'}>
              <button type="button" onClick={() => setSortKey('full_name')} aria-label="Player" className="underline-offset-2 hover:underline">
                Player
              </button>
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} scope="col" className={`${TH} text-right`} aria-sort={sortKey === col.key ? 'descending' : 'none'}>
                <button
                  type="button"
                  onClick={() => setSortKey(col.key)}
                  aria-label={col.label}
                  title={col.label}
                  className="underline-offset-2 hover:underline"
                >
                  {col.short}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.player_id ?? row.full_name} data-testid="season-stats-row" className="border-t border-line">
              <td className="px-1.5 py-1.5 text-left font-semibold text-ink">{row.full_name}</td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="px-1.5 py-1.5 text-right text-ink">
                  {row[col.key] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/season-stats-table.test.jsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/SeasonStatsTable.jsx tests/season-stats-table.test.jsx
git commit -m "feat(ui): SeasonStatsTable — one sortable table for the three season-stats surfaces"
```

---

### Task 7: The squad page card

**Files:**
- Modify: `src/screens/SquadHub.jsx` (imports at line 1-30; render after the `senior-section-link` paragraph, line 481)
- Test: `tests/squad-hub-season-stats.test.jsx`

**Interfaces:**
- Consumes: `seasonStats`, `seasonStatsGaps` (Task 4), `seasonLabelFor` (Task 3), `SeasonStatsTable` (Task 6).

- [ ] **Step 1: Write the failing test**

```jsx
// tests/squad-hub-season-stats.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const useMembershipsMock = vi.fn()
const seasonStatsMock = vi.fn()
const seasonStatsGapsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ listEvents: async () => [], subscribeEvents: () => () => {} }))
vi.mock('../src/data/players.js', () => ({ listPlayers: async () => [], subscribePlayers: () => () => {} }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: async () => [] }))
vi.mock('../src/data/attendance.js', () => ({ listAttendanceForEvents: async () => [] }))
vi.mock('../src/data/matchSheets.js', () => ({ listMatchSheetsFor: async () => [] }))
vi.mock('../src/data/leagueTeams.js', () => ({ listLeagueTeams: async () => [] }))
vi.mock('../src/data/announcements.js', () => ({ listNotices: async () => [], listMyReads: async () => [] }))
vi.mock('../src/data/documents.js', () => ({ listDocuments: async () => [] }))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: (...a) => seasonStatsGapsMock(...a),
}))
vi.mock('../src/components/CallupCard.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/EventDetail.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/Availability.jsx', () => ({ default: () => null }))
vi.mock('../src/screens/Register.jsx', () => ({ default: () => null }))

import SquadHub from '../src/screens/SquadHub.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 't-men1', club_id: CLUB, name: 'Senior Men - 1st XV', sort_order: 16, section: 'senior_men', is_senior: true },
  { id: 't-u12', club_id: CLUB, name: 'U12 Mixed', sort_order: 3, section: null, is_senior: false },
]
const ROWS = [
  { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 3, bench: 0, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 0, reds: 0 },
]

function renderAs(teamId) {
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: teamId, club_id: CLUB }],
    teams: TEAMS,
    loading: false,
  })
  render(
    <MemoryRouter initialEntries={[`/squad/${teamId}`]}>
      <Routes>
        <Route path="/squad/:teamId" element={<SquadHub />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockResolvedValue(ROWS)
  seasonStatsGapsMock.mockResolvedValue({ played: 7, unnamed: 2 })
})

describe('the squad page — season stats', () => {
  it('a senior squad gets the card, this season, and the gap line', async () => {
    renderAs('t-men1')
    expect(await screen.findByTestId('season-stats-card')).toBeInTheDocument()
    expect(seasonStatsMock).toHaveBeenCalledWith('t-men1', expect.stringMatching(/^\d{4}-\d{2}$/))
    expect(await screen.findByText('Harness Fly Half')).toBeInTheDocument()
    expect(screen.getByText('2 of 7 played games have no scorers named.')).toBeInTheDocument()
  })
  it('a junior squad gets no card and asks the database nothing', async () => {
    renderAs('t-u12')
    await screen.findByRole('heading', { name: /U12 Mixed/ })
    expect(screen.queryByTestId('season-stats-card')).not.toBeInTheDocument()
    expect(seasonStatsMock).not.toHaveBeenCalled()
  })
})
```

⚠️ If the mocked module lists for `announcements.js` / `documents.js` do not match what `SquadHub` imports, copy the exact mock shapes from `tests/squad-hub.test.jsx` lines 26-52 — those are the real import names.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/squad-hub-season-stats.test.jsx`
Expected: first FAILs (no card), second passes.

- [ ] **Step 3: Implement**

Imports in `SquadHub.jsx`:

```js
import SeasonStatsTable from '../components/SeasonStatsTable.jsx'
import { seasonStats, seasonStatsGaps } from '../data/seasonStats.js'
import { seasonLabelFor } from '../lib/season.js'
```

State and effect, inside `SquadHub()` after `const team = ...` (line 210):

```js
  // Season stats — SENIOR SQUADS ONLY. Asked for by section, not by is_senior:
  // the database function refuses a squad with no section anyway, and this
  // avoids one refused call per junior hub open.
  const season = seasonLabelFor()
  const [stats, setStats] = useState(null)
  const [gaps, setGaps] = useState({ played: 0, unnamed: 0 })
  useEffect(() => {
    if (!team?.section) {
      setStats(null)
      return undefined
    }
    let mounted = true
    Promise.all([seasonStats(team.id, season), seasonStatsGaps(team.id, season)])
      .then(([rows, gap]) => {
        if (!mounted) return
        setStats(rows)
        setGaps(gap)
      })
      .catch(() => mounted && setStats([]))
    return () => {
      mounted = false
    }
  }, [team?.id, team?.section, season])
```

Render, after the `senior-section-link` paragraph (line 481):

```jsx
          {team?.section && (
            <Card className="mb-3 p-3" data-testid="season-stats-card">
              <BlockTitle>Season stats · {season}</BlockTitle>
              {stats === null ? <Spinner /> : <SeasonStatsTable rows={stats} />}
              {gaps.unnamed > 0 && (
                <p className="mt-2 text-xs text-ink-muted" data-testid="season-stats-gap">
                  {gaps.unnamed} of {gaps.played} played games have no scorers named.
                </p>
              )}
            </Card>
          )}
```

- [ ] **Step 4: Run the new file and the existing hub suites**

Run: `npx vitest run tests/squad-hub-season-stats.test.jsx tests/squad-hub.test.jsx tests/squad-hub-event-sheet.test.jsx`
Expected: all pass. The existing hub tests must not now call the RPC: their teams have no section.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SquadHub.jsx tests/squad-hub-season-stats.test.jsx
git commit -m "feat(squad): Season stats card on a senior squad's page, with the unnamed-scorers line"
```

---

### Task 8: The Seniors overview section

**Files:**
- Modify: `src/screens/SeniorSection.jsx` (imports; load in the effect at line 85-108; render after the `season-record` section, line 340)
- Test: `tests/senior-section-stats.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/senior-section-stats.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const useMembershipsMock = vi.fn()
const seasonStatsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ listEvents: async () => [] }))
vi.mock('../src/data/players.js', () => ({ listPlayers: async () => [] }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: async () => [] }))
vi.mock('../src/data/leagueTeams.js', () => ({ listAllLeagueTeams: async () => [] }))
vi.mock('../src/data/competitions.js', () => ({ standings: async () => [] }))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))

import SeniorSection from '../src/screens/SeniorSection.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 'men1', club_id: CLUB, name: 'Senior Men - 1st XV', section: 'senior_men', sort_order: 16, is_senior: true },
  { id: 'men2', club_id: CLUB, name: 'Senior Men - 2nd XV', section: 'senior_men', sort_order: 17, is_senior: true },
  { id: 'women', club_id: CLUB, name: 'Senior Women', section: 'senior_women', sort_order: 19, is_senior: true },
]
const MEN2_PLAYER = [{ id: 'm1', role: 'player', status: 'active', team_id: 'men2', club_id: CLUB }]

function rowsFor(teamId, n) {
  return Array.from({ length: n }, (_, i) => ({
    player_id: `${teamId}-p${i}`, full_name: `Harness ${teamId} ${i}`, games: n - i, starts: n - i, bench: 0,
    tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 0,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockImplementation(async (teamId) => rowsFor(teamId, teamId === 'men1' ? 7 : 2))
})

describe('the seniors overview — season stats', () => {
  it('one table per squad of the section, top five with Show all', async () => {
    useMembershipsMock.mockReturnValue({ memberships: MEN2_PLAYER, teams: TEAMS, loading: false, error: null, reload: vi.fn() })
    render(
      <MemoryRouter initialEntries={['/seniors']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SeniorSection />
      </MemoryRouter>,
    )
    const section = await screen.findByTestId('season-stats')
    const blocks = within(section).getAllByTestId('season-stats-squad')
    expect(blocks).toHaveLength(2)
    expect(seasonStatsMock).toHaveBeenCalledWith('men1', expect.any(String))
    expect(seasonStatsMock).toHaveBeenCalledWith('men2', expect.any(String))
    expect(seasonStatsMock).not.toHaveBeenCalledWith('women', expect.any(String))

    const first = blocks[0]
    expect(within(first).getAllByTestId('season-stats-row')).toHaveLength(5)
    await userEvent.setup().click(within(first).getByRole('button', { name: 'Show all 7' }))
    expect(within(first).getAllByTestId('season-stats-row')).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/senior-section-stats.test.jsx`
Expected: FAIL — no `season-stats` test id.

- [ ] **Step 3: Implement**

Imports:

```js
import SeasonStatsTable from '../components/SeasonStatsTable.jsx'
import { seasonStats } from '../data/seasonStats.js'
import { seasonLabelFor } from '../lib/season.js'
```

State beside `records` (line 70):

```js
  const [stats, setStats] = useState(new Map())
  const [openStats, setOpenStats] = useState({})
  const season = seasonLabelFor()
```

Inside the effect's `.then`, after `setRecords(new Map(tables))`:

```js
        // Stats are for the section's OWN members; a foreign section reads none.
        const statRows = foreign
          ? []
          : await Promise.all(teamIds.map((id) => seasonStats(id, season).then((rows) => [id, rows]).catch(() => [id, []])))
        if (!mounted) return
        setStats(new Map(statRows))
```

Add `season` to the effect's dependency array.

Render, after the `season-record` section:

```jsx
          {!foreign && (
            <section className="mb-5" data-testid="season-stats">
              <BlockTitle>Season stats · {season}</BlockTitle>
              {sectionTeams.map((team) => {
                const rows = stats.get(team.id) ?? []
                const open = Boolean(openStats[team.id])
                return (
                  <Card key={team.id} className="mb-3 p-3" data-testid="season-stats-squad">
                    <p className="mb-1.5 text-xs font-bold text-ink-muted">{shortSquadName(team.name)}</p>
                    <SeasonStatsTable rows={rows} limit={open ? undefined : 5} />
                    {rows.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setOpenStats((c) => ({ ...c, [team.id]: !open }))}
                        className="mt-2 text-[12.5px] font-bold text-brand-ink underline-offset-2 hover:underline"
                      >
                        {open ? 'Show fewer' : `Show all ${rows.length}`}
                      </button>
                    )}
                  </Card>
                )
              })}
            </section>
          )}
```

- [ ] **Step 4: Run the new file and the existing overview suite**

Run: `npx vitest run tests/senior-section-stats.test.jsx tests/senior-section.test.jsx`
Expected: all pass. ⚠️ `tests/senior-section.test.jsx` does not mock `seasonStats.js`; if it now fails on an unmocked supabase import, add `vi.mock('../src/data/seasonStats.js', () => ({ seasonStats: async () => [], seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }) }))` to it beside its other mocks.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SeniorSection.jsx tests/senior-section-stats.test.jsx tests/senior-section.test.jsx
git commit -m "feat(seniors): Season stats per squad on the overview, top five with Show all"
```

---

### Task 9: The player sheet block

**Files:**
- Modify: `src/screens/PlayerDetail.jsx` (a `SeasonBlock` component before `PlayerDetail`, ~line 526; rendered after `ParentsBlock`, line 638)
- Test: `tests/player-detail-season.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/player-detail-season.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const seasonStatsMock = vi.fn()
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))
vi.mock('../src/data/players.js', () => ({
  getPlayerParents: async () => [],
  getPlayerPrivate: async () => null,
  getPlayerContact: async () => null,
}))
vi.mock('../src/lib/useOwnContactGate.js', () => ({ default: () => ({ allowed: false }) }))

import PlayerDetail from '../src/screens/PlayerDetail.jsx'

const MEN1 = { id: 't-men1', name: 'Senior Men - 1st XV', section: 'senior_men' }
const U12 = { id: 't-u12', name: 'U12 Mixed', section: null }
const PLAYER = { id: 'p1', full_name: 'Harness Fly Half', team_id: 't-men1' }

function mount(team) {
  render(
    <MemoryRouter>
      <PlayerDetail player={PLAYER} team={team} onClose={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockResolvedValue([
    { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 2, bench: 1, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 1, reds: 0 },
    { player_id: 'p2', full_name: 'Harness Hooker', games: 3, starts: 3, bench: 0, tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 0 },
  ])
})

describe('the player sheet — this season', () => {
  it('a senior player gets their own line for the squad the sheet was opened from', async () => {
    mount(MEN1)
    const block = await screen.findByTestId('season-block')
    expect(block).toHaveTextContent('Games3')
    expect(block).toHaveTextContent('Starts2')
    expect(block).toHaveTextContent('Bench1')
    expect(block).toHaveTextContent('Conversions4')
    expect(block).toHaveTextContent('Yellow cards1')
    expect(seasonStatsMock).toHaveBeenCalledWith('t-men1', expect.any(String))
  })
  it('says so when the player is on no sheet yet', async () => {
    seasonStatsMock.mockResolvedValue([])
    mount(MEN1)
    expect(await screen.findByText('No games on a sheet yet.')).toBeInTheDocument()
  })
  it('a junior squad has no block and asks nothing', async () => {
    mount(U12)
    await screen.findByRole('heading', { name: 'Harness Fly Half' })
    expect(screen.queryByTestId('season-block')).not.toBeInTheDocument()
    expect(seasonStatsMock).not.toHaveBeenCalled()
  })
})
```

⚠️ The `players.js` mock must export whatever `PlayerDetail` actually imports; read lines 1-50 of `src/screens/PlayerDetail.jsx` and mirror the names. If the file needs an auth provider (the `useMyProfile` trap the sheet tests document), mock `../src/lib/useMyProfile.js` too.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/player-detail-season.test.jsx`
Expected: first two FAIL, third passes.

- [ ] **Step 3: Implement**

Imports in `PlayerDetail.jsx`:

```js
import { seasonStats } from '../data/seasonStats.js'
import { seasonLabelFor } from '../lib/season.js'
```

Before `export default function PlayerDetail`:

```jsx
const SEASON_LINES = [
  ['games', 'Games'], ['starts', 'Starts'], ['bench', 'Bench'], ['tries', 'Tries'],
  ['conversions', 'Conversions'], ['penalties', 'Penalties'], ['drops', 'Drop goals'],
  ['yellows', 'Yellow cards'], ['reds', 'Red cards'],
]

/**
 * This season, for a SENIOR player, for the squad the sheet was opened from.
 * Renders nothing for a junior squad — no call, no heading — for the reason
 * ContactBlock gives: never suggest withheld data exists. The database refuses
 * anyone outside the section, and that refusal arrives as [] and reads as
 * "no games yet", which is the one honest thing it can say.
 */
function SeasonBlock({ playerId, team }) {
  const season = seasonLabelFor()
  const [line, setLine] = useState(undefined)
  useEffect(() => {
    if (!team?.section) return undefined
    let mounted = true
    seasonStats(team.id, season)
      .then((rows) => mounted && setLine(rows.find((r) => r.player_id === playerId) ?? null))
      .catch(() => mounted && setLine(null))
    return () => {
      mounted = false
    }
  }, [playerId, team?.id, team?.section, season])
  if (!team?.section) return null
  return (
    <section className="mb-4" data-testid="season-block">
      <h4 className="mb-2 text-[13px] font-bold text-ink">This season · {season}</h4>
      {line === undefined ? null : line === null ? (
        <p className="text-sm text-ink-faint">No games on a sheet yet.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 tabular-nums">
          {SEASON_LINES.map(([key, label]) => (
            <KeyValue key={key} label={label}>{line[key] ?? 0}</KeyValue>
          ))}
        </dl>
      )}
    </section>
  )
}
```

(`useState`/`useEffect` are already imported at the top of the file; check, and add if not.) Render after `<ParentsBlock playerId={player.id} />`:

```jsx
      <SeasonBlock playerId={player.id} team={team} />
```

⚠️ `KeyValue` at line 53 renders `label` then `children`; the test's `toHaveTextContent('Games3')` depends on that adjacency. If `KeyValue` puts a separator between them, change the assertions to `within(block).getByText('Games').nextSibling` checks rather than changing the component.

- [ ] **Step 4: Run the new file and the suites that render PlayerDetail**

Run: `npx vitest run tests/player-detail-season.test.jsx tests/more.test.jsx tests/roster-deeplinks.test.jsx tests/player-form.test.jsx`
Expected: all pass. If an existing suite fails on an unmocked `seasonStats.js`, its teams have no section so no call is made; the failure would be the import itself — add the same `vi.mock` there.

- [ ] **Step 5: Commit**

```bash
git add src/screens/PlayerDetail.jsx tests/player-detail-season.test.jsx
git commit -m "feat(player): This season on a senior player's sheet"
```

---

### Task 10: The whole suite, lint, build, and the paperwork

**Files:**
- Modify: `claude/changelog.md` (a new entry under the current date's heading, PR number form)
- Modify: `claude/plans/2026-09-04-senior-season-stats.md` (status line → `**Status: SHIPPED (#NNN, <date>).**`; the `count`→`qty` and singular→plural deviations noted in one line under Data)
- Modify: `claude/plans/2026-09-04-senior-season-stats-implementation.md` (this file's status line)
- Modify: `claude/plans/2026-09-02-senior-squads.md` (status line: step 8 shipped)
- Modify: `claude/state-of-play.md` (the seniors paragraph: stats live; scorers block on senior sheets; what remains is standings routes 2 and 3, the cross-section setting, union numbers)

- [ ] **Step 1: The full suite, lint and build**

Run: `npm test` — Expected: every file passes except any pre-existing `pwa-build` failure, which CLAUDE.md attributes to the worktree's missing `node_modules/vite/bin/vite.js`; check that file exists before believing it is that.
Run: `npm run lint` — Expected: clean.
Run: `npm run build` — Expected: builds.

- [ ] **Step 2: Push the branch and open the pull request**

```bash
git push -u origin claude/senior-season-stats
gh pr create --title "feat(seniors): season stats — scorers on the sheet, a count per player per season" --body-file - <<'EOF'
Spec: claude/plans/2026-09-04-senior-season-stats.md. Plan: claude/plans/2026-09-04-senior-season-stats-implementation.md.

- `match_sheet_scores` beside the sheet (the cards table's twin); RLS = cards.
- `senior_season_stats(team, season)` and `_gaps`, security definer, gated on the section inside.
- Scorers block on senior sheets only, rows from the 22, a soft note when the score and the names disagree.
- Season stats on the squad page, the Seniors overview (top five, Show all), and the player sheet.
- Harness `db/tests/season-stats.sql`, 15 assertions, three injected faults on the dry run.

Migration APPLIED to live before this PR was opened; the harness runs against the live function.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Write the changelog entry citing the PR number, and the four status lines**

Under `## <today> 2026` at the top of `claude/changelog.md`:

```
- #NNN — 📊 **Senior season stats.** Scorers on senior match sheets (`match_sheet_scores`, the cards table's twin), and a per-player season line — games, starts, bench, T/C/P/DG, cards — on the squad page, the Seniors overview and the player sheet. `senior_season_stats(team, season)`, security definer, section-gated inside. Harness `db/tests/season-stats.sql`. Spec `claude/plans/2026-09-04-senior-season-stats.md`.
```

Then the status lines named above, `npm run docs:check` (every line `ok` except the pre-existing changelog-SHA one), and:

```bash
git add claude/changelog.md claude/state-of-play.md claude/plans/2026-09-04-senior-season-stats.md claude/plans/2026-09-04-senior-season-stats-implementation.md claude/plans/2026-09-02-senior-squads.md
git commit -m "docs: senior season stats shipped — changelog, plan status lines, state of play"
git push
```

- [ ] **Step 4: Tell Jay**

The PR link; that the migration is applied; that CI must be green before he merges; that a merge deploys `main` (15 credits); and the two things only he can do afterwards: open a senior sheet on a phone and name one scorer, then look at Seniors for the line.

---

## Self-review

**Spec coverage.** §1 data → Task 1; §1 screen and soft note → Task 5; §1 "not on the facsimile" → Task 5 puts it in the editor only; §2 both functions, gate, draft-or-complete, season window → Task 1; §3 component and three surfaces → Tasks 6-9; §4 harness assertions 1-8 → Task 1 rows 1-15 (spec's 1 → rows 11-14; 2 → row 2; 3 → row 3; 4 → rows 4b/4c; 5 → rows 1 and 3; 6 → row 5 and the draft sheets; 7 → rows 6-7; 8 → rows 9-10, 15); §4 front-end tests → Tasks 3-9; §5 paperwork → Task 10.

**Deviations from the spec, on purpose:** `qty` not `count`; plural kinds; `SCORE_ROWS = 6` not five (six covers a heavy day without the cards' paper-form reason for five).

**Type consistency.** `scoreRows` rows are `{ kind, slot, full_name, qty }` everywhere (Task 4 save, Task 5 state and props, Task 1 columns). `seasonStats(teamId, season)` and `seasonStatsGaps` names match across Tasks 4, 7, 8, 9. `SeasonStatsTable` props `rows`, `limit` match Tasks 6, 7, 8. The player select's option value is `String(slot)` and the save coerces with `numeric()`, matching the test's `slot: 10`.
