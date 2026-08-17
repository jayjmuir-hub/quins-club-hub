-- A PENDING membership must not confer the power to approve.
--
-- Apply as migration `20260817xxxxxx approve_requires_active_membership`.
--
-- ══ WHAT WAS WRONG ══════════════════════════════════════════════════════
-- private.can_approve_team asked "do you hold a coach or manager row for this
-- squad?" and never asked whether that row was ACTIVE. Its two siblings both
-- do:
--
--     private.can_see_team    ... and m.status = 'active' ...
--     private.can_edit_team   ... and m.status = 'active' ...
--     private.can_approve_team              — nothing
--
-- That was harmless for exactly as long as a pending STAFF row could not
-- exist. `public.request_staff_role` (20260816) created one: it inserts a
-- coach/manager/medic membership with status 'pending' and player_id null, so
-- that from 16 Aug 2026 ASKING to coach a squad satisfied the approval gate
-- for that squad.
--
-- ⚠️ MEASURED, NOT REASONED ABOUT — 17 Aug 2026, against production inside a
-- rolled-back transaction, with an invented club so no live row took part:
--
--     PENDING coach of the squad ............ ALLOWED   <- the hole
--     ACTIVE  coach of the squad ............ ALLOWED   <- control
--     ACTIVE  coach of ANOTHER squad ........ refused (42501)   <- control
--
-- Both controls matter. Without the second, "refused" would be what everyone
-- got and the first line would prove nothing; without the third, "allowed"
-- would be. db/tests/approve-status-gate.sql is that measurement, kept.
--
-- What it meant in practice: a person who signed up and asked to coach a squad
-- could approve their own request, and could admit other families to that
-- squad. Approval is the gate that stands between a stranger and a list of
-- children's names and contact details, so this is that gate rather than a
-- tidiness matter.
--
-- ⚠️ AND THE CLIENT AGREED WITH THE DATABASE, WHICH IS WHY IT WAS REACHABLE
-- FROM THE ORDINARY APP rather than only by a hand-rolled API call.
-- src/lib/scope.js `canApproveAnything` and `canApproveTeam` also filtered on
-- role and team but not on status, and `loadMyMemberships` returns pending
-- rows. Both are fixed in the same commit. The comment in scope.js already
-- said the two must be changed together; they were, in the same wrong
-- direction, because neither had a status test to begin with.
--
-- ══ WHY NOT ALSO private.is_admin ═══════════════════════════════════════
-- It has the same omission. It is NOT changed here, deliberately:
--
--   * nothing can currently create a non-active admin row —
--     request_staff_role refuses any role but coach/manager/medic, and
--     production held ZERO admin memberships that were not active when this
--     was measured (17 Aug 2026);
--   * is_admin backs most admin RLS policy in the schema, so adding a
--     condition to it changes the blast radius from one function to the whole
--     admin surface, on a live site with real families on it.
--
-- ⚠️ THAT IS A DEFERRAL, NOT A VERDICT — it is recorded in
-- claude/open-items.md so it is not rediscovered as news. Re-measure the admin
-- row count before assuming it is still unreachable.
--
-- ══ WHY MEDIC IS STILL ABSENT ═══════════════════════════════════════════
-- Unchanged from 20260809: Jay chose coach and manager. This edit adds a
-- status test and touches nothing else about who may approve.

begin;

create or replace function private.can_approve_team(_team uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      -- ⚠️ THE LINE THIS MIGRATION EXISTS FOR. Without it a pending request is
      -- indistinguishable from granted access, and the gate approves the
      -- person asking to pass through it.
      and m.status = 'active'
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager') and m.team_id = _team)));
$function$;

commit;
