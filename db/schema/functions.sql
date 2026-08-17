-- =====================================================================
-- db/schema/functions.sql
-- CAPTURE of every function in the `public` and `private` schemas of
-- Supabase project lusmshimxdcxpnrktlgz (quins-club-hub).
-- First captured 2026-08-03; re-captured 2026-08-07;
-- ⚠️ RE-CAPTURED 2026-08-09 — 29 functions (was 22).
-- ⚠️ RE-CAPTURED 2026-08-11 — see the block below.
-- ⚠️ RE-CAPTURED 2026-08-12 — public.calendar_events_for_token only
--   (20260812 calendar_feed_league_team). Three columns added to its
--   RETURNS TABLE and a LEFT JOIN to league_teams. See the block at its
--   definition for what the DROP did to its grants.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md.
--
-- ── ⚠️ RE-CAPTURED 2026-08-11 AFTER THIS FILE WENT TWO DAYS BEHIND ───
-- Three functions were live and had NO entry here at all, and a fourth was
-- recorded with a signature the database no longer has:
--
--   private.is_super_admin()                    20260810183058 super_admin_and_rights
--   public.set_admin_rights(uuid,bool,text[])   20260810183058 super_admin_and_rights
--   private.notify_pitch_request()              20260811051334 pitch_request_notify
--   public.register_my_player(...)              20260811085312 self_registration
--                                               — 3-arg here, 4-arg live
--
-- ⚠️ THE `register_my_player` ENTRY WAS THE DANGEROUS ONE, and not because it
-- was merely out of date. The 11 Aug migration DROPS the 3-argument signature,
-- so this file was describing a function that does not exist while the one that
-- does — carrying a new argument that decides whether a registrant becomes a
-- 'player' or a 'parent' — appeared nowhere. A reader diffing live against this
-- file would have found the whole self-registration guard missing and had no
-- way to tell "not captured" from "reverted". That is the exact confusion this
-- directory exists to remove.
--
-- ⚠️ AND THE COMMITTED MIGRATION IS NOT WHAT WAS APPLIED. The body live in the
-- database carries a SHORTER version of the 0A000 comment than
-- db/migrations/20260811_self_registration.sql does, and is missing that file's
-- two `-- ⚠️ UNCHANGED …` comments entirely. Every executable statement is
-- identical; only the prose differs. Recorded, not reconciled — but it means
-- **re-applying that committed file would rewrite the live function body**, and
-- the next capture would then show a diff nobody intended. The body below is
-- what the database returns, per the README: capture live, never the migration.
-- ⚠️ Note this is NOT the `apply_migration` comment-stripping described lower
-- down — comments INSIDE a dollar-quoted body do survive, which is why the ones
-- that are there are there. Something shorter was applied, then written up.
--
-- Source: pg_proc + pg_get_functiondef(oid) + proacl, verbatim. Bodies
-- below are exactly what the database returns — not reformatted.
--
-- ── MIGRATIONS COVERED BY THE 9 AUG 2026 RE-CAPTURE ──────────────────
-- Twelve, applied 8 and 9 Aug 2026, in version order:
--   20260808151251 event_end_time_and_notes
--   20260808154115 calendar_feed_end_time_and_notes
--   20260808160943 membership_pending_status
--   20260808161025 is_attached_to_team_grants
--   20260808161245 register_my_player
--   20260808164111 teams_readable_before_registration
--   20260808191310 profile_phone_and_column_grants
--   20260809080107 age_groups_rename
--   20260809083535 register_my_player_gender
--   20260809083640 register_my_player_gender_errcode
--   20260809092039 squad_staff_approval
--   20260809093858 notify_pending_membership
--
-- Effect on THIS file: 7 functions added, 3 bodies changed
-- (public.calendar_events_for_token, public.claim_roster_access,
-- private.can_see_team). Every body change traces to a listed migration.
--
-- ⚠️ THE WINDOW WAS TWO DAYS AND TWELVE MIGRATIONS. The README says to
-- re-capture WITH the migration, not days later. That was not done, again.
--
-- ── ⚠️ SQL COMMENTS DO NOT SURVIVE INTO THE DATABASE ─────────────────
-- Every migration applied through the Supabase MCP `apply_migration` tool
-- is stored in supabase_migrations.schema_migrations with its `--` comments
-- STRIPPED. Checked 9 Aug 2026: not one of the twelve rows above contains
-- any comment text from its committed .sql file.
--
-- That is why public.claim_roster_access below now has NO prose in its body
-- although the migration that last wrote it
-- (db/migrations/20260808_membership_pending_status.sql) is full of it, and
-- why none of the seven functions added below carry inline WHY comments the
-- way accept_invite does. The SQL is identical; only the prose is gone.
-- The reasoning lives in db/migrations/*.sql and claude/decisions/*.md —
-- when a function body here looks bare, that is where to look.
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
  missing_player int;   -- added 2026-08-14 (family_role_needs_player)
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

  -- ⚠️ ADDED 14 Aug 2026 (family_role_needs_player), AND IT IS HERE RATHER THAN
  -- LEFT TO THE CONSTRAINT FOR ONE REASON: without it the insert below violates
  -- memberships_family_role_needs_player and the person accepting a perfectly
  -- ordinary-looking invite reads a raw 23514 naming a table.
  --
  -- ⚠️ IT SITS BEFORE `update invites set accepted_at`, DELIBERATELY. After it,
  -- a refused invite would be BURNED — marked used, membership refused, and the
  -- person left holding a link that now reports "already used". Proved: the
  -- refused invite is still unaccepted afterwards.
  --
  -- Both branches are checked against the player the insert would ACTUALLY use —
  -- invite_targets.player_id when there are targets, invites.player_id when
  -- there are not. Checking the wrong one lets the other through.
  if inv.role in ('parent', 'player') then
    if target_count > 0 then
      select count(*) into missing_player
        from public.invite_targets t
       where t.invite_id = inv.id and t.player_id is null;
    else
      missing_player := case when inv.player_id is null then 1 else 0 end;
    end if;

    if missing_player > 0 then
      raise exception 'This invite is incomplete — it does not say which player it is for. Ask an admin to send a new one.';
    end if;
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
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
-- ⚠️ The proacl line here read `{postgres,anon,authenticated}` until 9 Aug
-- 2026. `service_role` is present live. See the UNATTRIBUTED GRANT DELTAS
-- note in the inventory block near the end of this file.
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
--
-- ⚠️ CHANGED 2026-08-08 (20260808154115 calendar_feed_end_time_and_notes):
-- `ends_at` and `notes` added to both the RETURNS TABLE signature and the
-- select list, following 20260808151251 event_end_time_and_notes which added
-- those two columns to public.events. The visibility rule is untouched —
-- still the line-by-line mirror of private.can_see_team described above.
-- ⚠️ THAT MIRROR IS NOW BROKEN, DELIBERATELY. private.can_see_team gained
-- `m.status = 'active'` on 8 Aug (membership_pending_status) and this
-- function did NOT. See the note on can_see_team below.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calendar_events_for_token(_token uuid)
 RETURNS TABLE(id uuid, type text, title text, opponent text, home boolean, venue text, pitch text, competition text, starts_at timestamp with time zone, ends_at timestamp with time zone, notes text, team_name text, league_team_name text, league_division text, round smallint, time_tbd boolean, competition_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type
  from public.events e
  join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
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

-- ⚠️ THESE THREE GRANTS WERE DESTROYED AND REBUILT ON 12 Aug 2026, and the
-- rebuild was NOT automatically identical. RETURNS TABLE cannot be changed in
-- place, so the migration had to DROP the function — and a drop takes the ACL
-- with it. Re-granting anon/authenticated/service_role restored those three,
-- but `create function` ALSO grants EXECUTE to PUBLIC by default, which this
-- function did not have before. The ACL read back after the migration was:
--     {=X/postgres, postgres=X/postgres, anon=..., authenticated=..., ...}
--      ^^^^^^^^^^^ PUBLIC, new
-- A follow-up `revoke ... from public` restored the original string exactly.
-- ⚠️ THE LESSON, since this is the one anonymous endpoint in the schema:
-- re-granting what you measured is not the same as restoring what you
-- measured. Compare the WHOLE proacl before and after, not just the one role
-- you were worried about. See db/migrations/20260812_calendar_feed_league_team.sql.
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- public.my_calendar_token() and public.reset_my_calendar_token()
-- prosecdef: false (INVOKER)  provolatile: v (VOLATILE)
-- proconfig: search_path=public
-- proacl (BOTH functions, identical): {=X/postgres,postgres=X/postgres,
--          anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ⚠️ CORRECTED 9 Aug 2026. This line previously read
-- `{postgres=X/postgres,authenticated=X/postgres}`, which was WRONG — both
-- functions carry the default PUBLIC grant (`=X`) plus anon and service_role,
-- and no migration since 4 Aug 2026 has touched either of them (checked
-- against supabase_migrations.schema_migrations). So the grants did not
-- change; the FILE WAS WRONG about them. See the UNATTRIBUTED GRANT DELTAS
-- note in the inventory block near the end of this file.
--
-- These are SECURITY INVOKER, so an anon caller executing them still has no
-- rights on public.calendar_tokens and auth.uid() is null — the raise below
-- is what they hit. The EXECUTE grant is not the control here; the function
-- body and RLS are.
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

REVOKE EXECUTE ON FUNCTION public.my_calendar_token() FROM PUBLIC;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
REVOKE EXECUTE ON FUNCTION public.my_calendar_token() FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
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

REVOKE EXECUTE ON FUNCTION public.reset_my_calendar_token() FROM PUBLIC;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
REVOKE EXECUTE ON FUNCTION public.reset_my_calendar_token() FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
GRANT EXECUTE ON FUNCTION public.reset_my_calendar_token() TO authenticated;


-- ---------------------------------------------------------------------
-- public.set_own_player_photo(uuid, text)
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
--
-- ⚠️ CORRECTED 9 Aug 2026. This line previously read
-- `{postgres=X/postgres,authenticated=X/postgres}`. `anon` and `service_role`
-- are present live and no migration since 4 Aug 2026 has touched this
-- function, so the file was wrong rather than the grants having changed. It
-- fails closed for anon the same way set_own_player_gender does — via
-- private.is_own_player(), which cannot match a NULL auth.uid(). Recorded, not
-- fixed. See UNATTRIBUTED GRANT DELTAS near the end of this file.
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

REVOKE EXECUTE ON FUNCTION public.set_own_player_photo(uuid, text) FROM PUBLIC;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
REVOKE EXECUTE ON FUNCTION public.set_own_player_photo(uuid, text) FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
GRANT EXECUTE ON FUNCTION public.set_own_player_photo(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_admin_see_pending(uuid)
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
-- ⚠️ CORRECTED 9 Aug 2026: the `anon` grant was missing from this line. It was
-- added by db/migrations/20260806_grant_anon_execute_on_two_profile_helpers.sql
-- on 6 Aug, so the 7 Aug capture should already have shown it. Safe for the
-- reason that migration gives: with no JWT auth.uid() is null, the EXISTS
-- matches nothing, and the function returns false.
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
GRANT EXECUTE ON FUNCTION private.can_admin_see_pending(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.can_edit_team(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- ⚠️ CHANGED 2026-08-05 (roles_manager_and_medic): the squad-staff test was
-- `m.role = 'coach'` and is now `m.role in ('coach','manager','medic')`. All
-- three grant IDENTICAL rights — the word is the only thing distinguishing
-- them. Mirrored client-side by SQUAD_STAFF_ROLES in src/lib/scope.js:
-- CHANGE ONE, CHANGE BOTH.
--
-- ⚠️ CHANGED 2026-08-10 (can_edit_team_status): `m.status = 'active'` added,
-- OVERTURNING A DELIBERATE DECISION. 20260808_membership_pending_status.sql
-- said in as many words that it was "deliberately NOT status-gated here",
-- because staff roles are admin-granted and a pending coach cannot arise, so
-- the check "implies a state that has no way of arising, and an unreachable
-- branch is a lie about the model". That premise is still true. It was
-- overturned on Jay's instruction, on the argument that thirteen policies
-- hang off this function — events, players, player_contacts, player_parents,
-- attendance, availability and the player-photo storage policy — and the day
-- anything grants staff access through a pending state, all thirteen open at
-- once with no policy edit to notice. The original author's own words are
-- that the check is harmless.
-- Harness: db/tests/rls-can-edit-team-status.sql.
--
-- ⚠️ DO NOT "TIDY" THE SAME CHECK INTO private.is_attached_to_team. That one
-- is status-blind ON PURPOSE — it gates `event read`, and fixtures are
-- non-sensitive squad context a pending parent needs in order for signing in
-- to be worth anything. Measured: a pending coach still reads events, and
-- that is correct.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_edit_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
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
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- ⚠️ CHANGED 2026-08-08 (20260808160943 membership_pending_status): the line
-- `and m.status = 'active'` was ADDED. Before that, ANY membership row with a
-- matching team_id satisfied this function whatever its role or status.
--
-- This function now means "may see this squad's PEOPLE". The looser test —
-- "is attached to this squad at all, pending or active" — moved to the new
-- private.is_attached_to_team(uuid), added by the same migration and captured
-- further down this file. The two bodies are identical apart from this line.
-- Per that migration: a self-registered parent's row is `pending`, and
-- without the split a pending row would expose every other child in the
-- squad (measured live on 8 Aug: 6 players visible, not 1).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_see_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
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
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
-- ⚠️ CORRECTED 9 Aug 2026: same missing `anon` grant as can_admin_see_pending
-- above, from the same 6 Aug migration and safe for the same reason.
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
GRANT EXECUTE ON FUNCTION private.shares_admin_club(uuid) TO anon;  -- inert: anon has no USAGE on `private`


-- =====================================================================
-- ⚠️ UNATTRIBUTED GRANT DELTAS — found 9 Aug 2026
--
-- Four `proacl:` lines in this file did not match the live catalogue, and
-- NONE of the twelve migrations in the header explains any of them. They are
-- corrected in place above and listed together here because a grant delta
-- nobody can attribute is exactly what this directory exists to surface.
--
--   private.can_admin_see_pending(uuid)   file lacked `anon`
--   private.shares_admin_club(uuid)       file lacked `anon`
--     → BOTH attributable, just not to this window: the 6 Aug migration
--       20260806_grant_anon_execute_on_two_profile_helpers.sql added them.
--       The 7 Aug capture recorded them wrongly. Record error, not drift.
--
--   public.my_calendar_token()            file lacked `=X` (PUBLIC), anon,
--   public.reset_my_calendar_token()        service_role — both functions
--   public.set_own_player_photo(uuid,text) file lacked anon, service_role
--     → NOT attributable to any migration. supabase_migrations was searched
--       for every statement mentioning these functions: the last were
--       20260804060408 self_service_profile and 20260804064700 calendar_feed,
--       i.e. nothing has recreated or re-granted them since 4 Aug 2026.
--
-- BEST READING, STATED AS A JUDGEMENT AND NOT AS FACT: what is live is
-- exactly what Supabase's default privileges on the `public` schema produce
-- for a function CREATEd by `postgres` (PUBLIC + anon + authenticated +
-- service_role), so the likelihood is that these three were recorded from
-- intent rather than from proacl at the 3–4 Aug capture and have been wrong
-- in this file ever since. ⚠️ THAT IS NOT PROVEN. Postgres does not keep a
-- timestamp for a GRANT, so "the file was always wrong" and "someone granted
-- these outside a migration" are indistinguishable from the catalogue alone.
-- Do not delete this note on the strength of the paragraph above it.
--
-- The security consequence in each case is nil-to-small and is argued at each
-- function: the two calendar functions are SECURITY INVOKER (the grant buys
-- an anon caller nothing), and set_own_player_photo fails closed inside
-- private.is_own_player(). Recorded as found, per the README. Not fixed here.
--
-- ✅ **FIXED 13 Aug 2026 — `db/migrations/20260813_revoke_anon_execute.sql`.**
-- All three now answer false to has_function_privilege('anon', ..., 'execute'),
-- along with five more the note above never reached: approve_membership,
-- set_admin_rights, set_series_time_from, claim_roster_access and
-- set_own_player_gender. **Ten of the fourteen functions in `public` were
-- anon-executable; two now are, both deliberately.**
--
-- ⚠️ THE JUDGEMENT ABOVE WAS SOUND AND THE CONCLUSION WAS STILL WRONG, WHICH
-- IS THE PART WORTH KEEPING. "Nil-to-small, argued at each function" is exactly
-- right — and it means each of those functions was safe **by its body rather
-- than by its grant**. That is a separate thing that has to stay true, in eight
-- places, forever, and it is re-argued from scratch every time somebody edits
-- one. A grant stays true on its own.
--
-- ⚠️ AND THE MECHANISM WAS ALREADY DOCUMENTED IN THIS VERY FILE, in the
-- photo_backup_list_objects entry, which calls the revoke "the load-bearing
-- half". Two correct observations in one file, never joined up.
--
-- ⚠️ WHAT THIS NOTE GOT RIGHT AND MUST NOT BE LOST: both `=X` (PUBLIC) and a
-- named `anon` grant can be present INDEPENDENTLY, and revoking one leaves the
-- other. Three of these carried PUBLIC and needed both revokes. The only
-- reliable check is has_function_privilege — never a reading of the SQL.
-- Guarded now by db/tests/grants.sql §3b, in BOTH directions: it also fails if
-- calendar_events_for_token ever LOSES anon, which would take the calendar feed
-- off every subscriber's phone with no way to repair it.
-- =====================================================================


-- =====================================================================
-- ⚠️ THE search_path RULE IS A THREE-WAY TEST, NOT "EVERY FUNCTION IS
-- ⚠️ PINNED EXCEPT ONE". Written 13 Aug 2026 after the same advisor warning
-- ⚠️ got three DIFFERENT correct answers in one day.
--
-- The line below used to read "Every one is `SET search_path` pinned EXCEPT
-- private.squad_expects_gender", and a reader naturally took the exemption as
-- a general precedent about harmless-looking helpers. It is not one. Applied
-- as a blanket rule in either direction it is wrong both ways: pin everything
-- and you break functions that legitimately need `public` on the path; exempt
-- everything and you leave an access-control helper resolving names it should
-- not.
--
-- ASK THREE QUESTIONS, IN THIS ORDER:
--
--   1. Is it SECURITY DEFINER?  → PIN IT. Not negotiable. A DEFINER function
--      runs with the owner's rights, so name resolution is a privilege
--      boundary. Every DEFINER function in both schemas is pinned.
--
--   2. Is it INVOKER, but does it DECIDE ACCESS or get called from an RLS
--      POLICY or a TRIGGER?  → PIN IT ANYWAY. Volatility markers do not
--      matter here; position does. Two examples, both from 13 Aug:
--        · private.social_idea_owner — IMMUTABLE, touches no table, and its
--          exemption note read WORD FOR WORD like squad_expects_gender's.
--          Every fact in it was true and the conclusion was wrong, because it
--          is called from three storage.objects policies and therefore decides
--          who may write into a bucket.
--        · private.events_result_from_components — a TRIGGER on public.events
--          whose whole job is that a tampered request cannot produce a score
--          contradicting its components.
--
--   3. Is it INVOKER, touches no table, calls nothing, and decides nothing?
--      → RECORDING IT IS ENOUGH. private.squad_expects_gender is the only
--      function here that reaches this branch: it takes a string, calls
--      lower()/btrim() and the `~` operator, all pg_catalog, and returns a
--      word. There is nothing for a search_path to redirect.
--
-- ⚠️ AND PIN IT TO THE RIGHT VALUE, WHICH IS THE STEP THAT BITES. `''` is
-- correct only for a function that resolves nothing outside pg_catalog
-- (social_idea_owner). Anything reading `public` tables or calling into
-- `private` needs `'public, pg_temp'`. **Match the function's own siblings,
-- not whichever fix happened to be made last** — copying an empty path onto a
-- trigger that reads public.events breaks it at the first fire.
--
-- ⚠️ A CHANGED ADVISOR LIST IS NOT EVIDENCE THE DATABASE CHANGED. On 13 Aug
-- events_result_from_components appeared in a security-advisor run hours after
-- an earlier run that omitted it, which read as an unannounced production
-- change. It was not: the function had been unpinned since 12 Aug and repo and
-- live matched exactly. The advisor runs on its own schedule. **Diff the repo
-- against live before believing a new warning means new drift.**
-- =====================================================================
--
-- Complete inventory as captured on 2026-08-09 — 29 functions.
--
-- ⚠️ THIS LINE IS A 9 AUG MEASUREMENT AND HAS ROTTED THREE TIMES SINCE.
-- It read "Every one is `SET search_path` pinned EXCEPT
-- private.squad_expects_gender". Two functions added later were also unpinned
-- — private.social_idea_owner (12 Aug) and
-- private.events_result_from_components (12 Aug).
--
-- ❌ **AND THE SENTENCE THAT REPLACED IT SAID "both were pinned on 13 Aug",
-- WHICH WAS HALF TRUE FOR A DAY.** social_idea_owner was.
-- events_result_from_components was NOT — measured live 14 Aug 2026, found by
-- running `get_advisors` while checking something else, and pinned that day by
-- db/migrations/20260814_pin_scoring_trigger_search_path.sql with
-- `search_path = ''`.
-- ⚠️ **A HALF-TRUE SENTENCE SURVIVES A READ-THROUGH IN A WAY A FALSE ONE DOES
-- NOT**, which is why this one lasted a day inside a file whose whole job is to
-- be the capture. **A prose claim in this file is not a measurement.**
-- ✅ There is now a harness: `db/tests/search-path.sql` asserts every function
-- in `private` is pinned except the NAMED exemption, and goes red if the
-- exemption itself is ever pinned. Count nothing from this list; run that.
--
-- The 18 present since the 2026-08-03 capture:
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
-- ADDED 2026-08-08 to 2026-08-09, appended at the very end of this file:
--   public.approve_membership(uuid)             SECURITY DEFINER, VOLATILE
--   public.register_my_player(text,uuid,text)   SECURITY DEFINER, VOLATILE
--   private.can_approve_team(uuid)              SECURITY DEFINER, STABLE
--   private.can_squad_staff_see_pending(uuid)   SECURITY DEFINER, STABLE
--   private.is_attached_to_team(uuid)           SECURITY DEFINER, STABLE
--   private.notify_pending_membership()         SECURITY DEFINER, VOLATILE
--   private.squad_expects_gender(text)          INVOKER,          IMMUTABLE
--
-- `public` holds 10 (accept_invite, set_own_player_photo,
-- set_own_player_gender, the three calendar functions, claim_roster_access,
-- delete_my_account, register_my_player, approve_membership); the other 19
-- live in `private`.
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
--
-- ⚠️ CHANGED 2026-08-08 (20260808160943 membership_pending_status): `status`
-- added to the INSERT column list and `'active'` to the SELECT. Per that
-- migration: a roster email match IS the verification, so a matched parent is
-- granted outright and must never sit in the approval queue. It would inherit
-- the column default today; stating it means a later change to that default
-- cannot silently start queueing matched parents.
--
-- ⚠️ EVERY INLINE COMMENT IN THIS BODY IS GONE FROM THE LIVE DEFINITION,
-- and the block above is what the file used to carry. Nothing removed them on
-- purpose: db/migrations/20260808_membership_pending_status.sql still contains
-- all of them, but `apply_migration` strips `--` comments before executing.
-- See the note at the top of this file. The SQL is otherwise byte-identical to
-- the committed migration. Read that file for the reasoning that used to be
-- here — in particular WHY this refuses to run for an account that already
-- holds any membership (it would silently resurrect access an admin had
-- deliberately revoked).
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
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select auth.uid(),
         p.club_id,
         p.team_id,
         case when t.is_senior then 'player' else 'parent' end,
         p.id,
         -- ⚠️ 'pending' SINCE 14 Aug 2026 (claim_roster_access_pending), and it
         -- USED TO BE 'active'. Jay's ruling: nothing gets squad access without
         -- an admin approving it.
         --
         -- The old position is recorded in
         -- 20260809_notify_pending_membership.sql — "a roster email match IS
         -- the verification" — and it was sound while the club expected to
         -- IMPORT a roster: an email already on a child's record had been put
         -- there by the club. Since the no-roster-import ruling (10 Aug) every
         -- `player_contacts.email` was put there by whoever registered that
         -- child, so a match proves two accounts share an address and nothing
         -- more. And it was REACHABLE: children carrying their own email on
         -- their contact record were being handed the whole squad — every other
         -- child's name, photo and parent contact details — unseen.
         --
         -- ⚠️ THE MATCHING IS UNCHANGED. Identifying which child an account
         -- belongs to is still automatic; it simply no longer grants anything.
         -- Two different jobs, and this function used to do both.
         --
         -- ⚠️ CONSEQUENCE: `notify_pending_membership` fires
         -- `when (new.status = 'pending')`, so these inserts USED TO SLIP PAST
         -- IT SILENTLY and now email the squad's staff like any other
         -- registration. That trigger's own comment about not emailing
         -- volunteers over work that does not exist is now stale for this path
         -- — the work exists, because somebody has to approve it.
         'pending'
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
  on conflict do nothing
  returning *;
end;
$function$
;

REVOKE EXECUTE ON FUNCTION public.claim_roster_access() FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
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

REVOKE EXECUTE ON FUNCTION public.set_own_player_gender(uuid, text) FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
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
-- ✅ The single-word-name bug is FIXED as of 8 Aug 2026 —
-- db/migrations/20260808_sync_profile_name_single_word.sql. The old code
-- derived first_name, then tested `if new.first_name is null`, which a
-- one-word input can never satisfy: stripping a non-existent final word
-- leaves the string unchanged, not empty. So 'Ahmed' produced
-- first_name = last_name = 'Ahmed'. It now tests the SPLIT instead.
-- ⚠️ It was NOT a rare gate case. NamePrompt.jsx:96 writes first/last
-- separately and takes the branch that never splits; the branch that does
-- is reached by private.handle_new_user(), which seeds full_name from the
-- identity provider's display name on EVERY signup.
-- Verified live on a probe table, and the old derivation was re-run inline
-- on the same inputs to prove the check could fail.
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

    -- THE FIX. Decide on the split BEFORE deriving either name.
    if position(' ' in full_in) = 0 then
      -- a single-word name is a first name with no family name, not the reverse
      new.first_name := full_in;
      new.last_name  := null;
    else
      new.first_name := nullif(btrim(regexp_replace(full_in, '\s+\S+$', '')), '');
      new.last_name  := nullif(btrim(regexp_replace(full_in, '^.*\s', '')), '');
    end if;
  end if;

  return new;
end;
$function$
;


-- #####################################################################
-- ##   ADDED 2026-08-08 .. 2026-08-09 — captured 2026-08-09          ##
-- ##                                                                 ##
-- ##   Seven functions. Together they are the parent self-            ##
-- ##   registration feature: a stranger registers a player, the row   ##
-- ##   lands `pending`, the club is emailed, and a coach, manager or  ##
-- ##   admin approves it.                                            ##
-- ##                                                                 ##
-- ##   ⚠️ None of these carry inline prose, because apply_migration   ##
-- ##   strips SQL comments — see the note at the top of this file.    ##
-- ##   The WHY for each lives in the migration named against it.      ##
-- #####################################################################


-- ---------------------------------------------------------------------
-- private.is_attached_to_team(uuid)
-- ADDED by 20260808160943 membership_pending_status.
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- "Is the caller attached to this squad at ALL, pending or active?" — the
-- pre-8-Aug private.can_see_team, kept unchanged under a new name when
-- can_see_team gained its `status = 'active'` test. Per the migration, it
-- gates non-sensitive squad context (the `event read` policy) while
-- can_see_team gates anything exposing other people.
--
-- ⚠️ Its grants are a SEPARATE migration, 20260808161025
-- is_attached_to_team_grants, because the creating migration revoked EXECUTE
-- from PUBLIC and granted it to nobody. The `event read` policy calls it, so
-- every events query in production failed `42501: permission denied for
-- function is_attached_to_team` until that was fixed minutes later. An RLS
-- policy expression is evaluated AS THE QUERYING USER; SECURITY DEFINER
-- governs what a function may do once it runs, not who may run it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_attached_to_team(_team uuid)
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

REVOKE ALL ON FUNCTION private.is_attached_to_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_attached_to_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_attached_to_team(uuid) TO anon;  -- inert for direct calls: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.can_approve_team(uuid)
-- ADDED by 20260809092039 squad_staff_approval.
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- May the caller approve a pending registration on this squad? Admin anywhere
-- in the club, or coach/manager OF THIS SQUAD.
--
-- ⚠️ 'medic' IS DELIBERATELY ABSENT, which is the one thing that makes this
-- different from private.can_edit_team (`role in ('coach','manager','medic')`)
-- and the one thing someone will "simplify" away. Jay chose coach and manager,
-- 9 Aug 2026 — a medic keeps full squad access but admitting a stranger to a
-- children's squad is not a medical decision. If that ever changes, change
-- THIS function; do not repoint its callers at can_edit_team, which would also
-- silently re-include any role later added to that list.
--
-- The migration's own guard asserts can_approve_team(null) is false, so a
-- membership row with no team_id is not approvable by anybody.
--
-- ⚠️ `and m.status = 'active'` ADDED 17 Aug 2026 by
-- 20260817_approve_requires_active_membership, AND ITS ABSENCE WAS A LIVE HOLE
-- rather than an untidiness. Until then this function asked only about role and
-- team, so once public.request_staff_role (20260816) made a PENDING staff row
-- possible, asking to coach a squad satisfied this gate for that squad —
-- approving your own request, and admitting other families' children.
--
-- ⚠️ IT REACHED FURTHER THAN THE BUTTON. private.can_squad_staff_see_pending
-- below calls this function, and backs the policy letting an approver read a
-- pending registrant's NAME and EMAIL. Measured after the fix: a pending coach
-- sees 0 such profiles where an active coach of the same squad sees them.
--
-- ⚠️ private.is_admin STILL HAS THE SAME OMISSION, deliberately — it is
-- unreachable today (nothing can create a non-active admin row) and it backs
-- most of the admin RLS surface. claude/open-items.md carries the reasoning and
-- the re-measurement it depends on.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_approve_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager') and m.team_id = _team)));
$function$
;

REVOKE ALL ON FUNCTION private.can_approve_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_approve_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_approve_team(uuid) TO anon;  -- inert for direct calls: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.can_squad_staff_see_pending(uuid)
-- ADDED by 20260809092039 squad_staff_approval.
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- Backs the `profile read squad staff pending` policy on public.profiles, so
-- an approver can see the registering parent's name and email — without which
-- the queue is a card with two blanks on it.
--
-- ⚠️ EXISTS OVER THE TARGET'S *PENDING* ROWS ONLY, not "this person is on my
-- squad". Per the migration: the wider test would expose every parent's email
-- on the squad to every coach. The profile stops being visible through this
-- path the moment the last pending row is approved, which is the intended
-- lifetime.
--
-- Compare private.can_admin_see_pending(uuid) earlier in this file: same
-- shape, different question (that one is about a profile with NO memberships
-- at all).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_squad_staff_see_pending(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = _profile
       and m.status = 'pending'
       and private.can_approve_team(m.team_id)
  );
$function$
;

REVOKE ALL ON FUNCTION private.can_squad_staff_see_pending(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_squad_staff_see_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_squad_staff_see_pending(uuid) TO anon;  -- inert for direct calls: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.squad_expects_gender(text)
-- ADDED by 20260809083535 register_my_player_gender.
-- prosecdef: FALSE (INVOKER)   provolatile: i (IMMUTABLE)
-- proconfig: NULL — ⚠️ NO search_path IS PINNED ON THIS FUNCTION.
-- proacl: {postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}
--
-- The gender a squad NAME implies, or null for a mixed squad. Mirrors
-- squadExpects() in src/lib/gender.js — change both or neither. Female is
-- tested before male so a "Men's & Women's" squad is not called a men's side.
-- Word boundaries, not substring search: `like '%men%'` also matches
-- "Development" and "Improvers".
--
-- ⚠️ THE search_path GAP, RECORDED AND NOT FIXED. Every other function in
-- both schemas pins search_path; this one does not, and neither does the
-- committed migration, so live and repo agree — it is not drift. It is also
-- the least exposed function here: SECURITY INVOKER, IMMUTABLE, and it
-- touches no table and no schema-qualified object — only lower(), btrim() and
-- the `~` operator, all pg_catalog. private.photo_player(text) is the same
-- class of pure-text helper and IS pinned (`pg_catalog, public`), so the
-- asymmetry is worth someone's attention. ⚠️ I have not established whether
-- the omission was deliberate; the migration does not say.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.squad_expects_gender(_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when _name is null                                       then null
    when lower(_name) ~ '\y(women|girls)\y'                  then 'female'
    when lower(_name) ~ '\y(men|boys)\y'                     then 'male'
    when lower(btrim(_name)) ~ '^u[0-9]{1,2}g([^a-z]|$)'     then 'female'
    when lower(btrim(_name)) ~ '^u[0-9]{1,2}b([^a-z]|$)'     then 'male'
    else null
  end;
$function$
;

REVOKE ALL ON FUNCTION private.squad_expects_gender(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.squad_expects_gender(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.squad_expects_gender(text) TO anon;  -- inert for direct calls: anon has no USAGE on `private`


-- ---------------------------------------------------------------------
-- private.notify_pending_membership()  — TRIGGER FUNCTION
-- ADDED by 20260809093858 notify_pending_membership.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: NULL — default privileges, i.e. EXECUTE to PUBLIC. Same asymmetry
--   already recorded against private.handle_user_email_change above: never
--   explicitly revoked, and not directly usable (it reads NEW, so a direct
--   call errors out). Recorded as found.
--
-- Fires from the `notify_pending_membership` AFTER INSERT trigger on
-- public.memberships, `when (new.status = 'pending')` — see triggers.sql. It
-- POSTs a membership id to the notify-approval Edge Function, which emails the
-- squad's coaches, managers and the club's admins.
--
-- ⚠️ IT MUST NEVER FAIL A REGISTRATION, and per the migration there are three
-- separate layers of that: net.http_post QUEUES and returns without waiting;
-- a missing Vault secret WARNS and returns rather than raising; and the whole
-- body is wrapped in `exception when others` → warn → return new.
--
-- ⚠️ THE BODY CARRIES AN ID AND NOTHING ELSE. Every name and address in the
-- email is read back inside the Edge Function with the service role. A body
-- carrying "send this text to these addresses" would make the endpoint an open
-- relay wearing a shared secret.
--
-- The endpoint URL and shared secret are read from Vault
-- (`approval_notify_url`, `approval_notify_secret`) and are deliberately not
-- in any committed file.
--
-- ⚠️ THIS FUNCTION REACHES OUTSIDE THE SCHEMAS THIS FILE CAPTURES: it reads
-- vault.decrypted_secrets and calls net.http_post (pg_net). Neither is
-- captured anywhere in db/schema/, so a change to either is invisible to this
-- directory's diff.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_pending_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'approval_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pending_membership: vault secrets missing, no email sent for membership %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('membership_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_pending_membership: % (membership %)', sqlerrm, new.id;
  return new;
end;
$function$
;

-- No explicit grants. proacl is NULL as captured.


-- ---------------------------------------------------------------------
-- public.register_my_player(text, uuid, text, boolean, boolean, boolean)
--                                                      — PUBLIC-FACING WRITE
--
-- ⚠️ THE LAST TWO PARAMETERS ARRIVED 14 Aug 2026 (registration_duplicate_guards)
-- BECAUSE OF TWO REAL ROWS ON THE LIVE ROSTER. Before them this function
-- INSERTed a new `players` row unconditionally on every call — there was no
-- uniqueness of any kind, at any layer, on a roster of children. U18B ended up
-- holding one boy twice (added by his father's account and by his own, spelled
-- differently) and U14B ended up holding a PARENT as a player.
--
-- ⚠️ THE CHECKS CANNOT LIVE IN THE CLIENT. A registering parent holds a PENDING
-- membership, so `player read` returns nothing and a client-side "is this
-- already here?" answers no every single time. This function is the only thing
-- that can see the squad on their behalf.
-- ADDED by 20260808161245 register_my_player; the p_gender parameter and its
-- two guards by 20260809083535 register_my_player_gender; the 22004 errcode by
-- 20260809083640 register_my_player_gender_errcode; p_self_register, the 0A000
-- guard and the role expression by 20260811085312 self_registration.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
--
-- ⚠️ THERE IS EXACTLY ONE SIGNATURE, AND KEEPING IT THAT WAY IS THE POINT.
-- register_my_player(text, uuid) went with the gender migration; (text, uuid,
-- text) went with the self-registration migration, which drops it explicitly in
-- the same transaction as creating this one. **Postgres prefers an exact arity
-- match over one satisfied by a default**, so leaving an older signature in
-- place does not give you a compatible overload — it gives you a function every
-- existing client keeps resolving to, with the new feature reaching nobody and
-- nothing failing to say so. One row in pg_proc, confirmed live 11 Aug 2026.
--
-- How a stranger becomes a user: creates a player, puts their own confirmed
-- email on it as a contact, and gives themselves a PENDING membership. Pending
-- is the whole point — private.can_see_team requires `status = 'active'`, so
-- until a coach or admin approves, the registrant sees fixtures and their own
-- child and nobody else's.
--
-- The guards, in the order the body runs them:
--   * signed in, with an email, and email_confirmed_at NOT NULL — this is the
--     only anti-abuse control on a function any stranger may call.
--   * name present and <= 80 characters.
--   * the team must exist; club_id is then taken FROM THE TEAM ROW, never
--     from the caller.
--   * gender must be male/female if given, and is REQUIRED when
--     private.squad_expects_gender(team.name) is not null.
--     ⚠️ errcode 22004 (null_value_not_allowed) for that one, NOT 22023 like
--     the guards around it: per claude/decisions/2026-08-09-single-gender-squads.md,
--     src/data/members.js maps 22023 to one generic message, and this case
--     needs its own. Changing the errcode changes what the parent reads.
--   * at most 5 pending registrations per profile (errcode 42901).
--   * ⚠️ ADDED 11 Aug: p_self_register is REFUSED unless the squad's
--     teams.self_registration_allowed is true, errcode 0A000. It is checked
--     here and not only in AddYourPlayer.jsx because this is the one function
--     in the schema a person with NO membership may call, so a check that
--     lives only in the form is a check anyone hitting the REST endpoint
--     skips. 0A000 is deliberate: src/data/members.js maps 42501 to a sentence
--     about confirming your email address, which would be a lie here, and
--     codes ABSENT from that map fall through with error.message intact.
--
-- The role is
--   `case when p_self_register or team.is_senior then 'player' else 'parent' end`
-- — teams.is_senior and the new column, NEVER teams.name, the same rule as
-- claim_roster_access. ⚠️ is_senior is still in that expression on purpose: if a
-- senior squad ever returns, its players are players whether or not anyone
-- remembers to set the new column.
--
-- ⚠️ The role is COSMETIC and that is why widening it was safe: no policy in
-- policies.sql distinguishes 'parent' from 'player', private.is_own_player
-- accepts either, and src/lib/scope.js treats them identically. If that ever
-- stops being true, this line is the thing that was relied on.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_my_player(p_full_name text, p_team_id uuid, p_gender text DEFAULT NULL::text, p_self_register boolean DEFAULT false, p_confirm_duplicate boolean DEFAULT false, p_confirm_self_name boolean DEFAULT false)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_email  text;
  confirmed_at  timestamptz;
  pending_count int;
  new_player    public.players;
  new_membership public.memberships;
  clean_name    text;
  name_key      text;
  caller_key    text;
  clean_gender  text;
  team_row      public.teams;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;
  if confirmed_at is null then
    raise exception 'Please confirm your email address before adding a player.'
      using errcode = '42501';
  end if;

  clean_name := nullif(btrim(p_full_name), '');
  if clean_name is null then
    raise exception 'Enter the player''s name.' using errcode = '22023';
  end if;
  if length(clean_name) > 80 then
    raise exception 'That name is too long.' using errcode = '22023';
  end if;

  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That age group does not exist.' using errcode = '22023';
  end if;

  -- ⚠️ ADDED 11 Aug 2026. Server-side because register_my_player is the one
  -- function a person with NO membership can call. ERRCODE 0A000 deliberately:
  -- src/data/members.js maps 42501 to a sentence about confirming your email,
  -- which would be a lie here. Codes absent from that map fall through to
  -- error.message intact.
  if p_self_register and not coalesce(team_row.self_registration_allowed, false) then
    raise exception 'Players in % cannot register themselves — a parent or carer has to do it.',
      team_row.name using errcode = '0A000';
  end if;

  clean_gender := nullif(btrim(lower(p_gender)), '');
  if clean_gender is not null and clean_gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.' using errcode = '22023';
  end if;

  if clean_gender is null and private.squad_expects_gender(team_row.name) is not null then
    raise exception '% is a single-gender squad, so the player''s gender has to be recorded.',
      team_row.name using errcode = '22004';
  end if;

  name_key := private.name_match_key(clean_name);

  -- ⚠️ GUARD 1 — ALREADY ON THIS SQUAD'S ROSTER. Scoped to the SQUAD, not the
  -- club: brothers in different age groups share a surname, and two boys called
  -- Tom Smith in U12 and U16 are two boys. Within one squad the same first-and-
  -- last name is overwhelmingly the same child added twice. The message
  -- deliberately does NOT echo the stored spelling — see the disclosure note in
  -- the migration.
  if name_key is not null and not p_confirm_duplicate then
    if exists (
      select 1 from public.players pl
       where pl.team_id = team_row.id
         and private.name_match_key(pl.full_name) = name_key
    ) then
      raise exception 'Someone with that name is already registered in %. If that is your player, they are already on the roster — ask the club to connect you to them rather than adding them again.',
        team_row.name using errcode = '42710';
    end if;
  end if;

  -- ⚠️ GUARD 2 — THAT IS YOUR OWN NAME. Only when they said "my child": a U13+
  -- player registering THEMSELVES is supposed to type their own name, and
  -- firing here would break the whole self-registration feature. The signal is
  -- the CONTRADICTION, never the name alone.
  --
  -- ⚠️ THE PROFILE ALREADY HAS A NAME BY THIS POINT even on a first
  -- registration, because PlayerRegistrationForm writes it before the first
  -- call — the 13 Aug fix for the nameless-approval-queue race. That is what
  -- makes this guard work on the very registration it most needs to catch.
  if not p_self_register and not p_confirm_self_name then
    select private.name_match_key(
             coalesce(
               nullif(btrim(pr.full_name), ''),
               btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))
             )
           )
      into caller_key
      from public.profiles pr
     where pr.id = auth.uid();

    if caller_key is not null and name_key is not null and caller_key = name_key then
      if coalesce(team_row.self_registration_allowed, false) then
        raise exception 'That is your own name, but you have said you are registering a child. If you are the player, choose "I am the player". If you are registering your child, use their name.'
          using errcode = '42809';
      else
        raise exception 'That is your own name, but you have said you are registering a child. Players in % cannot register themselves, so if this is you, ask the club to set your access up instead.',
          team_row.name using errcode = '42809';
      end if;
    end if;
  end if;

  select count(*) into pending_count
    from public.memberships
   where profile_id = auth.uid() and status = 'pending';
  if pending_count >= 5 then
    raise exception 'You already have % players waiting to be approved. Please wait for the club to review them.', pending_count
      using errcode = '42901';
  end if;

  insert into public.players (club_id, team_id, full_name, gender)
  values (team_row.club_id, team_row.id, clean_name, clean_gender)
  returning * into new_player;

  insert into public.player_contacts (player_id, email)
  values (new_player.id, lower(btrim(caller_email)));

  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, team_row.id,
          -- ⚠️ is_senior IS DELIBERATELY STILL HERE. If a senior squad ever
          -- returns, its players are players whether or not anyone remembers
          -- to set the new column.
          case when p_self_register or team_row.is_senior then 'player' else 'parent' end,
          new_player.id, 'pending')
  returning * into new_membership;

  return new_membership;
end;
$function$
;

-- ⚠️ GRANTS ARE NOT INHERITED by a new signature, and the DROP of the 3-arg
-- version took its ACLs with it. These four are the live proacl as found on
-- 11 Aug 2026, and they match what the 3-arg version carried. On 8 Aug a revoke
-- with no matching grant broke every events query in production for a minute.
REVOKE ALL ON FUNCTION public.register_my_player(text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_my_player(text, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_my_player(text, uuid, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.register_my_player(text, uuid, text, boolean) TO service_role;


-- ---------------------------------------------------------------------
-- public.approve_membership(uuid)  — SECURITY-RELEVANT WRITE
-- ADDED by 20260809092039 squad_staff_approval.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
--
-- ⚠️ WHY THIS IS AN RPC AND NOT A WIDER POLICY, because widening the policy is
-- the obvious "simpler" change and it is wrong. `memb manage` on
-- public.memberships is FOR ALL USING private.is_admin(club_id) — SELECT,
-- INSERT, UPDATE and DELETE — and RLS grants ROWS, NOT COLUMNS. Adding a coach
-- clause to it would hand every coach the ability to change anyone's ROLE on
-- their squad (including to 'admin'), reassign a membership to another team,
-- and DELETE access. Approving a registration and administering the club would
-- become the same permission.
--
-- So the table write stays admin-only and approval lives here, where THE ONLY
-- COLUMN THE BODY CAN WRITE IS `status`: the caller supplies an id and nothing
-- else, and the SET list is a literal. There is no parameter through which a
-- role, a team or a player could be changed.
--
-- Authorisation is private.can_approve_team(target.team_id) — coach/manager of
-- that squad, or admin in the club. Not medic; see that function.
--
-- Returning the row unchanged when it is already active is deliberate: two
-- coaches both tapping Approve is the normal case and the second has done
-- nothing wrong.
--
-- The migration carries a guard asserting `memb manage` is still exactly
-- `private.is_admin(club_id)` — this RPC is pointless the moment coaches can
-- UPDATE the table directly.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_membership(p_membership_id uuid)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target public.memberships;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into target from public.memberships where id = p_membership_id;
  if target.id is null then
    raise exception 'That registration no longer exists.' using errcode = '42704';
  end if;

  if not private.can_approve_team(target.team_id) then
    raise exception 'You can only approve players for your own age groups.'
      using errcode = '42501';
  end if;

  if target.status = 'active' then
    return target;
  end if;

  update public.memberships
     set status = 'active'
   where id = p_membership_id
  returning * into target;

  return target;
end;
$function$
;

REVOKE ALL ON FUNCTION public.approve_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_membership(uuid) TO authenticated;
-- ⚠️ RECORDED, NOT FIXED: the migration runs
--   revoke execute on function public.approve_membership(uuid) from public;
--   grant  execute on function public.approve_membership(uuid) to authenticated;
-- and NOTHING grants anon or service_role — yet proacl carries both. Supabase's
-- default privileges on the `public` schema grant EXECUTE to anon,
-- authenticated and service_role on every newly CREATEd function, which is the
-- likely source, and the same pattern is visible on register_my_player and
-- set_own_player_gender. It fails closed: an anon caller has a null auth.uid()
-- and hits the first raise. Recorded as found, per the README.
REVOKE EXECUTE ON FUNCTION public.approve_membership(uuid) FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
GRANT EXECUTE ON FUNCTION public.approve_membership(uuid) TO service_role;


-- ---------------------------------------------------------------------
-- public.set_series_time_from(uuid, timestamptz, int, int)
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Added 2026-08-10 by migration `set_series_time_from`.
--
-- ⚠️ SECURITY INVOKER — the ONLY function in this file that is, and that is
-- the whole safety argument rather than an oversight. The UPDATE is evaluated
-- as the caller, so `event edit` (private.can_edit_team) filters it exactly as
-- it filters a PostgREST update. The function grants nothing. A SECURITY
-- DEFINER version would have to re-implement that check by hand, including the
-- status gate added the same day.
--
-- WHY IT EXISTS AT ALL. Every other series-wide edit sets the SAME value on
-- every row and PostgREST does it in one statement. The time cannot: each
-- occurrence has its own DATE, so "move to 18:30 for the rest of term" is a
-- different starts_at per row. Client-side that is N round trips and not
-- atomic — half a term moved, half not, and nothing on screen saying which.
--
-- ⚠️ anon HOLDS EXECUTE and that is Supabase's bootstrap default, not intent —
-- the creating migration revoked from PUBLIC and granted only `authenticated`.
-- Same pattern already recorded on approve_membership, register_my_player and
-- set_own_player_gender. It FAILS CLOSED: an anon caller has a null
-- auth.uid(), so can_edit_team is false, the UPDATE matches nothing, the
-- function returns an empty set and src/data/events.js throws on zero rows.
--
-- ⚠️ FUTURE ONLY (`starts_at >= _from`, inclusive) and series_id ONLY,
-- matching deleteSeriesFrom and Jay's 8 Aug ruling. Duration is preserved
-- rather than recomputed: ends_at moves by the same amount as starts_at, so a
-- 90-minute session stays 90 minutes and a null ends_at stays null. All SET
-- expressions see the OLD row, which is what makes that safe in one statement.
-- Verified live 10 Aug 2026 in a rolled-back transaction: three occurrences at
-- 18:00, moved from the second onward to 18:30 — the first stayed at 18:00 and
-- all three stayed 90 minutes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_series_time_from(_series uuid, _from timestamp with time zone, _hh integer, _mm integer)
 RETURNS SETOF events
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update events e
     set starts_at =
           (date_trunc('day', e.starts_at at time zone 'Asia/Dubai')
             + make_interval(hours => _hh, mins => _mm)) at time zone 'Asia/Dubai',
         ends_at =
           case
             when e.ends_at is null then null
             else ((date_trunc('day', e.starts_at at time zone 'Asia/Dubai')
                     + make_interval(hours => _hh, mins => _mm)) at time zone 'Asia/Dubai')
                  + (e.ends_at - e.starts_at)
           end
   where e.series_id = _series
     and e.starts_at >= _from
  returning e.*;
$function$
;

GRANT EXECUTE ON FUNCTION public.set_series_time_from(uuid, timestamp with time zone, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_series_time_from(uuid, timestamp with time zone, integer, integer) FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
GRANT EXECUTE ON FUNCTION public.set_series_time_from(uuid, timestamp with time zone, integer, integer) TO service_role;


-- ---------------------------------------------------------------------
-- private.is_super_admin()
-- Added 2026-08-10 by migration `super_admin_and_rights`. ⚠️ Live since then
-- with no entry in this file until the 11 Aug re-capture.
-- prosecdef: true    provolatile: s (STABLE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
--
-- ⚠️ THE TIER IS A FLAG ON memberships, NOT A ROLE VALUE, and that was the
-- design decision rather than an implementation detail. Twelve places in this
-- schema test `m.role = 'admin'`; a new role value would have to be added to
-- all twelve and each is a chance to miss one, where a miss silently strips a
-- super admin of an ordinary admin power. A boolean makes a super admin an
-- admin, so all twelve keep working untouched.
--
-- ⚠️ `status = 'active'` is in here for the same reason it was added to
-- can_edit_team on 10 Aug: a pending row must not carry authority.
--
-- ⚠️ NO `anon` GRANT, unlike most of public — this one was never created in
-- `public`, so Supabase's default privileges on that schema never applied. It
-- would fail closed anyway (null auth.uid() matches no membership row).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.role = 'admin'
      and m.status = 'active'
      and m.is_super);
$function$
;

-- No explicit grants beyond the two in proacl above.


-- ---------------------------------------------------------------------
-- public.set_admin_rights(uuid, boolean, text[])  — SECURITY-RELEVANT WRITE
-- Added 2026-08-10 by migration `super_admin_and_rights`. ⚠️ Live since then
-- with no entry in this file until the 11 Aug re-capture.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--          service_role=X/postgres}
--
-- ⚠️ WHY THIS IS AN RPC AND NOT A COLUMN THE APP WRITES — the same trap
-- approve_membership documents, and it very nearly ate this feature. `memb
-- manage` on public.memberships is FOR ALL USING private.is_admin(club_id), so
-- **any admin can already write membership rows**. A plain is_super column
-- would therefore let any admin set it on themselves and the whole tier would
-- be decoration. Two things stop that and BOTH are needed:
--   1. the column GRANT in grants.sql — policies authorise the ROW, grants
--      authorise the COLUMN, and getting only the policy right leaves it open;
--   2. this function, whose first statement is the super-admin check.
--
-- ⚠️ AND A THIRD, easy to miss because it is not in this file: the RESTRICTIVE
-- policy "memb no self promotion" in policies.sql closes the INSERT path. A
-- column grant stops an UPDATE; it does not stop somebody inserting a brand new
-- row that already has is_super = true.
--
-- `and role = 'admin'` in the WHERE is deliberate: rights are meaningless on a
-- coach or parent row, and silently writing them there would leave a membership
-- carrying authority no screen would ever show.
--
-- ⚠️ THE FIRST SUPER ADMIN WAS SET BY HAND IN SQL, as it had to be — this
-- function requires a super admin to exist and none could.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_admin_rights(_membership_id uuid, _is_super boolean, _rights text[])
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _row memberships;
begin
  if not private.is_super_admin() then
    raise exception 'Only a super admin can change admin rights'
      using errcode = '42501';
  end if;

  update memberships
     set is_super = coalesce(_is_super, false),
         admin_rights = coalesce(_rights, '{}')
   where id = _membership_id
     and role = 'admin'
  returning * into _row;

  if _row.id is null then
    raise exception 'No admin membership with that id'
      using errcode = 'P0002';
  end if;

  return _row;
end;
$function$
;

-- ⚠️ anon and service_role again hold EXECUTE from Supabase's default
-- privileges on `public`, not from intent. Fails closed: a null auth.uid()
-- cannot satisfy is_super_admin() and the first raise fires. Same pattern
-- already recorded on approve_membership, register_my_player,
-- set_own_player_gender and set_series_time_from.
GRANT EXECUTE ON FUNCTION public.set_admin_rights(uuid, boolean, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_admin_rights(uuid, boolean, text[]) FROM anon;  -- REVOKED 13 Aug 2026, 20260813_revoke_anon_execute.sql
GRANT EXECUTE ON FUNCTION public.set_admin_rights(uuid, boolean, text[]) TO service_role;


-- ---------------------------------------------------------------------
-- private.notify_pitch_request()  — TRIGGER FUNCTION, REACHES OUTSIDE THE DB
-- Added 2026-08-11 by migration `pitch_request_notify`. Fired by two triggers
-- on public.pitch_requests — see triggers.sql.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres}   ← the migration revokes from public, anon and
--         authenticated, so unlike most of this file nothing else can call it.
--
-- The SECOND function in this project to make an outbound HTTP call, after
-- private.notify_pending_membership. ⚠️ `pg_net` IS installed (0.20.4) — a
-- claim that this database cannot reach the network was carried in
-- claude/state-of-play.md for days after it stopped being true.
--
-- ⚠️ WHY THE DATABASE SENDS IT AND NOT THE APP, which is not a style choice:
-- the submit mail goes to whoever holds Pitch Management, and **a coach cannot read admin email
-- addresses** — `profiles` is not bulk-readable by one and `profiles.email` is
-- column-granted, not merely policy-gated. A client-side send would need either
-- the club's admin list in every coach's browser or a service-role key in it.
--
-- ⚠️ IT MUST NEVER FAIL THE WRITE, hence the catch-all `exception when others`.
-- A coach's pitch request has to file whether or not Resend is having a good
-- day. ⚠️ AND THE FAILURE IS THEREFORE GENUINELY QUIET — `raise warning` goes
-- to the Postgres log, which nobody reads. That is survivable ONLY because the
-- queue is in-app: the request sits on /admin/allocation whether or not the mail
-- arrived. **The email is a prompt to go and look, never the record.**
--
-- ⚠️ REUSES `approval_notify_secret` from the vault — same caller, same trust
-- domain, and a second secret is a second thing to rotate and forget. The URL
-- is its own entry, `pitch_notify_url`.
--
-- ⚠️ THE pg_net QUEUE ROW IS WRITTEN IN THIS TRANSACTION, which is what stops
-- the edge function reading back a pitch_requests row that has not committed
-- yet. It is also the trick for proving the trigger fires without sending
-- anything: insert inside a transaction and ROLL BACK — the queue count goes
-- 0 → 1 and then vanishes with everything else.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_pitch_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'pitch_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pitch_request: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('pitch_request_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_pitch_request failed for %: %', new.id, sqlerrm;
  return new;
end;
$function$
;

-- Function comment as stored in the database:
--   'Posts a pitch request id to the notify-pitch-request edge function on
--    submit and on decision. Swallows every failure: the in-app queue is the
--    record, this is only the prompt.'

REVOKE ALL ON FUNCTION private.notify_pitch_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_pitch_request() FROM anon;
REVOKE ALL ON FUNCTION private.notify_pitch_request() FROM authenticated;

-- ---------------------------------------------------------------------
-- private.can_edit_match_sheet(uuid)   -- added 2026-08-12
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- A HELPER FOR THE CHILD TABLES, not an inlined three-hop EXISTS. Reaching
-- slot -> sheet -> event -> squad inside a policy would make every row read
-- re-plan that join, and - the reason that actually matters - would put the
-- rule in three places, one of which will eventually be edited alone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_edit_match_sheet(_sheet uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.match_sheets ms
    join public.events e on e.id = ms.event_id
    where ms.id = _sheet and private.can_edit_team(e.team_id)
  );
$function$
;
GRANT EXECUTE ON FUNCTION private.can_edit_match_sheet(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.social_idea_owner(text)   (captured 12 Aug 2026)
--
-- The submitter of an image, parsed from its object key. Keys are
-- `<profile_id>/<timestamp>.<ext>`, so the first segment IS the owner — a
-- storage policy sees nothing but the filename. Mirrors photo_player/photo_team.
--
-- ❌ **THIS SAID "NO PINNED search_path, RECORDED RATHER THAN FIXED" UNTIL
-- 13 Aug 2026, AND IT IS NOW PINNED.** The old note put it "in the same
-- position as private.squad_expects_gender: SECURITY INVOKER, IMMUTABLE, and
-- touches no table, so there is nothing for a search_path to redirect."
--
-- ⚠️ EVERY ONE OF THOSE FACTS IS STILL TRUE AND THE CONCLUSION WAS STILL
-- WRONG, WHICH IS THE PART WORTH KEEPING. squad_expects_gender maps a squad
-- name to a gender for a form. THIS function is called from THREE
-- storage.objects RLS POLICIES — it is one of the things deciding who may
-- write into a bucket. A helper in that position gets pinned whatever its
-- volatility markers say, because the cost of being wrong is not a wrong
-- dropdown.
--
-- ⚠️ squad_expects_gender's own exemption is UNCHANGED and still correct. Do
-- not read this as a precedent for pinning it too — read it as the reason the
-- two are now decided differently.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.social_idea_owner(_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(split_part(_name, '/', 1), '')::uuid
$function$
;

GRANT EXECUTE ON FUNCTION private.social_idea_owner(text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.set_social_idea_provenance()   (captured 12 Aug 2026)
--
-- BEFORE INSERT trigger function on public.social_ideas.
--
-- ⚠️ SECURITY DEFINER because it classifies the submitter from `memberships`.
-- A member can read their own row, so INVOKER would mostly work — and "mostly"
-- is the wrong guarantee for the value that decides how the manager triages.
--
-- ⚠️ IT OVERWRITES RATHER THAN DEFAULTS. Assigning only when null would leave
-- a caller able to supply their own from_staff, which is the entire hole this
-- closes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.set_social_idea_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _club uuid;
  _staff boolean;
begin
  select m.club_id,
         bool_or(m.role in ('admin', 'coach', 'manager', 'medic'))
    into _club, _staff
    from memberships m
   where m.profile_id = auth.uid()
     and m.status = 'active'
   group by m.club_id
   limit 1;

  if _club is null then
    raise exception 'no active membership' using errcode = '42501';
  end if;

  new.submitted_by := auth.uid();
  new.club_id      := _club;
  new.from_staff   := coalesce(_staff, false);
  new.status       := 'new';
  new.decided_by   := null;
  new.decided_at   := null;
  new.decision_note := null;

  return new;
end;
$function$
;

-- ── private.scoring_kinds_for_team, 12 Aug 2026 ─────────────────────────────
--
-- ⚠️ THIS IS THE SECOND COPY OF THESE THRESHOLDS INSIDE THIS APP, AND IT IS
-- HERE ON PURPOSE. src/lib/scoring.js carries the same three. The alternative
-- was worse: if the trigger summed every component while scoring.js ignores the
-- kinds a squad may not score, the FORM would show one total and the DATABASE
-- would store another, and both numbers would look plausible.
--
-- ⚠️ WHAT IS DUPLICATED IS THREE THRESHOLDS, NOT FIFTEEN ROWS. Every squad the
-- club fields collapses onto the band number with no exceptions.
--
-- ⚠️ AN UNKNOWN BAND GETS THE FULL SET -- deliberately the OPPOSITE of
-- allowsOwnContact, which fails closed. The harm is asymmetric in opposite
-- directions: there a twelve-year-old's phone number, here a coach who cannot
-- record a drop goal that was genuinely kicked.
--
-- ⚠️ THE TRAILING LETTER IS GENDER. U14B is U14 Boys. The regex mirrors
-- src/lib/ageGroup.js's YOUTH_NAME, including refusing to read U123 as U12.
create or replace function private.scoring_kinds_for_team(p_team_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_override text[];
  v_band int;
begin
  select name, scoring_kinds into v_name, v_override
  from public.teams where id = p_team_id;

  if v_override is not null and array_length(v_override, 1) > 0 then
    return v_override;
  end if;

  v_band := nullif(substring(v_name from '^[Uu]([0-9]{1,2})(?![0-9])'), '')::int;

  if v_band is null then
    return array['tries','conversions','penalties','drops'];
  elsif v_band <= 11 then
    return array['tries'];
  elsif v_band <= 13 then
    return array['tries','conversions'];
  else
    return array['tries','conversions','penalties','drops'];
  end if;
end;
$$;

-- ── private.events_result_from_components, 12 Aug 2026 ──────────────────────
--
-- ⚠️ THE TOTAL IS COMPUTED FROM THE COMPONENTS, NEVER TAKEN FROM THE CLIENT.
-- It stops a typo -- or a tampered request -- producing a score that does not
-- match the tries and kicks recorded beside it. Enforced in the database because
-- RLS is already the boundary and the app is not the only possible writer.
--
-- ⚠️ AND THE GUARD IS PER SIDE. A fixture where our components are recorded and
-- the opposition's are not is the normal case at half-time.
create or replace function private.events_result_from_components()
returns trigger
language plpgsql
as $$
declare
  v_kinds text[];
  v_us int;
  v_them int;
begin
  v_kinds := private.scoring_kinds_for_team(new.team_id);

  if new.tries_us is not null or new.conversions_us is not null
     or new.penalties_us is not null or new.drops_us is not null then
    v_us := 0;
    if 'tries'       = any(v_kinds) then v_us := v_us + coalesce(new.tries_us, 0) * 5; end if;
    if 'conversions' = any(v_kinds) then v_us := v_us + coalesce(new.conversions_us, 0) * 2; end if;
    if 'penalties'   = any(v_kinds) then v_us := v_us + coalesce(new.penalties_us, 0) * 3; end if;
    if 'drops'       = any(v_kinds) then v_us := v_us + coalesce(new.drops_us, 0) * 3; end if;
    new.result_us := v_us;
  end if;

  if new.tries_them is not null or new.conversions_them is not null
     or new.penalties_them is not null or new.drops_them is not null then
    v_them := 0;
    if 'tries'       = any(v_kinds) then v_them := v_them + coalesce(new.tries_them, 0) * 5; end if;
    if 'conversions' = any(v_kinds) then v_them := v_them + coalesce(new.conversions_them, 0) * 2; end if;
    if 'penalties'   = any(v_kinds) then v_them := v_them + coalesce(new.penalties_them, 0) * 3; end if;
    if 'drops'       = any(v_kinds) then v_them := v_them + coalesce(new.drops_them, 0) * 3; end if;
    new.result_them := v_them;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- private.notify_access_request()  — TRIGGER FUNCTION, REACHES OUTSIDE THE DB
-- Added 2026-08-12 by migration `access_request_notify`. Fired by one trigger
-- on public.access_requests — see triggers.sql.
-- prosecdef: true    provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres}   ← the migration revokes from public, anon and
--         authenticated, so nothing else can call it.
--
-- The THIRD function in this project to make an outbound HTTP call, after
-- private.notify_pending_membership and private.notify_pitch_request.
--
-- ⚠️ NOT THE SAME THING AS notify_pending_membership. That fires for a pending
-- MEMBERSHIP — somebody already attached to a squad, waiting to be approved
-- into it. This fires for an ACCESS REQUEST — somebody with NO membership at
-- all, asking to be let in. Two queues, two sections of the Accounts screen.
--
-- ⚠️ WHY THE DATABASE SENDS IT AND NOT THE APP: the person triggering it has no
-- membership, so they read zero rows from every table. They cannot read the
-- admin list and cannot read profiles.email (column-granted, not merely
-- policy-gated), and giving them either would hand an unapproved stranger the
-- club's admin roster.
--
-- ⚠️ IT MUST NEVER FAIL THE WRITE, hence the catch-all. ⚠️ AND THE FAILURE IS
-- THEREFORE QUIET — `raise warning` goes to a log nobody reads. Survivable ONLY
-- because the queue is in-app: the request sits in "Waiting for access" whether
-- or not the mail arrived. The email is a prompt to go and look, never the record.
--
-- ⚠️ REUSES `approval_notify_secret`. The URL is its own entry,
-- `access_request_notify_url`, DERIVED from approval_notify_url in SQL so that
-- the host cannot drift and so nobody ever reads, pastes or types the value.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_access_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'access_request_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_access_request: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('access_request_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_access_request failed for %: %', new.id, sqlerrm;
  return new;
end;
$function$
;

-- Function comment as stored in the database:
--   'Posts an access request id to the notify-access-request edge function when
--    somebody asks for access. Swallows every failure: the in-app waiting list
--    is the record, this is only the prompt.'

REVOKE ALL ON FUNCTION private.notify_access_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_access_request() FROM anon;
REVOKE ALL ON FUNCTION private.notify_access_request() FROM authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  public.photo_backup_list_objects  (13 Aug 2026, 20260813_photo_backup.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Object keys in a storage bucket, for the backup-player-photos edge function.
--
-- ⚠️ SECURITY DEFINER BECAUSE storage.objects IS UNREACHABLE OTHERWISE. It is
-- not readable by any app role and `storage` is not an exposed PostgREST schema,
-- so there is no route to this list from outside the database without a definer
-- function. search_path is pinned per the three-way rule at the top of this
-- file: DEFINER always pins.
--
-- ⚠️ THE REVOKE IS THE LOAD-BEARING HALF, AND SECTION 1 OF grants.sql IS WHY.
-- Supabase's default privileges grant EXECUTE on every new function in `public`
-- to `anon` and `authenticated`. Without the revoke, any signed-in account --
-- and any stranger holding the project URL -- could enumerate every object key
-- in every bucket, and a key is the one thing needed to ask for a signed URL to
-- a child's photograph. This function has no auth.uid() guard of its own,
-- deliberately: the grant is the gate, and it is checked here rather than
-- duplicated in a body that would then have two answers to the same question.
--
-- ⚠️ KEYSET PAGINATION, NOT OFFSET. `name > _after` rides the existing unique
-- index on (bucket_id, name). OFFSET walks every skipped row whatever the index
-- does -- the finding already recorded against .range() in state-of-play.
--
-- ⚠️ THE BUCKET IS A PARAMETER AND THAT IS NOT AN INVITATION. service_role can
-- already read every bucket, so this grants nothing new. It is a parameter so
-- that mirroring `social-ideas` one day is a configuration change rather than a
-- migration -- but WHETHER to mirror it is an open question in the plan, not a
-- flag to flip.
CREATE OR REPLACE FUNCTION public.photo_backup_list_objects(_bucket text, _after text DEFAULT ''::text, _limit integer DEFAULT 1000)
 RETURNS TABLE(name text, size bigint, updated_at timestamp with time zone, etag text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.name,
         (o.metadata->>'size')::bigint,
         o.updated_at,
         o.metadata->>'eTag'
  from storage.objects o
  where o.bucket_id = _bucket
    and o.name > _after
  order by o.name
  limit least(greatest(_limit, 1), 1000)
$function$
;

-- Function comment as stored in the database:
--   'Object keys in a storage bucket, keyset-paginated. service_role only; used
--    by the backup-player-photos edge function.'

-- proacl as captured: {postgres=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.photo_backup_list_objects(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.photo_backup_list_objects(text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.photo_backup_list_objects(text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.photo_backup_list_objects(text, text, integer) TO service_role;


-- ══════════════════════════════════════════════════════════════════════════
--  public.my_squad_staff  (13 Aug 2026, 20260813_my_squad_staff.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Who coaches, manages and doctors the squads the CALLER is attached to. Feeds
-- the Squad contacts block on Home (src/components/SquadStaffCard.jsx).
--
-- ⚠️ SECURITY DEFINER BECAUSE THE ALTERNATIVE IS A POLICY ON `profiles`, AND
-- THAT IS THE WRONG MECHANISM. A parent cannot read another member's profile
-- row: the four SELECT policies are own / club-admin / two pending cases. The
-- obvious fix is a fifth policy — and **RLS authorises ROWS, not COLUMNS**, so
-- any policy wide enough to show a coach's NAME also hands over `email` and
-- `phone` regardless of what the screen draws. A column grant cannot rescue it
-- either: grants apply to the whole `authenticated` role, including the admins
-- who legitimately need those columns on Accounts.
--
-- So the boundary is this function's FIXED COLUMN LIST. `is_super` and
-- `admin_rights` live on `memberships`, which this function reads, and they are
-- unreachable purely because they are not named below. **Adding a column to the
-- RETURNS TABLE is the review.**
-- ⚠️ IT READ "FIXED SEVEN-COLUMN RESULT" UNTIL 15 Aug 2026, AND THE LIST HAD
-- BEEN EIGHT SINCE 13 Aug. A count written beside the thing it counts is a fact
-- with two copies, and this is the copy that rotted. The rule needs no number.
--
-- ⚠️ THE GATE IS can_see_team, NOT is_attached_to_team, AND THE DIFFERENCE IS
-- `status = 'active'`. `event read` deliberately uses the status-blind one
-- because "fixtures are not sensitive, and a pending parent needs them to be
-- worth signing in at all" (20260808_membership_pending_status.sql). A
-- volunteer's personal mobile is not a fixture, so a PENDING member gets an
-- empty card until somebody approves them.
--
-- ⚠️ `m.status = 'active'` APPEARS TWICE OVER AND IS NOT REDUNDANT: once inside
-- can_see_team (about the CALLER) and once in the body (about the PERSON BEING
-- LISTED). A pending coach has been approved by nobody.
--
-- ⚠️ CONTACT DETAILS ARE RETURNED ON A RULING, NOT BY OVERSIGHT. Jay, 13 Aug
-- 2026: "the staff automatically opts in when accepting the position". The plan
-- (claude/plans/2026-08-13-squad-staff-on-home.md) recommended a per-person
-- opt-in toggle and was overruled. Do not narrow this to name-and-title to
-- match the plan document.
--
-- ⚠️ THE `FROM anon` REVOKE IS LOAD-BEARING AND THE HOUSE PATTERN OMITS IT.
-- Nine migrations write `revoke execute … from public; grant … to
-- authenticated;` and that does NOT keep anon out — Supabase's default
-- privileges grant to `anon` BY NAME, exactly as the photo_backup entry above
-- records. Measured 13 Aug 2026: six other public RPCs are anon-executable and
-- are safe only by their bodies. Harness:
-- db/tests/rls-squad-staff-visibility.sql asserts this one is false.
-- ⚠️ `photo_path` ADDED 13 Aug 2026 (20260813_staff_photos.sql), and adding it
-- required a DROP: `create or replace` cannot change a RETURNS TABLE and fails
-- with 42P13. **A dropped function loses every grant and comes back
-- anon-executable** through Supabase's default privileges — see the anon note
-- further up this file. The revokes below are restated for that reason, not out
-- of tidiness.
-- ⚠️ `photo_focus_x` / `photo_focus_y` ADDED 15 Aug 2026
-- (20260815_my_squad_staff_focus.sql), by the same drop-and-recreate and for the
-- same 42P13 reason. WHY THEY HAD TO COME THROUGH HERE AT ALL: the photo
-- positioner shipped in four phases and every one of them stopped at the
-- database, so the Squad contacts card — the surface the whole feature exists to
-- control — drew every face centred whatever anybody chose. There is no
-- client-side route to those columns precisely BECAUSE of the design in the note
-- above, so the fix was necessarily a migration. Measured after applying:
-- `anon` EXECUTE false, `authenticated` true, proacl identical to before the drop.
CREATE OR REPLACE FUNCTION public.my_squad_staff()
 RETURNS TABLE(team_id uuid, membership_id uuid, full_name text, title text, role text, email text, phone text, photo_path text, photo_focus_x smallint, photo_focus_y smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.team_id,
    m.id,
    p.full_name,
    m.title,
    m.role,
    p.email,
    p.phone,
    p.photo_path,
    p.photo_focus_x,
    p.photo_focus_y
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.role in ('coach', 'manager', 'medic')
    and m.status = 'active'
    and m.team_id is not null
    and private.can_see_team(m.team_id);
$function$
;

-- proacl as captured: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.my_squad_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_squad_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_squad_staff() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  private.staff_photo_owner  (13 Aug 2026, 20260813_staff_photos.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- The profile id out of a `staff-photos` object key. The key shape
-- `<profile_id>/<timestamp>.<ext>` IS the security boundary — a storage policy
-- sees only a filename, so the first path segment is the identity.
--
-- ⚠️ NULL RATHER THAN AN ERROR ON A MALFORMED KEY, AND THAT IS THE FAIL-CLOSED
-- CHOICE. A policy comparing NULL to auth.uid() yields NULL, which is not true,
-- so a key in the wrong shape is refused. Raising instead would turn a bad
-- filename into a 500.
--
-- ⚠️ `search_path` IS PINNED, AND THE THREE-WAY TEST ABOVE IS WHY. This is
-- SECURITY INVOKER, IMMUTABLE and touches no table — the same shape as
-- private.squad_expects_gender, which is deliberately NOT pinned. The
-- difference is the one that decided private.social_idea_owner: **this is
-- called from storage RLS policies, so it decides who may write.** A helper in
-- that position gets pinned whatever its volatility markers say.
CREATE OR REPLACE FUNCTION private.staff_photo_owner(_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(split_part(_key, '/', 1), '')::uuid;
$function$
;

REVOKE ALL ON FUNCTION private.staff_photo_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_photo_owner(text) FROM anon;
GRANT EXECUTE ON FUNCTION private.staff_photo_owner(text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  private.can_see_staff_photo  (13 Aug 2026, 20260813_staff_photos.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THIS MIRRORS public.my_squad_staff() AND MUST KEEP MIRRORING IT. The Squad
-- contacts card draws a name and title through that function and the FACE
-- through the `staff photo read` policy built on this. If the two rules drift, a
-- parent sees a photograph of somebody whose name the app will not tell them,
-- or the reverse.
--
-- Three arms, and each is load-bearing:
--   * yourself — so the upload control on /more can show what you just
--     uploaded before anybody else can see it;
--   * an ACTIVE member of a squad that person ACTIVELY staffs — `status =
--     'active'` on BOTH sides, the same as my_squad_staff(). A pending member
--     has been approved by nobody; a pending coach is not yet this squad's
--     coach;
--   * an admin of the club — who can already read every profile row via
--     `profile read club admin`, so this grants nothing new.
CREATE OR REPLACE FUNCTION private.can_see_staff_photo(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    _profile = auth.uid()
    or private.shares_admin_club(_profile)
    or exists (
      select 1
      from memberships staff
      join memberships mine
        on mine.team_id = staff.team_id
       and mine.profile_id = auth.uid()
       and mine.status = 'active'
      where staff.profile_id = _profile
        and staff.status = 'active'
        and staff.role in ('coach', 'manager', 'medic')
        and staff.team_id is not null
    );
$function$
;

REVOKE ALL ON FUNCTION private.can_see_staff_photo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_see_staff_photo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_see_staff_photo(uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  public.set_my_photo  (13 Aug 2026, 20260813_staff_photos.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Records (or clears) the signed-in person's own head-shot key.
--
-- ⚠️ AN RPC RATHER THAN AN UPDATE POLICY, for the reason set_own_player_photo
-- records: **RLS grants access to ROWS, not COLUMNS.** An owner-update policy on
-- public.profiles would let a person write `email` — the mirror of their login
-- address, which an admin reads when approving a stranger — as well as
-- photo_path. This has a hard-coded SET list.
--
-- ⚠️ AND profiles.photo_path IS NOT COLUMN-GRANTED, so a direct
-- `update profiles set photo_path = …` fails looking exactly like an RLS
-- refusal. Deliberate. See tables.sql.
--
-- ⚠️ THE KEY-OWNERSHIP GUARD IS NOT BELT-AND-BRACES. Without it a person could
-- point their profile at somebody ELSE'S object key: the storage policy would
-- still refuse them the write, but my_squad_staff() would hand the key out and
-- the READER's own permission would sign it — one volunteer's face appearing
-- under another's name, with no policy violated anywhere.
CREATE OR REPLACE FUNCTION public.set_my_photo(_photo_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _saved text;
begin
  if _photo_path is not null
     and private.staff_photo_owner(_photo_path) is distinct from auth.uid() then
    raise exception 'A photo key must live under your own id.'
      using errcode = '42501';
  end if;

  update profiles
     set photo_path = _photo_path
   where id = auth.uid()
  returning photo_path into _saved;

  if not found then
    raise exception 'No profile for the signed-in user.' using errcode = 'P0002';
  end if;

  return _saved;
end;
$function$
;

-- proacl as captured: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.set_my_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_photo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_photo(text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.set_announcement_provenance() / private.touch_announcement()
-- public.announcement_stats() / public.announcement_audience(uuid)
--   ADDED 14 Aug 2026 by 20260814_announcements.sql
--
-- Measured live after applying: anon=false, authenticated=true on BOTH public
-- functions (has_function_privilege), so the explicit REVOKE ... FROM anon did
-- its job. See grants.sql for why that revoke is load-bearing.
--
-- !! BOTH PUBLIC FUNCTIONS ARE SECURITY DEFINER, SO RLS IS BYPASSED INSIDE THEM
-- and their own WHERE clause is the only gate on the club's entire notice
-- history: author_id = auth.uid() OR private.is_admin(club_id). db/tests/
-- announcements.sql step 12 is the assertion that an ordinary member gets zero
-- rows from announcement_stats().
--
-- !! announcement_audience RETURNS NAME ONLY -- no email, no phone, no role,
-- no membership id -- and adding a column to its RETURNS TABLE is the only way
-- one could ever appear. That is deliberately NARROWER than my_squad_staff,
-- which DOES return contact details, and the difference is consent: Jay ruled
-- on 13 Aug that staff opt in when they accept the position. A parent opted
-- into nothing of the kind, and "who has not read my notice" is not a reason to
-- hand a coach thirty families' phone numbers.
--
-- !! count(distinct m.profile_id) IS LOAD-BEARING IN BOTH. memberships_unique_grant
-- is (profile_id, club_id, role, team_id, player_id), so a parent with TWO
-- children in one squad holds TWO active membership rows. count(*) reports a
-- squad of 24 as 26. db/tests/announcements.sql injects exactly that fault.
--
-- !! AUDIENCE IS NOT READERSHIP. A club admin can READ a squad notice
-- (can_see_team has an admin arm) and is NOT counted in its audience. The read
-- policy and these functions agree on membership STATUS -- the half that must
-- match -- and differ on the admin arm, which is the half that must not.
--
-- !! AMENDED 14 Aug 2026 by 20260814_announcement_author_not_audience.sql: both
-- public functions now exclude the AUTHOR from the audience
-- (`and m.profile_id <> a.author_id`), in the denominator AND in the numerator.
-- A coach holds a membership on the squad they coach, so a coach posting to
-- their own squad was counted in the audience they were writing to and their
-- own mark-on-render read made it "1 of 25 seen" before anyone else opened the
-- app. Verified live: both bodies carry the clause.
--
-- Bodies are in db/migrations/20260814_announcements.sql as first written and in
-- 20260814_announcement_author_not_audience.sql as they now stand. They are
-- reproduced there in full and are not duplicated here.
-- ---------------------------------------------------------------------


-- ══════════════════════════════════════════════════════════════════════════
--  private.name_match_key  (14 Aug 2026, 20260814_registration_duplicate_guards)
-- ══════════════════════════════════════════════════════════════════════════
--
-- FIRST token + LAST token, case-folded and punctuation-blind. The whole of the
-- duplicate rule, in one place — because two copies of a matching rule are two
-- copies that drift, and because the CLIENT cannot hold a copy at all: a
-- registering parent's membership is pending, so they cannot see the roster
-- they would be comparing against.
--
-- What it does on the shape of the rows that caused it. ⚠️ **The names are
-- INVENTED**; the spellings reproduce the real cases exactly:
--   'Sara Ahmed'        -> 'sara ahmed'
--   'sara noor ahmed'   -> 'sara ahmed'     <-- MATCH, middle ignored
--   'PIETER VOS'        -> 'pieter vos'
--   'Lars Vos-Meijer'   -> 'lars meijer'    <-- correctly NO match
--
-- ⚠️ `[^[:alnum:]]+` RATHER THAN `[^a-z0-9]+`, and this club already has the
-- names that make the difference. The class is unicode-aware, so 'José' stays
-- 'josé' instead of collapsing to 'jos' (which would collide with a genuinely
-- different 'Jos'), and Arabic-script names survive intact. Measured — an
-- earlier draft of this note claimed non-Latin names "reduce to nothing", and
-- they do not.
--
-- NULL comes back only for a name with no alphanumerics at all, and a NULL key
-- never matches anything, so that case fails OPEN. Right direction to fail: a
-- missed duplicate is a tidy-up, a false block is a family that cannot register.
CREATE OR REPLACE FUNCTION private.name_match_key(_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
           when parts is null or cardinality(parts) = 0 then null
           when parts[1] = '' then null
           when cardinality(parts) = 1 then parts[1]
           else parts[1] || ' ' || parts[cardinality(parts)]
         end
  from (
    select nullif(
             regexp_split_to_array(
               btrim(regexp_replace(lower(coalesce(_name, '')), '[^[:alnum:]]+', ' ', 'g')),
               ' '
             ),
             array[]::text[]
           ) as parts
  ) t;
$function$
;

REVOKE ALL ON FUNCTION private.name_match_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.name_match_key(text) FROM anon;
GRANT EXECUTE ON FUNCTION private.name_match_key(text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  public.scan_photo_orphans  (16 Aug 2026, 20260816_photo_orphan_scan.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Counts storage objects that nothing references, into public.photo_orphan_scans.
-- Scheduled nightly by pg_cron as `scan-photo-orphans` at 41 22 * * *.
--
-- ⚠️ IT COUNTS. IT DOES NOT DELETE — Jay's ruling, 16 Aug 2026, taken over an
-- auto-sweeping version on one fact: `staff-photos` is mirrored NOWHERE
-- (backup-player-photos pins SOURCE_BUCKET = 'player-photos'), so a scheduled
-- delete there has no safety net and a bug wrongly clearing `photo_path` would
-- become permanent loss, on a timer, unwatched. **Do not add a delete.**
--
-- ⚠️ AND IT COULD NOT DELETE IF IT WANTED TO. storage.objects carries a
-- `protect_delete` trigger that raises 42501 on any direct SQL DELETE. The
-- `storage.allow_delete_query` escape hatch drops the ROW and leaves the FILE,
-- which is not a delete but losing track of a photograph. RESTORE.md carries
-- the same warning.
--
-- ⚠️ THE `_grace` DEFAULT IS LOAD-BEARING AND MUST MATCH db/tests/photo-orphans.sql.
-- An upload and the row write that records it are NOT atomic — MyPhotoField
-- uploads, then calls set_my_photo — so an object seconds old with nothing
-- pointing at it is a photo mid-save, not an orphan. Measured 16 Aug 2026: only
-- ONE staff object was older than a day, so without the grace period the first
-- run would have reported the bucket as almost entirely orphaned.
--
-- ⚠️ NOT EXECUTABLE BY ANY BROWSER ROLE, and that is the point of the revokes
-- below rather than tidiness: this is SECURITY DEFINER over storage.objects, so
-- EXECUTE for `authenticated` would hand every signed-in parent a census of
-- every photograph in the club. `anon` is revoked BY NAME because Supabase's
-- default privileges grant to it explicitly and a bare `revoke from public`
-- does NOT remove it — the finding of 20260813_revoke_anon_execute.sql.
CREATE OR REPLACE FUNCTION public.scan_photo_orphans(_grace interval DEFAULT '24:00:00'::interval)
 RETURNS SETOF photo_orphan_scans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  scanned public.photo_orphan_scans;
begin
  insert into public.photo_orphan_scans (bucket, objects, referenced, orphaned, missing_files, orphan_keys)
  select 'player-photos',
         count(*),
         count(*) filter (where referenced),
         count(*) filter (where not referenced),
         (select count(*) from public.players p
           where p.photo_path is not null
             and not exists (select 1 from storage.objects o
                              where o.bucket_id = 'player-photos' and o.name = p.photo_path)),
         coalesce((array_agg(name order by created_at) filter (where not referenced))[1:50], '{}')
    from (
      select o.name, o.created_at,
             exists (select 1 from public.players p where p.photo_path = o.name) as referenced
        from storage.objects o
       where o.bucket_id = 'player-photos'
         and o.created_at < now() - _grace
    ) s
  returning * into scanned;
  return next scanned;

  insert into public.photo_orphan_scans (bucket, objects, referenced, orphaned, missing_files, orphan_keys)
  select 'staff-photos',
         count(*),
         count(*) filter (where referenced),
         count(*) filter (where not referenced),
         (select count(*) from public.profiles pr
           where pr.photo_path is not null
             and not exists (select 1 from storage.objects o
                              where o.bucket_id = 'staff-photos' and o.name = pr.photo_path)),
         coalesce((array_agg(name order by created_at) filter (where not referenced))[1:50], '{}')
    from (
      select o.name, o.created_at,
             exists (select 1 from public.profiles pr where pr.photo_path = o.name) as referenced
        from storage.objects o
       where o.bucket_id = 'staff-photos'
         and o.created_at < now() - _grace
    ) s
  returning * into scanned;
  return next scanned;
end;
$function$
;

-- proacl as captured: {postgres=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.scan_photo_orphans(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_photo_orphans(interval) FROM anon;
REVOKE ALL ON FUNCTION public.scan_photo_orphans(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.scan_photo_orphans(interval) TO service_role;
