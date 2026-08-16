-- An access request must say WHO is asking and for WHICH squad.
--
-- Jay, 16 Aug 2026: "we need to force people to select a requested role for age
-- groups when creating an account, i still have account requests coming in and
-- have no idea who they are because they don't type any extra info".
--
-- ⚠️ NO RPC, AND THE FIRST VERSION OF THIS MIGRATION HAD ONE. It added a
-- SECURITY DEFINER `list_squads_for_access_request()` on the strength of the
-- header in src/components/RequestAccess.jsx, which states that "every SELECT
-- policy in the database bottoms out in a memberships row for auth.uid(), so
-- this user reads zero rows from every table including teams".
--
-- ⚠️ THAT SENTENCE IS FALSE FOR `teams`, AND IT WAS MEASURED RATHER THAN
-- ASSUMED, 16 Aug 2026. The `team read` policy is `auth.uid() IS NOT NULL` —
-- any signed-in caller reads every squad. Impersonating a membership-less user
-- on production returned 15 teams, against 0 players, 0 memberships and 0
-- events in the same breath, which is the control proving RLS was being applied
-- rather than bypassed.
--
-- So the form reads `teams` directly and this migration only adds columns. The
-- function was created, measured, and dropped again the same hour. The comment
-- in RequestAccess.jsx is corrected rather than deleted — it was a load-bearing
-- claim, and the next person to reason from it deserves to know which half of
-- it holds.
--
-- ⚠️ IT DELIBERATELY DOES NOT ENFORCE THE REQUIREMENT. That is
-- 20260816_access_request_require_role.sql, and it MUST NOT RUN UNTIL THE NEW
-- FORM IS LIVE. This file is additive and safe to apply against the running
-- app: the form deployed today does not send these columns, and nothing here
-- makes it start failing. Tightening the INSERT policy in the same breath would
-- refuse every signup between the migration and the deploy — a stranger trying
-- to join the club would be told, in effect, that they are not allowed.

begin;

-- 1 ── WHAT THE REQUEST NOW CARRIES ─────────────────────────────────────────
--
-- ⚠️ BOTH NULLABLE, DESPITE BEING REQUIRED. Existing rows have neither, and a
-- NOT NULL would either fail outright or need a backfill inventing an answer on
-- behalf of people who never gave one. The requirement is enforced on the INSERT
-- policy below, which applies to new rows only — exactly the distinction NOT
-- NULL cannot express.
alter table public.access_requests
  add column if not exists requested_role    text,
  add column if not exists requested_team_id uuid references public.teams(id) on delete set null;

-- ⚠️ NO 'admin' IN THE LIST. Every other role here is squad-scoped and granted
-- by a coach or manager approving a stranger; admin is club-wide and is granted
-- by an existing admin, deliberately, on a different screen. A self-service
-- "I would like to be an admin" is not a request this club wants to receive.
alter table public.access_requests
  drop constraint if exists access_requests_requested_role_check;
alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (requested_role is null
         or requested_role in ('parent', 'player', 'coach', 'manager', 'medic'));

commit;
