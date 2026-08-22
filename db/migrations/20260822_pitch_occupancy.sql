-- Pitch occupancy for squad staff — the read that RLS deliberately refuses.
--
-- WHY A FUNCTION AND NOT A POLICY. `event read` is scoped to
-- private.is_attached_to_team(team_id) on purpose: a parent sees their own
-- squads' calendars and nobody else's. But a coach asking "is D2 free on
-- Saturday morning?" needs the CLUB-WIDE booking picture, which under that
-- policy only admins can assemble. Widening `event read` would hand every
-- member every squad's full fixture detail — opponent, notes, scores — to
-- answer a question that only needs WHO is WHERE and WHEN. This SECURITY
-- DEFINER function returns exactly that redacted row and nothing else:
--
--   id, team_id, team_name, type, starts_at, ends_at, pitch
--
-- No title, no opponent, no venue, no notes, no scores. The name is the
-- squad's, which every member can already see in the team picker.
--
-- WHO MAY CALL IT: active squad staff (coach / manager / medic with a squad)
-- or an active admin. Anyone else gets ZERO ROWS, not an error — the same
-- refuse-by-empty shape RLS gives everywhere else in this schema.
--
-- STABLE, and the gate is one EXISTS over memberships — the same shape as
-- private.can_edit_team, inlined rather than a new private helper because
-- "staff anywhere" has exactly this one caller (the same argument
-- src/screens/More.jsx made for canEditAnyTeam before it died).

create or replace function public.pitch_occupancy(_from timestamptz, _to timestamptz)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  type text,
  starts_at timestamptz,
  ends_at timestamptz,
  pitch text,
  -- group_id rides along UNREDACTED because findPitchClashes needs it: a
  -- multi-squad session is fanned out into one event per squad on the same
  -- pitch at the same time BY CONSTRUCTION, and without the shared group_id
  -- every one of them would render as a double booking.
  group_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.team_id, t.name, e.type, e.starts_at, e.ends_at, e.pitch, e.group_id
  from events e
  join teams t on t.id = e.team_id
  where e.starts_at >= _from
    and e.starts_at < _to
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
