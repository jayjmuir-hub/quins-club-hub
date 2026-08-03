-- =====================================================================
-- db/schema/policies.sql
-- CAPTURE of every row-level-security policy on the `public` schema of
-- Supabase project lusmshimxdcxpnrktlgz (quins-club-hub), 2026-08-03.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md.
--
-- Source: pg_policies, pg_class.relrowsecurity.
--
-- Every policy is PERMISSIVE and applies to role {public} (i.e. no
-- explicit TO clause was given; scoping is done entirely inside the
-- expressions via auth.uid() / auth.jwt()). Every helper referenced lives
-- in the `private` schema — see functions.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- RLS enabled state — all ten public tables
-- (relrowsecurity = true, relforcerowsecurity = false on every one)
-- ---------------------------------------------------------------------
ALTER TABLE public.availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams           ENABLE ROW LEVEL SECURITY;


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
CREATE POLICY "contact read" ON public.player_contacts
  AS PERMISSIVE FOR SELECT TO public
  USING ((private.can_edit_team(( SELECT players.team_id
   FROM players
  WHERE (players.id = player_contacts.player_id))) OR private.is_own_player(player_id)));

CREATE POLICY "contact edit" ON public.player_contacts
  AS PERMISSIVE FOR ALL TO public
  USING (private.can_edit_team(( SELECT players.team_id
   FROM players
  WHERE (players.id = player_contacts.player_id))))
  WITH CHECK (private.can_edit_team(( SELECT players.team_id
   FROM players
  WHERE (players.id = player_contacts.player_id))));


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
-- Consequence worth keeping in view: every SELECT policy above bottoms
-- out in a memberships row for auth.uid(). A signed-in user with zero
-- memberships reads ZERO rows from every table, including teams — no
-- error, just empty. That is correct for an invite-only club app.
-- ---------------------------------------------------------------------
