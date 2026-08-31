-- ══════════════════════════════════════════════════════════════════════════
--  Grok-sweep item 3 — tournament GAMES leave pitch_occupancy · 30 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT. A tournament is a CONTAINER events row; its games ride inside it with
-- `tournament_id` set, inherit the container's pitch, and carry no
-- ends_at/pitch_portion — so each game reads as a full-pitch occupant. Both
-- calendar reads already exclude them (`listEvents` filters
-- `tournament_id IS NULL`, src/data/events.js; the token feed since
-- 20260829_calendar_feed_exclude_tournament_games.sql) — and since the pitch
-- rework the Allocation screen feeds clash detection from listEvents, so it
-- was already clean. `pitch_occupancy` was the leftover: Pitch Glance reads
-- it, so on a home tournament day Pitch Glance flagged false clashes that
-- Allocation disagreed with. One WHERE arm closes it: the container still
-- occupies its pitch; its games no longer count a second time.
--
-- Drop-first on purpose: the live signature already carries pitch_portion
-- (9 columns, 20260829_pitch_portion.sql) so a plain replace would work, but
-- drop-first matches the file this body came from and avoids the return-type
-- trap. Grants are re-stated because the drop discards them.
--
-- ROLLBACK. Re-create from db/migrations/20260829_pitch_portion.sql (same
-- body without the tournament_id arm) and re-state the same grants.

begin;

drop function if exists public.pitch_occupancy(timestamptz, timestamptz);

create or replace function public.pitch_occupancy(_from timestamptz, _to timestamptz)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  type text,
  starts_at timestamptz,
  ends_at timestamptz,
  pitch text,
  pitch_portion text,
  group_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.team_id, t.name, e.type, e.starts_at, e.ends_at, e.pitch, e.pitch_portion, e.group_id
  from events e
  join teams t on t.id = e.team_id
  where e.starts_at >= _from
    and e.starts_at < _to
    -- a tournament GAME lives inside its container; the container occupies
    -- the pitch, the games must not count a second time (matches listEvents
    -- and the calendar token feed)
    and e.tournament_id is null
    and exists (
      select 1 from memberships m
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (m.role = 'admin'
             or (m.role in ('coach','manager','medic') and m.team_id is not null))
    );
$$;

revoke execute on function public.pitch_occupancy(timestamptz, timestamptz) from public;
revoke execute on function public.pitch_occupancy(timestamptz, timestamptz) from anon;
grant execute on function public.pitch_occupancy(timestamptz, timestamptz) to authenticated;

-- ── Guard ──────────────────────────────────────────────────────────────────
do $g$
begin
  if pg_get_functiondef('public.pitch_occupancy(timestamptz, timestamptz)'::regprocedure)
     not like '%tournament_id is null%' then
    raise exception 'ABORTING: pitch_occupancy still counts tournament games.';
  end if;
  raise notice 'Tournament games no longer occupy pitches twice.';
end $g$;

commit;
