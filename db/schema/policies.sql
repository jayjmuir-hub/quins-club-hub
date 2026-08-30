-- =====================================================================
-- db/schema/policies.sql
-- CAPTURE of every row-level-security policy on the `public` schema of
-- Supabase project lusmshimxdcxpnrktlgz (quins-club-hub), 2026-08-03,
-- re-captured 2026-08-04 after the player_parents + photos migration, the
-- access_requests migration, and the self-service profile migration.
--
-- SCOPE WIDENED 2026-08-04: this file now also records the two policies on
-- `storage.objects` for the `player-photos` bucket (last section). The
-- README's capture query filters `schemaname = 'public'` and would have
-- missed them entirely — run it for `storage` as well, or they drift
-- invisibly, which is the exact failure this directory exists to prevent.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md.
--
-- Source: pg_policies, pg_class.relrowsecurity.
--
-- RE-CAPTURED 2026-08-07. Live count was 31 public policies + the 2 on
-- storage.objects. The only delta since 4 Aug was the removal of "contact read"
-- and "parent read" (commit c70be86) — every other policy's USING / WITH CHECK
-- expression was compared against the live catalogue and was unchanged.
--
-- RE-CAPTURED 2026-08-09. Live count is now 33 public policies + the 2 on
-- storage.objects = 35. Delta since the 7 Aug capture, all of it from the
-- 8-9 Aug migrations:
--
--   ADDED   memberships  "memb read squad staff pending"   (squad_staff_approval, 9 Aug)
--   ADDED   profiles     "profile read squad staff pending"(squad_staff_approval, 9 Aug)
--   CHANGED players      "player read"     + OR is_own_player(id)
--   CHANGED availability "avail read"      + OR is_own_player(player_id)
--   CHANGED events       "event read"      can_see_team -> is_attached_to_team
--   CHANGED teams        "team read"       membership EXISTS -> auth.uid() IS NOT NULL
--   REMOVED (nothing)
--
-- The four CHANGED rows are all consequences of one migration pair:
-- `membership_pending_status` (8 Aug) split the old single `can_see_team`
-- helper into two, and `teams_readable_before_registration` (8 Aug) widened
-- team-name reads. The helper split is the thing to understand before
-- reading any policy below — see the block immediately after the RLS list.
--
-- RE-CAPTURED AGAIN 2026-08-09, later the same day, after
-- `scale_indexes_and_availability_policy_merge`
-- (db/migrations/20260809_scale_indexes_and_availability_policy_merge.sql).
-- Live count is STILL 33 public policies + the 2 on storage.objects = 35, and
-- availability still has exactly 4 — but they are not the same 4. Delta:
--
--   DROPPED availability "avail coach manage" (FOR ALL)
--   DROPPED availability "avail read"         (SELECT)
--   DROPPED availability "avail own insert"   (INSERT)
--   DROPPED availability "avail own update"   (UPDATE)
--   ADDED   availability "avail read"         (SELECT)
--   ADDED   availability "avail write insert" (INSERT)
--   ADDED   availability "avail write update" (UPDATE)
--   ADDED   availability "avail write delete" (DELETE)
--
-- ⚠️ A COUNT DID NOT MOVE WHILE THE POLICY SET WAS REPLACED WHOLESALE. Four
-- out, four in. Anything that reconciles this directory by counting rows
-- would have called this file clean. Read the availability block itself.
--
-- Nothing outside `public.availability` changed. Every other policy's
-- USING / WITH CHECK was re-read from pg_policies and matches this file.
--
-- ⚠️ "memb manage" was CHECKED and is UNCHANGED: still
-- `private.is_admin(club_id)` for both USING and WITH CHECK, still ADMIN-ONLY.
-- It was NOT widened to coaches. That is deliberate and load-bearing — see
-- the memberships section.
--
-- RE-CAPTURED 2026-08-11. ⚠️ ONE POLICY WAS LIVE FROM 10 AUG WITH NO ENTRY
-- HERE, and it is the single most consequential kind to have missed:
--
--   ADDED   memberships  "memb no self promotion"  RESTRICTIVE, INSERT
--                        (20260810183058 super_admin_and_rights)
--
-- ⚠️ THIS FILE ASSERTED THE OPPOSITE OF THE TRUTH ABOUT IT. The paragraph
-- below read "Every policy is PERMISSIVE" — a sentence a reader would
-- reasonably rely on, because a PERMISSIVE policy can only ever ADD rows and a
-- RESTRICTIVE one is ANDed with everything else and can REMOVE them. Reasoning
-- from "they are all permissive, so this set can only be widened by adding to
-- it" was correct on 9 Aug and became wrong on 10 Aug.
--
-- ⚠️ Same shape as the "DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT" note that
-- tables.sql carried for a day after the unique index was created: not a
-- missing line, but a **standing claim that inverted**. Those are worse than
-- an omission, because an omission looks like an omission.
--
-- Every OTHER policy is PERMISSIVE, and all of them apply to role {public}
-- (i.e. no explicit TO clause was given; scoping is done entirely inside the
-- expressions via auth.uid() / auth.jwt()). Every helper referenced lives
-- in the `private` schema — see functions.sql.
--
-- EXCEPTION: the two `storage.objects` policies at the end are TO
-- authenticated, not {public}. That is deliberate — on a storage bucket
-- the anon role is a real caller, not a theoretical one.
-- =====================================================================


-- ---------------------------------------------------------------------
-- RLS enabled state — EVERY public table
-- (relrowsecurity = true, relforcerowsecurity = false on every one)
--
-- ⚠️ THE HEADING SAID "all thirteen public tables" UNTIL 11 AUG 2026 AND THE
-- LIST BELOW HAD THIRTEEN ENTRIES, while live had sixteen: `attendance`
-- (10 Aug), `pitches` and `pitch_requests` (11 Aug) were all missing. Every one
-- of the three does have RLS on — verified live 11 Aug — so nothing was
-- exposed. But this list is the one place in the repo that would show a table
-- created WITHOUT RLS, and ⚠️ **Supabase's default privileges give `anon` full
-- table rights on every new table in `public`**, so such a table is not merely
-- unhardened, it is readable and writable by anyone holding the project URL.
-- A list that silently stops at thirteen cannot report that. The count is now
-- out of the heading deliberately; the list is the inventory.
--
-- Per-table policy counts previously lived here and were deleted for the same
-- reason: they rot, and pg_policies answers the question in a second.
--
-- ⚠️ AND IT DRIFTED AGAIN — FOUND 13 AUG 2026. `social_ideas` has had RLS on
-- since 12 Aug and was never added to this list, so the list was short by one
-- for a day, in exactly the way the paragraph above says it must not be. It has
-- RLS on; nothing was exposed. **The warning did not prevent the thing it warns
-- about, because a prose warning cannot.** Re-measured against pg_class the same
-- day and the list below now matches live table for table.
--
--   select c.relname, c.relrowsecurity, c.relforcerowsecurity
--   from pg_class c
--   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
--   order by c.relname;
-- ---------------------------------------------------------------------
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements      ENABLE ROW LEVEL SECURITY;  -- added 14 Aug 2026
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;  -- added 14 Aug 2026
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026
ALTER TABLE public.channel_settings  ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026
ALTER TABLE public.message_reads     ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026
ALTER TABLE public.conversations      ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026 (phase 3)
ALTER TABLE public.conversation_clears ENABLE ROW LEVEL SECURITY;  -- added 24 Aug 2026 (the Chats list)
ALTER TABLE public.dm_blocks          ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026 (phase 3)
ALTER TABLE public.message_reports    ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026 (phase 3)
ALTER TABLE public.welfare_access_log ENABLE ROW LEVEL SECURITY;  -- added 23 Aug 2026 (phase 3)
ALTER TABLE public.match_sheets      ENABLE ROW LEVEL SECURITY;  -- added 12 Aug 2026
ALTER TABLE public.match_sheet_slots ENABLE ROW LEVEL SECURITY;  -- added 12 Aug 2026
ALTER TABLE public.match_sheet_cards ENABLE ROW LEVEL SECURITY;  -- added 12 Aug 2026
ALTER TABLE public.attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_teams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_backup_runs ENABLE ROW LEVEL SECURITY;  -- added 13 Aug 2026
-- ⚠️ RLS ON AND **ZERO POLICIES**, WHICH IS NOT AN OVERSIGHT — it is what makes
-- the table unreachable from the browser. RLS with no policy denies every role
-- that does not bypass it, and `service_role` (which runs the nightly scan)
-- does bypass it. A future admin screen gets a policy written FOR it; do not
-- add one speculatively. added 16 Aug 2026
ALTER TABLE public.photo_orphan_scans ENABLE ROW LEVEL SECURITY;  -- added 16 Aug 2026
ALTER TABLE public.social_ideas      ENABLE ROW LEVEL SECURITY;  -- added 12 Aug 2026, captured 13 Aug
ALTER TABLE public.feedback          ENABLE ROW LEVEL SECURITY;  -- added 18 Aug 2026, captured 19 Aug
ALTER TABLE public.notification_opt_outs ENABLE ROW LEVEL SECURITY;  -- added 19 Aug 2026
ALTER TABLE public.pitch_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_parents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams           ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- READ THIS BEFORE ANY POLICY BELOW — the 8 Aug helper split
--
-- `memberships` gained a `status` column on 8 Aug ('active' / 'pending'),
-- so that a parent who self-registers can use the app before anyone has
-- approved them. Until then a membership row was a membership row, and the
-- single helper `private.can_see_team` returned true for ANY row with a
-- matching team_id whatever its role or status.
--
-- Migration `membership_pending_status` records the measurement that
-- motivated the split: run live on 8 Aug against a brand-new parent with one
-- U16 membership row (rolled back), that parent could read 6 players — the
-- whole squad — and 26 events. Not through a screen; through the query.
--
-- So one helper became two (both in `private`, see functions.sql):
--
--   private.can_see_team(_team)         requires status = 'active'.
--                                       Gates anything exposing OTHER PEOPLE.
--   private.is_attached_to_team(_team)  ANY status.
--                                       Gates non-sensitive squad context:
--                                       fixtures and training times.
--
-- The migration states the principle in one line: "A child's name and photo
-- are sensitive; a training time is not."
--
-- ⚠️ `private.can_edit_team` IS NOW STATUS-GATED TOO — changed 10 Aug 2026.
-- This paragraph said the opposite until then, and the reasoning it recorded
-- was real: staff roles are admin-granted and never self-registered, so a
-- pending coach cannot arise, and the check "implies a state that has no way
-- of existing". That premise still holds.
--
-- It was overturned on Jay's instruction, on the argument that THIRTEEN
-- policies hang off can_edit_team — events, players, player_contacts,
-- player_parents, all four attendance policies, three availability writes,
-- one arm of `avail read`, and the player-photo storage policy. The day any
-- flow grants staff access through a pending state, all thirteen open at once
-- and nothing in the diff that caused it will look like access control.
-- Harness: db/tests/rls-can-edit-team-status.sql.
--
-- ⚠️ CONSEQUENCE, correcting a warning that was true until now: the merged
-- `avail read` policy's three arms — can_see_team OR can_edit_team OR
-- is_own_player — were documented as only LOOKING redundant, because dropping
-- the can_edit_team arm would remove a pending coach's read. can_edit_team now
-- implies active, so it is a strict subset of can_see_team and that arm IS
-- genuinely redundant. LEFT IN PLACE deliberately — it costs a boolean, and
-- removing it is its own change with its own harness.
--
-- ⚠️ `private.is_attached_to_team` REMAINS STATUS-BLIND, ON PURPOSE. Do not
-- "finish the job" by adding the check there: it gates `event read`, and a
-- pending parent seeing fixtures and training times is what makes signing in
-- worth anything before approval. Measured 10 Aug: a pending coach reads
-- events and cannot read players or contacts. That is correct.
--
-- Three read policies below therefore gained an `OR private.is_own_player(...)`
-- arm on 8 Aug — "player read", "avail read" — or swapped helper entirely
-- — "event read". Each is annotated in place.
-- =====================================================================


-- ---------------------------------------------------------------------
-- access_requests  (3 policies — the approval gate)
--
-- Note what is ABSENT: the OWNER has no UPDATE and no DELETE policy. That
-- absence, plus the UNIQUE key on profile_id, is what stops a dismissed
-- person re-opening their own request. Re-opening is an admin action.
--
-- The `status = 'pending'` clause in the insert policy's WITH CHECK is
-- load-bearing: any status value the client controls is a value it can
-- choose, so pinning it here means every write that sets 'dismissed' is an
-- admin write.
--
-- The admin policy is FOR ALL because all four verbs are genuinely used:
-- SELECT the queue, INSERT a dismissal for someone who never asked, UPDATE an
-- existing request to dismissed, DELETE to restore someone dismissed by
-- mistake.
-- ---------------------------------------------------------------------
CREATE POLICY "access request admin" ON public.access_requests
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin_anywhere())
  WITH CHECK (private.is_admin_anywhere());

-- Re-captured 25 Aug 2026: live is TO authenticated (not public) and the
-- 16 Aug who-and-which-squad migration added the two NOT NULL requirements —
-- the table comment described them; this block had not caught up.
-- 26 Aug 2026: a volunteer may carry no squad — Jay's reversal of his 17 Aug
-- ruling; 20260826_volunteer_no_squad.sql. Every other role still needs one.
CREATE POLICY "access request insert own" ON public.access_requests
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (requested_role IS NOT NULL) AND ((requested_team_id IS NOT NULL) OR (requested_role = 'volunteer'::text))));

CREATE POLICY "access request read own" ON public.access_requests
  AS PERMISSIVE FOR SELECT TO public
  USING ((profile_id = auth.uid()));


-- ---------------------------------------------------------------------
-- availability  (4 policies — ONE PER COMMAND since 9 Aug 2026)
-- ---------------------------------------------------------------------
-- ⚠️ ALL FOUR POLICIES ON THIS TABLE WERE REPLACED 2026-08-09 by
-- `scale_indexes_and_availability_policy_merge`. The count stayed at 4; the
-- policies are different objects. Do not read the count as "unchanged".
--
-- WHAT THIS BLOCK USED TO SAY, and no longer does. Until 9 Aug this section
-- described FOUR policies covering only THREE commands:
--
--     avail coach manage   FOR ALL     can_edit_team(<event's team>)
--     avail read           SELECT      can_see_team(...) OR is_own_player
--     avail own insert     INSERT      is_own_player
--     avail own update     UPDATE      is_own_player
--
-- and it carried a note headed "CHANGED 2026-08-08 (membership_pending_status)"
-- explaining that "avail read" had gained its `OR is_own_player(player_id)`
-- arm on 8 Aug — the migration called it "THE SILENT ONE": the write policies
-- were `is_own_player` but the read was `can_see_team` alone, so once
-- can_see_team required status = 'active', a pending parent would SAVE their
-- child's availability and then not be able to read it back. The write
-- succeeds, the row vanishes, nothing errors. That history is still WHY the
-- is_own_player arm exists in the SELECT policy below — the merge preserved
-- it deliberately — but the four-policy shape it described is gone.
--
-- WHY THE MERGE. Permissive policies are OR'd, and Postgres evaluates EVERY
-- one of them per candidate row. Under the old shape, SELECT, INSERT and
-- UPDATE each ran TWO policy expressions — each containing a subquery against
-- `events` — where one would do. `availability` is the largest table in the
-- schema (one row per player per event: ~70,000 for a season at the 600-700
-- players the club is heading for), so that was a straight doubling of
-- per-row policy work on the worst possible table. Now: one policy per
-- command, each carrying the full OR'd rule.
--
-- ══ THE THREE THINGS THAT MAKE THIS SECTION NON-OBVIOUS ═══════════════
-- (all three from the migration header — read it before touching these)
--
-- ⚠️ 1. THE THREE-ARM SELECT IS NOT REDUNDANT. `can_see_team OR can_edit_team
-- OR is_own_player` looks like it has a spare arm, because for an ACTIVE
-- staff member can_edit_team does imply can_see_team. The middle arm is
-- load-bearing anyway: **private.can_edit_team does NOT check `status` and
-- private.can_see_team DOES**. Drop it and a PENDING coach silently loses
-- their read. The first version of this merge did exactly that, and the
-- harness caught it — `2_coach_pending` went 1 -> 0 on SELECT and
-- ALLOWED -> NO ROWS on UPDATE and DELETE. Keeping the arm is what makes this
-- a refactor rather than a behaviour change.
--
-- ⚠️ 2. DELETE IS STAFF-ONLY, AND ALWAYS WAS. "avail write delete" is
-- can_edit_team with NO is_own_player arm. That is not an omission: a parent
-- was never granted delete under the old shape either (the only FOR ALL
-- policy was the coach one), and the merge did not grant it. A parent changes
-- their answer; they do not remove the row. The harness records
-- `3_parent_active` as NO ROWS on delete both before and after.
--
-- ⚠️ 3. THE EQUIVALENCE WAS MEASURED, NOT ARGUED. A policy merge is an
-- authorisation change wearing a performance hat, and "obviously equivalent"
-- is how access quietly widens. `db/tests/rls-availability-equivalence.sql`
-- records what SEVEN kinds of caller can do before the merge, applies it, and
-- re-records: active coach, pending coach, active parent, pending parent,
-- unrelated active parent, admin, anon — across SELECT, INSERT, UPDATE and
-- DELETE. All seven read `same`. If you change anything below, re-run it.
--
-- ⚠️ NOT FIXED HERE, and deliberately: `private.can_edit_team` still has no
-- `status` check while `private.can_see_team` gained one on 8 Aug, so a
-- PENDING coach/manager/medic can WRITE their squad's availability. It is
-- latent, not live — no app path creates a pending staff membership — and it
-- belongs in a change of its own with its own harness. See the migration
-- header and claude/state-of-play.md.
--
-- Expressions below are verbatim from pg_policies as at 9 Aug 2026 (note the
-- `e` alias, which is how the catalogue renders them).
CREATE POLICY "avail read" ON public.availability
  AS PERMISSIVE FOR SELECT TO public
  USING ((private.can_see_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))) OR private.can_edit_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))) OR private.is_own_player(player_id)));

CREATE POLICY "avail write insert" ON public.availability
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((private.can_edit_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))) OR private.is_own_player(player_id)));

CREATE POLICY "avail write update" ON public.availability
  AS PERMISSIVE FOR UPDATE TO public
  USING ((private.can_edit_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))) OR private.is_own_player(player_id)))
  WITH CHECK ((private.can_edit_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))) OR private.is_own_player(player_id)));

CREATE POLICY "avail write delete" ON public.availability
  AS PERMISSIVE FOR DELETE TO public
  USING (private.can_edit_team(( SELECT e.team_id
   FROM events e
  WHERE (e.id = availability.event_id))));


-- ---------------------------------------------------------------------
-- calendar_tokens  (1 policy)
--
-- Own row only. There is deliberately NO admin policy: an admin has no reason
-- to read someone else's feed URL, and a table of live bearer credentials is
-- the last place to widen read access for convenience.
-- ---------------------------------------------------------------------
CREATE POLICY "calendar token own" ON public.calendar_tokens
  AS PERMISSIVE FOR ALL TO public
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));


-- ---------------------------------------------------------------------
-- clubs  (1 policy — SELECT only; no INSERT/UPDATE/DELETE policy exists,
--         so nothing can write to clubs through the API at all)
-- ---------------------------------------------------------------------
CREATE POLICY "club read" ON public.clubs
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.club_id = clubs.id)))));


-- ---------------------------------------------------------------------
-- events  (2 policies)
--
-- ⚠️ CHANGED 2026-08-08 (membership_pending_status): "event read" was
-- `private.can_see_team(team_id)` and is now
-- `private.is_attached_to_team(team_id)` — i.e. ANY membership status, not
-- just 'active'. This is the deliberate widening half of the helper split:
-- the migration's stated reason is that fixtures are not sensitive and "a
-- pending parent needs them to be worth signing in at all".
--
-- Note the consequence, because it is the point of the split rather than an
-- accident: a PENDING member reads this squad's whole fixture list, while
-- reading none of its people.
--
-- ⚠️ `is_attached_to_team` was created with its EXECUTE grant revoked from
-- public and none re-granted, which broke every events query with
-- "42501: permission denied for function is_attached_to_team" within
-- minutes. Fixed the same day by `is_attached_to_team_grants` (8 Aug), which
-- grants EXECUTE to authenticated and anon. The concept, recorded there
-- because it is easy to repeat: an RLS policy expression is evaluated AS THE
-- QUERYING USER, not as the table owner, so every helper a policy calls needs
-- its own grant.
-- ---------------------------------------------------------------------
CREATE POLICY "event read" ON public.events
  AS PERMISSIVE FOR SELECT TO public
  USING (private.is_attached_to_team(team_id));

CREATE POLICY "event edit" ON public.events
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(team_id))
  WITH CHECK (private.can_edit_team(team_id));


-- ---------------------------------------------------------------------
-- invite_targets  (2 policies)
-- ---------------------------------------------------------------------
CREATE POLICY "invite targets read own" ON public.invite_targets
  AS PERMISSIVE FOR SELECT TO public
  USING (private.is_own_invite(invite_id));

CREATE POLICY "invite targets manage" ON public.invite_targets
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_manage_invite(invite_id))
  WITH CHECK (private.can_manage_invite(invite_id));


-- ---------------------------------------------------------------------
-- invites  (2 policies)
-- "invites read own" matches on the invitee's own VERIFIED login email
-- from the JWT — never a client-supplied value. Do not weaken this to
-- anything the caller can set.
-- ---------------------------------------------------------------------
CREATE POLICY "invites read own" ON public.invites
  AS PERMISSIVE FOR SELECT TO public
  USING ((lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))));

CREATE POLICY "invites manage" ON public.invites
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));


-- ---------------------------------------------------------------------
-- league_teams  (2 policies — ADDED 2026-08-12)
--
-- ⚠️ READ IS DELIBERATELY WIDE — any signed-in member, not a membership check.
-- A coach filling an RCM match sheet has to pick their league team, so a
-- narrower policy would make the sheet unfillable. Nothing here is sensitive:
-- it is the club's own team names, which the opposition already knows.
--
-- ⚠️ WRITE IS ADMIN-ONLY, AND THAT IS THE SECURITY BOUNDARY. `rcm_name` is the
-- field that tells the league whose result a match sheet is. A coach able to
-- rename a league team could file a result against another team's name, and the
-- club would learn about it from the league table rather than from the app.
--
-- ⚠️ THE `youth` ADMIN RIGHT DOES NOT APPEAR HERE, ON PURPOSE. Same ruling as
-- pitches: a right decides which dashboard somebody is SHOWN, not what they may
-- do. It is a "not your job" message and must never be called a boundary.
--
-- Harness: db/tests/rls-league-teams.sql. Verified live 12 Aug 2026 — a coach's
-- INSERT refused with 42501 specifically, an admin's allowed, anon reads zero.
-- ---------------------------------------------------------------------
CREATE POLICY "league team read" ON public.league_teams
  AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "league team manage" ON public.league_teams
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));


-- ---------------------------------------------------------------------
-- memberships  (4 policies — was 2 until 9 Aug 2026, 3 until 10 Aug)
--
-- ⚠️ THE FOURTH IS THE ONLY RESTRICTIVE POLICY IN THIS SCHEMA. Read the
-- "memb no self promotion" block at the end of this section before reasoning
-- about what an admin can write to this table — everything above it describes
-- what is PERMITTED, and that one describes what is FORBIDDEN regardless.
--
-- ⚠️⚠️ "memb manage" IS STILL ADMIN-ONLY AND MUST STAY THAT WAY. ⚠️⚠️
--
-- Squad approvals shipped on 9 Aug: coaches and team managers may now approve
-- pending registrations for their own age groups. The obvious way to build
-- that is to add a coach clause to "memb manage". It was deliberately NOT
-- done, and migration `squad_staff_approval` plus
-- claude/decisions/2026-08-09-approvals-emails-and-accounts.md both record
-- why, in the same words:
--
--   "memb manage" is FOR ALL — not "for update of status" — and **RLS grants
--   ROWS, NOT COLUMNS**. Widening it to coaches would hand every coach the
--   ability to change anyone's ROLE on their squad (including to 'admin'), to
--   reassign a membership to another team, and to DELETE access. Approving a
--   registration and administering the club would become the same permission.
--
-- So the WRITE stays admin-only here, and approval lives in
-- `public.approve_membership`, a SECURITY DEFINER function whose SET list is
-- a literal `status` and which takes no role, team or player parameter. The
-- decision doc puts the corollary bluntly: the RPC is pointless the moment
-- coaches can write the table directly.
--
-- If a future diff shows this policy's USING or WITH CHECK as anything other
-- than `private.is_admin(club_id)`, that is a privilege escalation, not a
-- refactor. The migration ships a guard that counts this policy and RAISEs.
-- ---------------------------------------------------------------------
CREATE POLICY "memb read" ON public.memberships
  AS PERMISSIVE FOR SELECT TO public
  USING (((profile_id = auth.uid()) OR private.is_admin(club_id)));

CREATE POLICY "memb manage" ON public.memberships
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));

-- ADDED 2026-08-09 (squad_staff_approval). "memb read" is (own row) OR
-- is_admin, so a coach could not see the pending membership at all and the
-- approval queue would be permanently empty for them.
--
-- ⚠️ SCOPED TO status = 'pending', NOT to the whole squad. The migration's
-- reasoning: a coach does not need the squad's membership table to approve a
-- registration, and handing it over would be a disclosure nobody asked for.
-- The row leaves their view the moment they approve it, which is correct —
-- it is no longer waiting.
--
-- PERMISSIVE, so it ORs with "memb read" and can only ever ADD rows. It
-- cannot narrow anything. It is a SELECT policy only — it confers no write.
--
-- `private.can_approve_team` is admin-anywhere-in-club, or coach/manager of
-- this squad. It is NOT `can_edit_team`: MEDIC IS EXCLUDED (Jay, 9 Aug 2026).
-- A medic keeps full squad access, but admitting a stranger to a children's
-- squad is not a medical decision. If that is ever revisited, change
-- can_approve_team — do not repoint callers at can_edit_team, which would
-- also silently re-include any role added to that list later.
--
-- Consequence the decision doc records as having actually bitten: because a
-- coach sees ONLY pending rows, an approval done as a table UPDATE with
-- `.select()` read back zero rows, so a SUCCESSFUL approval was reported to
-- the coach as a refusal. That is one more reason approval is an RPC.
CREATE POLICY "memb read squad staff pending" ON public.memberships
  AS PERMISSIVE FOR SELECT TO public
  USING (((status = 'pending'::text) AND private.can_approve_team(team_id)));

-- ADDED 2026-08-10 (super_admin_and_rights). ⚠️ THE ONLY RESTRICTIVE POLICY IN
-- THIS FILE, and the only one whose effect is to REMOVE rows rather than add
-- them. Restrictive policies are ANDed with the permissive set, so this cannot
-- grant anything: an INSERT must satisfy "memb manage" AND this.
--
-- ⚠️ WHAT IT IS FOR, and why the column grant alone was not enough. The super
-- tier is a FLAG on this table (memberships.is_super, plus the admin_rights
-- array), and "memb manage" is FOR ALL and admin-only — so **every admin can
-- already write rows here**. Two doors therefore had to be shut, not one:
--
--   UPDATE — closed by the column GRANT in grants.sql. `authenticated` simply
--            does not hold UPDATE on is_super or admin_rights, so an admin
--            cannot promote an existing row, their own included.
--   INSERT — closed by THIS. A grant on a column does not stop somebody
--            INSERTing a brand-new row that arrives already carrying
--            is_super = true. Without this policy the tier is decoration: any
--            admin could insert themselves a second, super membership.
--
-- The legitimate route is public.set_admin_rights, a SECURITY DEFINER RPC
-- whose first statement is private.is_super_admin(). The `OR
-- private.is_super_admin()` arm here is what lets a super admin create an
-- already-super row directly, rather than having to insert then promote.
--
-- ⚠️ `COALESCE(array_length(admin_rights, 1), 0) = 0` and not
-- `admin_rights = '{}'`: array_length of an empty array is NULL in Postgres,
-- not 0, so the coalesce is load-bearing. Without it the expression is NULL for
-- the ordinary case, NULL is not true, and a RESTRICTIVE policy that is not
-- true REFUSES — which would block every ordinary membership insert in the app.
--
-- Harness: db/tests/rls-super-admin.sql.
CREATE POLICY "memb no self promotion" ON public.memberships
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((((is_super = false) AND (COALESCE(array_length(admin_rights, 1), 0) = 0)) OR private.is_super_admin()));


-- ---------------------------------------------------------------------
-- player_contacts  (2 policies — safeguarding: parents/players see only
--                   their own player's contact row, coaches/admins see
--                   the teams they can edit)
-- ---------------------------------------------------------------------
-- ⚠️ DROPPED 2026-08-06 (commit c70be86). "contact read" was EXACTLY the OR of
-- the two ALL policies already covering this table, so removing it changed
-- nothing a caller can observe. Recorded rather than deleted because the
-- redundancy is MUTUAL AND THE TWO SIDES ARE NOT INTERCHANGEABLE: dropping the
-- read-only policy is safe, dropping "contact edit own" would silently remove a
-- parent's ability to EDIT their own contact row. A fault injection that found
-- NOTHING is what established that. Do not "restore" this policy.
--
-- CREATE POLICY "contact read" ON public.player_contacts
--   AS PERMISSIVE FOR SELECT TO public
--   USING ((private.can_edit_team(...) OR private.is_own_player(player_id)));

-- Self-service, added 4 Aug 2026: the OWNER (a parent of this player, or the
-- player themselves) may edit their own contact row. PERMISSIVE, so it ORs
-- with "contact edit" above rather than narrowing it.
--
-- WITH CHECK repeats the predicate deliberately: without it an owner could
-- UPDATE their row and set player_id to another child, moving their contact
-- details onto somebody else's record.
CREATE POLICY "contact edit own" ON public.player_contacts
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));

CREATE POLICY "contact edit" ON public.player_contacts
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT players.team_id
   FROM players
  WHERE (players.id = player_contacts.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT players.team_id
   FROM players
  WHERE (players.id = player_contacts.player_id))));


-- ---------------------------------------------------------------------
-- player_parents  (2 policies — a deliberate byte-for-byte mirror of
--                  player_contacts above: same two policies, same
--                  predicates, same helpers. Parent details are the same
--                  class of safeguarding-sensitive data, so they get the
--                  same boundary rather than a second one to reason about.
--                  A parent sees their own child's parent rows and NOBODY
--                  else's, including other parents in the same squad.)
-- ---------------------------------------------------------------------
-- ⚠️ DROPPED 2026-08-06 (commit c70be86), same reasoning as "contact read".
--
-- CREATE POLICY "parent read" ON public.player_parents
--   AS PERMISSIVE FOR SELECT TO public
--   USING ((private.can_edit_team(...) OR private.is_own_player(player_id)));

-- Same self-service addition, same reasoning, on the parent rows. A parent
-- keeping their own household's details current is the most common correction
-- anyone will make in this app.
CREATE POLICY "parent edit own" ON public.player_parents
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));

CREATE POLICY "parent edit" ON public.player_parents
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT p.team_id
   FROM players p
  WHERE (p.id = player_parents.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT p.team_id
   FROM players p
  WHERE (p.id = player_parents.player_id))));


-- ---------------------------------------------------------------------
-- players  (2 policies)
-- ---------------------------------------------------------------------
-- CHANGED 2026-08-08 (membership_pending_status). Was `can_see_team(team_id)`
-- alone. can_see_team now requires status = 'active', which would leave a
-- pending parent seeing NOTHING — including the player they had just
-- registered, which reads as the app having lost them. The is_own_player arm
-- restores exactly that one row and nothing else.
--
-- Note the argument is `id`, not `team_id`: is_own_player takes a PLAYER id.
CREATE POLICY "player read" ON public.players
  AS PERMISSIVE FOR SELECT TO public
  USING ((private.can_see_team(team_id) OR private.is_own_player(id)));

CREATE POLICY "player edit" ON public.players
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(team_id))
  WITH CHECK (private.can_edit_team(team_id));


-- ---------------------------------------------------------------------
-- profiles  (7 policies — was 6 until 9 Aug 2026)
--
-- NOTE: "profile update own" has a USING clause but NO WITH CHECK. For an
-- UPDATE policy Postgres then reuses USING for the check, so a user still
-- cannot move their row to another id — recorded because the asymmetry
-- with "profile update club admin" (which has both) looks like an
-- oversight at a glance and is not one.
--
-- "profile read pending" exists so an admin can see a signed-up user who
-- has no membership yet (i.e. someone who registered but has not accepted
-- an invite) — otherwise they would be invisible on the Accounts screen.
-- ---------------------------------------------------------------------
CREATE POLICY "profile read own" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING ((id = auth.uid()));

CREATE POLICY "profile read club admin" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (private.shares_admin_club(id));

CREATE POLICY "profile read pending" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_admin_see_pending(id));

-- ADDED 2026-08-09 (squad_staff_approval). The counterpart to "memb read
-- squad staff pending": the approval queue shows the child's name, the
-- parent's name and the parent's email, and without this the coach sees a
-- card with two blanks on it and no way to judge whether the person is real
-- — which is the entire decision they are being asked to make.
--
-- ⚠️ The helper is an EXISTS over the TARGET'S *PENDING* MEMBERSHIP ROWS
-- ONLY — not "this person is on my squad", which would expose every parent's
-- email on the squad to every coach. Once the last pending row is approved
-- the profile stops being visible through this path. That lifetime is
-- intended, not a side effect.
--
-- Distinct from "profile read pending" above: that one is admin-only and
-- fires on a profile with NO memberships at all. This one fires on a profile
-- with a PENDING membership on a squad the caller may approve for.
CREATE POLICY "profile read squad staff pending" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_squad_staff_see_pending(id));

CREATE POLICY "profile insert own" ON public.profiles
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "profile update own" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO public
  USING ((id = auth.uid()));

CREATE POLICY "profile update club admin" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO public
  USING (private.shares_admin_club(id))
  WITH CHECK (private.shares_admin_club(id));


-- ---------------------------------------------------------------------
-- teams  (2 policies)
--
-- ⚠️ CHANGED 2026-08-08 (teams_readable_before_registration, applied live as
-- version 20260808164111). "team read" USED TO CLAIM, and used to be:
--
--   USING (EXISTS (SELECT 1 FROM memberships m
--                   WHERE m.profile_id = auth.uid()
--                     AND m.club_id = teams.club_id))
--
-- It is now `auth.uid() IS NOT NULL` — any signed-in account may list team
-- names. The migration's reasoning: the self-registration screen asks a
-- signed-in person with NO memberships to pick their child's age group, and
-- the old policy returned zero rows for exactly that user, so the dropdown
-- was empty. `teams` is (id, club_id, name, sort_order, is_senior) — "U13",
-- "U16", "Colts" is the club's fixture list, already printed on the website,
-- so there is nothing here to definer-protect.
--
-- ⚠️ `anon` is NOT granted anything. The policy still requires auth.uid() to
-- be non-null, so a signed-OUT visitor still reads nothing.
--
-- ⚠️ THE FINAL PARAGRAPH OF THIS FILE IS NOW PARTLY WRONG BECAUSE OF THIS —
-- see the correction at the bottom.
--
-- ⚠️ RECORDED AS FOUND, NOT FIXED (9 Aug): the repo copy of that migration,
-- db/migrations/20260808_teams_readable_before_registration.sql, still opens
-- with "⚠️⚠️ NOT APPLIED. WRITTEN 8 Aug 2026, WAITING ON JAY. ⚠️⚠️". It WAS
-- applied — the live policy matches it. That header is stale.
-- Separately, the migration ends with `comment on policy "team read"`, and
-- the live catalogue carries NO comment on that policy (nor on any other
-- policy: obj_description is null for all 35). So the comment statement did
-- not land even though the CREATE POLICY did. Not a security difference —
-- but it means what actually ran was not byte-identical to the committed
-- file, which is worth knowing.
-- ---------------------------------------------------------------------
CREATE POLICY "team read" ON public.teams
  AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "team manage" ON public.teams
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));


-- ---------------------------------------------------------------------
-- storage.objects — bucket `player-photos`  (2 policies)
--
-- NOT in the `public` schema, so the README's capture query misses these.
-- Recorded here anyway; re-capture them alongside the public ones.
--
-- The bucket is PRIVATE (public = false, 5 MB cap, allowed MIME types
-- image/jpeg, image/png, image/webp). These are head shots of children: a
-- public bucket would hand out a permanent unauthenticated URL for every
-- one, with no expiry and no way to revoke short of deleting the file.
--
-- READ is `can_see_team` — squad-wide, matching public.players' own
-- "player read" policy, because the photo sits beside the name in the
-- roster and the name is already visible to exactly that audience.
-- Jay approved this deliberately. TO TIGHTEN to coaches/admins plus the
-- player's own account, swap can_see_team for can_edit_team and add
-- `OR private.is_own_player(private.photo_player(name))`, i.e. exactly the
-- shape of "parent read" above.
--
-- WRITE is coaches/admins of the squad OR the player's own account (the
-- is_own_player arm added 4 Aug 2026 for self-service). WITH CHECK as well as
-- USING, so neither a coach nor an owner can upload INTO another player's
-- folder.
--
-- Both depend on private.photo_team(name) parsing the FIRST path segment
-- as the player id — the "<player_id>/<timestamp>.<ext>" key format is
-- load-bearing security, not a naming convention. See functions.sql.
-- ---------------------------------------------------------------------
CREATE POLICY "player photo read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'player-photos'::text) AND private.can_see_team(private.photo_team(name))));

CREATE POLICY "player photo write" ON storage.objects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'player-photos'::text) AND (private.can_edit_team(private.photo_team(name)) OR private.is_own_player(private.photo_player(name)))))
  WITH CHECK (((bucket_id = 'player-photos'::text) AND (private.can_edit_team(private.photo_team(name)) OR private.is_own_player(private.photo_player(name)))));


-- ---------------------------------------------------------------------
-- storage.objects — bucket `staff-photos`  (2 policies, added 2026-08-13)
--
-- Head shots of the ADULTS who staff a squad. ⚠️ A SEPARATE BUCKET FROM
-- `player-photos` ON PURPOSE: that one holds photographs of CHILDREN behind
-- policies written around squad membership, and nothing written for staff
-- should be able to widen it.
--
-- ⚠️ THE WRITE RULE IS NARROWER THAN THE PLAYER ONE, DELIBERATELY. A player
-- photo may be uploaded by that child's COACH (`can_edit_team`), because a
-- nine-year-old cannot do it. A coach is an adult with their own login, so
-- here it is OWN PREFIX ONLY — nobody else picks the picture of your face
-- that thirty families see.
--
-- ⚠️ `FOR ALL` WITH **BOTH** `USING` AND `WITH CHECK`, and the pair is the
-- point. `USING` is tested against the row as it EXISTS and governs
-- UPDATE/DELETE; `WITH CHECK` is tested against the row being WRITTEN and is
-- the only one an INSERT consults. With `USING` alone, any signed-in account
-- could create an object under somebody else's prefix — and that person's
-- own photo would then be one a stranger put there. This is the trap
-- 20260804_self_service_profile.sql records for the player bucket.
--
-- The READ rule mirrors public.my_squad_staff() and must keep mirroring it:
-- the card draws a name from that function and a face from this policy, so if
-- the two drift a parent sees a photograph of somebody the app will not name.
-- Proved live against an injected fault: a member of another squad is refused,
-- and the SAME query returns the photo once they join the squad.
-- ---------------------------------------------------------------------
-- Re-captured 25 Aug 2026: live roles are {public} on both (the function
-- gates access, not the role list), and the WRITE policy now goes through
-- private.may_set_staff_photo — an admin may set another staff member's
-- photo, not only their own.
CREATE POLICY "staff photo read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'staff-photos'::text) AND private.can_see_staff_photo(private.staff_photo_owner(name))));

CREATE POLICY "staff photo write" ON storage.objects
  AS PERMISSIVE FOR ALL TO public
  USING (((bucket_id = 'staff-photos'::text) AND private.may_set_staff_photo(private.staff_photo_owner(name))))
  WITH CHECK (((bucket_id = 'staff-photos'::text) AND private.may_set_staff_photo(private.staff_photo_owner(name))));


-- ---------------------------------------------------------------------
-- Consequence worth keeping in view — CORRECTED 2026-08-09.
--
-- THIS PARAGRAPH USED TO SAY: "every SELECT policy above bottoms out in a
-- memberships row for auth.uid(). A signed-in user with zero memberships
-- reads ZERO rows from every table, including teams — no error, just empty.
-- That is correct for an invite-only club app."
--
-- That was true up to 7 Aug. It is no longer, in one specific place:
-- "team read" is now `auth.uid() IS NOT NULL` (8 Aug), so a signed-in user
-- with zero memberships reads EVERY team row. The club is no longer purely
-- invite-only — parents self-register, and picking an age group is the first
-- thing they do.
--
-- The corrected statement:
--
--   * `teams` — readable by any signed-in account. Names only; no people.
--   * everything that exposes PEOPLE — players, player_contacts,
--     player_parents, availability, profiles — still bottoms out in a
--     memberships row, and since 8 Aug in an ACTIVE one, via
--     private.can_see_team. A zero-membership user still reads nothing there.
--   * `events` sits between the two: `is_attached_to_team`, so it needs a
--     membership row but not an active one. Zero memberships still reads
--     zero events.
--
-- So the invariant that matters is narrower than the old sentence but
-- unbroken: NO SQUAD MEMBER'S DETAILS ARE READABLE WITHOUT AN ACTIVE
-- MEMBERSHIP ON THAT SQUAD, or an approval-scoped pending row (memberships /
-- profiles, 9 Aug), or ownership of the player.
-- ---------------------------------------------------------------------


-- =====================================================================
-- attendance  — added 2026-08-10, db/migrations/20260810_attendance.sql
--
-- ⚠️ THE READ POLICY IS DELIBERATELY NARROWER THAN THE HOUSE STYLE, and this
-- is the note that stops somebody "fixing" it. Every other team-scoped table
-- reads with `can_see_team`, so a parent sees the whole squad. Attendance does
-- not: "which children miss training, and how often" is a safeguarding-
-- adjacent fact about somebody else's child and the sort of thing that becomes
-- touchline gossip. Staff see the squad; a parent sees only their own child.
--
-- ⚠️ `is_own_player` APPEARS IN THE READ POLICY AND IN NO WRITE POLICY. A
-- parent must never mark their own child present — the entire value of an
-- attendance number is that somebody other than the interested party recorded
-- it. If it ever appears in a write policy, the feature is worthless.
--
-- ⚠️ `private.can_edit_team` DOES NOT CHECK `status`, so a PENDING coach,
-- manager or medic passes all four of these. Inherited, not introduced —
-- claude/state-of-play.md records it as latent (no path creates a pending
-- staff membership) and rules that it belongs in its own change with its own
-- harness. Fixing it here would silently change every other policy built on
-- the same helper.
--
-- Three write policies rather than one FOR ALL, following the shape the
-- availability merge settled on 9 Aug: FOR ALL on a table a coach can write is
-- how deletion gets granted alongside insertion without anybody deciding to.
--
-- Verified against live 2026-08-10; harness in db/tests/attendance.sql.
-- =====================================================================

CREATE POLICY "attendance read" ON public.attendance
  FOR SELECT USING (
    private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = attendance.event_id))
    OR private.is_own_player(player_id)
  );

CREATE POLICY "attendance write insert" ON public.attendance
  FOR INSERT WITH CHECK (
    private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = attendance.event_id))
  );

CREATE POLICY "attendance write update" ON public.attendance
  FOR UPDATE USING (
    private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = attendance.event_id))
  ) WITH CHECK (
    private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = attendance.event_id))
  );

CREATE POLICY "attendance write delete" ON public.attendance
  FOR DELETE USING (
    private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = attendance.event_id))
  );

-- ---------------------------------------------------------------------
-- pitches  (2 policies — 11 Aug 2026)
--
-- Read is open to anyone signed in: a parent sees "Pitch 2" on a fixture and
-- the name has to mean something. Pitch names are not sensitive.
--
-- ⚠️ WRITES ARE ADMIN-ONLY, NOT GATED ON THE `pitches` ADMIN RIGHT, and that
-- is deliberate. The admin rights added 10 Aug gate SCREENS, not data — every
-- admin already sees and edits everything, and a right decides which dashboard
-- appears. Enforcing admin_rights here would make it the first right that is a
-- real permission, which is a different decision with different consequences.
-- See claude/decisions/2026-08-10-role-dashboards.md.
-- ---------------------------------------------------------------------
CREATE POLICY "pitch read" ON public.pitches
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pitch manage" ON public.pitches
  FOR ALL USING (private.is_admin(club_id)) WITH CHECK (private.is_admin(club_id));

-- ---------------------------------------------------------------------
-- pitch_requests  (4 policies — 11 Aug 2026)
--
-- ⚠️ CREATE IS `can_edit_team`, DECIDE IS `is_admin`, AND THE DIFFERENCE IS
-- THE WHOLE FEATURE. A coach may ASK for a pitch for their own squad; only an
-- admin may ANSWER. Widening "decide" to can_edit_team would let a coach
-- allocate their own request, which is the thing a request exists to prevent.
--
-- ⚠️ READ INCLUDES `requested_by = auth.uid()` AS A REQUIREMENT, not a
-- convenience: Jay asked (11 Aug) for a request to be trackable from
-- submission to assignment BY THE PERSON WHO SUBMITTED IT. An admin-only read
-- would make the submitter's dashboard impossible.
--
-- ⚠️ WITHDRAWING IS A DELETE, NOT A STATUS WRITE, and deliberately so: the
-- UPDATE policy is admin-only, and widening it to the requester would also let
-- them write status='allocated'. Deleting their own UNDECIDED request is the
-- narrow power that cannot be abused — once decided, status <> 'submitted' and
-- the policy stops applying.
--
-- Harness: db/tests/rls-pitch-requests.sql.
-- ---------------------------------------------------------------------
CREATE POLICY "pitch request read" ON public.pitch_requests
  FOR SELECT USING (
    requested_by = auth.uid()
    OR private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = event_id))
  );
CREATE POLICY "pitch request create" ON public.pitch_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND private.can_edit_team((SELECT e.team_id FROM events e WHERE e.id = event_id))
  );
CREATE POLICY "pitch request decide" ON public.pitch_requests
  FOR UPDATE USING (private.is_admin((SELECT e.club_id FROM events e WHERE e.id = event_id)))
  WITH CHECK (private.is_admin((SELECT e.club_id FROM events e WHERE e.id = event_id)));
CREATE POLICY "pitch request withdraw" ON public.pitch_requests
  FOR DELETE USING (requested_by = auth.uid() AND status = 'submitted');

-- ---------------------------------------------------------------------
-- match_sheets / match_sheet_slots / match_sheet_cards (12 Aug 2026)
--
-- ONE CONDITION FOR READ AND WRITE, AND NO SEPARATE is_admin ARM.
-- private.can_edit_team ALREADY contains an admin arm, so a club admin reaches
-- every squad's sheet through it. The plan proposed `can_edit_team OR is_admin`
-- for reads; that arm would be redundant EXCEPT that private.is_admin does not
-- check membership STATUS - so adding it would let a PENDING admin read every
-- sheet in the club. can_edit_team was deliberately made status-aware on
-- 10 Aug 2026. Do not "restore" the is_admin arm to match the house style.
-- ---------------------------------------------------------------------
CREATE POLICY "match sheet manage" ON public.match_sheets
  FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND private.can_edit_team(e.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND private.can_edit_team(e.team_id)));
CREATE POLICY "match sheet slot manage" ON public.match_sheet_slots
  FOR ALL USING (private.can_edit_match_sheet(match_sheet_id))
  WITH CHECK (private.can_edit_match_sheet(match_sheet_id));
CREATE POLICY "match sheet card manage" ON public.match_sheet_cards
  FOR ALL USING (private.can_edit_match_sheet(match_sheet_id))
  WITH CHECK (private.can_edit_match_sheet(match_sheet_id));


-- ---------------------------------------------------------------------
-- public.social_ideas  (4 policies, captured 12 Aug 2026)
--
-- ⚠️ ROLE IS `public`, like every other policy on a `public` table here — the
-- two storage.objects blocks are the only ones TO authenticated. Captured, not
-- assumed.
--
-- ⚠️ READING IS `is_admin`, NOT the `media` right. Rights gate SCREENS, not
-- data (claude/decisions/2026-08-10-role-dashboards.md).
--
-- ⚠️ private.is_admin() tests role only, NOT status — unlike can_edit_team,
-- which was made status-aware on 10 Aug. Every admin-gated table already
-- relies on that; recorded here so it is a known property rather than a
-- surprise.
-- ---------------------------------------------------------------------
CREATE POLICY "social idea read" ON public.social_ideas
  FOR SELECT
  USING (((submitted_by = auth.uid()) OR private.is_admin(club_id)));

CREATE POLICY "social idea create" ON public.social_ideas
  FOR INSERT
  WITH CHECK (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
     FROM memberships m
    WHERE ((m.profile_id = auth.uid()) AND (m.club_id = social_ideas.club_id) AND (m.status = 'active'::text))))));

CREATE POLICY "social idea decide" ON public.social_ideas
  FOR UPDATE
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));

-- ⚠️ TWO DELETERS: the submitter while still `new` (withdrawing), and an admin
-- always (Jay, 12 Aug: "give the manager the ability to mark things and remove
-- them"). The admin arm is the only real control over an inappropriate photo.
CREATE POLICY "social idea remove" ON public.social_ideas
  FOR DELETE
  USING (((((submitted_by = auth.uid()) AND (status = 'new'::text))) OR private.is_admin(club_id)));


-- ---------------------------------------------------------------------
-- storage.objects — bucket `social-ideas`  (3 policies, captured 12 Aug 2026)
--
-- ⚠️ A SECOND BUCKET, NOT `player-photos`. Mixing submitted images into the
-- roster bucket would put publication-bound photos behind policies written for
-- recognising a child on a pitch.
--
-- ⚠️ CLUB-BLIND, via private.is_admin_anywhere(), because an object key
-- carries no club. Same documented single-club assumption as
-- can_admin_see_pending and is_admin_anywhere itself; all three are revisited
-- together if a second club ever appears.
-- ---------------------------------------------------------------------
CREATE POLICY "social idea image read" ON storage.objects
  FOR SELECT TO authenticated
  USING (((bucket_id = 'social-ideas'::text) AND ((private.social_idea_owner(name) = auth.uid()) OR private.is_admin_anywhere())));

-- ⚠️ RE-CAPTURED 13 Aug 2026 — THE MEMBERSHIP ARM IS NEW, AND ITS ABSENCE WAS
-- A REAL HOLE THAT WAS OPEN FROM 12 TO 13 Aug.
--
-- The old WITH CHECK was `bucket_id = 'social-ideas' AND
-- social_idea_owner(name) = auth.uid()` and nothing else. That proves only
-- that you are writing under a folder named after your own uid. **It never
-- asked whether you were in the club.**
--
-- ⚠️ THE SHAPE OF THE MISTAKE, WHICH IS THE TRANSFERABLE PART: the ROW policy
-- and the IMAGE policy are two halves of ONE feature, written in ONE
-- migration, and only one half was gated. "social idea create" above requires
-- an ACTIVE membership; this did not. So a signed-in stranger could not submit
-- an IDEA and could upload IMAGES — the half that consumes storage and holds
-- the content, and the half whose orphans appear on NO screen, including the
-- inbox that exists to review exactly this.
--
-- ⚠️ PROVED BY EXECUTION, NOT BY READING. On 13 Aug, inside a transaction on
-- production that rolled back: with the OLD policy an account with ZERO
-- memberships was ALLOWED to upload; with this one it is REFUSED, an active
-- member is still ALLOWED under their own prefix, and still REFUSED under
-- somebody else's. Re-run after the change against the live policy, all three
-- as intended. Harness: db/tests/rls-social-upload.sql.
--
-- ⚠️ STILL CLUB-BLIND, DELIBERATELY. An object key carries no club id, so this
-- asks "actively a member of SOMETHING" rather than "of THIS club" — the same
-- documented single-club assumption as private.is_admin_anywhere(). Revisited
-- with the others if a second club appears.
CREATE POLICY "social idea image write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'social-ideas'::text) AND (private.social_idea_owner(name) = auth.uid()) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.status = 'active'::text))))));

CREATE POLICY "social idea image remove" ON storage.objects
  FOR DELETE TO authenticated
  USING (((bucket_id = 'social-ideas'::text) AND ((private.social_idea_owner(name) = auth.uid()) OR private.is_admin_anywhere())));


-- ---------------------------------------------------------------------
-- public.photo_backup_runs — ONE policy, and it is read-only on purpose
-- (13 Aug 2026, 20260813_photo_backup.sql)
--
-- ⚠️ THERE IS NO INSERT, UPDATE OR DELETE POLICY AND THERE MUST NEVER BE ONE.
-- The backup-player-photos edge function writes these rows with the service
-- role, which bypasses RLS entirely, so the app needs no write path at all. A
-- run log an admin can edit is not a log — if this table can be rewritten from
-- the app it stops being evidence, and evidence is the only reason it exists.
--
-- ⚠️ CLUB-BLIND, via private.is_admin_anywhere(). A run is a fact about a
-- storage bucket, and a bucket carries no club — the same documented
-- single-club assumption as the three storage policies above.
--
-- ⚠️ AND service_role CAN STILL DELETE A ROW. Supabase default privileges gave
-- it all eight table privileges before the migration ran, and a GRANT cannot
-- take one away. See db/schema/grants.sql: this is a record for a human to
-- read, not a tamper-proof one.
-- ---------------------------------------------------------------------
CREATE POLICY "photo backup run read admin" ON public.photo_backup_runs
  FOR SELECT TO authenticated
  USING (private.is_admin_anywhere());


-- ---------------------------------------------------------------------
-- public.announcements / public.announcement_reads  (captured 14 Aug 2026)
-- Migration: db/migrations/20260814_announcements.sql
--
-- Captured from pg_policy via pg_get_expr, not pasted from the migration.
-- All six are PERMISSIVE.
--
-- !! THE READ POLICY USES can_see_team, WHICH REQUIRES status = 'active', AND
-- THAT IS A DELIBERATE DIVERGENCE FROM `event read`. That one uses the
-- status-blind is_attached_to_team because 20260808_membership_pending_status
-- ruled fixtures are not sensitive and a pending parent needs them. A notice is
-- not a fixture, and the second reason is the one specific to this feature:
-- THE AUDIENCE COUNT IS A FEATURE AND IT HAS TO MEAN SOMETHING. "18 of 24" must
-- not count accounts nobody has approved. public.announcement_audience is built
-- to agree with this policy line for line. Change one, change both.
--
-- !! "announcement edit" HAS A WITH CHECK THAT IS NOT ITS USING, ON PURPOSE.
-- USING decides which rows may be edited; WITH CHECK decides what they may
-- become. Without the second arm an author could edit a row into a shape they
-- could never have created.
--
-- !! RE-SCOPING IS BLOCKED BY THE COLUMN GRANT, NOT BY ANY POLICY HERE. See
-- grants.sql: team_id is absent from the UPDATE list. Reading these policies
-- alone would suggest an author can move a notice between squads.
-- ---------------------------------------------------------------------
CREATE POLICY "announcement read" ON public.announcements
  FOR SELECT USING (
CASE
    WHEN (team_id IS NULL) THEN (EXISTS ( SELECT 1
       FROM memberships m
      WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.club_id = announcements.club_id) AND (m.status = 'active'::text))))
    ELSE private.can_see_team(team_id)
END);

CREATE POLICY "announcement create" ON public.announcements
  FOR INSERT WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND
CASE
    WHEN (team_id IS NULL) THEN private.is_admin(club_id)
    ELSE private.can_edit_team(team_id)
END));

CREATE POLICY "announcement edit" ON public.announcements
  FOR UPDATE USING (((author_id = ( SELECT auth.uid() AS uid)) OR private.is_admin(club_id)))
  WITH CHECK (
CASE
    WHEN (team_id IS NULL) THEN private.is_admin(club_id)
    ELSE private.can_edit_team(team_id)
END);

CREATE POLICY "announcement remove" ON public.announcements
  FOR DELETE USING (((author_id = ( SELECT auth.uid() AS uid)) OR private.is_admin(club_id)));

-- !! SELECT AND INSERT ONLY. There is deliberately no UPDATE or DELETE policy,
-- so a read cannot be un-read or back-dated even by the person who owns it, and
-- read_at therefore means FIRST read. `authenticated` does hold table-level
-- DELETE here from Supabase's defaults (grants.sql records it) -- inert,
-- because RLS is on and no policy grants it.
CREATE POLICY "announcement read own reads" ON public.announcement_reads
  FOR SELECT USING ((profile_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "announcement mark read" ON public.announcement_reads
  FOR INSERT WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));


-- ---------------------------------------------------------------------
-- player_private  (3 policies)                          ADDED 2026-08-16
--
-- ⛔ THE TABLE EXISTS BECAUSE A COLUMN COULD NOT WORK. `player read` is
-- can_see_team(team_id) OR is_own_player(id), and can_see_team is SQUAD-WIDE —
-- so a `date_of_birth` column on public.players would be readable by EVERY
-- PARENT IN THE SQUAD. RLS grants ROWS, not COLUMNS, and a parent and a coach
-- are the same `authenticated` role, so no policy can hide one column of
-- players from a parent while showing them the rest of the row.
--
-- ⚠️ THE SCHEMA HAD ALREADY MET THIS AND SOLVED IT THE SAME WAY — see the table
-- comment on public.player_grades. This is that pattern, second use.
--
-- The pair below is deliberately the SAME PAIR player_parents runs: the people
-- who may see a child's parents' phone numbers are exactly the people who may
-- see that child's birthday. `is_own_player` is membership-based, so it covers
-- a parent AND a self-registered player reading their own row.
--
-- ⚠️ A PARENT MAY WRITE, NOT JUST READ. The family is the source of truth for a
-- birthday; staff-write-only would route every correction through a volunteer.
-- ⚠️ CONSEQUENCE, AND IT IS NOT YET HANDLED: src/lib/ageGroup.js's
-- allowsOwnContact decides whether a child may hold their own email and phone,
-- and it currently infers age from the SQUAD NAME. If it is ever re-pointed at
-- this column, a DOB must only be allowed to make that stricter, never to relax
-- it — otherwise a parent editing a birthday could unlock the under-13 gate.
--
-- WITH CHECK repeats each predicate deliberately: without it an owner could
-- UPDATE their row and set player_id to another child, moving a birthday onto
-- somebody else's record. Same trap "contact edit own" documents.
--
-- Proved on production 16 Aug 2026, rolled back, WITH A CONTROL:
--   control (no RLS)         2 rows exist
--   parent of child A        1   (own child only)
--   parent A reading B       0
--   parent updates own       1 row
--   parent updates team-mate 0 rows
--   coach of the squad       2
-- ---------------------------------------------------------------------
CREATE POLICY "player private read" ON public.player_private
  AS PERMISSIVE FOR SELECT TO public
  USING ((private.can_edit_team(( SELECT p.team_id
     FROM players p
    WHERE (p.id = player_private.player_id))) OR private.is_own_player(player_id)));

CREATE POLICY "player private edit own" ON public.player_private
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));

CREATE POLICY "player private edit" ON public.player_private
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT p.team_id
     FROM players p
    WHERE (p.id = player_private.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT p.team_id
     FROM players p
    WHERE (p.id = player_private.player_id))));


-- ---------------------------------------------------------------------
-- player_grades / player_positions / player_units  (1 policy each,
-- captured 25 Aug 2026 from pg_policies)
--
-- ⚠️ THE FIRST TWO WERE MISSING FROM THIS FILE FOR ELEVEN DAYS — both shipped
-- 14 Aug and were never captured, the same gap the feedback block below
-- records for 18-19 Aug. Found while capturing player_units, added today.
--
-- All three are the SAME SHAPE on purpose, since 25 Aug 2026: can_edit_team on
-- both arms, no wider read, so a parent cannot read their own child's grade,
-- positions OR unit. player_positions was born squad-readable ("read is wider
-- than write") and Jay reversed that ruling on 25 Aug — positions_staff_only
-- replaced its read/write pair with the single manage policy below and moved
-- the players.position / players.unit columns into these tables outright.
-- Fault-injected the same day, with real users: an actual parent read their 2
-- squad players and ZERO rows from all three tables; an admin read 68/2/17.

CREATE POLICY "player grade manage" ON public.player_grades
  FOR ALL
  USING (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_grades.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_grades.player_id))));

CREATE POLICY "player position manage" ON public.player_positions
  FOR ALL
  USING (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_positions.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_positions.player_id))));

CREATE POLICY "player unit manage" ON public.player_units
  FOR ALL
  USING (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_units.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT p.team_id FROM players p
    WHERE (p.id = player_units.player_id))));


-- ---------------------------------------------------------------------
-- public.feedback  (4 policies, captured 19 Aug 2026)
--
-- ⚠️ THIS TABLE WAS ADDED ON 18 Aug AND WAS MISSING FROM THIS FILE ENTIRELY
-- UNTIL 19 Aug. Captured now, in the same commit as the migration that added
-- its fourth policy — which is what README.md asks for and what did not happen
-- when the table was created. The gap is exactly the failure this directory
-- exists to catch: a whole table's access rules, invisible to a reconciliation.
--
-- ⚠️ ONE POLICY PER VERB, AND THE SELECT IS THE WIDE ONE. A member reads their
-- OWN report (that is what /my-reports and the `?` sheet show them); an admin
-- reads the club's. Everything that CHANGES a row is admin-only.
--
-- ⚠️ THE DELETE POLICY IS NEW (19 Aug 2026) AND DELIBERATELY NARROWER THAN
-- social_ideas' EQUIVALENT. `social idea remove` lets the submitter withdraw
-- their own while still `new`; this one does not let the reporter delete at
-- all. A withdrawn suggestion costs the club nothing; a withdrawn REPORT
-- removes the record of a problem that may still be real. Deleting here is for
-- rubbish — spam, a test, a duplicate — and a handled report belongs in `done`
-- or `wontfix`, which the admin screen now hides by default so that a tidy
-- list is never a reason to destroy anything.
-- db/migrations/20260819_feedback_delete.sql, db/tests/feedback-delete.sql.
--
-- ⚠️ THERE IS NO AUDIT ROW. Unlike `memberships`, this table has no companion
-- log, so a deleted report leaves nothing behind anywhere.
-- ---------------------------------------------------------------------
CREATE POLICY "feedback read" ON public.feedback
  FOR SELECT
  USING (((submitted_by = auth.uid()) OR private.is_admin(club_id)));

CREATE POLICY "feedback create" ON public.feedback
  FOR INSERT
  WITH CHECK (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
     FROM memberships m
    WHERE ((m.profile_id = auth.uid()) AND (m.club_id = feedback.club_id) AND (m.status = 'active'::text))))));

CREATE POLICY "feedback triage" ON public.feedback
  FOR UPDATE
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));

CREATE POLICY "feedback remove" ON public.feedback
  FOR DELETE
  USING (private.is_admin(club_id));


-- ---------------------------------------------------------------------
-- public.notification_opt_outs  (1 policy, captured 19 Aug 2026)
--
-- ⚠️ ONE POLICY FOR ALL FOUR VERBS, WHICH IS UNUSUAL IN THIS FILE AND CORRECT
-- HERE. The row carries no state beyond its own existence — it names a person
-- and a category and that is all — so "is this mine" is the whole rule for
-- reading it, creating it and removing it alike. Splitting it into four
-- identical policies would be four places to make the same mistake.
--
-- ⚠️ A ROW MEANS **OFF**. No row means ON. That is what makes "notification
-- categories default to on" true without a backfill, for everybody who exists
-- and everybody who joins. db/migrations/20260819_notice_push.sql.
--
-- ⚠️ NOT READABLE BY ADMINS, DELIBERATELY — unlike almost everything else in
-- this schema. Nobody needs to see anybody else's preferences, and an admin
-- who could see them would eventually be asked to change them.
--
-- ⚠️ NO UPDATE GRANT AT THE TABLE LEVEL either (see db/schema/grants.sql), so
-- the WITH CHECK arm only ever governs INSERT in practice. Recorded because
-- the policy reads as though UPDATE were possible.
-- ---------------------------------------------------------------------
CREATE POLICY "opt out is mine" ON public.notification_opt_outs
  FOR ALL
  USING ((profile_id = auth.uid()))
  WITH CHECK ((profile_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Training plans (21 Aug 2026)
--
-- Library objects (drills, templates, blocks, focus): any signed-in person
-- reads, an ACTIVE club admin manages — private.is_admin checks status.
-- Sessions follow the EVENT: read is is_attached_to_team (a parent may see
-- tonight's plan; it holds no children's data), write is can_edit_team, the
-- match-sheet pattern. Harness: db/tests/training-plans.sql.
-- ---------------------------------------------------------------------
-- ⚠️ MANAGE WIDENED 27 Aug 2026 (20260827_coach_training_plans.sql): a coach
-- manages their OWN squad's drills/templates (team_id not null AND
-- can_edit_team), the Director manages club ones and can null a team_id to
-- approve a suggestion. Reads stay open — a drill holds no personal data and a
-- squad-owned one appears inside a family-visible session plan.
create policy "drill read"   on public.drills for select using (auth.uid() is not null);
create policy "drill manage" on public.drills for all
  using (private.is_admin(club_id) or (team_id is not null and private.can_edit_team(team_id)))
  with check (private.is_admin(club_id) or (team_id is not null and private.can_edit_team(team_id)));

create policy "template read"   on public.session_templates for select using (auth.uid() is not null);
create policy "template manage" on public.session_templates for all
  using (private.is_admin(club_id) or (team_id is not null and private.can_edit_team(team_id)))
  with check (private.is_admin(club_id) or (team_id is not null and private.can_edit_team(team_id)));

create policy "template block read" on public.session_template_blocks for select using (auth.uid() is not null);
create policy "template block manage" on public.session_template_blocks for all
  using (exists (select 1 from public.session_templates t where t.id = template_id
    and (private.is_admin(t.club_id) or (t.team_id is not null and private.can_edit_team(t.team_id)))))
  with check (exists (select 1 from public.session_templates t where t.id = template_id
    and (private.is_admin(t.club_id) or (t.team_id is not null and private.can_edit_team(t.team_id)))));

create policy "focus read"   on public.training_focus for select using (auth.uid() is not null);
create policy "focus manage" on public.training_focus for all
  using (private.is_admin(club_id)) with check (private.is_admin(club_id));

-- ⚠️ VISIBILITY-AWARE 27 Aug 2026. read: squad→is_attached_to_team (a parent
-- sees tonight's plan — no children's data), staff→can_edit_team, draft→the
-- author. manage: can_edit_team, and a draft is the author's alone until they
-- promote it. ⚠️ The session's own columns are qualified `training_sessions.*`
-- — events carries its own created_by, and an unqualified reference bound to
-- the EVENT's creator, refusing every draft insert (measured 27 Aug 2026).
create policy "session read" on public.training_sessions for select
  using (exists (select 1 from public.events e where e.id = training_sessions.event_id and (
     (training_sessions.visibility = 'squad' and private.is_attached_to_team(e.team_id))
     or (training_sessions.visibility = 'staff' and private.can_edit_team(e.team_id))
     or (training_sessions.visibility = 'draft' and training_sessions.created_by = (select auth.uid())))));
create policy "session manage" on public.training_sessions for all
  using (exists (select 1 from public.events e where e.id = training_sessions.event_id
     and private.can_edit_team(e.team_id)
     and (training_sessions.visibility <> 'draft' or training_sessions.created_by = (select auth.uid()))))
  with check (exists (select 1 from public.events e where e.id = training_sessions.event_id
     and private.can_edit_team(e.team_id)
     and (training_sessions.visibility <> 'draft' or training_sessions.created_by = (select auth.uid()))));

create policy "session block read" on public.training_session_blocks for select
  using (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                 where s.id = session_id and (
                   (s.visibility = 'squad' and private.is_attached_to_team(e.team_id))
                   or (s.visibility = 'staff' and private.can_edit_team(e.team_id))
                   or (s.visibility = 'draft' and s.created_by = (select auth.uid())))));
create policy "session block manage" on public.training_session_blocks for all
  using (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                 where s.id = session_id and private.can_edit_team(e.team_id)
                   and (s.visibility <> 'draft' or s.created_by = (select auth.uid()))))
  with check (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                      where s.id = session_id and private.can_edit_team(e.team_id)
                        and (s.visibility <> 'draft' or s.created_by = (select auth.uid()))));

-- ── publish_training ──────────────────────────────────────────────────────
-- ONE function for preview and for real, switched by _preview, so the table
-- the Director confirms is computed by the code that then acts on it.
-- ⛔ DATE RANGE ON type = 'training'. No weekday anywhere.


-- ---------------------------------------------------------------------
-- public.messages / public.channel_settings / public.message_reads
--   (7 policies, captured 23 Aug 2026 from pg_policies in a rolled-back apply)
-- Migration: db/migrations/20260823_squad_chat.sql
--
-- ⚠️ "message create" CALLS private.can_reply_to() RATHER THAN SELECTING FROM
-- messages: a policy on messages that reads messages is "infinite recursion
-- detected in policy" — measured on the first harness run. The helper is
-- SECURITY DEFINER and re-applies the read rule itself.
--
-- ⚠️ NO DELETE POLICY ON messages, ON PURPOSE. Removal is an UPDATE setting
-- deleted_at; messages_touch blanks the body. The row survives.
--
-- ⚠️ "message edit"'s WITH CHECK pins only channel. What keeps an author from
-- re-scoping a post is that authenticated holds NO table-level UPDATE — only
-- column-level on (body, pinned, deleted_at), see grants.sql — and that
-- messages_touch freezes every other column regardless.
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260823_adult_dms_private: an admin reaches a DM only through
-- private.admin_may_review — a minor in it, or a reported message. Captured from live.
-- ⚠️ REPLACED by 20260824_chat_list (the Chats list; delete a message / a chat).
-- ⚠️ REPLACED by 20260830_role_channels: five role-channel arms, one helper.
CREATE POLICY "message read" ON public.messages
  FOR SELECT USING (
CASE channel
    WHEN 'squad'::text THEN
    CASE
        WHEN (team_id IS NULL) THEN (EXISTS ( SELECT 1
           FROM memberships m
          WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.club_id = messages.club_id) AND (m.status = 'active'::text))))
        ELSE private.can_see_team(team_id)
    END
    WHEN 'staff'::text THEN private.can_edit_team(team_id)
    WHEN 'dm'::text THEN ((private.in_conversation(conversation_id) AND (created_at > COALESCE(private.cleared_before(conversation_id), '-infinity'::timestamp with time zone))) OR private.admin_may_review(conversation_id))
    WHEN 'headcoaches'::text THEN private.in_role_channel(channel, club_id)
    WHEN 'managers'::text    THEN private.in_role_channel(channel, club_id)
    WHEN 'medics'::text      THEN private.in_role_channel(channel, club_id)
    WHEN 'welfare'::text     THEN private.in_role_channel(channel, club_id)
    WHEN 'clubstaff'::text   THEN private.in_role_channel(channel, club_id)
    ELSE false
END);
-- ⚠️ REPLACED by 20260823_squad_chat_phase3: three channels. 'staff' is the
-- squad's staff; 'dm' is a participant OR ANY CLUB ADMIN — Jay's 23 Aug
-- ruling, and the permanent notice in every DM says so.

CREATE POLICY "message create" ON public.messages
  FOR INSERT WITH CHECK (
CASE channel
    WHEN 'squad'::text THEN (((parent_id IS NOT NULL) AND private.can_reply_to(parent_id)) OR ((parent_id IS NULL) AND
    CASE
        WHEN (team_id IS NULL) THEN private.is_admin(( SELECT m.club_id
           FROM memberships m
          WHERE ((m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text))
          ORDER BY m.created_at
         LIMIT 1))
        ELSE (private.can_edit_team(team_id) OR ((NOT private.channel_announce_only(team_id)) AND private.can_see_team(team_id)) OR ((event_id IS NOT NULL) AND private.can_see_team(team_id)))
    END))
    WHEN 'staff'::text THEN private.can_edit_team(team_id)
    WHEN 'dm'::text THEN private.in_conversation(conversation_id)
    -- 20260830_role_channels: members post; replies via can_reply_to.
    ELSE (channel IN ('headcoaches','managers','medics','welfare','clubstaff')
          AND (((parent_id IS NOT NULL) AND private.can_reply_to(parent_id))
            OR ((parent_id IS NULL) AND private.in_role_channel(channel, club_id))))
END);
-- ⚠️ REPLACED by 20260823_squad_chat_phase3. The 'dm' arm only agrees with the
-- trigger, which has already refused a non-participant and any pair can_dm
-- forbids — re-checked on EVERY message, so a DM stops the day it is not allowed.

-- ⚠️ REPLACED by 20260823_adult_dms_private: an admin reaches a DM only through
-- private.admin_may_review — a minor in it, or a reported message. Captured from live.
-- ⚠️ REPLACED by 20260824_chat_list (the Chats list; delete a message / a chat).
-- The author may REMOVE at any time; the 15-minute limit on EDITING words moved into private.touch_message.
-- ⚠️ REPLACED by 20260830_role_channels: a role-channel moderator is an admin
-- WHO IS A MEMBER — a non-member admin cannot even read Welfare.
CREATE POLICY "message edit" ON public.messages
  FOR UPDATE USING (((author_id = ( SELECT auth.uid() AS uid)) OR ((channel = ANY (ARRAY['squad'::text, 'staff'::text])) AND (team_id IS NOT NULL) AND private.can_edit_team(team_id)) OR ((channel = 'squad'::text) AND (team_id IS NULL) AND private.is_admin(club_id)) OR ((channel = 'dm'::text) AND private.admin_may_review(conversation_id)) OR ((channel IN ('headcoaches','managers','medics','welfare','clubstaff')) AND private.in_role_channel(channel, club_id) AND private.is_admin(club_id))))
  WITH CHECK ((channel = ANY (ARRAY['squad'::text, 'staff'::text, 'dm'::text, 'headcoaches'::text, 'managers'::text, 'medics'::text, 'welfare'::text, 'clubstaff'::text])));
-- ⚠️ REPLACED by 20260823_squad_chat_phase3. An admin may UPDATE a DM row — to
-- REMOVE it (deleted_at; the trigger blanks the body). touch_message refuses a
-- body change from anybody but the author, so this grants removal, not editing.

CREATE POLICY "channel settings read" ON public.channel_settings
  FOR SELECT USING (private.can_see_team(team_id));

CREATE POLICY "channel settings write" ON public.channel_settings
  FOR ALL USING (private.can_edit_team(team_id))
  WITH CHECK ((private.can_edit_team(team_id) AND (updated_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "message read own reads" ON public.message_reads
  FOR SELECT USING ((profile_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "message mark read" ON public.message_reads
  FOR INSERT WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM messages m
  WHERE (m.id = message_reads.message_id)))));


-- ---------------------------------------------------------------------
-- public.conversations / public.dm_blocks / public.message_reports /
-- public.welfare_access_log  (captured 23 Aug 2026 — squad chat phase 3)
-- Migration: db/migrations/20260823_squad_chat_phase3.sql
--
-- ⚠️ NO INSERT POLICY ON conversations. The only way in is
-- public.open_conversation(), SECURITY DEFINER, which applies private.can_dm.
-- ⚠️ NO INSERT POLICY ON welfare_access_log either: public.log_welfare_access().
-- ---------------------------------------------------------------------
-- DELETE FOR GOOD (24 Aug 2026 — db/migrations/20260824_delete_for_good.sql)
-- Hard deletes. The author any time; staff in their channels; admins in the club
-- channel and in a DM they may review. ⚠️ A REPORTED message (or a post with a
-- reported reply, or a DM with any reported message) only by an admin — a
-- report is evidence until resolved. Either participant may delete a DM: gone
-- for BOTH. Channels are cleared through public.clear_channel(), not deleted.
-- ---------------------------------------------------------------------
CREATE POLICY "message delete" ON public.messages
  FOR DELETE USING (
CASE
    WHEN private.message_reported(id) THEN
    CASE channel
        WHEN 'dm'::text THEN private.admin_may_review(conversation_id)
        ELSE private.is_admin(club_id)
    END
    ELSE ((author_id = ( SELECT auth.uid() AS uid)) OR ((channel = ANY (ARRAY['squad'::text, 'staff'::text])) AND (team_id IS NOT NULL) AND private.can_edit_team(team_id)) OR ((channel = 'squad'::text) AND (team_id IS NULL) AND private.is_admin(club_id)) OR ((channel = 'dm'::text) AND private.admin_may_review(conversation_id)) OR ((channel IN ('headcoaches','managers','medics','welfare','clubstaff')) AND private.in_role_channel(channel, club_id) AND private.is_admin(club_id)))
END);

-- Re-captured 25 Aug 2026 (group-chat rewrite): membership is
-- private.in_conversation (covers groups), and deleting a group takes its
-- owner, not just any member.
CREATE POLICY "conversation delete" ON public.conversations
  FOR DELETE USING (
CASE
    WHEN private.conversation_reported(id) THEN private.admin_may_review(id)
    ELSE ((private.in_conversation(id) AND ((kind = 'dm'::text) OR private.is_group_owner(id))) OR private.admin_may_review(id))
END);

-- ---------------------------------------------------------------------
-- public.conversation_clears   (24 Aug 2026 — db/migrations/20260824_chat_list.sql)
-- ⚠️ SELECT ONLY. The only way in is public.clear_conversation(), SECURITY DEFINER,
-- which checks private.in_conversation. A clear hides the past from ONE person.
-- ---------------------------------------------------------------------
CREATE POLICY "clear own" ON public.conversation_clears
  FOR SELECT USING ((profile_id = ( SELECT auth.uid() AS uid)));

-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260823_adult_dms_private: an admin reaches a DM only through
-- private.admin_may_review — a minor in it, or a reported message. Captured from live.
-- Re-captured 25 Aug 2026 (group-chat rewrite): the a/b pair test became
-- private.in_conversation, which also answers for groups.
CREATE POLICY "conversation read" ON public.conversations
  FOR SELECT USING ((private.in_conversation(id) OR private.admin_may_review(id)));

CREATE POLICY "dm block own" ON public.dm_blocks
  FOR ALL USING ((blocker_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));

-- reporter_id and club_id are stamped by message_reports_provenance; the
-- check is visibility of the message (RLS on messages decides that).
CREATE POLICY "report create" ON public.message_reports
  FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM messages m
  WHERE (m.id = message_reports.message_id))));
-- Split by context since 30 Aug 2026 (20260830_welfare_review_gate): a report
-- on a CONVERSATION message (DM/group) is welfare-only; a report on a CHANNEL
-- message stays any-admin; the reporter always reads their own. Mirrors the
-- reported-message arm of "message delete" (20260830_role_channels).
CREATE POLICY "report read" ON public.message_reports
  FOR SELECT USING (((reporter_id = ( SELECT auth.uid() AS uid)) OR
    CASE WHEN private.report_on_conversation(message_id)
         THEN private.can_review_dm(club_id)
         ELSE private.is_admin(club_id) END));
CREATE POLICY "report resolve" ON public.message_reports
  FOR UPDATE USING (CASE WHEN private.report_on_conversation(message_id)
                         THEN private.can_review_dm(club_id)
                         ELSE private.is_admin(club_id) END)
  WITH CHECK (CASE WHEN private.report_on_conversation(message_id)
                   THEN private.can_review_dm(club_id)
                   ELSE private.is_admin(club_id) END);

CREATE POLICY "welfare log read" ON public.welfare_access_log
  FOR SELECT USING (private.is_admin(club_id));


-- =====================================================================
-- RE-CAPTURED 2026-08-25 — TWENTY-FIVE POLICIES THIS FILE WAS MISSING
--
-- 22 public + 3 storage, measured against pg_policies on 25 Aug 2026. The
-- oldest (lineups / lineup_players) went uncaptured for ELEVEN DAYS; the
-- chat-media storage bucket was an ENTIRE BUCKET with no line in this file.
-- Expressions verbatim from pg_policies. Reasoning lives in each policy's
-- migration under db/migrations/; not restated here.
--
-- Also noted on 25 Aug, cosmetic and NOT corrected file-wide: live renders
-- many older expressions as `( SELECT auth.uid() AS uid)` where this file
-- shows bare `auth.uid()` — the initplan-caching rewrite; semantics
-- identical. Compare expressions, not spellings, when reconciling.
-- =====================================================================

-- lineups / lineup_players (14 Aug 2026 — the file's announcements section mentions the
-- migration; the policies were never captured)
CREATE POLICY "lineup manage" ON public.lineups
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT e.team_id FROM events e WHERE (e.id = lineups.event_id))))
  WITH CHECK (private.can_edit_team(( SELECT e.team_id FROM events e WHERE (e.id = lineups.event_id))));

CREATE POLICY "lineup player manage" ON public.lineup_players
  AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1 FROM (lineups l JOIN events e ON ((e.id = l.event_id)))
    WHERE ((l.id = lineup_players.lineup_id) AND private.can_edit_team(e.team_id)))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM (lineups l JOIN events e ON ((e.id = l.event_id)))
    WHERE ((l.id = lineup_players.lineup_id) AND private.can_edit_team(e.team_id)))));

-- push_subscriptions
CREATE POLICY "push subscription own" ON public.push_subscriptions
  AS PERMISSIVE FOR ALL TO public
  USING ((profile_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));

-- membership_audit
CREATE POLICY "membership audit read" ON public.membership_audit
  AS PERMISSIVE FOR SELECT TO public
  USING (private.is_super_admin());

-- membership_vouches
CREATE POLICY "vouch read" ON public.membership_vouches
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_approve_team(team_id));

CREATE POLICY "vouch write own" ON public.membership_vouches
  AS PERMISSIVE FOR ALL TO public
  USING (((voucher_id = ( SELECT auth.uid() AS uid)) AND private.can_approve_team(team_id)))
  WITH CHECK (((voucher_id = ( SELECT auth.uid() AS uid)) AND private.can_approve_team(team_id)));

-- conversation_members
CREATE POLICY "member read" ON public.conversation_members
  AS PERMISSIVE FOR SELECT TO public
  USING (private.in_conversation(conversation_id));

-- conversations (group rename — owner-only, column grant on title does the narrowing)
CREATE POLICY "group rename" ON public.conversations
  AS PERMISSIVE FOR UPDATE TO public
  USING (((kind = 'group'::text) AND private.is_group_owner(id)))
  WITH CHECK ((kind = 'group'::text));

-- chat_prefs (4 owner-only policies)
CREATE POLICY "chat pref read own" ON public.chat_prefs
  AS PERMISSIVE FOR SELECT TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "chat pref write own" ON public.chat_prefs
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "chat pref edit own" ON public.chat_prefs
  AS PERMISSIVE FOR UPDATE TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "chat pref remove own" ON public.chat_prefs
  AS PERMISSIVE FOR DELETE TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

-- message_reactions (3)
CREATE POLICY "reaction read" ON public.message_reactions
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM messages x WHERE (x.id = message_reactions.message_id))));
CREATE POLICY "reaction create" ON public.message_reactions
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
    FROM messages x WHERE ((x.id = message_reactions.message_id) AND (x.deleted_at IS NULL))))));
CREATE POLICY "reaction delete" ON public.message_reactions
  AS PERMISSIVE FOR DELETE TO public
  USING ((profile_id = ( SELECT auth.uid() AS uid)));

-- message_stars (3)
CREATE POLICY "star read own" ON public.message_stars
  AS PERMISSIVE FOR SELECT TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "star create own" ON public.message_stars
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
    FROM messages x WHERE ((x.id = message_stars.message_id) AND (x.deleted_at IS NULL))))));
CREATE POLICY "star remove own" ON public.message_stars
  AS PERMISSIVE FOR DELETE TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

-- nicknames (4)
CREATE POLICY "nickname read own" ON public.nicknames
  AS PERMISSIVE FOR SELECT TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "nickname write own" ON public.nicknames
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "nickname edit own" ON public.nicknames
  AS PERMISSIVE FOR UPDATE TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "nickname remove own" ON public.nicknames
  AS PERMISSIVE FOR DELETE TO public
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

-- storage.objects — bucket `chat-media` (3, an entire uncaptured bucket)
CREATE POLICY "chat media read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'chat-media'::text) AND ((private.chat_media_owner(name) = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
    FROM messages x WHERE ((x.attachment_path = objects.name) AND (x.deleted_at IS NULL)))))));
CREATE POLICY "chat media write" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'chat-media'::text) AND (private.chat_media_owner(name) = ( SELECT auth.uid() AS uid))));
CREATE POLICY "chat media remove" ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'chat-media'::text) AND (private.chat_media_owner(name) = ( SELECT auth.uid() AS uid))));


-- ---------------------------------------------------------------------
-- storage.objects — bucket `training-diagrams` (2, 27 Aug 2026)
--
-- Schematic pitch drawings (cones, letters, arrows). ⚠️ A SEPARATE PUBLIC
-- BUCKET FROM player-photos AND staff-photos: those hold faces. Public is
-- OK because there are no children in these files. READ is open so an
-- <img src> works. WRITE matches drill manage (admin of the club, or squad
-- staff of a squad-owned drill). Key shape `<drill_id>/<file>` — first
-- path segment is the drill. Malformed keys fail closed.
-- NOT LIVE until 20260827_drill_diagram_url.sql is applied.
-- ---------------------------------------------------------------------
CREATE POLICY "training diagram read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'training-diagrams'::text));

CREATE POLICY "training diagram write" ON storage.objects
  AS PERMISSIVE FOR ALL TO public
  USING (((bucket_id = 'training-diagrams'::text) AND private.can_write_training_diagram(name)))
  WITH CHECK (((bucket_id = 'training-diagrams'::text) AND private.can_write_training_diagram(name)));


-- ---------------------------------------------------------------------
-- message_deliveries (2), and the author arm on message_reads
-- (26 Aug 2026 — 20260826_chat_delivery_receipts)
--
-- The AUTHOR of a message may read its receipt rows on BOTH tables — that
-- is the whole ticks feature; everybody else still sees only their own.
-- "message reads for author" is a SECOND policy beside "message read own
-- reads": policies OR together, so the own-rows behaviour is untouched.
-- ---------------------------------------------------------------------
CREATE POLICY "delivery record own" ON public.message_deliveries
  FOR INSERT
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM messages m
  WHERE (m.id = message_deliveries.message_id)))));

CREATE POLICY "delivery read own or author" ON public.message_deliveries
  FOR SELECT
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.id = message_deliveries.message_id) AND (m.author_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "message reads for author" ON public.message_reads
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.id = message_reads.message_id) AND (m.author_id = ( SELECT auth.uid() AS uid))))));
