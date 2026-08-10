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
-- Every policy is PERMISSIVE and applies to role {public} (i.e. no
-- explicit TO clause was given; scoping is done entirely inside the
-- expressions via auth.uid() / auth.jwt()). Every helper referenced lives
-- in the `private` schema — see functions.sql.
--
-- EXCEPTION: the two `storage.objects` policies at the end are TO
-- authenticated, not {public}. That is deliberate — on a storage bucket
-- the anon role is a real caller, not a theoretical one.
-- =====================================================================


-- ---------------------------------------------------------------------
-- RLS enabled state — all thirteen public tables
-- (relrowsecurity = true, relforcerowsecurity = false on every one)
--
-- Re-verified 2026-08-09: still thirteen tables, still RLS-enabled on every
-- one, still no FORCE anywhere. No table was added or dropped by the 8-9 Aug
-- migrations. Policy counts per table as at 9 Aug: access_requests 3,
-- availability 4, calendar_tokens 1, clubs 1, events 2, invite_targets 2,
-- invites 2, memberships 3, player_contacts 2, player_parents 2, players 2,
-- profiles 7, teams 2.
-- ---------------------------------------------------------------------
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships     ENABLE ROW LEVEL SECURITY;
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
-- ⚠️ `private.can_edit_team` is deliberately NOT status-gated. The migration
-- gives the reason: staff roles are granted by an admin and never
-- self-registered, so a pending coach cannot arise, and adding the check
-- would imply a state that has no way of existing.
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

CREATE POLICY "access request insert own" ON public.access_requests
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((profile_id = auth.uid()) AND (status = 'pending'::text)));

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
-- memberships  (3 policies — was 2 until 9 Aug 2026)
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
