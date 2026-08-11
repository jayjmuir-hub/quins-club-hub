-- ══════════════════════════════════════════════════════════════════════════
--  Pitch requests — a coach asks, Tracy allocates
--  11 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- THE MODEL (Jay, 11 Aug, four answers):
--   1. A request ATTACHES TO AN EXISTING FIXTURE. The coach creates the match
--      as normal and then asks for a pitch, so the fixture is in the schedule
--      immediately carrying `Pitch TBD` — which is exactly what that
--      placeholder already means, and why Jay ruled it must keep rendering.
--   2. TRACY ALLOCATES. The coach asks; a Pitch Manager assigns.
--   3. THE REFEREE IS A TICKBOX ON THE SAME REQUEST, because both are asked
--      for at the same moment: when a match is being arranged.
--   4. It must be TRACKABLE FROM SUBMISSION TO ASSIGNMENT BY THE PERSON WHO
--      SUBMITTED IT, appear in two dashboards, and send email.
--
-- ⚠️ ONE ROW PER EVENT, enforced by a unique constraint rather than by the
-- app. A second request for the same fixture is not a second question — it is
-- the same question asked twice, and two rows would mean two queue entries,
-- two emails and a race over which one Tracy answers. Re-asking after a
-- decline moves the existing row back to 'submitted'.
--
-- ⚠️ THE ALLOCATION WRITES `events.pitch` AS WELL AS THIS TABLE, and that
-- duplication is deliberate. `events.pitch` is what the schedule, the fixture
-- rows, the calendar feed and the clash detector all read; a request table
-- nobody reads would leave the allocation invisible everywhere that matters.
-- This table is the WORKFLOW; `events.pitch` remains the ANSWER.

create table if not exists public.pitch_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,

  -- ⚠️ 'submitted' -> 'allocated' is the path Jay described. 'declined' and
  -- 'cancelled' exist because both happen in a real club and neither is a
  -- deletion: a request that vanishes leaves the coach wondering whether they
  -- ever sent it. A CHECK rather than an enum, matching memberships.status —
  -- adding a state stays a one-line migration.
  status text not null default 'submitted'
    check (status in ('submitted', 'allocated', 'declined', 'cancelled')),

  needs_referee boolean not null default false,

  -- What the coach wants Tracy to know: "we can play early", "U8s share with
  -- U9s". Free text on purpose — the whole point is the things a form cannot
  -- anticipate.
  note text,

  -- Why a request was declined, so the coach is told rather than left to
  -- guess. Shown to them.
  decision_note text,

  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),

  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,

  -- ⚠️ ONE REQUEST PER FIXTURE. See the note above.
  unique (event_id)
);

alter table public.pitch_requests enable row level security;

create index if not exists pitch_requests_status_idx
  on public.pitch_requests (status, requested_at);

-- ══════════════════════════════════════════════════════════════════════════
--  RLS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE REQUESTER MUST BE ABLE TO SEE THEIR OWN REQUEST, and that is a
-- REQUIREMENT rather than a nicety: Jay asked for it to be trackable from
-- submission to assignment "by also the coach or manager submitting it". A
-- policy that only let admins read would make the submitter's dashboard
-- impossible, and the feature would be a black hole with an email at the end.

drop policy if exists "pitch request read" on public.pitch_requests;
create policy "pitch request read" on public.pitch_requests
  for select using (
    requested_by = auth.uid()
    or private.can_edit_team((select e.team_id from events e where e.id = event_id))
  );

-- ⚠️ INSERT IS `can_edit_team`, NOT "any signed-in member". A pitch request is
-- a claim on a club resource made on behalf of a squad, so the person making
-- it has to be that squad's staff — the same test that decides who may create
-- the fixture in the first place. A parent cannot book a pitch.
--
-- ⚠️ `requested_by = auth.uid()` IS ENFORCED HERE, not left to the client.
-- Without it a coach could file a request in somebody else's name, and the
-- read policy above would then hide it from them and show it to a stranger.
drop policy if exists "pitch request create" on public.pitch_requests;
create policy "pitch request create" on public.pitch_requests
  for insert with check (
    requested_by = auth.uid()
    and private.can_edit_team((select e.team_id from events e where e.id = event_id))
  );

-- ⚠️ DECIDING IS ADMIN-ONLY, NOT `can_edit_team`. The coach who asked must not
-- be able to answer their own request — that is the entire point of there
-- being a request. Note this is `is_admin`, NOT the `pitches` admin right:
-- those rights gate SCREENS, not data (see
-- claude/decisions/2026-08-10-role-dashboards.md). The right decides who is
-- SHOWN Tracy's queue.
drop policy if exists "pitch request decide" on public.pitch_requests;
create policy "pitch request decide" on public.pitch_requests
  for update using (private.is_admin((select e.club_id from events e where e.id = event_id)))
  with check (private.is_admin((select e.club_id from events e where e.id = event_id)));

-- ⚠️ A REQUESTER MAY CANCEL, AND THAT IS A DELETE RATHER THAN A STATUS WRITE,
-- because the UPDATE policy above is admin-only and widening it to the
-- requester would let them write `status = 'allocated'` too. Deleting their
-- own un-decided request is the narrow power that cannot be abused: once Tracy
-- has decided, `status <> 'submitted'` and this stops applying.
drop policy if exists "pitch request withdraw" on public.pitch_requests;
create policy "pitch request withdraw" on public.pitch_requests
  for delete using (requested_by = auth.uid() and status = 'submitted');
