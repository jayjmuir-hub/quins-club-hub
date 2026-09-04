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
