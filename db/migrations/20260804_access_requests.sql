-- ---------------------------------------------------------------------
-- Access requests — gate public signup behind admin approval
--                                              (4 Aug 2026, Jay's brief)
--
-- THE PROBLEM THIS SOLVES, precisely:
-- signup is open and CANNOT simply be closed. Invites are accepted at
-- /accept-invite/:token, which sits behind RequireAuth — the invitee must
-- already have a session to accept. Turning off Supabase's "allow new users
-- to sign up" would therefore kill the invite flow for every new member, not
-- just for strangers. Closing signup at the auth layer needs admin-side user
-- creation through a service-role Edge Function; that is a separate build.
--
-- So the gate is approval, not exclusion. A signed-in account with no
-- membership already reads ZERO rows from every table (every SELECT policy
-- bottoms out in a memberships row for auth.uid()) — that containment is
-- unchanged and is still what actually protects club data. What was missing
-- was the admin's side: the "Waiting for access" list is derived by
-- SUBTRACTION (every profile the admin can read, minus everyone who already
-- has a membership), so every stranger who ever signed in sits in it forever,
-- indistinguishable from a real member mid-invite, with no way to clear them.
--
-- This table is the admin's triage state for membership-less profiles, and
-- doubles as the requester's own "I'm asking for access" record.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. private.is_admin_anywhere()
--
-- A requester holds NO membership, so they have no club — they cannot read
-- clubs or teams, and therefore cannot put a club_id on their own request.
-- That means the admin-side policies cannot be club-scoped the way
-- private.is_admin(club_id) is everywhere else.
--
-- Deliberately follows the precedent already set by
-- private.can_admin_see_pending(): "an admin, anywhere, may see people who
-- belong nowhere". Correct today because this database has exactly ONE club
-- (the same single-club assumption as clubId being derived opportunistically
-- in InviteForm/PlayerImport/Accounts). If a second club is ever added, this
-- and can_admin_see_pending both need revisiting together — a request would
-- have to carry the club it is aimed at, which means the requester needs some
-- club-independent way to say so.
--
-- SECURITY DEFINER: under the caller's own RLS an admin only sees memberships
-- in their own club, which is fine here, but the definer form matches every
-- other helper in this schema and keeps the policy predicates uniform.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_admin_anywhere()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.role = 'admin'
  );
$function$;

GRANT EXECUTE ON FUNCTION private.is_admin_anywhere() TO authenticated;


-- ---------------------------------------------------------------------
-- 2. access_requests
--
-- ONE row per profile (profile_id is UNIQUE). That uniqueness is not
-- housekeeping, it is the anti-spam mechanism: a person who has been
-- dismissed cannot insert a second request, because there is no update path
-- for them either (see the policies below). Their row stays 'dismissed'
-- until an admin deletes it, which is what "restore" does in the UI.
--
-- `note` is free text and is the only thing the requester can tell the club.
-- It cannot be a squad picker: a membership-less user reads zero rows from
-- `teams`, so there is nothing to populate a dropdown with. The admin picks
-- the squad when granting, in the existing AccessBuilder.
--
-- There is deliberately NO 'granted' status. Granted access is the existence
-- of a memberships row, and the screen already subtracts members out of the
-- waiting list. A second source of truth for the same fact would only give
-- the two a way to disagree.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_requests (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL,
  note         text,
  status       text        NOT NULL DEFAULT 'pending',
  created_at   timestamptz          DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid,
  CONSTRAINT access_requests_pkey            PRIMARY KEY (id),
  CONSTRAINT access_requests_profile_id_key  UNIQUE (profile_id),
  CONSTRAINT access_requests_profile_id_fkey FOREIGN KEY (profile_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting the admin who dismissed a request must
  -- not delete the dismissal and quietly resurrect the request.
  CONSTRAINT access_requests_decided_by_fkey FOREIGN KEY (decided_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT access_requests_status_check    CHECK (status IN ('pending', 'dismissed'))
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;


-- Admins: full control. FOR ALL rather than separate select/insert/update
-- policies because all four verbs are genuinely used —
--   SELECT  the queue,
--   INSERT  a dismissal for someone who never asked (the stranger case),
--   UPDATE  an existing request to 'dismissed',
--   DELETE  to restore/un-dismiss someone dismissed by mistake.
DROP POLICY IF EXISTS "access request admin" ON public.access_requests;
CREATE POLICY "access request admin" ON public.access_requests
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_admin_anywhere())
  WITH CHECK (private.is_admin_anywhere());

-- The requester may read their own row, so the app can tell them whether
-- they are waiting or were turned down.
DROP POLICY IF EXISTS "access request read own" ON public.access_requests;
CREATE POLICY "access request read own" ON public.access_requests
  AS PERMISSIVE FOR SELECT TO public
  USING (profile_id = auth.uid());

-- The requester may create their OWN request, and only as 'pending'.
--
-- The status check in WITH CHECK is load-bearing, not defensive tidiness:
-- without it a requester could insert their own row as 'dismissed'... which
-- sounds harmless until you notice the reverse is the real risk — any status
-- value they control is a value they can choose. Pinning it to 'pending' here
-- means the only writes that ever set 'dismissed' are admin writes.
--
-- Note what is ABSENT: no UPDATE and no DELETE policy for the requester.
-- Combined with the UNIQUE constraint on profile_id, a dismissed person
-- cannot flip their own row back to 'pending', cannot delete it and try
-- again, and cannot insert a second one. Re-opening the door is an admin
-- action, by design.
DROP POLICY IF EXISTS "access request insert own" ON public.access_requests;
CREATE POLICY "access request insert own" ON public.access_requests
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (profile_id = auth.uid() AND status = 'pending');
