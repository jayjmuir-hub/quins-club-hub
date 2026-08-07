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
-- RE-CAPTURED 2026-08-07. Live count is 31 public policies + the 2 on
-- storage.objects. The only delta since 4 Aug is the removal of "contact read"
-- and "parent read" (commit c70be86) — every other policy's USING / WITH CHECK
-- expression was compared against the live catalogue and is unchanged.
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
-- availability  (4 policies)
-- ---------------------------------------------------------------------
CREATE POLICY "avail read" ON public.availability
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_see_team(( SELECT events.team_id
   FROM events
  WHERE (events.id = availability.event_id))));

CREATE POLICY "avail own insert" ON public.availability
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (private.is_own_player(player_id));

CREATE POLICY "avail own update" ON public.availability
  AS PERMISSIVE FOR UPDATE TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));

CREATE POLICY "avail coach manage" ON public.availability
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT events.team_id
   FROM events
  WHERE (events.id = availability.event_id))))
  WITH CHECK (private.can_edit_team(( SELECT events.team_id
   FROM events
  WHERE (events.id = availability.event_id))));


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
-- ---------------------------------------------------------------------
CREATE POLICY "event read" ON public.events
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_see_team(team_id));

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
-- memberships  (2 policies)
-- ---------------------------------------------------------------------
CREATE POLICY "memb read" ON public.memberships
  AS PERMISSIVE FOR SELECT TO public
  USING (((profile_id = auth.uid()) OR private.is_admin(club_id)));

CREATE POLICY "memb manage" ON public.memberships
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin(club_id))
  WITH CHECK (private.is_admin(club_id));


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
CREATE POLICY "player read" ON public.players
  AS PERMISSIVE FOR SELECT TO public
  USING (private.can_see_team(team_id));

CREATE POLICY "player edit" ON public.players
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(team_id))
  WITH CHECK (private.can_edit_team(team_id));


-- ---------------------------------------------------------------------
-- profiles  (6 policies)
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
-- ---------------------------------------------------------------------
CREATE POLICY "team read" ON public.teams
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.profile_id = auth.uid()) AND (m.club_id = teams.club_id)))));

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
-- Consequence worth keeping in view: every SELECT policy above bottoms
-- out in a memberships row for auth.uid(). A signed-in user with zero
-- memberships reads ZERO rows from every table, including teams — no
-- error, just empty. That is correct for an invite-only club app.
-- ---------------------------------------------------------------------
