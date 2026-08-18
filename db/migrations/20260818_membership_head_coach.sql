-- A real head-coach flag, so the approval emails stop guessing from free text.
--
-- ⚠️ CAPTURE THIS IN db/schema/tables.sql AND db/schema/grants.sql IN THE SAME
-- COMMIT. `npm run docs:check` fails a migration that grants on a table the
-- capture does not name, and the column grant below is the whole point of the
-- file — an uncaptured one would stop db/schema/ diffing it.
--
-- WHY A FLAG AND NOT A ROLE
--
-- `memberships.role` is constrained to admin/coach/manager/medic/parent/player
-- and a head coach's PERMISSIONS are a coach's exactly. The job differs; the
-- authority does not. So this is a flag on the membership, mirroring `is_super`
-- (20260810_super_admin_and_rights.sql), and NOT a seventh role.
--
-- WHY NOT JUST READ `title`
--
-- Because the notify functions would then match a string a human typed.
-- Measured on production 18 Aug 2026: `title` carries ZERO check constraints
-- and already contains 'Assistant Coach/Medic' alongside 'Head Coach'. A squad
-- recorded as 'HC' or 'Head coach ' matches nothing, and the failure is an
-- approval e-mail that is silently not sent — the worst shape there is, because
-- nobody learns of it. `title` stays exactly what 20260813_membership_title.sql
-- says it is: a label that grants nothing. This column is the machine-readable
-- half.
--
-- ⚠️ **NEVER** `grant update on public.memberships to authenticated`.
-- That is the trap 20260813_membership_title.sql documents at length and
-- src/data/staff.js repeats: `authenticated` holds COLUMN-LEVEL update on this
-- table precisely so that `is_super` and `admin_rights` stay unwritable. A
-- table-level grant hands every admin the ability to make themselves a super
-- admin. Grant the one column, as below.

alter table public.memberships
  add column if not exists is_head_coach boolean not null default false;

-- Backfill from the titles already in place — 4 squads on 18 Aug 2026, so those
-- carry over with no data entry.
--
-- ⚠️ DEFENSIVE ON PURPOSE, even though the measured data is one per squad:
-- `distinct on (team_id)` means a squad that somehow holds two 'Head Coach'
-- titles picks exactly one rather than failing the unique index below and
-- taking the whole migration down with it. Ordered by id so the choice is
-- deterministic and re-running changes nothing.
update public.memberships m
   set is_head_coach = true
  from (
    select distinct on (team_id) id
      from public.memberships
     where status = 'active'
       and role = 'coach'
       and team_id is not null
       and title ilike '%head coach%'
     order by team_id, id
  ) pick
 where m.id = pick.id;

-- A head coach is a COACH ON A SQUAD. Without this, the flag could be set on an
-- admin (whose team_id is null) or a parent, and the notify functions would
-- inherit a recipient that makes no sense. Written as `not is_head_coach or ...`
-- so it is silent for every row where the flag is false, which is all of them
-- except the backfill above.
alter table public.memberships
  drop constraint if exists memberships_head_coach_is_a_squad_coach;
alter table public.memberships
  add constraint memberships_head_coach_is_a_squad_coach
  check (not is_head_coach or (role = 'coach' and team_id is not null));

-- ONE head coach per squad, enforced by the database rather than hoped for.
-- Jay's ruling, 18 Aug 2026. A PARTIAL index: rows with the flag false are not
-- in it at all, so the ordinary case costs nothing and `team_id` null cannot
-- collide. This is what lets the notify functions treat "the head coach" as a
-- single recipient instead of defending against duplicates.
create unique index if not exists memberships_one_head_coach_per_team
  on public.memberships (team_id)
  where is_head_coach;

-- The narrow grant. `title` got exactly this treatment and for exactly this
-- reason; see the header.
grant update (is_head_coach) on public.memberships to authenticated;
