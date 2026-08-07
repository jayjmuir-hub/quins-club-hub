-- =====================================================================
-- db/schema/functions.sql
-- CAPTURE of every function in the `public` and `private` schemas of
-- Supabase project lusmshimxdcxpnrktlgz (quins-club-hub), 2026-08-03.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md.
--
-- Source: pg_proc + pg_get_functiondef(oid) + proacl, verbatim. Bodies
-- below are exactly what the database returns — not reformatted.
--
-- Schema-level USAGE (pg_namespace.nspacl), which gates whether an
-- EXECUTE grant is reachable at all:
--   private: {postgres=UC/postgres, authenticated=U/postgres}
--   public : {pg_database_owner=UC/pg_database_owner, =U/pg_database_owner,
--             postgres=U/pg_database_owner, anon=U/pg_database_owner,
--             authenticated=U/pg_database_owner, service_role=U/pg_database_owner}
--
-- NOTE (recorded, not fixed): `anon` holds EXECUTE on four private
-- helpers (is_admin, can_see_team, can_edit_team, is_own_player) but has
-- NO USAGE on the `private` schema, so it cannot actually call them
-- directly. Those grants were restored deliberately by the migration
-- `restore_anon_execute_on_rls_helpers` to match pre-migration behaviour;
-- they are inert for direct calls and irrelevant to RLS evaluation
-- (policies run the function as the policy owner). Leaving as-is.
-- =====================================================================


-- #####################################################################
-- ##                                                                 ##
-- ##   public.accept_invite(uuid) — SECURITY-CRITICAL                ##
-- ##                                                                 ##
-- ##   THIS FUNCTION IS `SECURITY DEFINER` AND IT WRITES ACCESS.     ##
-- ##   It is the ONLY path that turns an invite token into a         ##
-- ##   memberships row, and memberships are what every RLS policy    ##
-- ##   in this database bottoms out in. A weakened guard here is a   ##
-- ##   privilege-escalation hole, not a bug.                         ##
-- ##                                                                 ##
-- ##   The five guards, in order, MUST NEVER BE WEAKENED OR          ##
-- ##   REORDERED AWAY:                                               ##
-- ##     1. SIGNED IN — caller_email resolved from auth.users via    ##
-- ##        auth.uid(); null means not signed in, hard raise.        ##
-- ##     2. TOKEN EXISTS, ROW-LOCKED — `select ... for update`       ##
-- ##        against a concurrent double-accept. The FOR UPDATE is    ##
-- ##        load-bearing; a plain SELECT lets two calls both pass    ##
-- ##        the accepted_at check.                                   ##
-- ##     3. NOT ALREADY ACCEPTED — accepted_at must be null.         ##
-- ##     4. CALLER EMAIL MATCHES — lower(inv.email) must equal       ##
-- ##        lower(caller_email), taken from auth.users, NOT from any ##
-- ##        client-supplied argument.                                ##
-- ##     5. INCOMPLETE-INVITE CHECK — a non-admin invite with no     ##
-- ##        invite_targets rows AND no team_id is rejected. This     ##
-- ##        replaces the dropped table CHECK constraint              ##
-- ##        `invites_team_required_unless_admin`; it is the only     ##
-- ##        thing now stopping a club-wide-scoped membership being   ##
-- ##        minted from a malformed invite.                          ##
-- ##                                                                 ##
-- ##   EXECUTE grants are authenticated + service_role + postgres    ##
-- ##   ONLY. `anon` must never be granted EXECUTE. Supabase's        ##
-- ##   default privileges auto-grant EXECUTE on new public-schema    ##
-- ##   functions to anon AND authenticated, so ANY migration that    ##
-- ##   recreates this function must be followed by an explicit       ##
-- ##   REVOKE EXECUTE ... FROM anon and re-verified.                 ##
-- ##                                                                 ##
-- ##   HISTORY — READ BEFORE TOUCHING: on 2026-08-03 an older        ##
-- ##   migration named `accept_invite_multi_target` was re-applied   ##
-- ##   repeatedly and silently reverted guard 5 each time. That is   ##
-- ##   why this file exists. See db/schema/README.md.                ##
-- ##                                                                 ##
-- #####################################################################
--
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public

CREATE OR REPLACE FUNCTION public.accept_invite(_token uuid)
 RETURNS SETOF memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.invites%rowtype;
  caller_email text;
  target_count int;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'You must be signed in to accept an invite.';
  end if;

  select * into inv from public.invites where token = _token for update;
  if not found then
    raise exception 'This invite link is not valid.';
  end if;

  if inv.accepted_at is not null then
    raise exception 'This invite has already been used.';
  end if;

  if lower(inv.email) <> lower(caller_email) then
    raise exception 'This invite was sent to a different email address than the one you signed in with.';
  end if;

  select count(*) into target_count
  from public.invite_targets t where t.invite_id = inv.id;

  -- Replaces the dropped invites_team_required_unless_admin CHECK.
  if inv.role <> 'admin' and target_count = 0 and inv.team_id is null then
    raise exception 'This invite is incomplete — it has no age group. Ask an admin to send a new one.';
  end if;

  update public.invites set accepted_at = now() where id = inv.id;

  if target_count > 0 then
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id)
    select distinct auth.uid(), inv.club_id, t.team_id, inv.role, t.player_id
    from public.invite_targets t
    where t.invite_id = inv.id
    returning *;
  else
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id)
    values (auth.uid(), inv.club_id, inv.team_id, inv.role, inv.player_id)
    returning *;
  end if;
end;
$function$
;

-- Grants as captured:
REVOKE ALL ON FUNCTION public.accept_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO service_role;
-- (postgres holds EXECUTE as owner. `anon` deliberately does NOT.)


-- =====================================================================
-- private.* — RLS helper functions
--
-- All are SECURITY DEFINER with SET search_path = 'public'. The read-only
-- boolean helpers are STABLE; the two trigger functions are VOLATILE.
-- They live in `private` rather than `public` so PostgREST cannot expose
-- them as RPC endpoints (Task 21).
-- =====================================================================


-- ---------------------------------------------------------------------
-- public.calendar_events_for_token(_token uuid)
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}
--
-- Granted to ANON on purpose: the caller is a calendar client with no session
-- and no JWT, reached through the `calendar` Edge Function which holds only
-- the anon key. Every authorisation decision therefore lives here.
--
-- The visibility rule is a line-by-line MIRROR of private.can_see_team, with
-- the profile resolved from the token instead of auth.uid(). IF can_see_team
-- CHANGES, THIS MUST CHANGE WITH IT — that duplication is the price of a
-- caller with no JWT.
--
-- An unknown or revoked token returns zero rows rather than raising: an error
-- distinguishing "no such token" from "token with no fixtures" is an oracle
-- for guessing tokens.
--
-- ⚠️ CHANGED 2026-08-05 (calendar_feed_returns_pitch): `pitch` added to both
-- the RETURNS TABLE signature and the select list, so a subscribed calendar
-- shows which pitch. Nothing else about the visibility rule changed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calendar_events_for_token(_token uuid)
 RETURNS TABLE(id uuid, type text, title text, opponent text, home boolean, venue text, pitch text, competition text, starts_at timestamp with time zone, team_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, t.name as team_name
  from public.events e
  join public.teams t on t.id = e.team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and (
        (m.role = 'admin' and m.club_id = t.club_id)
        or m.team_id = e.team_id
      )
  )
  and e.starts_at > now() - interval '6 months'
  order by e.starts_at;
$function$
;

GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- public.my_calendar_token() and public.reset_my_calendar_token()
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
--
-- SECURITY INVOKER (note the absence of SECURITY DEFINER): the
-- "calendar token own" policy is already exactly right, so a definer would
-- add nothing except a way to get it wrong.
--
-- Reset DELETEs and re-inserts rather than updating in place, so the old
-- token stops working the instant the new one exists.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_calendar_token()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select token into existing from public.calendar_tokens where profile_id = auth.uid();
  if existing is not null then
    return existing;
  end if;

  insert into public.calendar_tokens (profile_id) values (auth.uid())
  returning token into existing;

  return existing;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.my_calendar_token() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_my_calendar_token()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  fresh uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from public.calendar_tokens where profile_id = auth.uid();
  insert into public.calendar_tokens (profile_id) values (auth.uid())
  returning token into fresh;

  return fresh;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.reset_my_calendar_token() TO authenticated;


-- ---------------------------------------------------------------------
-- public.set_own_player_photo(uuid, text)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
--
-- WHY A FUNCTION AND NOT A POLICY, because this is the one someone will want
-- to "simplify" later: RLS grants access to ROWS, not COLUMNS. An
-- owner-update policy on public.players would let a parent write full_name,
-- position, jersey_num and - fatally - team_id, making "move my child into
-- another squad" an RLS-approved write. Column GRANTs cannot help either:
-- they attach to the ROLE, and coaches and parents are both `authenticated`.
-- And no policy can express "unchanged except photo_path", because USING sees
-- the old row and WITH CHECK the new one, and nothing sees both.
--
-- So: SECURITY DEFINER with a hard-coded column list. Two explicit guards,
-- because a definer function bypasses RLS and nothing else is protecting the
-- row - ownership, and that the key lives in this player's OWN folder (else
-- an owner could point photo_path at another player's object and read it back
-- through the signed-URL route).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_player_photo(_player uuid, _photo_path text)
 RETURNS players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.players;
begin
  if not private.is_own_player(_player) then
    raise exception 'You can only change a photo for your own player.'
      using errcode = '42501';
  end if;

  if _photo_path is not null and private.photo_player(_photo_path) is distinct from _player then
    raise exception 'That photo does not belong to this player.'
      using errcode = '42501';
  end if;

  update public.players
     set photo_path = _photo_path
   where id = _player
  returning * into updated;

  return updated;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.set_own_player_photo(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_admin_see_pending(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_admin_see_pending(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
           select 1 from memberships mine
           where mine.profile_id = auth.uid() and mine.role = 'admin'
         )
     and not exists (
           select 1 from memberships m where m.profile_id = _profile
         );
$function$
;

GRANT EXECUTE ON FUNCTION private.can_admin_see_pending(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_edit_team(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- ⚠️ CHANGED 2026-08-05 (roles_manager_and_medic): the squad-staff test was
-- `m.role = 'coach'` and is now `m.role in ('coach','manager','medic')`. All
-- three grant IDENTICAL rights — the word is the only thing distinguishing
-- them. Mirrored client-side by SQUAD_STAFF_ROLES in src/lib/scope.js:
-- CHANGE ONE, CHANGE BOTH.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_edit_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager','medic') and m.team_id = _team)));
$function$
;

GRANT EXECUTE ON FUNCTION private.can_edit_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_team(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.can_manage_invite(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_manage_invite(_invite uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from invites i
    where i.id = _invite and private.is_admin(i.club_id)
  );
$function$
;

GRANT EXECUTE ON FUNCTION private.can_manage_invite(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_see_team(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_see_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or m.team_id = _team));
$function$
;

GRANT EXECUTE ON FUNCTION private.can_see_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_see_team(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.handle_new_user()  — trigger fn for on_auth_user_created
-- proacl: {postgres=X/postgres}   (no anon/authenticated grant, by design:
--   it is only ever invoked by the trigger, which runs as the fn owner)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$function$
;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC;


-- ---------------------------------------------------------------------
-- private.handle_user_email_change()  — trigger fn for
--   on_auth_user_email_updated
--
-- proacl: NULL — i.e. DEFAULT privileges, which for a function means
-- EXECUTE to PUBLIC. Unlike handle_new_user() above (explicitly revoked),
-- this one was never revoked. It is not directly reachable because `anon`
-- lacks USAGE on `private` and it takes no arguments a caller could
-- exploit (it reads NEW, so a direct call errors out), but the asymmetry
-- with handle_new_user is recorded here rather than silently corrected.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.handle_user_email_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$function$
;


-- ---------------------------------------------------------------------
-- private.is_admin(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_admin(_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid() and m.club_id = _club and m.role = 'admin');
$function$
;

GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.is_admin_anywhere()
-- proacl: {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
-- Carries the default PUBLIC execute grant, as photo_player/photo_team do.
-- Recorded as found.
--
-- CLUB-BLIND ON PURPOSE, and the only helper here that is. A person with no
-- membership has no club, cannot read clubs or teams, and therefore cannot
-- put a club_id on their own access request — so the admin side of that table
-- cannot be club-scoped the way private.is_admin(club_id) is everywhere else.
-- Same shape and same single-club assumption as can_admin_see_pending above.
-- If a second club is ever added, those two need revisiting together.
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
$function$
;

GRANT EXECUTE ON FUNCTION private.is_admin_anywhere() TO authenticated;


-- ---------------------------------------------------------------------
-- private.is_own_invite(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_own_invite(_invite uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from invites i
    where i.id = _invite
      and lower(i.email) = lower(auth.jwt() ->> 'email')
  );
$function$
;

GRANT EXECUTE ON FUNCTION private.is_own_invite(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.is_own_player(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_own_player(_player uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid() and m.player_id = _player
      and m.role in ('parent','player'));
$function$
;

GRANT EXECUTE ON FUNCTION private.is_own_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_own_player(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.photo_player(text)
-- proacl: {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
-- NOTE: unlike every other helper here, this one still carries the default
-- PUBLIC execute grant (the leading `=X/postgres`). Recorded as found, not
-- changed. It is inert in practice — `private` has no USAGE for anon — and
-- the function is pure text parsing with no table access.
-- NOTE: `SET search_path TO 'pg_catalog', 'public'` is present live but is
-- ABSENT from db/migrations/20260803_player_parents_and_photos.sql as it
-- was first committed. The migration file was corrected on 4 Aug 2026 to
-- match; re-applying the old file would have silently un-pinned it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.photo_player(_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when split_part(_key, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
    else null
  end;
$function$
;

GRANT EXECUTE ON FUNCTION private.photo_player(text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.photo_team(text)
-- proacl: {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
-- Same default-PUBLIC-grant note as photo_player above.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.photo_team(_key text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.team_id from public.players p
   where p.id = private.photo_player(_key);
$function$
;

GRANT EXECUTE ON FUNCTION private.photo_team(text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.shares_admin_club(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.shares_admin_club(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from memberships target
    join memberships mine on mine.club_id = target.club_id
    where target.profile_id = _profile
      and mine.profile_id = auth.uid()
      and mine.role = 'admin'
  );
$function$
;

GRANT EXECUTE ON FUNCTION private.shares_admin_club(uuid) TO authenticated;


-- =====================================================================
-- Complete inventory as captured (18 functions):
--   public.accept_invite(uuid)                  SECURITY DEFINER, VOLATILE
--   public.set_own_player_photo(uuid, text)     SECURITY DEFINER, VOLATILE
--   public.calendar_events_for_token(uuid)      SECURITY DEFINER, STABLE
--   public.my_calendar_token()                  INVOKER,          VOLATILE
--   public.reset_my_calendar_token()            INVOKER,          VOLATILE
--   private.can_admin_see_pending(uuid)         SECURITY DEFINER, STABLE
--   private.can_edit_team(uuid)                 SECURITY DEFINER, STABLE
--   private.can_manage_invite(uuid)             SECURITY DEFINER, STABLE
--   private.can_see_team(uuid)                  SECURITY DEFINER, STABLE
--   private.handle_new_user()                   SECURITY DEFINER, VOLATILE
--   private.handle_user_email_change()          SECURITY DEFINER, VOLATILE
--   private.is_admin(uuid)                      SECURITY DEFINER, STABLE
--   private.is_admin_anywhere()                 SECURITY DEFINER, STABLE
--   private.is_own_invite(uuid)                 SECURITY DEFINER, STABLE
--   private.is_own_player(uuid)                 SECURITY DEFINER, STABLE
--   private.photo_player(text)                  INVOKER,          IMMUTABLE
--   private.photo_team(text)                    SECURITY DEFINER, STABLE
--   private.shares_admin_club(uuid)             SECURITY DEFINER, STABLE
--
-- ADDED 2026-08-05 to 2026-08-07, appended at the end of this file:
--   public.claim_roster_access()                SECURITY DEFINER, VOLATILE
--   public.delete_my_account()                  SECURITY DEFINER, VOLATILE
--   public.set_own_player_gender(uuid,text)     SECURITY DEFINER, VOLATILE
--   private.sync_profile_name()                 INVOKER,          VOLATILE
--
-- `public` holds accept_invite, set_own_player_photo, the three calendar
-- functions and the three above; everything else lives in `private`.
-- =====================================================================


-- #####################################################################
-- ##   ADDED 2026-08-05 .. 2026-08-07 — captured 2026-08-07          ##
-- #####################################################################


-- ---------------------------------------------------------------------
-- public.claim_roster_access()  — ONBOARDING, SECURITY-RELEVANT
-- proacl: {=X/postgres,postgres=X/postgres,anon=X/postgres,
--          authenticated=X/postgres,service_role=X/postgres}
--
-- How parents self-onboard: grants the caller the squads their email already
-- appears against in player_contacts. No invite is sent to anyone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_roster_access()
 RETURNS SETOF memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_email text;
begin
  -- Fail-safe guard, matching the four existing anon-callable SECURITY DEFINER
  -- functions in this schema.
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  -- ⚠️ ONLY for accounts that hold NO access at all.
  --
  -- Running this on every sign-in would automatically pick up a newly-rostered
  -- sibling, which is genuinely useful — but it would ALSO silently resurrect
  -- access an admin had deliberately revoked, with no record that it happened.
  -- Re-granting revoked access is the worse failure, so it is refused here.
  -- Auto-adding siblings needs a ledger of what was granted automatically;
  -- that is separate work, deliberately not smuggled in here.
  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id)
  select auth.uid(),
         p.club_id,
         p.team_id,
         -- ⚠️ teams.is_senior, never teams.name. A squad rename must not be
         -- able to hand an adult a 'parent' role.
         case when t.is_senior then 'player' else 'parent' end,
         p.id
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
  -- Belt and braces against a double-submit racing the zero-membership guard
  -- above. memberships_unique_grant is what actually makes this safe.
  on conflict do nothing
  returning *;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.claim_roster_access() TO anon;
GRANT EXECUTE ON FUNCTION public.claim_roster_access() TO authenticated;


-- ---------------------------------------------------------------------
-- public.delete_my_account()  — DESTRUCTIVE, SECURITY-CRITICAL
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- NOTE: NOT granted to anon, unlike most functions here.
-- search_path is pinned to '' (not 'public'), so references are fully
-- qualified on purpose.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  other_admins int;
begin
  -- Same fail-safe shape as every other SECURITY DEFINER function here: an
  -- unauthenticated caller gets a loud 42501, not a silent no-op.
  if me is null then
    raise exception 'You must be signed in to delete your account.'
      using errcode = '42501';
  end if;

  -- ⚠️ THE LAST ADMIN CANNOT LEAVE. Without this, one tap makes the club
  -- permanently unadministerable: nobody can approve access requests, add
  -- fixtures, or promote a replacement, and there is no way back through the
  -- app at all. Refusing is recoverable; the alternative is not.
  select count(*) into other_admins
  from public.memberships
  where role = 'admin'
    and profile_id <> me;

  if other_admins = 0 then
    raise exception 'You are the only admin. Make someone else an admin first, then delete your account.'
      using errcode = 'P0001';
  end if;

  -- Cut the three NO ACTION references loose. Club records, kept.
  update public.events       set created_by = null where created_by = me;
  update public.invites      set created_by = null where created_by = me;
  update public.availability set updated_by = null where updated_by = me;

  -- One delete. auth.users -> profiles -> memberships / access_requests /
  -- calendar_tokens, plus auth's own sessions and identities.
  delete from auth.users where id = me;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;


-- ---------------------------------------------------------------------
-- public.set_own_player_gender(uuid, text)
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
--
-- Same shape as set_own_player_photo: RLS grants access to ROWS, not COLUMNS,
-- so a row-level owner policy on players would hand a parent team_id as well.
-- ⚠️ Fails safe for anon via private.is_own_player(), which cannot match a
-- NULL auth.uid() — a DIFFERENT mechanism from the explicit `auth.uid() is
-- null` guard used elsewhere, same outcome (42501).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_player_gender(_player uuid, _gender text)
 RETURNS players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.players;
begin
  if not private.is_own_player(_player) then
    raise exception 'You can only change details for your own player.'
      using errcode = '42501';
  end if;

  if _gender is not null and _gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.'
      using errcode = '22023';
  end if;

  update public.players
     set gender = _gender
   where id = _player
  returning * into updated;

  return updated;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.set_own_player_gender(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.set_own_player_gender(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.sync_profile_name()  — TRIGGER FUNCTION
-- proacl: NULL (no explicit grants; invoked by the trigger)
--
-- ⚠️ NOT SECURITY DEFINER. Runs as the caller.
-- search_path pinned to '' on 2026-08-07 —
-- db/migrations/20260807_sync_profile_name_search_path.sql. Safe with '' because
-- the body touches no schema-qualified object, only pg_catalog builtins.
--
-- ⚠️ KNOWN BUG, recorded not fixed: a single-word full_name yields
-- last_name = that same word, which the comment below says must not happen.
-- The `if new.first_name is null` guard is dead code — stripping the final
-- word from a one-word string leaves it unchanged, not empty. Latent; no live
-- row has hit it. Detail and fix in claude/state-of-play.md.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_profile_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  fn text := nullif(btrim(new.first_name), '');
  ln text := nullif(btrim(new.last_name), '');
  full_in text := nullif(btrim(new.full_name), '');
  names_changed boolean;
  full_changed boolean;
begin
  if tg_op = 'INSERT' then
    names_changed := (fn is not null or ln is not null);
    full_changed  := (full_in is not null);
  else
    names_changed := (new.first_name is distinct from old.first_name)
                  or (new.last_name  is distinct from old.last_name);
    full_changed  := (new.full_name  is distinct from old.full_name);
  end if;

  -- first/last win when both changed in one statement: they are the explicit
  -- input, full_name is the derived display value.
  if names_changed and (fn is not null or ln is not null) then
    new.full_name := btrim(concat_ws(' ', fn, ln));
    new.first_name := fn;
    new.last_name  := ln;
  elsif full_changed and full_in is not null then
    new.full_name  := full_in;
    new.first_name := nullif(btrim(regexp_replace(full_in, '\s+\S+$', '')), '');
    new.last_name  := nullif(btrim(regexp_replace(full_in, '^.*\s', '')), '');
    -- a single-word name is a first name with no family name, not the reverse
    if new.first_name is null then
      new.first_name := full_in;
      new.last_name  := null;
    end if;
  end if;

  return new;
end;
$function$
;
