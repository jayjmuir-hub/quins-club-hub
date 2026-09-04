-- ══════════════════════════════════════════════════════════════════════════
--  The `seniors` right — a named person reads BOTH senior sections
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 4 Sep 2026: cross-section rosters open per PERSON, not only per club —
-- "the option to give certain people rights to see both men and women, like
-- the club captain for example, but might be others."
-- claude/plans/2026-09-03-senior-section.md, the "Who reads BOTH sections"
-- ruling.
--
-- 20260905_senior_section.sql gave every adult in a section full read of their
-- OWN section (rosters, availability) and of BOTH sections' fixtures. Across
-- men and women, rosters and availability stayed off: a women's squad decides
-- who reads its numbers, not the app. This adds the one route Jay asked for —
-- a right, held on an ADMIN membership row, that reads rosters, availability,
-- fixtures and season stats across both senior sections.
--
-- ⚠️ IT IS A RIGHT ON AN ADMIN ROW, LIKE EVERY OTHER RIGHT. The club captain
-- gets an admin membership carrying `seniors` and nothing else. Under the
-- admin split (20260904_admin_team_reach) an admin row reaches no squad by
-- itself, so a `seniors`-only admin reads exactly what this file grants and
-- nothing more: no chat, no notices, no documents, no junior squad, no child's
-- private row or photo. `seniors` is deliberately NOT added to
-- private.admin_team_reach's 'see' list, because 'see' is can_see_team, which
-- twenty-nine policies read — including chat — and the ruling was rosters and
-- availability, not the 1st XV's chat.
--
-- ⚠️ SENIORS ONLY. Every arm below demands `t.section is not null`. A junior
-- squad has a null section and this right cannot reach it. And every child
-- protection still keys on the PERSON: a 17-year-old in the 2nd XV keeps his
-- private row, photo consent and DM rules — a `seniors` holder gains his NAME
-- on the roster, which every section-mate already had, and nothing else.
-- db/tests/senior-section.sql steps 13–19 prove all of this.
--
-- ⚠️ THE CLUB-WIDE SWITCH IS NOT BUILT AND IS NOT THIS. The plan keeps a club
-- setting to open rosters across sections as the coarser fallback for when a
-- whole section asks. This is the finer tool and the one to reach for first.

-- The caller holds an active ADMIN membership carrying the `seniors` right,
-- and _team is in a senior section. Super admins already reach every squad
-- through admin_team_reach, so this does not repeat that arm.
create or replace function private.seniors_right_reach(_team uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.teams t
      join public.memberships m on m.club_id = t.club_id
     where t.id = _team
       and t.section is not null
       and m.profile_id = (select auth.uid())
       and m.status = 'active'
       and m.role = 'admin'
       and 'seniors' = any(m.admin_rights)
  );
$$;
revoke execute on function private.seniors_right_reach(uuid) from public, anon;
grant execute on function private.seniors_right_reach(uuid) to authenticated;

-- ── The three read arms gain the right ─────────────────────────────────────
drop policy if exists "event read" on public.events;
create policy "event read" on public.events
  as permissive for select to public
  using (
    private.is_attached_to_team(team_id)
    or private.senior_section_fixture_reach(team_id)
    or private.seniors_right_reach(team_id)
  );

drop policy if exists "player read" on public.players;
create policy "player read" on public.players
  as permissive for select to public
  using (
    private.can_see_player(id)
    or private.is_own_player(id)
    or private.same_section_member(team_id)
    or private.seniors_right_reach(team_id)
  );

drop policy if exists "avail read" on public.availability;
create policy "avail read" on public.availability
  as permissive for select to public
  using (
    private.can_see_team((select e.team_id from public.events e where e.id = availability.event_id))
    or private.can_edit_team((select e.team_id from public.events e where e.id = availability.event_id))
    or private.is_own_player(player_id)
    or private.same_section_member((select e.team_id from public.events e where e.id = availability.event_id))
    or private.seniors_right_reach((select e.team_id from public.events e where e.id = availability.event_id))
  );

-- ── Season stats: the same gate as the roster ──────────────────────────────
-- 20260906_senior_season_stats gates both RPCs on same_section_member OR
-- can_edit_team. A person who reads the roster reads the season line beside
-- it; the gate gains the right. Bodies otherwise unchanged from that file.
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
       and (private.same_section_member(_team) or private.can_edit_team(_team) or private.seniors_right_reach(_team))
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

revoke execute on function public.senior_season_stats(uuid, text) from public, anon;
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
       and (private.same_section_member(_team) or private.can_edit_team(_team) or private.seniors_right_reach(_team))
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
revoke execute on function public.senior_season_stats_gaps(uuid, text) from public, anon;
grant execute on function public.senior_season_stats_gaps(uuid, text) to authenticated;

-- ── Assert it landed ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'seniors_right_reach') then
    raise exception 'private.seniors_right_reach was not created';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'players' and policyname = 'player read' and qual like '%seniors_right_reach%') then
    raise exception 'player read did not gain the seniors-right arm';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'event read' and qual like '%seniors_right_reach%') then
    raise exception 'event read did not gain the seniors-right arm';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'availability' and policyname = 'avail read' and qual like '%seniors_right_reach%') then
    raise exception 'avail read did not gain the seniors-right arm';
  end if;
  if not exists (select 1 from pg_proc p where p.proname = 'senior_season_stats' and pg_get_functiondef(p.oid) like '%seniors_right_reach%') then
    raise exception 'senior_season_stats did not gain the seniors-right arm';
  end if;
end $$;
