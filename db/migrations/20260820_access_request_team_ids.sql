-- 20 Aug 2026 — public.access_requests.requested_team_ids
--
-- WHY. The sign-up flow asked for a name on the first screen and what the
-- person actually wanted on the second, so anybody who stopped in between left
-- a named profile and nothing else. Measured on production the same day: three
-- people waiting, all confirmed, all signed in, none with a request row — two
-- of them named. The first screen now collects the squads as well, and writes
-- the request in the same submit, so a drop-out is still actionable.
--
-- Jay, 20 Aug 2026, asked for MULTI-SELECT: "some parents have 3, 4 or even 5
-- children at the club, across different age groups" is already recorded
-- against the minis work, and one squad per request cannot express it.
--
-- ══ ⚠️ WHY AN ARRAY AND NOT ONE ROW PER SQUAD ════════════════════════════
--
-- `access_requests` carries UNIQUE (profile_id) — one row per person — and the
-- whole approval queue is built on that: `requestByProfile` is a Map keyed by
-- profile id, and dismissal is per person, not per squad. Dropping the
-- constraint to allow several rows would mean reworking triage, dismissal and
-- the "asked" badge for a case that is a list, not a workflow.
--
-- ══ ⚠️ requested_team_id STAYS, AND STAYS POPULATED ══════════════════════
--
-- The INSERT policy `access request insert own` requires BOTH
-- `requested_role IS NOT NULL` and `requested_team_id IS NOT NULL`. That policy
-- was added 16 Aug 2026 for exactly this complaint — "i still have account
-- requests coming in and have no idea who they are" — so this migration does
-- not touch it. The writer sets `requested_team_id` to the FIRST squad chosen
-- and the array to all of them, which means:
--
--   * the policy is satisfied without being weakened;
--   * every existing reader keeps working unchanged;
--   * nothing has to be backfilled — an old row simply has a null array, and
--     the screen falls back to the single column it already read.
--
-- ⚠️ NO BACKFILL ON PURPOSE. Copying the old single id into a one-element array
-- would make it impossible to tell "asked for one squad" from "asked before the
-- array existed", and the fallback below costs nothing.

begin;

alter table public.access_requests
  add column if not exists requested_team_ids uuid[];

comment on column public.access_requests.requested_team_ids is
  'Every squad the person named when they asked, in the order they were shown. '
  'requested_team_id holds the FIRST of these and is what the INSERT policy '
  'checks; this column is the full answer. Null on rows written before '
  '20 Aug 2026 — readers fall back to requested_team_id.';

commit;
