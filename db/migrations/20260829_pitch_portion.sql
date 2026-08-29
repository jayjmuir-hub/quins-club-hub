-- Pitch portions: how much of a pitch a booking uses.
--
-- WHY. `events.pitch` names a whole pitch, but a pitch is routinely SHARED —
-- at training different age groups take a quarter or a half of the same
-- surface, and even matches split it for the younger bands (only U12 and older
-- get a full pitch for a match — Jay, 29 Aug 2026). Without a portion, two
-- squads sharing one pitch look like a double booking. With it, clash detection
-- becomes a capacity question: findPitchClashes (src/data/pitches.js) sums the
-- portions occupying a pitch at each moment and warns only when they overtop a
-- whole pitch. The vocabulary and the age-based default live in
-- src/lib/pitchPortion.js.
--
-- ⚠️ TEXT, NULLABLE, NO DEFAULT — and NULL MEANS A WHOLE PITCH. The app treats
-- an unset portion as a full pitch (portionFraction in src/lib/pitchPortion.js),
-- which is what makes this backward-compatible: every existing booking keeps
-- behaving exactly as it did until someone sets a portion on it. A DEFAULT of
-- 'full' would look tidier and be wrong — it would erase the distinction
-- between "nobody split this" and "somebody chose the whole pitch", the same
-- distinction `Pitch TBD` exists to protect for allocation.
--
-- The CHECK admits NULL (a CHECK passes on NULL) and pins the three portion
-- values so a typo cannot reach the column the way free-text pitch names once
-- did.

alter table public.events
  add column if not exists pitch_portion text
    check (pitch_portion in ('quarter', 'half', 'full'));

-- ── pitch_occupancy returns the portion too ────────────────────────────────
--
-- The redacted club-wide booking read (20260822_pitch_occupancy.sql) feeds
-- findPitchClashes on PitchGlance, so it must carry pitch_portion or every
-- shared pitch there would read as a clash. Adding a column to the RETURN TABLE
-- changes the function's signature, which `create or replace` cannot do, so the
-- function is dropped and recreated — and the grants, which a drop discards,
-- are re-stated below exactly as the original migration set them.
--
-- ⚠️ STILL REDACTED. pitch_portion is a fact about the booking's use of the
-- ground, not about the fixture — no title, opponent, venue, notes or score
-- joins it. The redaction argument in the original migration is unchanged.

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
  select e.id, e.team_id, t.name, e.type, e.starts_at, e.ends_at, e.pitch, e.pitch_portion, e.group_id
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
