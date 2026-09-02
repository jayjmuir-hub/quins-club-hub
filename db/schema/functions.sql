-- =====================================================================
-- db/schema/functions.sql
-- CAPTURE of every function in the `public` and `private` schemas of
-- Supabase project lusmshimxdcxpnrktlgz (quins-club-hub).
-- ⚠️ RE-CAPTURED 2026-08-22 — A NAME-LEVEL AUDIT AGAINST pg_proc FOUND
--   29 LIVE FUNCTIONS WITH NO ENTRY IN THIS FILE AT ALL. The mechanism:
--   every re-capture since 11 Aug was SELECTIVE ("re-capture what my
--   migration touched"), so functions added by OTHER work — the push
--   pipeline, the nudges, feedback, photo focus — accumulated silently.
--   All 29 are now captured verbatim from pg_get_functiondef at the
--   section marked "2026-08-22" below, with proacl noted per entry.
--   public.pitch_occupancy (20260822) is also captured from live rather
--   than transcribed from its migration.
--   ⚠️ WHAT THIS RE-CAPTURE DID NOT DO: re-verify the BODIES of entries
--   captured earlier. Each entry's own capture date still governs it.
-- First captured 2026-08-03; re-captured 2026-08-07;
-- ⚠️ RE-CAPTURED 2026-08-09 — 29 functions (was 22).
-- ⚠️ RE-CAPTURED 2026-08-11 — see the block below.
-- ⚠️ RE-CAPTURED 2026-08-18 — public.save_player_parents ADDED
--   (20260818 save_player_parents_atomically), and the four admin gates
--   (20260818 admin_gates_require_active_membership): private.is_admin,
--   is_admin_anywhere, shares_admin_club, can_admin_see_pending each gained
--   `status = 'active'` on the CALLER's membership row. Grants, volatility,
--   search_path and security-definer flags all unchanged — verified from
--   pg_proc after applying, not assumed from CREATE OR REPLACE.
--   AND public.register_my_player's proacl only (20260818
--   revoke_anon_execute_register_my_player): `anon` execute revoked, body
--   unchanged. See the block at its definition for why the grant was never a
--   decision despite two migrations restating it.
-- ⚠️ RE-CAPTURED 2026-08-12 — public.calendar_events_for_token only
--   (20260812 calendar_feed_league_team). Three columns added to its
--   RETURNS TABLE and a LEFT JOIN to league_teams. See the block at its
--   definition for what the DROP did to its grants.
--
-- ⚠️ RE-CAPTURED 2026-08-31 — public.update_document only
--   (20260831_documents_policy_split): the key-prefix invariant guard. Body
--   diffed against pg_get_functiondef and identical; proacl re-read from
--   pg_proc and unchanged by the CREATE OR REPLACE.
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
-- ⚠️ CHANGED 2026-09-01 (calendar_token_fn_all_day): `info_only` and `all_day`
-- added to the signature and select list, via DROP + CREATE — Postgres refuses
-- a return-type change in place. ⚠️ THE DROP DROPS THE ACL, and a fresh
-- function grants EXECUTE to PUBLIC by default, so the migration re-applies
-- the exact measured grants (anon/authenticated/service_role, PUBLIC absent)
-- and ASSERTS them; forgetting that would silently undo
-- calendar_feed_revoke_public_execute with a body that looks right.
-- Also repointed db/tests/tournaments.sql, which carried a stale 17-column
-- COPY of this function as pre-migration scaffolding and went red on the
-- signature change — a harness must not carry a copy of a function body.
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
 RETURNS TABLE(id uuid, type text, title text, opponent text, home boolean, venue text, pitch text, competition text, starts_at timestamp with time zone, ends_at timestamp with time zone, notes text, team_name text, league_team_name text, league_division text, round smallint, time_tbd boolean, competition_type text, info_only boolean, all_day boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type, e.info_only, e.all_day
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
  -- Added 2026-08-29 (calendar_feed_exclude_tournament_games). A tournament's
  -- games are shown inside the tournament, not as their own calendar entries;
  -- src/data/events.js listEvents carries the identical filter for the in-app
  -- schedule. CREATE OR REPLACE (return type unchanged) kept every grant, so no
  -- grant/revoke was repeated.
  and e.tournament_id is null
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
-- public.save_player_parents(uuid, jsonb)          ADDED 18 Aug 2026
-- prosecdef: FALSE   provolatile: v (VOLATILE)    proconfig: search_path=public
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ⚠️ `service_role` IS IN THAT LIST AND WAS NOT REVOKED. The migration revokes
-- PUBLIC and anon; service_role keeps Supabase's default grant, as it does on
-- every other function here. Recorded rather than tidied: service_role bypasses
-- RLS, so revoking it would be a real change to what an edge function could do,
-- and nothing has asked for that. Nothing calls this from one today.
--
-- ⚠️ `SECURITY INVOKER`, WHICH IS UNUSUAL HERE BUT NOT UNIQUE. Measured 18 Aug
-- 2026: `my_calendar_token`, `reset_my_calendar_token` and `set_series_time_from`
-- are invoker too — an earlier draft of this block claimed this was the only
-- one, which was written from impression rather than from pg_proc.
--
-- The choice is deliberate. Most RPCs here are definer-rights with a
-- hand-written guard at the top, because they need to do something the caller
-- may not. This one does exactly what the caller could already do — replace a
-- child's parent rows — in one statement instead of four requests. Left as
-- invoker, the two policies on public.player_parents keep deciding who may
-- write:
--
--     parent edit      ALL  private.can_edit_team(...)
--     parent edit own  ALL  private.is_own_player(player_id)
--
-- A definer version would have had to reimplement both, and a reimplementation
-- of an authorisation rule is a second copy of it. **So this function adds no
-- authorisation surface**, which is why it carries none of the guard paperwork
-- the 15 Aug advisor walk records for its neighbours.
-- ⚠️ IF ANYBODY EVER MAKES IT `SECURITY DEFINER`, IT NEEDS A GUARD THE SAME
-- MINUTE — otherwise any signed-in person could rewrite any child's parents.
-- db/tests/save-player-parents.sql §4 is the assertion that would notice.
--
-- ⚠️ IT NEVER WRITES created_at, invited_at OR profile_id. The last two are the
-- link to a parent's real ACCOUNT, set by invite_parent, and no screen shows
-- them beside the fields a coach edits — so an UPDATE naming every column would
-- silently un-invite a parent whenever somebody fixed a typo in their phone
-- number. §3 of the harness is that assertion.
--
-- ⚠️ THE anon GRANT IS ABSENT ON PURPOSE, unlike register_my_player's. Supabase
-- ships a default privilege that grants EXECUTE to anon on every new function,
-- and `revoke all … from public` does not remove it; the migration revokes anon
-- explicitly. Inert either way here — invoker rights mean anon gains nothing —
-- but the ACLs now say what was meant.
--
-- Body: db/migrations/20260818_save_player_parents_atomically.sql, which
-- carries the full reasoning. Not repeated here.
-- ---------------------------------------------------------------------


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
--
-- ⚠️ `and mine.status = 'active'` ADDED 18 Aug 2026 by
-- 20260818_admin_gates_require_active_membership, with is_admin,
-- is_admin_anywhere and shares_admin_club. One of the FOUR spellings of "is
-- the caller an admin", none of which tested status.
-- ⚠️ THE TEST IS ON `mine` ONLY, DELIBERATELY. The second EXISTS is about the
-- TARGET having no membership rows at all, and an admin must be able to see a
-- person who is waiting — that is the approval queue. Adding a status test
-- there would hide exactly the people this function exists to reveal.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_admin_see_pending(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
           select 1 from memberships mine
           where mine.profile_id = auth.uid()
             and mine.status = 'active'
             and mine.role = 'admin'
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
--
-- ⚠️ RE-CAPTURED 2026-08-29 from pg_get_functiondef — verbatim. The copy here
-- had drifted a long way behind live: it showed only the profile insert
-- (id/full_name/email), while the deployed function — grown by the 25 Aug
-- "signup before confirm" work (claude/decisions/2026-08-25-signup-before-confirm.md)
-- and the 26 Aug volunteer change — also derives first/last/full name, records
-- name_confirmed_at and the signup_intent on the profile, WRITES the
-- access_requests row from the intent, and calls apply_signup_intent once the
-- email is confirmed. The drift was found 29 Aug while adding hold_bare_signup;
-- a migration had updated the live function without this capture being refreshed.
-- The migrations are authoritative; this file is a mirror — trust
-- pg_get_functiondef over it if they ever disagree again.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  intent     jsonb;
  first_n    text;
  last_n     text;
  full_n     text;
  role_claim text;
  team_ids   uuid[];
  first_team uuid;
begin
  intent := new.raw_user_meta_data->'signup_intent';
  first_n := nullif(btrim(coalesce(intent->>'first_name', new.raw_user_meta_data->>'first_name', '')), '');
  last_n  := nullif(btrim(coalesce(intent->>'last_name', new.raw_user_meta_data->>'last_name', '')), '');
  full_n  := nullif(btrim(coalesce(
               new.raw_user_meta_data->>'full_name',
               concat_ws(' ', first_n, last_n)
             )), '');

  insert into public.profiles (
    id, full_name, first_name, last_name, email, email_confirmed_at,
    name_confirmed_at, signup_intent
  )
  values (
    new.id,
    coalesce(full_n, ''),
    first_n,
    last_n,
    new.email,
    new.email_confirmed_at,
    case when first_n is not null then now() else null end,
    intent
  )
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at,
        signup_intent = coalesce(public.profiles.signup_intent, excluded.signup_intent);

  if intent is not null then
    role_claim := nullif(intent->>'claimed_role', '');
    select coalesce(array_agg(x::uuid), '{}')
      into team_ids
      from jsonb_array_elements_text(coalesce(intent->'squad_ids', '[]'::jsonb)) as x;
    first_team := team_ids[1];

    -- 'volunteer' may have no squad — the 26 Aug 2026 change. Everything
    -- else still requires one, matching the INSERT policy above.
    if role_claim is not null
       and (first_team is not null or role_claim = 'volunteer') then
      insert into public.access_requests (
        profile_id, status, requested_role, requested_team_id, requested_team_ids
      )
      values (new.id, 'pending', role_claim, first_team, nullif(team_ids, '{}'))
      on conflict (profile_id) do nothing;
    end if;
  end if;

  if new.email_confirmed_at is not null then
    begin
      perform private.apply_signup_intent(new.id);
    exception when others then
      raise warning 'apply_signup_intent (at signup) failed for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$function$
;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC;


-- ---------------------------------------------------------------------
-- private.hold_bare_signup()  — trigger fn for hold_bare_signup on
--   public.profiles                                  ADDED 2026-08-29
--
-- Pre-dismisses a profile born with no name AND no signup_intent — the
-- unambiguous signature of a signup that skipped the wizard (bot, stale-cache
-- client, or a magic-link/OTP for an unknown email). Keeps junk out of the
-- admin's active list; non-blocking (its only action is a guarded, always-valid
-- insert) and reversible (a later access request flips the row to pending).
-- db/migrations/20260829_hold_bare_signup.sql; trigger in triggers.sql.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.hold_bare_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(btrim(new.full_name), '') = '' and new.signup_intent is null then
    insert into public.access_requests (profile_id, status)
    values (new.id, 'dismissed')
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$function$
;

REVOKE ALL ON FUNCTION private.hold_bare_signup() FROM PUBLIC;


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
--
-- ⚠️ `and m.status = 'active'` ADDED 18 Aug 2026 by
-- 20260818_admin_gates_require_active_membership. The deferral recorded in
-- 20260817_approve_requires_active_membership — and in the note further down
-- this file, which said this function STILL had the omission — taken.
-- ⚠️ IT BACKS 15 POLICIES ACROSS 9 TABLES (announcements, feedback, invites,
-- league_teams, memberships, pitch_requests, pitches, social_ideas, teams),
-- measured the same day. That blast radius is why it waited, and it is the
-- reason to read this line before changing anything here again.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_admin(_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and m.club_id = _club and m.role = 'admin');
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
--
-- ⚠️ `and m.status = 'active'` ADDED 18 Aug 2026 by
-- 20260818_admin_gates_require_active_membership, with is_admin. This one had
-- never been NAMED as carrying the omission — claude/open-items.md and the note
-- below both said "private.is_admin", singular — and it was found by asking the
-- database which functions mention `memberships` without mentioning `status`
-- rather than by grepping for the name already known. It backs access_requests
-- and photo_backup_runs.
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
       and m.status = 'active'
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
-- ⚠️ EDITED 2 Sep 2026 (20260902_player_leavers_left_grants_nothing.sql). The
-- leavers harness (step 12) found this was the only membership predicate on
-- OWN-PLAYER access with no status test at all -- a 'left' membership row
-- (now possible since memberships_status_check widened) passed it just the
-- same as an active one. `and m.status <> 'left'` added -- NOT `= 'active'`,
-- so a pending row still passes, unchanged.
CREATE OR REPLACE FUNCTION private.is_own_player(_player uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid() and m.player_id = _player
      and m.role in ('parent','player')
      and m.status <> 'left');
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
--
-- ⚠️ `and mine.status = 'active'` ADDED 18 Aug 2026 by
-- 20260818_admin_gates_require_active_membership. This function and
-- can_admin_see_pending back `profiles`, so the omission was the one that
-- MATTERED most of the four: a pending admin row could read every member's name
-- and e-mail. Measured under RLS in a rolled-back transaction, before and after
-- — 1 row, then 0, with an active admin still reading 1 as the control.
-- ⚠️ `target` DELIBERATELY HAS NO STATUS TEST. An admin must be able to see a
-- PENDING registrant; that is the approval queue. Only the caller's own row —
-- `mine` — decides whether they are an admin.
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
      and mine.status = 'active'
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
--      → RECORDING IT IS ENOUGH. private.squad_expects_gender was the only
--      function that ever reached this branch: it takes a string, calls
--      lower()/btrim() and the `~` operator, all pg_catalog, and returns a
--      word. There is nothing for a search_path to redirect.
--      ⚠️ PINNED ANYWAY on 30 Aug 2026 by
--      20260830_pin_private_helper_search_path.sql (its argument was the
--      register_my_player call chain, not a flaw in this reasoning), so the
--      branch currently has NO inhabitants and db/tests/search-path.sql's
--      exemption list is EMPTY. The three-way rule itself still stands —
--      the branch is real, merely unoccupied.
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
    -- ⚠️ ADDED 2 Sep 2026 (20260902_player_leavers.sql). A leaver's own row
    -- must not raise a pending approval request for a squad the child no
    -- longer belongs to — see claude/specs/2026-09-02-player-leavers-design.md
    -- §3. This is the re-match being SKIPPED for a leaver, and is not the
    -- same thing as Restore: restore_player is what gives the family their
    -- access back; this only stops a NEW, unwanted request being raised.
    and p.left_at is null
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
-- ⚠️ EDITED 2 Sep 2026 (20260902_player_leavers_left_grants_nothing.sql),
-- the same finding as private.is_own_player above: this was the other of
-- the two membership predicates with no status test at all. `and m.status
-- <> 'left'` added -- a pending row is still let through, only a leaver
-- is excluded.
CREATE OR REPLACE FUNCTION private.is_attached_to_team(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status <> 'left'
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
-- ✅ private.is_admin NO LONGER HAS THE SAME OMISSION — fixed 18 Aug 2026 by
-- 20260818_admin_gates_require_active_membership, along with is_admin_anywhere,
-- shares_admin_club and can_admin_see_pending. This line read "STILL HAS THE
-- SAME OMISSION, deliberately" for one day.
-- ⚠️ AND IT NAMED ONE FUNCTION WHERE THERE WERE FOUR. The other three were not
-- hiding: they were simply never looked for, because the note recorded the name
-- somebody already knew instead of the QUESTION — "which gates ask about role
-- and not status?" A deferral is worth writing down as the question, not as the
-- one instance of it that happened to be found first.
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
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ⚠️ `anon` WAS IN THAT ACL UNTIL 18 Aug 2026, AND REMOVING IT CHANGED NOTHING
-- A REAL CALLER COULD DO. The function's first line refuses a null
-- `auth.uid()`, and a signed-in session always executes as `authenticated`
-- regardless of this grant — only a genuinely anonymous PostgREST call ever
-- runs as `anon`, and that call was always refused one line in. The grant was
-- restated by two migrations that DROP-and-CREATE this function's signature
-- (DROP takes the old ACLs with it), each explaining that it was avoiding a
-- repeat of an 8 Aug outage, not choosing to keep `anon`. An explicit grant in
-- a migration is evidence someone typed it, not evidence someone decided it —
-- see `db/migrations/20260818_revoke_anon_execute_register_my_player.sql` for
-- the full account, including a second document (`db/tests/grants.sql` §3b)
-- that had called this grant deliberate for five days on the same misreading.
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
-- ⚠️ Measured 25 Aug 2026: live proacl also carries EXECUTE to PUBLIC. No
-- migration granted that; same undatable-GRANT class as the 9 Aug proacl
-- findings — recorded as judgement, not attributed.


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
--  private.training_diagram_drill / private.can_write_training_diagram
--  (27 Aug 2026, 20260827_drill_diagram_url.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pitch drawings in the PUBLIC `training-diagrams` bucket. The key shape
-- `<drill_id>/<file>` IS the security boundary — a storage policy sees only
-- a filename, so the first path segment is the drill. Malformed keys return
-- NULL (fail closed), never raise.
--
-- WRITE matches drill manage: admin of the club, or squad staff of a
-- squad-owned drill. The `training` right is a message, not a boundary.
-- NOT LIVE until the migration is applied.
CREATE OR REPLACE FUNCTION private.training_diagram_drill(_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when split_part(_key, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
    else null
  end;
$function$
;

REVOKE ALL ON FUNCTION private.training_diagram_drill(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_diagram_drill(text) FROM anon;
GRANT EXECUTE ON FUNCTION private.training_diagram_drill(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_write_training_diagram(_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.drills d
    where d.id = private.training_diagram_drill(_key)
      and (
        private.is_admin(d.club_id)
        or (d.team_id is not null and private.can_edit_team(d.team_id))
      )
  );
$function$
;

REVOKE ALL ON FUNCTION private.can_write_training_diagram(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_write_training_diagram(text) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_write_training_diagram(text) TO authenticated;


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
    )
    -- 26 Aug 2026, ruling C (20260826_member_contact_card.sql): any active
    -- member may see any staff/admin's photo — the face follows the card.
    or (
      exists (
        select 1 from memberships mine
         where mine.profile_id = auth.uid() and mine.status = 'active'
      )
      and exists (
        select 1 from memberships staff
         where staff.profile_id = _profile and staff.status = 'active'
           and (staff.role in ('coach','manager','medic','admin') or staff.is_super)
      )
    );
$function$
;

REVOKE ALL ON FUNCTION private.can_see_staff_photo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_see_staff_photo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_see_staff_photo(uuid) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
--  public.member_contact_card  (26 Aug 2026, 20260826_member_contact_card.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- The person card's one fetch — and the place the visibility ruling LIVES.
-- Ruling C (claude/plans/2026-08-26-person-card.md, Jay 26 Aug 2026): an
-- active staff or admin role makes your phone + email visible to ANY active
-- member; a parent's contacts go only to the existing manage scopes (super
-- admins, or staff of a squad the parent belongs to). The contact columns
-- are nulled HERE, server-side — the screen never has what it must not show.
CREATE OR REPLACE FUNCTION public.member_contact_card(_profile uuid)
 RETURNS TABLE(profile_id uuid, full_name text, role text, title text, is_super boolean, squads text[], phone text, email text, photo_path text, photo_focus_x smallint, photo_focus_y smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select exists (
      select 1 from memberships m
       where m.profile_id = auth.uid() and m.status = 'active'
    ) as is_member
  ),
  best as (
    select m.role, m.title, m.is_super
      from memberships m
     where m.profile_id = _profile and m.status = 'active'
     order by case when m.is_super then 0
                   when m.role = 'admin' then 1
                   when m.role = 'coach' then 2
                   when m.role = 'manager' then 3
                   when m.role = 'medic' then 4
                   else 5 end
     limit 1
  ),
  entitled as (
    select
      exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and (m.role in ('coach','manager','medic','admin') or m.is_super)
      )
      or private.is_admin_anywhere()
      or exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and m.role = 'parent' and m.team_id is not null
           and private.can_edit_team(m.team_id)
      ) as contacts
  )
  select p.id, p.full_name,
         best.role, best.title, coalesce(best.is_super, false),
         coalesce((select array_agg(distinct t.name order by t.name)
                     from memberships m join teams t on t.id = m.team_id
                    where m.profile_id = _profile and m.status = 'active'
                      and m.team_id is not null), '{}') as squads,
         case when entitled.contacts then p.phone else null end,
         case when entitled.contacts then p.email else null end,
         case when private.can_see_staff_photo(p.id) then p.photo_path else null end,
         p.photo_focus_x, p.photo_focus_y
    from profiles p
   cross join viewer
   cross join entitled
    left join best on true
   where p.id = _profile
     and viewer.is_member;
$function$
;

REVOKE ALL ON FUNCTION public.member_contact_card(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_contact_card(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.member_contact_card(uuid) TO authenticated;


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
-- ⚠️ RE-CAPTURED 2026-08-30 (20260830_name_match_key_accent_blind): the key is
-- now ACCENT-BLIND. A U10 child was registered twice by their two parents, a
-- cedilla apart, and [[:alnum:]] keeps `ç` so the 20260814 key never matched.
-- Diacritics now fold via extensions.unaccent (explicit-dictionary form — the
-- empty search_path makes the bare form throw); non-Latin scripts pass through
-- unchanged, measured. IMMUTABLE kept despite unaccent's formal STABLE-ness:
-- no index depends on this function, all callers are run-time guards.
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
               btrim(regexp_replace(
                 lower(extensions.unaccent('extensions.unaccent', coalesce(_name, ''))),
                 '[^[:alnum:]]+', ' ', 'g')),
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

-- ---------------------------------------------------------------------
-- public.publish_training(uuid, uuid[], date, date, boolean)  (21 Aug 2026)
-- proacl: authenticated, service_role (PUBLIC and anon revoked in the migration)
--
-- ONE function for preview and for real, switched by _preview, so the table
-- the Director confirms is computed by the code that then acts on it.
-- SECURITY DEFINER, and refuses unless private.is_admin(club). ⛔ Selects on
-- type = 'training' within a DATE RANGE in club time — no weekday anywhere.
-- Skips and COUNTS any session with coach_edited_at set.
--
-- ⚠️ THE TEXT BELOW IS AS OF 20260821_publish_training_fit_check — written
-- and APPLIED 21 Aug 2026 (claude/schema-history.md). It adds the
-- per-squad check that the team is in the template's club and fits its
-- contact flag; SECURITY DEFINER bypasses RLS, so nothing else would notice.
-- ---------------------------------------------------------------------
create or replace function public.publish_training(
  _template uuid, _teams uuid[], _from date, _to date, _preview boolean default true)
returns table (team_id uuid, will_write int, skipped_coach_edited int, no_events int)
language plpgsql security definer set search_path to 'public'
as $$
declare
  _club uuid;
  _team uuid;
  _ev record;
  _session uuid;
begin
  select club_id into _club from session_templates where id = _template and is_active;
  if _club is null then
    raise exception 'template not found or retired' using errcode = 'P0002';
  end if;
  if not private.is_admin(_club) then
    raise exception 'not an active admin of this club' using errcode = '42501';
  end if;
  if _to < _from then
    raise exception 'date range is backwards' using errcode = '22007';
  end if;

  foreach _team in array _teams loop
    team_id := _team; will_write := 0; skipped_coach_edited := 0; no_events := 0;

    perform 1 from teams t, session_templates tpl
     where t.id = _team and tpl.id = _template
       and t.club_id = _club
       and (not tpl.requires_contact or t.requires_contact);
    if not found then
      raise exception 'squad % is not in this club or does not fit this template', _team using errcode = '42501';
    end if;

    for _ev in
      select e.id, s.id as session_id, s.coach_edited_at
        from events e
        left join training_sessions s on s.event_id = e.id
       where e.team_id = _team
         and e.type = 'training'
         and (e.starts_at at time zone 'Asia/Dubai')::date between _from and _to
    loop
      if _ev.coach_edited_at is not null then
        skipped_coach_edited := skipped_coach_edited + 1;
        continue;
      end if;
      will_write := will_write + 1;
      if _preview then continue; end if;

      if _ev.session_id is null then
        insert into training_sessions (event_id, template_id)
        values (_ev.id, _template) returning id into _session;
      else
        _session := _ev.session_id;
        update training_sessions set template_id = _template, published_at = now()
         where id = _session;
        delete from training_session_blocks where session_id = _session;
      end if;

      insert into training_session_blocks (session_id, position, drill_id, minutes, coach_note)
      select _session, b.position, b.drill_id, b.minutes, b.coach_note
        from session_template_blocks b where b.template_id = _template;
    end loop;

    if will_write = 0 and skipped_coach_edited = 0 then no_events := 1; end if;
    return next;
  end loop;
end $$;

revoke execute on function public.publish_training(uuid, uuid[], date, date, boolean) from public, anon;
grant  execute on function public.publish_training(uuid, uuid[], date, date, boolean) to authenticated, service_role;


-- (public.pitch_occupancy: captured from live in the 2026-08-22 re-capture
-- section below — the hand-transcribed pre-application block that sat here
-- for a few hours is gone, as its own header demanded.)


-- =====================================================================
-- ⚠️ 2026-08-22 RE-CAPTURE — the 29 functions that were live with no
-- entry in this file (see the header). Captured verbatim from
-- pg_get_functiondef; proacl noted above each. A null proacl means
-- default privileges only (owner + PUBLIC per default ACL behaviour for
-- functions — note `private` is sealed at the SCHEMA level: anon and
-- authenticated hold no USAGE on it, so PUBLIC execute on a private.*
-- function is inert, the same argument can_edit_team's grant records).
-- =====================================================================

-- ---------------------------------------------------------------------
-- private.approval_audience(uuid, uuid, uuid)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.approval_audience(_club uuid, _team uuid, _requester uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct m.profile_id
    from memberships m
   where m.status = 'active'
     and m.profile_id is distinct from _requester
     and (
       (m.club_id = _club and m.is_super)
       or (_team is not null and m.team_id = _team
           and (m.is_head_coach or m.role = 'manager'))
     );
$function$
;

-- ---------------------------------------------------------------------
-- private.guard_last_admin()   (30 Aug 2026 — last_admin_guard, Grok item 8)
-- proacl: null
-- ---------------------------------------------------------------------
-- BEFORE UPDATE OR DELETE on memberships: raises P0001 when the row is the
-- club's last ACTIVE admin and the operation would remove that status.
CREATE OR REPLACE FUNCTION private.guard_last_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    if not exists (
      select 1 from public.memberships m
       where m.club_id = old.club_id
         and m.id <> old.id
         and m.role = 'admin'
         and m.status = 'active'
    ) then
      raise exception 'This is the club''s only active admin. Make someone else an admin first.'
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.audit_membership()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.audit_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor uuid := auth.uid();
  row_now public.memberships;
begin
  row_now := coalesce(new, old);

  if tg_op = 'UPDATE' then
    if new.role = old.role
       and new.status = old.status
       and new.is_super = old.is_super
       and new.admin_rights = old.admin_rights then
      return new;
    end if;
  end if;

  insert into public.membership_audit (
    membership_id, profile_id, club_id, team_id, player_id,
    action, actor_id, actor_kind,
    old_role, new_role, old_status, new_status,
    old_is_super, new_is_super, old_rights, new_rights
  )
  values (
    row_now.id, row_now.profile_id, row_now.club_id, row_now.team_id, row_now.player_id,
    case tg_op when 'INSERT' then 'granted' when 'DELETE' then 'revoked' else 'changed' end,
    actor,
    case when actor is null then 'system' else 'member' end,
    case when tg_op = 'INSERT' then null else old.role end,
    case when tg_op = 'DELETE' then null else new.role end,
    case when tg_op = 'INSERT' then null else old.status end,
    case when tg_op = 'DELETE' then null else new.status end,
    case when tg_op = 'INSERT' then null else old.is_super end,
    case when tg_op = 'DELETE' then null else new.is_super end,
    case when tg_op = 'INSERT' then null else old.admin_rights end,
    case when tg_op = 'DELETE' then null else new.admin_rights end
  );

  return coalesce(new, old);
exception when others then
  raise warning 'audit_membership: % (membership %)', sqlerrm, row_now.id;
  return coalesce(new, old);
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.availability_nudge_candidates(uuid)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.availability_nudge_candidates(_event uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct m.profile_id
    from events e
    join memberships m
      on m.team_id = e.team_id and m.status = 'active'
     and m.role in ('parent', 'player') and m.player_id is not null
   where e.id = _event
     and not exists (select 1 from availability a
                      where a.event_id = e.id and a.player_id = m.player_id)
     and not exists (select 1 from availability_nudges n
                      where n.event_id = e.id and n.profile_id = m.profile_id)
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = m.profile_id and o.category = 'availability');
$function$
;

-- ---------------------------------------------------------------------
-- private.handle_user_email_confirmed()
-- proacl: {postgres=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.handle_user_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
     set email_confirmed_at = new.email_confirmed_at
   where id = new.id;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.may_set_staff_photo(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.may_set_staff_photo(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    _profile is not null
    and (
      _profile = auth.uid()
      or exists (
        select 1 from public.memberships m
        where m.profile_id = _profile
          and (
            (m.club_id is not null and private.is_admin(m.club_id))
            or (m.team_id is not null and private.can_edit_team(m.team_id))
          )
      )
    ),
    false
  );
$function$
;

-- ---------------------------------------------------------------------
-- private.notice_audience(uuid, uuid)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notice_audience(_club uuid, _team uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct m.profile_id
    from memberships m
   where m.status = 'active'
     and m.club_id = _club
     and (_team is null or m.team_id = _team);
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_feedback()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_feedback()
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
    from vault.decrypted_secrets where name = 'feedback_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_feedback: vault secrets missing, no email sent for feedback %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('feedback_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_feedback: % (feedback %)', sqlerrm, new.id;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_feedback_reply_push()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_feedback_reply_push()
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
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_feedback_reply_push: vault secrets missing, no push sent for feedback %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('feedback_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_feedback_reply_push: % (feedback %)', sqlerrm, new.id;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.fixture_push_when(timestamptz, timestamptz, boolean, boolean)
-- private.fixture_push_when(public.events)
-- proacl: null
-- Added 2026-09-01 (fixture_push_all_day_when, then availability_nudge_all_day_when).
--
-- ⚠️ THE "when" LINE OF A FIXTURE PUSH, AND THERE IS EXACTLY ONE
-- IMPLEMENTATION. The scalar form below is it; the public.events form
-- DELEGATES to it. That is not tidiness — TWO copies of this expression is
-- what caused the bug: send_fixture_push and send_availability_nudges each
-- built it inline, so fixing one left "Thu 17 Sep, 00:00" reachable from the
-- other, with no test anywhere that would have said so.
--
-- ⚠️ AN ALL-DAY EVENT GETS A DATE AND NO CLOCK TIME. Its starts_at is
-- club-midnight, a PLACEHOLDER — printing it as 00:00 is the invented value the
-- time_tbd branch was written to avoid. A multi-day one names both days,
-- because a two-day collection announced as one day is its own small lie and
-- the second day is the one a parent would miss.
--
-- ⚠️ coalesce ON BOTH FLAGS. send_availability_nudges passes record columns
-- straight in; a null flag would return NULL, and a null when-line
-- concatenated into the body makes the WHOLE body null — a notification with no
-- text, worse than one with a wrong time.
--
-- Both forms pinned in their introducing migrations. Asserted by
-- db/tests/club-diary-push.sql steps 5-13, including that the two forms agree
-- and that the nudge is STILL match-only after being replaced.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.fixture_push_when(_starts_at timestamp with time zone, _ends_at timestamp with time zone, _all_day boolean, _time_tbd boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select to_char(_starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
      || case
           when coalesce(_all_day, false) and _ends_at is not null
             then ' – ' || to_char(_ends_at at time zone 'Asia/Dubai', 'Dy DD Mon')
           when coalesce(_all_day, false)  then ''
           when coalesce(_time_tbd, false) then ', time TBC'
           else ', ' || to_char(_starts_at at time zone 'Asia/Dubai', 'HH24:MI')
         end;
$function$
;

CREATE OR REPLACE FUNCTION private.fixture_push_when(_event events)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select private.fixture_push_when(_event.starts_at, _event.ends_at, _event.all_day, _event.time_tbd);
$function$
;

-- ---------------------------------------------------------------------
-- private.fixture_push_headline(text, boolean)
-- proacl: null
-- Added 2026-09-01 (fixture_push_diary_wording).
--
-- ⚠️ THE WORDING OF A FIXTURE PUSH, SPLIT OUT SO IT CAN BE TESTED. A Club
-- Diary entry (events.info_only) is NOT a fixture and must never be announced
-- as one — before this, adding a kit collection told the whole squad "New
-- fixture". The decision lives here rather than inside send_fixture_push
-- because that function ends in net.http_post: asserting its behaviour from a
-- harness would send a REAL push to REAL members, and a rollback does not
-- un-send a notification. This one is IMMUTABLE and touches nothing.
--
-- ⚠️ coalesce ON _info_only IS LOAD-BEARING. A null would otherwise return
-- null from the CASE, and a null headline reaches the push body as SQL null —
-- a notification with no title rather than a wrong one.
-- Asserted by db/tests/club-diary-push.sql.
--
-- ⚠️ PINNED search_path, ADDED THE SAME DAY BY A CORRECTIVE MIGRATION
-- (20260901_fixture_push_headline_pin_search_path.sql). It shipped WITHOUT the
-- pin and was briefly the ONLY unpinned function in `private` — 109 functions,
-- 108 pinned — which turned db/tests/search-path.sql RED against production.
-- Pinned rather than exempted: `''` is correct for a CASE over two scalars that
-- resolves nothing, and it keeps that harness's exemption list EMPTY, which is
-- the stronger state.
-- ⚠️ A NEW FUNCTION IS A NEW OBLIGATION TO AN EXISTING HARNESS. Run the FULL
-- `npm run db:check`, not just your own new file.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.fixture_push_headline(_kind text, _info_only boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when coalesce(_info_only, false) then
           case _kind
             when 'added'     then 'New in the club diary'
             when 'changed'   then 'Diary entry changed'
             when 'cancelled' then 'Diary entry cancelled'
           end
         else
           case _kind
             when 'added'     then 'New fixture'
             when 'changed'   then 'Fixture changed'
             when 'cancelled' then 'Fixture cancelled'
           end
         end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_fixture_added()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_fixture_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.events;
begin
  if (select count(*) from inserted) <> 1 then return null; end if;
  select * into e from inserted;
  if e.series_id is not null then return null; end if;
  perform private.send_fixture_push(
    e.club_id, e.team_id, auth.uid(),
    private.fixture_push_headline('added', e.info_only), e);
  return null;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_fixture_cancelled()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_fixture_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.events;
begin
  if (select count(*) from deleted) <> 1 then return null; end if;
  select * into e from deleted;
  perform private.send_fixture_push(
    e.club_id, e.team_id, auth.uid(),
    private.fixture_push_headline('cancelled', e.info_only), e);
  return null;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_fixture_changed()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_fixture_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.events; n public.events;
begin
  if (select count(*) from updated_new) <> 1 then return null; end if;
  select * into n from updated_new;
  select * into o from updated_old;
  if o.starts_at is distinct from n.starts_at
     or o.time_tbd is distinct from n.time_tbd
     or o.venue    is distinct from n.venue
     or o.pitch    is distinct from n.pitch
     or o.opponent is distinct from n.opponent
     or o.home     is distinct from n.home
     or o.team_id  is distinct from n.team_id
  then
    perform private.send_fixture_push(
      n.club_id, n.team_id, auth.uid(),
      private.fixture_push_headline('changed', n.info_only), n);
  end if;
  return null;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_invite()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_invite()
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
    from vault.decrypted_secrets where name = 'invite_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_invite: vault secrets missing, no email sent for invite %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('invite_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_invite: % (invite %)', sqlerrm, new.id;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_notice_push()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_notice_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
  lead     record;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_notice_push: vault secrets missing, no push sent';
    return null;
  end if;

  -- ⚠️ array_agg(order by) AND NOT min(id): THERE IS NO min(uuid) IN POSTGRES.
  -- The first draft used min() and failed with "function min(uuid) does not
  -- exist", caught by running this inside a rolled-back transaction first.
  for lead in
    select (array_agg(a.id order by a.id))[1] as id
      from inserted a
     where a.expires_at is null or a.expires_at > now()
     group by coalesce(a.group_id, a.id)
  loop
    begin
      perform net.http_post(
        url     := endpoint,
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-approval-secret', secret),
        body    := jsonb_build_object('announcement_id', lead.id));
    exception when others then
      raise warning 'notify_notice_push: % (notice %)', sqlerrm, lead.id;
    end;
  end loop;

  return null;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_pending_membership_push()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_pending_membership_push()
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
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pending_membership_push: vault secrets missing, no push sent for membership %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('approval_membership_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_pending_membership_push: % (membership %)', sqlerrm, new.id;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.send_availability_nudges()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_availability_nudges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text; secret text; ev record; v_batch uuid;
  n_people int; n_sent int := 0; squad text; detail text; whenish text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_availability_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  for ev in
    select e.*, t.name as team_name
      from events e join teams t on t.id = e.team_id
     where e.type = 'match'
       and e.starts_at > now()
       and e.starts_at <= now() + interval '48 hours'
  loop
    v_batch := gen_random_uuid();

    insert into availability_nudges (event_id, profile_id, batch_id)
    select ev.id, c.profile_id, v_batch
      from private.availability_nudge_candidates(ev.id) as c(profile_id)
    on conflict (event_id, profile_id) do nothing;

    get diagnostics n_people = row_count;
    if n_people = 0 then continue; end if;

    squad   := ev.team_name;
    whenish := private.fixture_push_when(ev.starts_at, ev.ends_at, ev.all_day, ev.time_tbd);
    detail  := coalesce(
      case when ev.opponent is not null then 'v ' || ev.opponent end,
      nullif(ev.title, ''), 'Match');

    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-approval-secret', secret),
      body    := jsonb_build_object('availability_nudge', jsonb_build_object(
                   'event_id', ev.id,
                   'batch_id', v_batch,
                   'title', 'Availability needed' || coalesce(' — ' || squad, ''),
                   'body',  detail || ' · ' || whenish,
                   'path',  '/schedule',
                   'tag',   'availability-' || ev.id)));

    n_sent := n_sent + n_people;
  end loop;

  return n_sent;
exception when others then
  raise warning 'send_availability_nudges: %', sqlerrm;
  return n_sent;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.send_fixture_push(uuid, uuid, uuid, text, events)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_fixture_push(_club uuid, _team uuid, _actor uuid, _headline text, _event events)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare endpoint text; secret text; squad text; detail text; whenish text; outbox uuid;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_fixture_push: vault secrets missing, no push sent';
    return;
  end if;

  select t.name into squad from teams t where t.id = _team;

  whenish := private.fixture_push_when(_event);

  detail := coalesce(
    case when _event.type = 'match' and _event.opponent is not null then 'v ' || _event.opponent end,
    nullif(_event.title, ''), initcap(_event.type));

  -- ⚠️ Copy via the OUTBOX since 30 Aug 2026 (20260830_push_hardening, item
  -- 11): the HTTP body carries only the outbox id; push-send renders from the
  -- row and consumes it. Note the declare list grew `outbox uuid`.
  insert into public.push_outbox (club_id, team_id, actor_id, category, title, body, path, tag)
  values (_club, _team, _actor, 'fixture',
          _headline || coalesce(' — ' || squad, ''),
          detail || ' · ' || whenish,
          '/schedule',
          'fixture-' || _event.id)
  returning id into outbox;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('squad_push', jsonb_build_object('outbox_id', outbox)));
exception when others then
  raise warning 'send_fixture_push: %', sqlerrm;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.send_signup_nudges(boolean)
-- proacl: {postgres=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_signup_nudges(_dry boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
  people   jsonb;
  n        int := 0;
  total    int := 0;
  step     int;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'signup_nudge_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if not _dry and (endpoint is null or secret is null) then
    raise warning 'send_signup_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  foreach step in array array[1, 2] loop
    -- ⚠️ IDS ONLY since 30 Aug 2026 (20260830_push_hardening, item 10):
    -- notify-unfinished-signup loads email/first_name by id and caps the
    -- batch; the body never carries an address.
    select coalesce(jsonb_agg(jsonb_build_object(
             'profile_id', c.profile_id, 'nudge_no', step)), '[]'::jsonb),
           count(*)
      into people, n
      from private.unfinished_signup_candidates(step) as c;

    if n = 0 then
      continue;
    end if;

    total := total + n;
    if _dry then
      continue;
    end if;

    insert into public.signup_nudges (profile_id, nudge_no)
    select c.profile_id, step
      from private.unfinished_signup_candidates(step) as c
    on conflict (profile_id, nudge_no) do nothing;

    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-approval-secret', secret),
      body    := jsonb_build_object('people', people));
  end loop;

  return total;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.stamp_feedback()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.stamp_feedback()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  _club uuid;
begin
  select m.club_id into _club
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.status = 'active'
   order by m.created_at
   limit 1;

  if _club is null then
    raise exception 'no active membership: cannot file feedback'
      using errcode = '42501';
  end if;

  new.club_id      := _club;
  new.submitted_by := auth.uid();
  new.status       := 'new';
  new.handled_by   := null;
  new.handled_at   := null;
  new.created_at   := now();

  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.touch_lineup()
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.touch_lineup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.unfinished_signup_candidates(integer)
-- proacl: {postgres=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.unfinished_signup_candidates(_nudge_no integer)
 RETURNS TABLE(profile_id uuid, email text, first_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(p.first_name), ''), '')::text
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email_confirmed_at is not null
     and u.email is not null
     and u.created_at < now() - case when _nudge_no = 1
                                     then interval '24 hours'
                                     else interval '7 days' end
     and not exists (select 1 from public.memberships m where m.profile_id = u.id)
     and not exists (
       select 1 from public.access_requests ar
        where ar.profile_id = u.id
          and (ar.requested_role = 'volunteer' or ar.status = 'dismissed'))
     and not exists (
       select 1 from public.signup_nudges sn
        where sn.profile_id = u.id and sn.nudge_no = _nudge_no)
     -- ⚠️ THE SECOND NEVER ARRIVES WITHOUT THE FIRST, *AND NOT IN THE SAME RUN
     -- AS IT*. The sent_at test is the whole of this migration.
     and (_nudge_no = 1
          or exists (select 1 from public.signup_nudges sn
                      where sn.profile_id = u.id
                        and sn.nudge_no = 1
                        and sn.sent_at < now() - interval '6 days'));
$function$
;

-- ---------------------------------------------------------------------
-- public.approval_push_subscriptions(uuid)
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approval_push_subscriptions(_membership uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from memberships req
    cross join lateral
      private.approval_audience(req.club_id, req.team_id, req.profile_id) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where req.id = _membership
     and req.status = 'pending'
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = aud.profile_id
          and o.category = 'approval');
$function$
;

-- ---------------------------------------------------------------------
-- public.availability_push_subscriptions(uuid, uuid)
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.availability_push_subscriptions(_event uuid, _batch uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from availability_nudges n
    join push_subscriptions s on s.profile_id = n.profile_id
   where n.event_id = _event and n.batch_id = _batch;
$function$
;

-- ---------------------------------------------------------------------
-- public.get_push_vapid_private_key()
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- ⚠️ A VAULT READ BEHIND A FUNCTION: service_role only. If this ever
-- gains an authenticated grant, every member can mint club push traffic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_push_vapid_private_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private_key';
$function$
;

-- ---------------------------------------------------------------------
-- public.link_my_parent_rows()
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_my_parent_rows()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_email text;
  confirmed_at timestamptz;
  linked       integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null or confirmed_at is null then
    return 0;
  end if;

  update public.player_parents pp
     set profile_id = auth.uid()
   where pp.profile_id is null
     and lower(btrim(pp.email)) = lower(btrim(caller_email));

  get diagnostics linked = row_count;
  return linked;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.notice_push_subscriptions(uuid)
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notice_push_subscriptions(_announcement uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with asked as (
    select * from announcements where id = _announcement
  ),
  siblings as (
    select an.*
      from announcements an
      join asked a
        on (a.group_id is not null and an.group_id = a.group_id)
        or (a.group_id is null and an.id = a.id)
  ),
  people as (
    select distinct aud.profile_id
      from siblings s
      cross join lateral private.notice_audience(s.club_id, s.team_id) as aud(profile_id)
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and (a.expires_at is null or a.expires_at > now())
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = p.profile_id and o.category = 'notice');
$function$
;

-- ---------------------------------------------------------------------
-- public.set_my_photo_focus(smallint, smallint)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_photo_focus(_focus_x smallint, _focus_y smallint)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  update public.profiles
     set photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = auth.uid()
  returning * into updated;

  if not found then
    raise exception 'No profile for the signed-in user.' using errcode = 'P0002';
  end if;

  return updated;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.set_own_player_photo_focus(uuid, smallint, smallint)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_player_photo_focus(_player uuid, _focus_x smallint, _focus_y smallint)
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

  update public.players
     set photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = _player
  returning * into updated;

  return updated;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.set_staff_photo(uuid, text, smallint, smallint)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_photo(_profile uuid, _photo_path text, _focus_x smallint DEFAULT NULL::smallint, _focus_y smallint DEFAULT NULL::smallint)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.profiles;
begin
  if not private.may_set_staff_photo(_profile) then
    raise exception 'Only a club admin can set that person''s photo.'
      using errcode = '42501';
  end if;

  if _photo_path is not null
     and private.staff_photo_owner(_photo_path) is distinct from _profile then
    raise exception 'A photo key must live under that person''s id.'
      using errcode = '42501';
  end if;

  update public.profiles
     set photo_path = _photo_path,
         photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = _profile
  returning * into updated;

  if not found then
    raise exception 'No such profile.' using errcode = 'P0002';
  end if;

  return updated;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.squad_push_subscriptions(uuid, uuid, uuid, text)
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.squad_push_subscriptions(_club uuid, _team uuid, _actor uuid, _category text)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from private.notice_audience(_club, _team) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where (_actor is null or aud.profile_id <> _actor)
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = aud.profile_id and o.category = _category);
$function$
;

-- ---------------------------------------------------------------------
-- private.channel_announce_only(_team uuid)   (23 Aug 2026 — squad chat)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ⚠️ authenticated's EXECUTE arrived in a SECOND apply (squad_chat_helper_execute):
-- the first revoked it and every insert failed 42501. A policy calls its
-- helpers as the calling role.
-- Absent channel_settings row = announce-only ON.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.channel_announce_only(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select announce_only from channel_settings where team_id = _team), true);
$function$
;

-- ---------------------------------------------------------------------
-- private.can_reply_to(_parent uuid)   (23 Aug 2026 — squad chat)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ⚠️ Same second-apply note as channel_announce_only above.
-- SECURITY DEFINER so "message create" can look at the parent without the policy recursing into its own table.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_reply_to(_parent uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from messages p
     where p.id = _parent
       and p.parent_id is null
       and p.deleted_at is null
       and case p.channel
         when 'squad' then
           case when p.team_id is null then exists (
                  select 1 from memberships m
                   where m.profile_id = (select auth.uid())
                     and m.club_id = p.club_id and m.status = 'active')
                else private.can_see_team(p.team_id) end
         when 'staff' then private.can_edit_team(p.team_id)
         -- 20260830_role_channels: replies reach role channels via the
         -- membership helper; a dm can never be a parent (refused upstream).
         when 'dm' then false
         else private.in_role_channel(p.channel, p.club_id)
       end);
$function$
;

-- ---------------------------------------------------------------------
-- private.set_message_provenance()   (23 Aug 2026 — squad chat)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- ⚠️ REPLACED by 20260823_squad_chat_phase2 (fixture threads, mentions) — md5 re-verified.
-- proacl: null
-- Stamps club/author/role/title; a reply inherits team/channel/event from its parent; replies are one level deep.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260831_group_chat_mentions (a group keeps member mentions; 1:1 DMs still zeroed) — pg_get_functiondef from live, 31 Aug 2026.
CREATE OR REPLACE FUNCTION private.set_message_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  parent public.messages;
  ev public.events;
  conv public.conversations;
begin
  new.author_id := auth.uid();
  if new.author_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if new.parent_id is not null then
    select * into parent from messages where id = new.parent_id;
    if parent.id is null then
      raise exception 'no such message to reply to' using errcode = 'P0002';
    end if;
    if parent.parent_id is not null then
      raise exception 'replies are one level deep' using errcode = '23514';
    end if;
    if parent.deleted_at is not null then
      raise exception 'that message was removed' using errcode = '23514';
    end if;
    if parent.channel = 'dm' then
      raise exception 'a direct message has no threads' using errcode = '23514';
    end if;
    new.team_id  := parent.team_id;
    new.channel  := parent.channel;
    new.event_id := parent.event_id;
    new.conversation_id := null;
    new.pinned   := false;
  elsif new.conversation_id is not null then
    -- The conversation decides everything else. For a DM the pair rule is
    -- re-checked on EVERY message; for a group, membership is the whole rule
    -- (24 Aug ruling).
    select * into conv from conversations where id = new.conversation_id;
    if conv.id is null then
      raise exception 'no such conversation' using errcode = 'P0002';
    end if;
    if conv.kind = 'group' then
      if not exists (select 1 from conversation_members gm
                      where gm.conversation_id = conv.id
                        and gm.profile_id = new.author_id) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
    else
      if new.author_id not in (conv.profile_a, conv.profile_b) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
      if not private.can_dm(case when conv.profile_a = new.author_id then conv.profile_b else conv.profile_a end) then
        raise exception 'you cannot message this person' using errcode = '42501';
      end if;
    end if;
    new.channel  := 'dm';
    new.team_id  := null;
    new.event_id := null;
    new.pinned   := false;
    -- GROUP MENTIONS (31 Aug 2026): a group's mentions survive to the
    -- keep-filter below; a 1:1 DM's are still zeroed here.
    if conv.kind <> 'group' then
      new.mentions := '{}';
    end if;
    update conversations set last_at = now() where id = conv.id;
  elsif new.event_id is not null then
    select * into ev from events where id = new.event_id;
    if ev.id is null then
      raise exception 'no such fixture' using errcode = 'P0002';
    end if;
    if new.team_id is null then
      new.team_id := ev.team_id;
    elsif new.team_id is distinct from ev.team_id then
      raise exception 'that fixture belongs to another squad' using errcode = '23514';
    end if;
  end if;

  if new.channel = 'staff' and new.team_id is null then
    raise exception 'a staff channel belongs to a squad' using errcode = '23514';
  end if;

  -- ROLE CHANNELS: the author's badge comes from their best role ANYWHERE in
  -- the club — a head coach posting in Club Head Coaches has only a
  -- team-scoped coach row, which the (team_id = new.team_id) arm below would
  -- miss for a team-less message.
  select m.role, m.title into new.author_role, new.author_title
    from memberships m
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff'))
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            m.team_id nulls last
   limit 1;

  new.club_id := coalesce(
    conv.club_id,
    (select club_id from teams where id = new.team_id),
    (select m.club_id from memberships m
      where m.profile_id = new.author_id and m.status = 'active'
      order by m.created_at limit 1));
  if new.club_id is null then
    raise exception 'no club for this message' using errcode = '23502';
  end if;

  if coalesce(array_length(new.mentions, 1), 0) > 0 then
    select coalesce(array_agg(distinct m), '{}') into new.mentions
      from unnest(new.mentions) as m
     where m <> new.author_id
       and m in (
         select profile_id from private.notice_audience(new.club_id, new.team_id) as aud(profile_id)
          where new.channel = 'squad'
         union
         select profile_id from private.staff_audience(new.team_id) where new.channel = 'staff'
         -- ROLE CHANNELS: the audience is the derived membership.
         union
         select rca.profile_id from private.role_channel_audience(new.channel, new.club_id) rca
          where new.channel in ('headcoaches','managers','medics','welfare','clubstaff')
         -- GROUP MENTIONS (31 Aug 2026): a group's audience is its members.
         union
         select gm.profile_id from conversation_members gm
          where new.conversation_id is not null
            and gm.conversation_id = new.conversation_id);
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.touch_message()   (23 Aug 2026 — squad chat)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- ⚠️ REPLACED by 20260823_squad_chat_phase2 (fixture threads, mentions) — md5 re-verified.
-- proacl: null
-- Freezes every column but body/pinned/deleted_at; soft delete blanks the body to "(removed)".
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260824_chat_list (the Chats list; delete a message / a chat).
-- md5 85583086af08f80c49622213bc5baf0c from a rolled-back apply; re-verify after the real one.
CREATE OR REPLACE FUNCTION private.touch_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.club_id    := old.club_id;
  new.team_id    := old.team_id;
  new.channel    := old.channel;
  new.parent_id  := old.parent_id;
  new.event_id   := old.event_id;
  new.conversation_id := old.conversation_id;
  new.author_id  := old.author_id;
  new.author_role  := old.author_role;
  new.author_title := old.author_title;
  new.mentions   := old.mentions;
  new.created_at := old.created_at;

  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '(removed)';
    new.pinned := false;
  elsif old.deleted_at is not null then
    new.body := old.body;
    new.deleted_at := old.deleted_at;
    new.pinned := false;
  elsif new.body is distinct from old.body then
    -- Only the author edits words, and only for 15 minutes (24 Aug 2026:
    -- the limit used to sit in the policy, which also blocked a late
    -- delete). An admin reviewing a DM may remove; rewriting is not a review.
    if auth.uid() <> old.author_id then
      raise exception 'only the author can edit a message' using errcode = '42501';
    end if;
    if old.created_at < now() - interval '15 minutes' then
      raise exception 'a message can be edited for 15 minutes' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.notify_message_push()   (23 Aug 2026 — squad chat)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- ⚠️ REPLACED by 20260823_squad_chat_phase2 (fixture threads, mentions) — md5 re-verified.
-- proacl: null
-- Fires on a STAFF top-level post only; queues {message_id} to push-send via net.http_post.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_message_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
  fires boolean;
begin
  fires := new.channel = 'dm'
    or (new.channel = 'staff' and new.parent_id is null)
    or (new.channel = 'squad' and new.parent_id is null
        and ((new.team_id is not null and new.author_role in ('admin','coach','manager','medic'))
             or (new.team_id is null and new.author_role = 'admin')))
    or coalesce(array_length(new.mentions, 1), 0) > 0;
  if not fires then return null; end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'notify_message_push: vault secrets missing, no push sent';
    return null;
  end if;

  begin
    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
      body    := jsonb_build_object('message_id', new.id));
  exception when others then
    raise warning 'notify_message_push: % (message %)', sqlerrm, new.id;
  end;
  return null;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.message_read_stats(_team uuid)   (23 Aug 2026 — squad chat)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Staff only — returns no rows to anybody else. Reads per post and the audience size.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.message_read_stats(_team uuid)
 RETURNS TABLE(message_id uuid, reads bigint, audience bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id,
         (select count(*) from message_reads r where r.message_id = m.id),
         (select count(*) from private.notice_audience(m.club_id, m.team_id))
    from messages m
   where m.team_id = _team and m.parent_id is null and m.deleted_at is null
     and private.can_edit_team(_team);
$function$
;

-- ---------------------------------------------------------------------
-- public.message_push_subscriptions(_message uuid)   (23 Aug 2026 — squad chat)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- ⚠️ REPLACED by 20260823_squad_chat_phase2 (fixture threads, mentions) — md5 re-verified.
-- proacl: {postgres=X/postgres,service_role=X/postgres}
-- The audience for one message: squad (or club) minus the author minus squad_chat opt-outs. service_role only — push-send calls it.
-- md5 verified against a rolled-back apply of 20260823_squad_chat.sql;
-- re-verify after the real apply.
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260831_group_mentions_no_punch_through (mentions arm excludes dm — the opt-out leak the harness caught) — pg_get_functiondef from live, 31 Aug 2026.
CREATE OR REPLACE FUNCTION public.message_push_subscriptions(_message uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with asked as (select * from messages where id = _message),
  staff_post as (
    select a.* from asked a
     where a.parent_id is null and a.channel = 'squad'
       and ((a.team_id is not null and a.author_role in ('admin','coach','manager','medic'))
            or (a.team_id is null and a.author_role = 'admin'))
  ),
  people as (
    select aud.profile_id, 'squad_chat'::text as category
      from staff_post a
      cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    union
    -- mentions buzz in the CHANNELS; a dm/group mention adds nothing here —
    -- the group arm below already reaches every member, opt-out respected.
    select m, 'squad_chat' from asked a, unnest(a.mentions) as m
     where a.channel <> 'dm'
    union
    select s.profile_id, 'squad_chat'
      from asked a cross join lateral private.staff_audience(a.team_id) s
     where a.channel = 'staff' and a.parent_id is null
    union
    -- a DM reaches the other side
    select case when c.profile_a = a.author_id then c.profile_b else c.profile_a end, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
     where a.channel = 'dm' and c.kind = 'dm'
    union
    -- a group message reaches every other member
    select gm.profile_id, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
      join conversation_members gm on gm.conversation_id = c.id
     where a.channel = 'dm' and c.kind = 'group'
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and a.deleted_at is null
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = p.profile_id and o.category = p.category);
$function$
;

-- ---------------------------------------------------------------------
-- public.chat_mentionables(_team uuid, _channel text DEFAULT 'squad'::text)
-- ⚠️ REPLACED by 20260823_squad_chat_phase3 (staff channel, DMs) — md5 re-verified from live.
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Who can be @mentioned in a channel: the audience, with best role, minus the
-- caller; rows only for somebody who can see the channel. service_role execute
-- via default privileges. md5 verified against a rolled-back apply.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_mentionables(_team uuid, _channel text DEFAULT 'squad'::text)
 RETURNS TABLE(profile_id uuid, full_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (
    select coalesce((select t.club_id from teams t where t.id = _team),
                    (select m.club_id from memberships m, me
                      where m.profile_id = me.id and m.status = 'active'
                      order by m.created_at limit 1)) as id
  ),
  allowed as (
    select case
      when _channel = 'staff' then _team is not null and private.can_edit_team(_team)
      when _team is null then exists (select 1 from memberships m, me, club
                    where m.profile_id = me.id and m.club_id = club.id and m.status = 'active')
      else private.can_see_team(_team) end as ok
  ),
  aud as (
    select profile_id from private.notice_audience((select id from club), _team) as a(profile_id) where _channel = 'squad'
    union
    select profile_id from private.staff_audience(_team) where _channel = 'staff'
  )
  select aud.profile_id, p.full_name,
         (select m.role from memberships m
           where m.profile_id = aud.profile_id and m.status = 'active'
             and (m.team_id = _team or m.team_id is null)
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end
           limit 1) as role
    from allowed
    cross join aud
    join profiles p on p.id = aud.profile_id
   where allowed.ok
     and aud.profile_id <> (select id from me)
   order by p.full_name;
$function$
;

-- ---------------------------------------------------------------------
-- SQUAD CHAT PHASE 3 (23 Aug 2026) — db/migrations/20260823_squad_chat_phase3.sql
-- Captured from pg_get_functiondef on LIVE after the apply; every md5 matched
-- the file. private.can_dm is THE rule for who may message whom; see the
-- migration header. Any club admin can read a DM (Jay's ruling).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- private.team_age_band(_team uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.team_age_band(_team uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when t.is_senior then 99
    else coalesce((regexp_match(t.name, '^U(\d{1,2})'))[1]::int, 0)
  end
  from teams t where t.id = _team;
$function$
;

-- ---------------------------------------------------------------------
-- private.is_minor_profile(_profile uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_minor_profile(_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from memberships m
      left join player_private pp on pp.player_id = m.player_id
     where m.profile_id = _profile
       and m.role = 'player'
       and m.status = 'active'
       and (pp.date_of_birth is null
            or pp.date_of_birth > (current_date - interval '18 years')));
$function$
;

-- ---------------------------------------------------------------------
-- private.is_guardian_of(_guardian uuid, _minor uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_guardian_of(_guardian uuid, _minor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from memberships mp
      join memberships mg on mg.player_id = mp.player_id
     where mp.profile_id = _minor and mp.role = 'player' and mp.status = 'active'
       and mg.profile_id = _guardian and mg.role = 'parent' and mg.status = 'active');
$function$
;

-- ---------------------------------------------------------------------
-- private.can_dm(_other uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_dm(_other uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  club uuid;
  me_minor boolean;
  other_minor boolean;
begin
  if me is null or _other is null or me = _other then return false; end if;

  -- 1. both active in the same club
  select m.club_id into club from memberships m
   where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  if club is null then return false; end if;
  if not exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club and m.status = 'active') then
    return false;
  end if;

  -- 4. blocks (checked early: a block beats every other arm)
  if exists (select 1 from dm_blocks b where (b.blocker_id = me and b.blocked_id = _other)
                                          or (b.blocker_id = _other and b.blocked_id = me)) then
    return false;
  end if;

  me_minor := private.is_minor_profile(me);
  other_minor := private.is_minor_profile(_other);

  -- 3. minors
  if me_minor and other_minor then return false; end if;
  if me_minor or other_minor then
    declare
      minor uuid := case when me_minor then me else _other end;
      adult uuid := case when me_minor then _other else me end;
    begin
      if private.is_guardian_of(adult, minor) then return true; end if;
      -- coach or manager of a U16+ squad the minor plays in, with a guardian's opt-in
      return exists (
        select 1
          from memberships pm                       -- the minor's player row
          join players p on p.id = pm.player_id
          join player_private pp on pp.player_id = p.id
          join memberships sm on sm.team_id = p.team_id and sm.profile_id = adult
                              and sm.role in ('coach','manager') and sm.status = 'active'
         where pm.profile_id = minor and pm.role = 'player' and pm.status = 'active'
           and pp.staff_dm_opt_in
           and private.team_age_band(p.team_id) >= 16);
    end;
  end if;

  -- 2. adults: a shared audience
  if private.is_admin(club) then return true; end if;
  if exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club
              and m.status = 'active' and m.role = 'admin') then return true; end if;
  return exists (
    select 1
      from memberships a
      join memberships b on b.team_id = a.team_id
     where a.profile_id = me and a.status = 'active' and a.team_id is not null
       and b.profile_id = _other and b.status = 'active');
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.in_conversation(_conversation uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.in_conversation(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from conversations c
                  where c.id = _conversation and (select auth.uid()) in (c.profile_a, c.profile_b));
$function$
;

-- ---------------------------------------------------------------------
-- private.conversation_other(_conversation uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.conversation_other(_conversation uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when c.profile_a = (select auth.uid()) then c.profile_b else c.profile_a end
    from conversations c where c.id = _conversation;
$function$
;

-- ---------------------------------------------------------------------
-- private.staff_audience(_team uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.staff_audience(_team uuid)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct m.profile_id from memberships m
   where m.team_id = _team and m.status = 'active' and m.role in ('coach','manager','medic');
$function$
;

-- ---------------------------------------------------------------------
-- private.set_report_provenance()   (23 Aug 2026 — squad chat phase 3)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.set_report_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.reporter_id := auth.uid();
  select club_id into new.club_id from messages where id = new.message_id;
  if new.club_id is null then
    raise exception 'no such message' using errcode = 'P0002';
  end if;
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.touch_report()   (23 Aug 2026 — squad chat phase 3)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.touch_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.club_id := old.club_id; new.message_id := old.message_id;
  new.reporter_id := old.reporter_id; new.reason := old.reason; new.created_at := old.created_at;
  if new.resolved_at is not null and old.resolved_at is null then
    new.resolved_by := auth.uid();
  end if;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.guard_staff_dm_opt_in()   (23 Aug 2026 — squad chat phase 3)
-- proacl: null
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_staff_dm_opt_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  club uuid;
begin
  if new.staff_dm_opt_in is distinct from old.staff_dm_opt_in then
    select p.club_id into club from players p where p.id = new.player_id;
    if private.is_admin(club)
       or exists (select 1 from memberships m where m.profile_id = me and m.player_id = new.player_id
                   and m.role = 'parent' and m.status = 'active') then
      new.staff_dm_opt_in_by := me;
      new.staff_dm_opt_in_at := now();
    else
      raise exception 'only a guardian or an admin can change this' using errcode = '42501';
    end if;
  else
    new.staff_dm_opt_in_by := old.staff_dm_opt_in_by;
    new.staff_dm_opt_in_at := old.staff_dm_opt_in_at;
  end if;
  return new;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.dm_candidates()   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_candidates()
 RETURNS TABLE(profile_id uuid, full_name text, role text, via_team text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  people as (
    select distinct m.profile_id from memberships m, club
     where m.club_id = club.id and m.status = 'active' and m.profile_id <> (select id from me))
  select p.profile_id, pr.full_name,
         (select m.role from memberships m where m.profile_id = p.profile_id and m.status = 'active'
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end limit 1) as role,
         (select t.name from memberships a join memberships b on b.team_id = a.team_id
            join teams t on t.id = a.team_id
           where a.profile_id = (select id from me) and b.profile_id = p.profile_id
             and a.status = 'active' and b.status = 'active'
           order by t.sort_order limit 1) as via_team
    from people p join profiles pr on pr.id = p.profile_id
   where private.can_dm(p.profile_id)
   order by pr.full_name;
$function$
;

-- ---------------------------------------------------------------------
-- public.open_conversation(_other uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_conversation(_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  a uuid; b uuid; conv uuid; club uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not private.can_dm(_other) then
    raise exception 'you cannot message this person' using errcode = '42501';
  end if;
  a := least(me, _other); b := greatest(me, _other);
  select id into conv from conversations where profile_a = a and profile_b = b;
  if conv is not null then return conv; end if;
  select m.club_id into club from memberships m where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  insert into conversations (club_id, profile_a, profile_b, created_by) values (club, a, b, me) returning id into conv;
  return conv;
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.log_welfare_access(_conversation uuid)   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260823_adult_dms_private: an admin reaches a DM only through
-- private.admin_may_review — a minor in it, or a reported message. md5 55728a7d25512cd4cecef9df23ba9ffa.
CREATE OR REPLACE FUNCTION public.log_welfare_access(_conversation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  conv public.conversations;
begin
  select * into conv from conversations where id = _conversation;
  if conv.id is null then raise exception 'no such conversation' using errcode = 'P0002'; end if;
  if me in (conv.profile_a, conv.profile_b) then return; end if;
  if not private.admin_may_review(_conversation) then raise exception 'not reviewable' using errcode = '42501'; end if;
  insert into welfare_access_log (club_id, admin_id, conversation_id) values (conv.club_id, me, _conversation);
end;
$function$
;

-- ---------------------------------------------------------------------
-- public.my_conversations()   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_conversations()
 RETURNS TABLE(conversation_id uuid, other_id uuid, other_name text, other_role text, last_at timestamp with time zone, last_body text, last_author_id uuid, unread boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id)
  select c.id,
         case when c.profile_a = me.id then c.profile_b else c.profile_a end as other_id,
         pr.full_name,
         (select m.role from memberships m
           where m.profile_id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
             and m.status = 'active'
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end limit 1),
         c.last_at,
         lm.body, lm.author_id,
         (lm.id is not null and lm.author_id <> me.id
          and not exists (select 1 from message_reads r where r.message_id = lm.id and r.profile_id = me.id))
    from me
    cross join conversations c
    join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
    left join lateral (select id, body, author_id from messages x
                        where x.conversation_id = c.id order by x.created_at desc limit 1) lm on true
   where me.id in (c.profile_a, c.profile_b)
   order by c.last_at desc;
$function$
;

-- ---------------------------------------------------------------------
-- public.welfare_overview()   (23 Aug 2026 — squad chat phase 3)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ---------------------------------------------------------------------
-- ⚠️ REPLACED by 20260823_adult_dms_private: an admin reaches a DM only through
-- private.admin_may_review — a minor in it, or a reported message. md5 4c2b0b533f8d37aaead7213105d43720.
-- ⚠️ GATE NARROWED 30 Aug 2026 (20260830_welfare_review_gate): `ok` keys on
-- private.can_review_dm — the dashboard needs the explicit welfare grant.
CREATE OR REPLACE FUNCTION public.welfare_overview()
 RETURNS TABLE(kind text, id uuid, label text, detail text, members bigint, last_at timestamp with time zone, open_reports bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  ok as (select private.can_review_dm(club.id) as yes from club)
  select rows.kind, rows.id, rows.label, rows.detail, rows.members, rows.last_at, rows.open_reports from (
    select 'squad'::text as kind, t.id as id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           (select count(*) from private.notice_audience(t.club_id, t.id)) as members,
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'squad') as last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'squad' and r.resolved_at is null) as open_reports
      from teams t, club where t.club_id = club.id
    union all
    select 'staff', t.id, t.name, 'Staff',
           (select count(*) from private.staff_audience(t.id)),
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'staff'),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'staff' and r.resolved_at is null)
      from teams t, club where t.club_id = club.id
    union all
    select 'club', club.id, 'Whole club', 'Club-wide · admins post',
           (select count(distinct profile_id) from memberships m where m.club_id = club.id and m.status = 'active'),
           (select max(created_at) from messages x where x.club_id = club.id and x.channel = 'squad' and x.team_id is null),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and r.resolved_at is null)
      from club
    union all
    select 'dm', c.id, pa.full_name || ' · ' || pb.full_name,
           case when private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
                then 'Direct message · involves a minor' else 'Direct message · reported' end,
           2::bigint, c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
      join profiles pa on pa.id = c.profile_a
      join profiles pb on pb.id = c.profile_b
     where c.club_id = club.id
       and private.conversation_reviewable(c.id)
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$
;

-- ---------------------------------------------------------------------
-- public.approval_recipients()   (23 Aug 2026 — db/migrations/20260823_notify_approvals.sql)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}   md5 99dfe405d827ea81c00822556360131a
-- The list an admin edits on the Club tab: every active admin, coach and manager with the switch.
-- ---------------------------------------------------------------------
-- ⚠️ Measured 25 Aug 2026: live proacl LACKS service_role for this function
-- (postgres + authenticated only) — the capture below over-claims it.
CREATE OR REPLACE FUNCTION public.approval_recipients()
 RETURNS TABLE(membership_id uuid, profile_id uuid, full_name text, role text, team_id uuid, team_name text, notify boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1)
  select m.id, m.profile_id, p.full_name, m.role, m.team_id, t.name, m.notify_approvals
    from memberships m
    cross join club
    join profiles p on p.id = m.profile_id
    left join teams t on t.id = m.team_id
   where m.club_id = club.id
     and m.status = 'active'
     and m.role in ('admin', 'coach', 'manager')
     and (m.role = 'admin' or m.team_id is not null)
     and private.is_admin(club.id)
   order by case m.role when 'admin' then 0 else 1 end, t.sort_order nulls first, t.name, p.full_name;
$function$
;

-- ---------------------------------------------------------------------
-- DELETE FOR GOOD (24 Aug 2026, evening) — db/migrations/20260824_delete_for_good.sql.
-- Jay: "i still can't completely delete messages or chats". Hard deletes; a
-- reported message/conversation only by an admin. Captured from a rolled-back
-- apply; md5s below.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- private.message_reported(_message uuid)   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}   md5 af6706827564f55cf28ba4568f67ee77
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.message_reported(_message uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- the message itself, OR any reply under it: deleting a post cascades its
  -- replies, and a reported reply must not vanish with an innocent parent
  select exists (select 1 from message_reports r
                   join messages x on x.id = r.message_id
                  where x.id = _message or x.parent_id = _message)
$function$
;

-- ---------------------------------------------------------------------
-- private.conversation_reported(_conversation uuid)   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}   md5 094ac9666704fea3f3294b2f15cb9c32
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.conversation_reported(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from message_reports r join messages x on x.id = r.message_id
                  where x.conversation_id = _conversation)
$function$
;

-- ---------------------------------------------------------------------
-- public.clear_channel(_team uuid, _channel text DEFAULT 'squad'::text)   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}   md5 76dafd9a8e1de6609d1f0ea58b8bf685
-- Every post (and by cascade reply) in a channel, gone; reported posts stay. Staff / admins.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_channel(_team uuid, _channel text DEFAULT 'squad'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
  my_club uuid;
begin
  if _channel not in ('squad', 'staff') then
    raise exception 'no such channel' using errcode = '22023';
  end if;
  if _team is null then
    -- the club channel: admins only
    select m.club_id into my_club from memberships m
     where m.profile_id = auth.uid() and m.status = 'active' order by m.created_at limit 1;
    if my_club is null or not private.is_admin(my_club) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
    delete from messages where club_id = my_club and channel = 'squad' and team_id is null
       and parent_id is null and not private.message_reported(id);
  else
    if not private.can_edit_team(_team) then
      raise exception 'not this squad''s staff' using errcode = '42501';
    end if;
    delete from messages where team_id = _team and channel = _channel
       and parent_id is null and not private.message_reported(id);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$function$
;

-- ---------------------------------------------------------------------
-- THE CHATS LIST, DELETE A MESSAGE, DELETE A CHAT (24 Aug 2026) —
-- db/migrations/20260824_chat_list.sql, claude/plans/2026-08-24-chat-list.md.
-- Jay: "make it more like whatsapp" and "need to be able to delete messages
-- and entire chats too". Captured from a rolled-back apply; md5s below.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- public.my_chats()   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}   md5 801095c17a8d8df940f146bf02404c2d
-- One row per chat the caller may read, newest first, with unread counts.
-- ---------------------------------------------------------------------
-- ⚠️ RE-CAPTURED FROM LIVE 25 Aug 2026 — body REPLACED by the 24 Aug group-chat work; the md5 recorded for this function described the pre-groups version.
-- ⚠️ RE-CAPTURED FROM LIVE 28 Aug 2026 — body REPLACED by db/migrations/20260828_my_chats_last_attachment.sql (adds last_attachment_path); the proacl/md5 above still describe the prior version.
CREATE OR REPLACE FUNCTION public.my_chats()
 RETURNS TABLE(kind text, team_id uuid, conversation_id uuid, label text, detail text, last_at timestamp with time zone, last_body text, last_author_id uuid, last_attachment_path text, last_author_name text, unread bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  rows as (
    select 'squad'::text as kind, t.id as team_id, null::uuid as conversation_id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           lm.created_at as last_at, lm.body as last_body, lm.author_id as last_author_id,
           lm.attachment_path as last_attachment_path,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id)) as unread
      from teams t cross join club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_see_team(t.id)
    union all
    select 'staff', t.id, null, t.name || ' · staff', 'Staff only',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from teams t cross join club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_edit_team(t.id)
    union all
    select 'club', null, null, 'Whole club', 'Club-wide · admins post',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
    union all
    -- 20260830_role_channels: a row per role channel the caller belongs to;
    -- detail carries the live member count.
    select rc.key, null, null, rc.label,
           (select count(*) from private.role_channel_audience(rc.key, club.id))::text || ' people',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = rc.key and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from (values ('headcoaches','Club Head Coaches'),
                   ('managers','Club Age Group Managers'),
                   ('medics','Club Medics'),
                   ('welfare','Welfare'),
                   ('clubstaff','Club Staff')) rc(key, label)
      cross join club cross join me
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.club_id = club.id and x.channel = rc.key and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where private.in_role_channel(rc.key, club.id)
    union all
    select 'dm', null, c.id, pr.full_name,
           coalesce((select labelled.l from (
               select case m.role when 'admin' then 'Club admin' when 'coach' then 'Coach'
                                  when 'manager' then 'Team Manager' when 'medic' then 'Medic' else null end as l,
                      case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end as o
                 from memberships m where m.profile_id = pr.id and m.status = 'active') labelled
               where labelled.l is not null order by labelled.o limit 1), 'Direct message'),
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where me.id in (c.profile_a, c.profile_b) and c.kind = 'dm'
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
    union all
    select 'group', null, c.id, c.title,
           (select count(*) from conversation_members gm where gm.conversation_id = c.id)::text || ' people',
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join conversation_members my on my.conversation_id = c.id and my.profile_id = me.id
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where c.kind = 'group' and (cl.cleared_at is null or c.last_at > cl.cleared_at)
  )
  select r.kind, r.team_id, r.conversation_id, r.label, r.detail,
         r.last_at, r.last_body, r.last_author_id, r.last_attachment_path, p.full_name, r.unread
    from rows r left join profiles p on p.id = r.last_author_id
   order by r.last_at desc nulls last, r.label;
$function$
;

-- ---------------------------------------------------------------------
-- public.clear_conversation(_conversation uuid)   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}   md5 173fde09c8d92e99053bf5a5fa4340a0
-- "Delete chat" for ME: records cleared_at; the read policy hides the past from me.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_conversation(_conversation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.in_conversation(_conversation) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  insert into conversation_clears (conversation_id, profile_id, cleared_at)
  values (_conversation, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set cleared_at = excluded.cleared_at;
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.cleared_before(_conversation uuid)   (24 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}   md5 189b5c7d82cc202c29ef949ad8663744
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cleared_before(_conversation uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cleared_at from conversation_clears
   where conversation_id = _conversation and profile_id = auth.uid()
$function$
;

-- ---------------------------------------------------------------------
-- ADULT DMs PRIVATE UNLESS REPORTED (23 Aug 2026, evening) —
-- db/migrations/20260823_adult_dms_private.sql. Jay: "I don't think dm between
-- adults should be visible to anyone except those people, unless a message is
-- reported." Captured from pg_get_functiondef in a rolled-back apply; md5s below.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- private.report_on_conversation(_message uuid)   (30 Aug 2026 — welfare_review_gate)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
-- Classifies a reported message: conversation (DM/group → welfare gate) vs
-- channel (→ any admin). SECURITY DEFINER so the split is decidable by admins
-- who may not read the message itself; leaks only the channel class.
CREATE OR REPLACE FUNCTION private.report_on_conversation(_message uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from messages m
     where m.id = _message and m.conversation_id is not null
  );
$function$
;

-- ---------------------------------------------------------------------
-- private.conversation_reviewable(_conversation uuid)   (23 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}   md5 4af1471901d8c7fa27cfa05a11a28a38
-- ---------------------------------------------------------------------
-- ⚠️ RE-CAPTURED FROM LIVE 25 Aug 2026 — body REPLACED by the 24 Aug group-chat work; the md5 recorded for this function described the pre-groups version.
CREATE OR REPLACE FUNCTION private.conversation_reviewable(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and case c.kind
             when 'group' then
               exists (select 1 from message_reports r
                         join messages x on x.id = r.message_id
                        where x.conversation_id = c.id)
               and exists (select 1 from conversation_members gm
                            where gm.conversation_id = c.id
                              and private.is_minor_profile(gm.profile_id))
             else
               private.is_minor_profile(c.profile_a)
               or private.is_minor_profile(c.profile_b)
               or exists (select 1 from message_reports r
                            join messages x on x.id = r.message_id
                           where x.conversation_id = c.id)
           end);
$function$
;

-- ---------------------------------------------------------------------
-- private.admin_may_review(_conversation uuid)   (23 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}   md5 d3b073c66a040fa2bebd563570579d1a
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.admin_may_review(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and private.is_admin(c.club_id)
       and private.conversation_reviewable(c.id))
$function$
;

-- ---------------------------------------------------------------------
-- public.conversation_involves_minor(_conversation uuid)   (23 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}   md5 c0555557733091086163d94b1f39151b
-- ---------------------------------------------------------------------
-- ⚠️ RE-CAPTURED FROM LIVE 25 Aug 2026 — body REPLACED by the 24 Aug group-chat work; the md5 recorded for this function described the pre-groups version.
CREATE OR REPLACE FUNCTION public.conversation_involves_minor(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case c.kind
           when 'group' then exists (select 1 from conversation_members gm
                                      where gm.conversation_id = c.id
                                        and private.is_minor_profile(gm.profile_id))
           else private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
         end
    from conversations c
   where c.id = _conversation
     and (private.in_conversation(c.id) or private.admin_may_review(c.id));
$function$
;

-- ---------------------------------------------------------------------
-- public.storage_usage()   (23 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Captured from pg_get_functiondef; md5 c778fa39b0708d995e65a2a4fc6653f2
-- verified against LIVE after the apply. db/migrations/20260823_storage_usage.sql.
-- Admin-only readout of database size and bytes per bucket, for the Club tab.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_usage()
 RETURNS TABLE(kind text, label text, bytes bigint, objects bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'database'::text, current_database()::text,
         pg_database_size(current_database()), null::bigint
  where private.is_admin_anywhere()
  union all
  select 'bucket'::text, o.bucket_id::text,
         coalesce(sum((o.metadata->>'size')::bigint), 0), count(*)
    from storage.objects o
   where private.is_admin_anywhere()
   group by o.bucket_id
   order by 1, 2
$function$
;

-- ---------------------------------------------------------------------
-- public.register_push_subscription(text, text, text)   (23 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Captured from pg_get_functiondef inside a rolled-back transaction BEFORE
-- 20260823_push_subscription_takeover was applied; re-verify the md5 after.
-- A device endpoint belongs to whoever is signed in on it now: delete any
-- row for this endpoint, insert one for auth.uid(). Replaces the client's
-- upsert, which RLS refused the first time a phone changed hands. The
-- service_role execute arrives via default privileges, as with
-- pitch_occupancy below. Harness: db/tests/push-subscription-takeover.sql.
-- ⚠️ ENDPOINT ALLOWLISTED 30 Aug 2026 (20260830_push_hardening, Grok item 12):
-- https + a recognised push service only, via private.push_endpoint_allowed
-- directly below. Harness: db/tests/push-endpoint-allowlist.sql.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_subscription(_endpoint text, _p256dh text, _auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _me uuid := auth.uid();
begin
  if _me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if _endpoint is null or btrim(_endpoint) = '' then
    raise exception 'endpoint required' using errcode = '22023';
  end if;
  if not private.push_endpoint_allowed(_endpoint) then
    raise exception 'endpoint is not a recognised push service' using errcode = '22023';
  end if;

  -- The takeover. Whoever held this device before no longer does.
  delete from public.push_subscriptions where endpoint = _endpoint;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (_me, _endpoint, _p256dh, _auth);
end;
$function$
;

-- ---------------------------------------------------------------------
-- private.push_endpoint_allowed(text)   (30 Aug 2026 — push_hardening, item 12)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
-- ---------------------------------------------------------------------
-- The endpoint is a URL push-send will POST to from inside the edge runtime;
-- only real browser push services pass. Mirrored in push-send's own
-- pushEndpointAllowed (belt and braces). Built from the hosts measured live:
-- web.push.apple.com, fcm.googleapis.com, jmt17.google.com, plus the Mozilla
-- and Windows (WNS wildcard) families.
CREATE OR REPLACE FUNCTION private.push_endpoint_allowed(_endpoint text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select _endpoint like 'https://%'
     and (
       _endpoint like 'https://fcm.googleapis.com/%'
       or _endpoint like 'https://web.push.apple.com/%'
       or _endpoint like 'https://updates.push.services.mozilla.com/%'
       or _endpoint similar to 'https://[a-z0-9.-]+\.notify\.windows\.com/%'
       or _endpoint similar to 'https://[a-z0-9.-]+\.google\.com/%'
       or _endpoint similar to 'https://[a-z0-9.-]+\.push\.apple\.com/%'
     );
$function$
;

-- ---------------------------------------------------------------------
-- public.pitch_occupancy(timestamptz, timestamptz)   (22 Aug 2026)
-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Captured from live AFTER 20260822_pitch_occupancy was applied — the
-- service_role execute arrived via default privileges, not the migration.
-- The redacted club-wide booking read for squad staff; see the migration
-- header for why this is a function and not a wider `event read` policy.
-- ⚠️ RE-CAPTURED 30 Aug 2026: this capture had missed the 20260829
-- pitch_portion re-create (9 columns). Now also carries the tournament-game
-- exclusion (20260830_pitch_occupancy_exclude_tournament_games, Grok item 3).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pitch_occupancy(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(id uuid, team_id uuid, team_name text, type text, starts_at timestamp with time zone, ends_at timestamp with time zone, pitch text, pitch_portion text, group_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.team_id, t.name, e.type, e.starts_at, e.ends_at, e.pitch, e.pitch_portion, e.group_id
  from events e
  join teams t on t.id = e.team_id
  where e.starts_at >= _from
    and e.starts_at < _to
    and e.tournament_id is null
    and exists (
      select 1 from memberships m
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (m.role = 'admin'
             or (m.role in ('coach','manager','medic') and m.team_id is not null))
    );
$function$
;


-- =====================================================================
-- RE-CAPTURED 2026-08-25 — TWENTY-TWO FUNCTIONS THIS FILE WAS MISSING
--
-- Live held 134 functions (55 public + 79 private); this file defined 112.
-- Nine private (signup intent, welcome mail, name sync, announcement
-- provenance, group-chat helpers, quote guard) and thirteen public (group
-- chat RPCs, signup wizard RPCs, invite_parent, save_player_parents,
-- announcement stats, set_message_pinned). announcement_stats and
-- announcement_audience had GRANT lines in grants-adjacent notes but no
-- definition anywhere. Captured verbatim from pg_get_functiondef on live;
-- proacl noted above each. apply_migration strips comments, so bodies are
-- bare — each function's WHY lives in its migration under db/migrations/.
-- =====================================================================

-- proacl: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION private.apply_signup_intent(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  intent        jsonb;
  already       timestamptz;
  caller_email  text;
  player        jsonb;
  clean_name    text;
  clean_gender  text;
  team_row      public.teams;
  new_player    public.players;
  pending_count int;
  staff_role    text;
  staff_team    uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select p.signup_intent, p.signup_intent_applied_at
    into intent, already
    from public.profiles p
   where p.id = p_user_id;

  if intent is null or already is not null then
    return;
  end if;

  select u.email
    into caller_email
    from auth.users u
   where u.id = p_user_id;

  if caller_email is null then
    return;
  end if;

  -- Staff claim. Same role list as public.request_staff_role.
  staff_role := nullif(intent->>'staff_role', '');
  staff_team := nullif(intent->>'staff_team_id', '')::uuid;
  if staff_role in ('coach', 'manager', 'medic') and staff_team is not null then
    select * into team_row from public.teams where id = staff_team;
    if team_row.id is not null then
      insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
      select p_user_id, team_row.club_id, team_row.id, staff_role, null, 'pending'
       where not exists (
         select 1 from public.memberships m
          where m.profile_id = p_user_id
            and m.club_id = team_row.club_id
            and m.team_id = team_row.id
            and m.role = staff_role
            and m.player_id is null
       );
    end if;
  end if;

  -- Children. Mirrors the guards inside public.register_my_player, with
  -- p_user_id in place of auth.uid(). Duplicate names are skipped rather
  -- than aborting the rest of the intent — a half-applied wizard is better
  -- than rolling the new user back to an empty waiting card.
  for player in
    select value from jsonb_array_elements(coalesce(intent->'players', '[]'::jsonb))
  loop
    clean_name := nullif(btrim(
      concat_ws(' ', player->>'first_name', player->>'last_name')
    ), '');
    if clean_name is null or length(clean_name) > 80 then
      continue;
    end if;

    select * into team_row from public.teams where id = nullif(player->>'team_id', '')::uuid;
    if team_row.id is null then
      continue;
    end if;

    if (player->>'self_register') = 'true'
       and not coalesce(team_row.self_registration_allowed, false) then
      continue;
    end if;

    clean_gender := nullif(btrim(lower(player->>'gender')), '');
    if clean_gender is not null and clean_gender not in ('male', 'female') then
      continue;
    end if;
    if clean_gender is null and private.squad_expects_gender(team_row.name) is not null then
      continue;
    end if;

    if private.name_match_key(clean_name) is not null
       and coalesce(player->>'confirm_duplicate', '') <> 'true'
       and exists (
         select 1 from public.players pl
          where pl.team_id = team_row.id
            and private.name_match_key(pl.full_name) = private.name_match_key(clean_name)
       ) then
      continue;
    end if;

    select count(*) into pending_count
      from public.memberships
     where profile_id = p_user_id and status = 'pending';
    if pending_count >= 5 then
      exit;
    end if;

    insert into public.players (club_id, team_id, full_name, gender)
    values (team_row.club_id, team_row.id, clean_name, clean_gender)
    returning * into new_player;

    insert into public.player_contacts (player_id, email)
    values (new_player.id, lower(btrim(caller_email)));

    insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
    values (
      p_user_id,
      team_row.club_id,
      team_row.id,
      case
        when (player->>'self_register') = 'true' or team_row.is_senior
        then 'player'
        else 'parent'
      end,
      new_player.id,
      'pending'
    );

    if nullif(player->>'dob', '') is not null then
      insert into public.player_private (player_id, date_of_birth, plays_up_confirmed_at)
      values (
        new_player.id,
        (player->>'dob')::date,
        case
          when player->>'play_up_consent' = 'true'
          then now()
          else null
        end
      )
      on conflict (player_id) do nothing;
    end if;
  end loop;

  update public.profiles
     set signup_intent_applied_at = now()
   where id = p_user_id;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION private.can_group_add(_other uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  club uuid;
begin
  if me is null or _other is null or me = _other then return false; end if;
  select m.club_id into club from memberships m
   where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  if club is null then return false; end if;
  if not exists (select 1 from memberships m where m.profile_id = _other
                  and m.club_id = club and m.status = 'active') then return false; end if;
  if exists (select 1 from dm_blocks b where (b.blocker_id = me and b.blocked_id = _other)
                                          or (b.blocker_id = _other and b.blocked_id = me)) then
    return false;
  end if;
  if private.is_admin(club) then return true; end if;
  if exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club
              and m.status = 'active' and m.role = 'admin') then return true; end if;
  return exists (
    select 1 from memberships a join memberships b on b.team_id = a.team_id
     where a.profile_id = me and a.status = 'active' and a.team_id is not null
       and b.profile_id = _other and b.status = 'active');
end;
$function$

-- proacl: {=X/postgres,postgres=X/postgres,authenticated=X/postgres}  (note the PUBLIC grant)
CREATE OR REPLACE FUNCTION private.attachments_well_formed(_a jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_typeof(_a) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(_a) e
        where jsonb_typeof(e) <> 'object'
           or nullif(btrim(coalesce(e ->> 'file', '')), '') is null)
$function$

-- Backs messages_attachments_shape. IMMUTABLE is what lets a CHECK use it.


CREATE OR REPLACE FUNCTION private.sync_attachment_paths()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if jsonb_array_length(new.attachments) > 0 then
    select array_agg(e ->> 'file' order by ord)
      into new.attachment_paths
      from jsonb_array_elements(new.attachments) with ordinality as t(e, ord);
  elsif cardinality(new.attachment_paths) > 0 then
    select jsonb_agg(jsonb_build_object('file', p) order by ord)
      into new.attachments
      from unnest(new.attachment_paths) with ordinality as t(p, ord);
  elsif new.attachment_path is not null then
    new.attachments      := jsonb_build_array(jsonb_build_object('file', new.attachment_path));
    new.attachment_paths := array[new.attachment_path];
  end if;

  new.attachment_path := new.attachment_paths[1];
  return new;
end $function$

-- INVOKER on purpose: it touches no table, only NEW, so SECURITY DEFINER would
-- be privilege for nothing. search_path pinned empty per the standing rule.


CREATE OR REPLACE FUNCTION private.chat_media_owner(_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(split_part(_name, '/', 1), '')::uuid
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION private.is_group_owner(_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from conversation_members gm
                  where gm.conversation_id = _conversation
                    and gm.profile_id = (select auth.uid()) and gm.is_owner);
$function$

-- proacl: null (default: EXECUTE to PUBLIC)
CREATE OR REPLACE FUNCTION private.messages_quote_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q record;
begin
  if new.quoted_id is null then return new; end if;
  if new.channel <> 'dm' or new.conversation_id is null then
    raise exception 'quotes are for direct and group chats only';
  end if;
  select id into q from public.messages where id = new.quoted_id;
  if q.id is null then
    raise exception 'quoted message is not one you can read';
  end if;
  return new;
end $function$

-- proacl: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION private.notify_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  endpoint text;
  secret   text;
begin
  -- The once-only gate, claimed BEFORE anything that can fail. If the vault
  -- reads or the queue insert blow up, the catch-all below still commits the
  -- claim — one lost mail, never two sent.
  update public.profiles
     set welcomed_at = now()
   where id = new.id
     and welcomed_at is null;
  if not found then
    return new;
  end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'welcome_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_welcome: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('user_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_welcome failed for %: %', new.id, sqlerrm;
  return new;
end;
$function$

-- proacl: null
CREATE OR REPLACE FUNCTION private.set_announcement_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _club uuid;
begin
  if new.team_id is not null then
    select t.club_id into _club from teams t where t.id = new.team_id;
    if _club is null then
      raise exception 'unknown squad' using errcode = '42501';
    end if;
  else
    select m.club_id into _club
      from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
     group by m.club_id
     limit 1;
    if _club is null then
      raise exception 'no active membership' using errcode = '42501';
    end if;
  end if;

  new.author_id  := auth.uid();
  new.club_id    := _club;
  new.created_at := now();
  new.updated_at := null;

  return new;
end;
$function$

-- proacl: null
CREATE OR REPLACE FUNCTION private.sync_person_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  fn      text := nullif(btrim(new.first_name), '');
  ln      text := nullif(btrim(new.last_name), '');
  full_in text := nullif(btrim(new.full_name), '');
  names_changed boolean;
  full_changed  boolean;
begin
  if tg_op = 'INSERT' then
    names_changed := (fn is not null or ln is not null);
    full_changed  := (full_in is not null);
  else
    names_changed := (new.first_name is distinct from old.first_name)
                  or (new.last_name  is distinct from old.last_name);
    full_changed  := (new.full_name  is distinct from old.full_name);
  end if;

  if names_changed and (fn is not null or ln is not null) then
    new.full_name  := btrim(concat_ws(' ', fn, ln));
    new.first_name := fn;
    new.last_name  := ln;
  elsif full_changed and full_in is not null then
    new.full_name := full_in;
    if position(' ' in full_in) = 0 then
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

-- proacl: null
CREATE OR REPLACE FUNCTION private.touch_announcement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  new.author_id  := old.author_id;
  new.club_id    := old.club_id;
  new.team_id    := old.team_id;
  new.created_at := old.created_at;
  return new;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.add_group_members(_conversation uuid, _members uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m uuid;
begin
  if not private.is_group_owner(_conversation) then
    raise exception 'only the group''s creator can add people' using errcode = '42501';
  end if;
  foreach m in array coalesce(_members, '{}'::uuid[]) loop
    if not private.can_group_add(m) then
      raise exception 'someone picked is not in your squads' using errcode = '42501';
    end if;
    insert into conversation_members (conversation_id, profile_id)
         values (_conversation, m) on conflict do nothing;
  end loop;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.announcement_audience(_announcement uuid)
 RETURNS TABLE(profile_id uuid, full_name text, read_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.profile_id, s.full_name, s.read_at
  from (
    select distinct on (m.profile_id)
           m.profile_id,
           p.full_name,
           r.read_at
      from announcements a
      join memberships m
        on m.club_id = a.club_id
       and m.status = 'active'
       and (a.team_id is null or m.team_id = a.team_id)
       and m.profile_id <> a.author_id
      join profiles p on p.id = m.profile_id
      left join announcement_reads r
        on r.announcement_id = a.id
       and r.profile_id = m.profile_id
     where a.id = _announcement
       and (a.author_id = auth.uid() or private.is_admin(a.club_id))
     order by m.profile_id, r.read_at nulls last
  ) s
  order by (s.read_at is not null), s.full_name;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.announcement_stats()
 RETURNS TABLE(announcement_id uuid, audience_count integer, seen_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.id,
    (select count(distinct m.profile_id)::integer
       from memberships m
      where m.status = 'active'
        and m.club_id = a.club_id
        and (a.team_id is null or m.team_id = a.team_id)
        and m.profile_id <> a.author_id),
    (select count(distinct r.profile_id)::integer
       from announcement_reads r
      where r.announcement_id = a.id
        and r.profile_id <> a.author_id
        and exists (
          select 1 from memberships m
           where m.profile_id = r.profile_id
             and m.status = 'active'
             and m.club_id = a.club_id
             and (a.team_id is null or m.team_id = a.team_id)
        ))
  from announcements a
  where a.author_id = auth.uid()
     or private.is_admin(a.club_id);
$function$

-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ⚠️ anon-callable (fails safe: auth.uid() null → 42501)
CREATE OR REPLACE FUNCTION public.complete_signup_intent()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  perform private.apply_signup_intent(auth.uid());
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_group(_title text, _members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  club uuid;
  conv uuid;
  m uuid;
  others uuid[];
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select array_agg(distinct x) into others
    from unnest(coalesce(_members, '{}'::uuid[])) as x where x is not null and x <> me;
  -- the >=3 floor holds at birth: creator plus at least two others
  if coalesce(array_length(others, 1), 0) < 2 then
    raise exception 'a group is three people or more' using errcode = '23514';
  end if;
  if _title is null or length(btrim(_title)) not between 1 and 80 then
    raise exception 'a group needs a name' using errcode = '23514';
  end if;
  select mm.club_id into club from memberships mm
   where mm.profile_id = me and mm.status = 'active' order by mm.created_at limit 1;
  if club is null then raise exception 'not a club member' using errcode = '42501'; end if;
  foreach m in array others loop
    if not private.can_group_add(m) then
      raise exception 'someone picked is not in your squads' using errcode = '42501';
    end if;
  end loop;
  insert into conversations (club_id, kind, title, created_by)
       values (club, 'group', btrim(_title), me) returning id into conv;
  insert into conversation_members (conversation_id, profile_id, is_owner) values (conv, me, true);
  insert into conversation_members (conversation_id, profile_id) select conv, unnest(others);
  return conv;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.group_candidates()
 RETURNS TABLE(profile_id uuid, full_name text, role text, via_team text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  people as (
    select distinct m.profile_id from memberships m, club
     where m.club_id = club.id and m.status = 'active' and m.profile_id <> (select id from me))
  select p.profile_id, pr.full_name,
         (select m.role from memberships m where m.profile_id = p.profile_id and m.status = 'active'
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end limit 1) as role,
         (select t.name from memberships a join memberships b on b.team_id = a.team_id
            join teams t on t.id = a.team_id
           where a.profile_id = (select id from me) and b.profile_id = p.profile_id
             and a.status = 'active' and b.status = 'active'
           order by t.sort_order limit 1) as via_team
    from people p join profiles pr on pr.id = p.profile_id
   where private.can_group_add(p.profile_id)
   order by pr.full_name;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ⚠️ EDITED 2 Sep 2026 (20260902_player_leavers.sql, then corrected same day
-- by 9bd5276). The leaver guard (`ply.left_at is not null`) was placed
-- BEFORE the may_edit authorisation check in the first version of this
-- migration -- an unauthorised caller could learn a player's leaver status
-- from the error message before being told they cannot invite anyone at
-- all. Moved to directly AFTER may_edit raises, below.
CREATE OR REPLACE FUNCTION public.invite_parent(p_parent_row uuid)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row_p     public.player_parents%rowtype;
  ply       public.players%rowtype;
  clean     text;
  may_edit  boolean;
  may_grant boolean;
  existing  public.invites;
  made      public.invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into row_p from public.player_parents where id = p_parent_row;
  if row_p.id is null then
    raise exception 'That contact no longer exists.' using errcode = '22023';
  end if;

  select * into ply from public.players where id = row_p.player_id;
  if ply.id is null then
    raise exception 'That contact is not attached to a player.' using errcode = '22023';
  end if;

  -- AUTHORISATION BEFORE ANYTHING ELSE IS READ BACK TO THE CALLER.
  may_edit := private.is_own_player(row_p.player_id)
              or private.can_edit_team(ply.team_id);
  if not may_edit then
    raise exception 'You cannot invite that person.' using errcode = '42501';
  end if;

  if ply.left_at is not null then
    raise exception 'That player has left the squad, so nobody can be invited to them.' using errcode = '22023';
  end if;

  clean := lower(nullif(btrim(row_p.email), ''));
  if clean is null then
    raise exception 'There is no email address on that contact yet. Add one first.'
      using errcode = '22023';
  end if;
  if position('@' in clean) = 0 then
    raise exception 'That contact''s email address does not look right.' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles pr where lower(pr.email) = clean) then
    raise exception 'That person already has an account. Ask an admin to connect them instead.'
      using errcode = '42710';
  end if;

  select * into existing
    from public.invites i
   where lower(i.email) = clean
     and i.player_id    = row_p.player_id
     and i.accepted_at is null
   limit 1;
  if existing.id is not null then
    return existing;
  end if;

  may_grant := private.can_approve_team(ply.team_id);

  insert into public.invites (club_id, email, role, team_id, player_id, created_by, grant_status)
  values (ply.club_id, clean, 'parent', ply.team_id, row_p.player_id, auth.uid(),
          case when may_grant then 'active' else 'pending' end)
  returning * into made;

  update public.player_parents set invited_at = now() where id = row_p.id;

  return made;
end;
$function$

-- proacl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ⚠️ anon-callable BY DESIGN (the signup wizard's squad list before login)
CREATE OR REPLACE FUNCTION public.list_signup_squads()
 RETURNS TABLE(id uuid, name text, sort_order integer, self_registration_allowed boolean, is_senior boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id, t.name, t.sort_order, t.self_registration_allowed, t.is_senior
    from public.teams t
   order by t.sort_order, t.name;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.remove_group_member(_conversation uuid, _member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.is_group_owner(_conversation) then
    raise exception 'only the group''s creator can remove people' using errcode = '42501';
  end if;
  if _member = auth.uid() then
    raise exception 'leave the group instead' using errcode = '23514';
  end if;
  if (select count(*) from conversation_members where conversation_id = _conversation) <= 3 then
    raise exception 'a group is three people or more — delete the group instead' using errcode = '23514';
  end if;
  delete from conversation_members
   where conversation_id = _conversation and profile_id = _member;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.request_staff_role(p_team_id uuid, p_role text)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_email   text;
  confirmed_at   timestamptz;
  team_row       public.teams;
  pending_count  int;
  existing       public.memberships;
  new_membership public.memberships;
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
    raise exception 'Please confirm your email address first.' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('coach', 'manager', 'medic') then
    raise exception 'Choose coach, team manager or medic.' using errcode = '22023';
  end if;

  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That squad does not exist.' using errcode = '22023';
  end if;

  select * into existing
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.club_id    = team_row.club_id
     and m.team_id    = p_team_id
     and m.role       = p_role
     and m.player_id is null
   limit 1;

  if existing.id is not null then
    return existing;
  end if;

  select count(*) into pending_count
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.status     = 'pending'
     and m.player_id is null
     and m.role in ('coach', 'manager', 'medic');

  if pending_count >= 5 then
    raise exception 'You already have % squad requests waiting to be approved.', pending_count
      using errcode = '42901';
  end if;

  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, p_team_id, p_role, null, 'pending')
  returning * into new_membership;

  return new_membership;
end;
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ⚠️ NOT SECURITY DEFINER — runs as the caller; RLS on player_parents is the boundary.
CREATE OR REPLACE FUNCTION public.save_player_parents(_player uuid, _rows jsonb)
 RETURNS SETOF player_parents
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  kept    jsonb;
  claimed int;
  updated int;
begin
  if _player is null then
    raise exception 'save_player_parents needs a player id.' using errcode = '22004';
  end if;

  select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb)
    into kept
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb))
         with ordinality as e(value, ordinality)
   where btrim(coalesce(e.value->>'full_name', '')) <> '';

  delete from public.player_parents pp
   where pp.player_id = _player
     and pp.id not in (
           select (r.value->>'id')::uuid
             from jsonb_array_elements(kept) as r(value)
            where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null
         );

  select count(*)
    into claimed
    from jsonb_array_elements(kept) as r(value)
   where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null;

  with incoming as (
    select (r.value->>'id')::uuid                                       as id,
           btrim(r.value->>'full_name')                                 as full_name,
           nullif(btrim(coalesce(r.value->>'first_name',   '')), '')    as first_name,
           nullif(btrim(coalesce(r.value->>'last_name',    '')), '')    as last_name,
           nullif(btrim(coalesce(r.value->>'relationship', '')), '')    as relationship,
           nullif(btrim(coalesce(r.value->>'email',        '')), '')    as email,
           nullif(btrim(coalesce(r.value->>'phone',        '')), '')    as phone,
           coalesce((r.value->>'is_primary')::boolean, false)           as is_primary,
           coalesce((r.value->>'sort_order')::int, (r.ordinality - 1)::int) as sort_order
      from jsonb_array_elements(kept) with ordinality as r(value, ordinality)
     where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null
  )
  update public.player_parents pp
     set full_name    = i.full_name,
         first_name   = i.first_name,
         last_name    = i.last_name,
         relationship = i.relationship,
         email        = i.email,
         phone        = i.phone,
         is_primary   = i.is_primary,
         sort_order   = i.sort_order
    from incoming i
   where pp.id = i.id
     and pp.player_id = _player;

  get diagnostics updated = row_count;

  if updated <> claimed then
    raise exception
      'That parent record does not belong to this player, or you may not edit it.'
      using errcode = '42501';
  end if;

  insert into public.player_parents
        (player_id, full_name, first_name, last_name, relationship, email, phone,
         is_primary, sort_order)
  select _player,
         btrim(r.value->>'full_name'),
         nullif(btrim(coalesce(r.value->>'first_name',   '')), ''),
         nullif(btrim(coalesce(r.value->>'last_name',    '')), ''),
         nullif(btrim(coalesce(r.value->>'relationship', '')), ''),
         nullif(btrim(coalesce(r.value->>'email',        '')), ''),
         nullif(btrim(coalesce(r.value->>'phone',        '')), ''),
         coalesce((r.value->>'is_primary')::boolean, false),
         coalesce((r.value->>'sort_order')::int, (r.ordinality - 1)::int)
    from jsonb_array_elements(kept) with ordinality as r(value, ordinality)
   where nullif(btrim(coalesce(r.value->>'id', '')), '') is null;

  return query
    select pp.*
      from public.player_parents pp
     where pp.player_id = _player
     order by pp.sort_order, pp.created_at;
end
$function$

-- proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_message_pinned(_message uuid, _pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record;
begin
  select id, channel, team_id, club_id, conversation_id, deleted_at
    into m from public.messages where id = _message;
  if m.id is null then
    raise exception 'no such message';
  end if;
  if m.deleted_at is not null then
    raise exception 'a removed message cannot be pinned';
  end if;
  if m.channel = 'dm' then
    if not (private.in_conversation(m.conversation_id)
            or private.conversation_reviewable(m.conversation_id)) then
      raise exception 'only people in this chat may pin';
    end if;
  elsif m.channel in ('squad', 'staff') then
    if not ((m.team_id is not null and private.can_edit_team(m.team_id))
            or (m.team_id is null and private.is_admin(m.club_id))) then
      raise exception 'only squad staff may pin here';
    end if;
  else
    raise exception 'unknown channel';
  end if;
  update public.messages set pinned = _pinned where id = _message;
end $function$

-- public.leave_group(_conversation uuid) — LIVE, definition not fetched in this pass.
-- Metadata: SECURITY DEFINER, SET search_path TO 'public', VOLATILE,
-- proacl {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}, prosrc 975 chars.
-- Capture with: select pg_get_functiondef('public.leave_group(uuid)'::regprocedure);

-- proacl: {postgres, authenticated, service_role}
CREATE OR REPLACE FUNCTION public.leave_group(_conversation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  was_owner boolean;
  remaining int;
begin
  select gm.is_owner into was_owner from conversation_members gm
   where gm.conversation_id = _conversation and gm.profile_id = me;
  if was_owner is null then
    raise exception 'not your group' using errcode = '42501';
  end if;
  delete from conversation_members
   where conversation_id = _conversation and profile_id = me;
  select count(*) into remaining from conversation_members
   where conversation_id = _conversation;
  if remaining < 3 and not private.conversation_reported(_conversation) then
    delete from conversations where id = _conversation;
  elsif was_owner then
    update conversation_members set is_owner = true
     where conversation_id = _conversation
       and profile_id = (select profile_id from conversation_members
                          where conversation_id = _conversation
                          order by joined_at, profile_id limit 1);
  end if;
end;
$function$


-- ══════════════════════════════════════════════════════════════════════════
--  public.touch_last_seen  (26 Aug 2026, 20260826_last_seen.sql)
-- ══════════════════════════════════════════════════════════════════════════
--
-- The ONLY write path to profiles.last_seen_at — the admin "Last active"
-- fact. No arguments on purpose (cannot stamp anyone else's row); the
-- 12-hour floor keeps it to roughly one write per person per day whatever
-- the client does. Day granularity is the privacy line: the deliberate,
-- admin-facing exception to chat's no-stored-presence ruling.
CREATE OR REPLACE FUNCTION public.touch_last_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '12 hours');
$function$
;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_last_seen() FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
-- ---------------------------------------------------------------------
-- public.member_identity(uuid)   (26 Aug 2026)
-- APPLIED to production 26 Aug 2026 (function measured present after
-- apply; db/tests/member-identity.sql green against live, rolled back).
-- One row per ACTIVE membership — role, title, is_super, squad, sort —
-- for any active member of the same club. Identity only: no contact
-- column exists here. claude/plans/2026-08-26-dm-identity-rows.md.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_identity(_profile uuid)
 RETURNS TABLE(role text, title text, is_super boolean, squad text, squad_sort integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
-- ⚠️ BODY REPLACED 26 Aug 2026 by 20260826_club_officers.sql (officer rows
-- union in) — APPLIED to production the same day, harness green rolled back.
AS $function$
  select m.role, m.title, coalesce(m.is_super, false), t.name, t.sort_order
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = _profile
     and m.status = 'active'
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = m.club_id
     )
  union all
  select 'officer', o.title, false, null::text, null::integer
    from club_officers o
   where o.profile_id = _profile
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = o.club_id
     )
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-30 — ROLE CHANNELS (20260830_role_channels.sql). Three NEW
-- functions, captured verbatim from the migration the day it was applied and
-- verified by db/tests/role-channels.sql against live (14 steps, all green).
-- The same migration REPLACED can_reply_to, set_message_provenance and
-- my_chats above — each carries a 20260830 marker at its edit — and also
-- surfaced that this capture had MISSED the 25 Aug group-chat rewrite of
-- set_message_provenance (now corrected at that entry).
-- ═══════════════════════════════════════════════════════════════════════════

-- private.in_role_channel(_channel, _club) — is the CALLER in this role
-- channel? The single membership rule: called by all four messages policies,
-- can_reply_to and my_chats. proacl: authenticated only.
CREATE OR REPLACE FUNCTION private.in_role_channel(_channel text, _club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case _channel
    when 'clubstaff' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and m.role in ('coach','manager','medic','admin'))
    when 'headcoaches' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and ((m.role = 'coach' and m.is_head_coach)
           or (m.role = 'admin' and 'chat-headcoaches' = any(m.admin_rights))))
    when 'managers' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and (m.role = 'manager'
           or (m.role = 'admin' and 'chat-managers' = any(m.admin_rights))))
    when 'medics' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and (m.role = 'medic'
           or (m.role = 'admin' and 'chat-medics' = any(m.admin_rights))))
    when 'welfare' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and m.role = 'admin' and 'welfare' = any(m.admin_rights))
    else false
  end;
$function$
;

-- private.role_channel_audience(_channel, _club) — every member, with the
-- reason they are in ("Head coach — U10 Mixed", "Admin — chat access").
-- Feeds the mention filter and channel_members. proacl: authenticated only.
CREATE OR REPLACE FUNCTION private.role_channel_audience(_channel text, _club uuid)
 RETURNS TABLE(profile_id uuid, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with rows as (
    select m.profile_id,
           case
             when _channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach
               then 'Head coach — ' || t.name
             when _channel = 'managers' and m.role = 'manager'
               then 'Manager — ' || t.name
             when _channel = 'medics' and m.role = 'medic'
               then 'Medic' || coalesce(' — ' || t.name, '')
             when _channel = 'welfare' and m.role = 'admin' and 'welfare' = any(m.admin_rights)
               then 'Welfare'
             when _channel = 'clubstaff' and m.role in ('coach','manager','medic')
               then initcap(m.role) || coalesce(' — ' || t.name, '')
             when _channel = 'clubstaff' and m.role = 'admin'
               then 'Club admin'
             when _channel in ('headcoaches','managers','medics') and m.role = 'admin'
                  and ('chat-' || _channel) = any(m.admin_rights)
               then 'Admin — chat access'
           end as reason
      from public.memberships m
      left join public.teams t on t.id = m.team_id
     where m.club_id = _club and m.status = 'active'
  )
  select r.profile_id, string_agg(distinct r.reason, ' · ' order by r.reason)
    from rows r
   where r.reason is not null
   group by r.profile_id;
$function$
;

-- public.channel_members(_channel, _team) — the member sheet behind every
-- channel header: (profile_id, full_name, reason) for any channel the caller
-- can read. Each arm re-applies the channel's own read rule; the CLUB arm is
-- ADMIN-ONLY on purpose (names are squad-scoped for everyone else — see the
-- migration's note). proacl: authenticated only. Body: the migration,
-- verbatim — db/migrations/20260830_role_channels.sql §"The member sheet".
CREATE OR REPLACE FUNCTION public.channel_members(_channel text, _team uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, full_name text, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_club uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select m.club_id into my_club from memberships m
   where m.profile_id = auth.uid() and m.status = 'active'
   order by m.created_at limit 1;
  if my_club is null then
    raise exception 'no active membership' using errcode = '42501';
  end if;

  if _channel = 'squad' and _team is not null then
    if not private.can_see_team(_team) then
      raise exception 'not your squad' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then case when m.is_head_coach then 'Head coach' else 'Coach' end
                           when 'manager' then 'Manager' when 'medic' then 'Medic'
                           when 'parent' then 'Parent' when 'player' then 'Player'
                           else initcap(m.role) end, ' · ')
        from private.notice_audience((select t.club_id from teams t where t.id = _team), _team) aud(pid)
        join profiles p on p.id = aud.pid
        left join memberships m on m.profile_id = p.id and m.status = 'active'
                                and (m.team_id = _team or m.role = 'admin')
       group by p.id, p.full_name;
  elsif _channel = 'staff' and _team is not null then
    if not private.can_edit_team(_team) then
      raise exception 'not your staff channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then case when m.is_head_coach then 'Head coach' else 'Coach' end
                           when 'manager' then 'Manager' when 'medic' then 'Medic'
                           else initcap(m.role) end, ' · ')
        from private.staff_audience(_team) aud(pid)
        join profiles p on p.id = aud.pid
        left join memberships m on m.profile_id = p.id and m.status = 'active'
                                and (m.team_id = _team or m.role = 'admin')
       group by p.id, p.full_name;
  elsif _channel = 'club' then
    if not private.is_admin(my_club) then
      raise exception 'not your channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then 'Coach' when 'manager' then 'Manager'
                           when 'medic' then 'Medic' when 'parent' then 'Parent'
                           when 'player' then 'Player' else initcap(m.role) end, ' · ')
        from memberships m join profiles p on p.id = m.profile_id
       where m.club_id = my_club and m.status = 'active'
       group by p.id, p.full_name;
  elsif _channel in ('headcoaches','managers','medics','welfare','clubstaff') then
    if not private.in_role_channel(_channel, my_club) then
      raise exception 'not your channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name, rca.reason
        from private.role_channel_audience(_channel, my_club) rca
        join profiles p on p.id = rca.profile_id;
  else
    raise exception 'no such channel' using errcode = '22023';
  end if;
end;
$function$
;

REVOKE ALL ON FUNCTION public.channel_members(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_members(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.channel_members(text, uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- public.club_icon_map() and public.member_icons(uuid)  (31 Aug 2026 — profile icons)
-- pg_get_functiondef from live, 31 Aug 2026. Read paths for the icon layer:
-- the club-wide primary map chat shares, and the person card's full list.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_icon_map()
 RETURNS TABLE(profile_id uuid, icon text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_club as (
    select m.club_id from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
     order by m.created_at limit 1
  ),
  worn as (
    select i.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i join my_club c on c.club_id = i.club_id
     where i.profile_id is not null
    union all
    select m.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i
      join my_club c on c.club_id = i.club_id
      join memberships m on m.team_id = i.team_id and m.status = 'active'
       and m.role in ('coach','manager','medic')
     where i.team_id is not null
  )
  select distinct on (w.profile_id) w.profile_id, w.icon
    from worn w
   order by w.profile_id, w.is_primary desc, w.created_at desc;
$function$

;

CREATE OR REPLACE FUNCTION public.member_icons(_profile uuid)
 RETURNS TABLE(id uuid, icon text, reason text, is_primary boolean, team_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_club as (
    select m.club_id from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
     order by m.created_at limit 1
  )
  select i.id, i.icon, i.reason, i.is_primary, null::text, i.created_at
    from profile_icons i join my_club c on c.club_id = i.club_id
   where i.profile_id = _profile
  union all
  select i.id, i.icon, i.reason, i.is_primary, t.name, i.created_at
    from profile_icons i
    join my_club c on c.club_id = i.club_id
    join teams t on t.id = i.team_id
   where i.team_id is not null
     and exists (select 1 from memberships m
        where m.profile_id = _profile and m.team_id = i.team_id
          and m.status = 'active' and m.role in ('coach','manager','medic'))
   order by is_primary desc, created_at desc;
$function$

;


-- =====================================================================
-- 2026-08-31 — THE DOCUMENTS REPO (db/migrations/20260831_documents.sql
-- and db/migrations/20260831_documents_push_acl.sql)
--
-- Seven functions, captured verbatim from pg_get_functiondef AFTER
-- applying, with proacl read from pg_proc rather than assumed from the
-- GRANT lines in the migration. That distinction earned its keep here —
-- see the ⚠️ block on document_push_subscriptions below.
-- =====================================================================


-- ---------------------------------------------------------------------
-- private.document_key_team(text)
-- proacl: postgres=X/postgres | authenticated=X/postgres
--
-- The write authority for a storage key. A storage policy sees only a
-- filename, so the FIRST PATH SEGMENT is the authority: `club/…` for
-- admins, `<team_id>/…` for that squad's staff. IMMUTABLE and pinned to
-- an EMPTY search_path — it is called from storage RLS, which is the
-- ruling private.staff_photo_owner records. Fails CLOSED: anything that
-- is not a bare uuid in segment 1 yields null, and null comparisons are
-- never true.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.document_key_team(_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when split_part(_key, '/', 1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
  end;
$function$
;

REVOKE ALL ON FUNCTION private.document_key_team(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.document_key_team(text) FROM anon;
GRANT EXECUTE ON FUNCTION private.document_key_team(text) TO authenticated;


-- ---------------------------------------------------------------------
-- private.is_active_staff_of(uuid)
-- proacl: postgres=X/postgres | authenticated=X/postgres
--
-- ⚠️ THE MANAGE SET, AND IT EXCLUDES medic ON PURPOSE. The READ set in
-- can_read_document below DOES include medic. A medic reads a staff
-- document; a coach or manager curates one. Do not "fix" the asymmetry.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_active_staff_of(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.team_id = _team
      and m.status = 'active'
      and m.role in ('coach','manager'));
$function$
;

REVOKE ALL ON FUNCTION private.is_active_staff_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_active_staff_of(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_active_staff_of(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_read_document(uuid)
-- proacl: postgres=X/postgres | authenticated=X/postgres
--
-- The read gate, used by BOTH the documents/document_squads select
-- policies and the storage READ policy. Four arms: admin anywhere, the
-- uploader, a club_wide document, or a targeted squad via the junction.
-- staff_only narrows the last two to coach/manager/medic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_read_document(_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from documents d
    where d.id = _doc
      and (
        private.is_admin_anywhere()
        or d.created_by = auth.uid()
        or (d.club_wide and exists (
              select 1 from memberships m
              where m.profile_id = auth.uid() and m.status = 'active'
                and (not d.staff_only
                     or m.role in ('coach','manager','medic'))))
        or (not d.club_wide and exists (
              select 1 from document_squads ds
              join memberships m
                on m.team_id = ds.team_id
               and m.profile_id = auth.uid()
               and m.status = 'active'
              where ds.document_id = _doc
                and (not d.staff_only
                     or m.role in ('coach','manager','medic'))))));
$function$
;

REVOKE ALL ON FUNCTION private.can_read_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_document(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_read_document(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_manage_document(uuid)
-- proacl: postgres=X/postgres | authenticated=X/postgres
--
-- The delete/edit gate. Note the club_wide arm is ABSENT by design: a
-- club-wide document is manageable by an admin or its uploader only —
-- squad staff cannot delete something the club published to everyone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_manage_document(_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from documents d
    where d.id = _doc
      and (
        private.is_admin_anywhere()
        or d.created_by = auth.uid()
        or (not d.club_wide and exists (
              select 1 from document_squads ds
              where ds.document_id = _doc
                and private.is_active_staff_of(ds.team_id)))));
$function$
;

REVOKE ALL ON FUNCTION private.can_manage_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_document(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_manage_document(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- public.create_document(text, text, boolean, boolean, uuid[], text,
--                        text, bigint, text, boolean)
-- proacl: postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- ⚠️ THE ONLY WAY A ROW IS INSERTED. There is no INSERT policy on
-- documents. Three gates before the insert: club_wide needs admin; every
-- targeted squad must be one the caller staffs; and the storage key's
-- PREFIX must be an authority the caller holds AND — for a squad prefix —
-- one of the squads the document actually names, so a coach cannot park a
-- file under a squad the document does not target.
--
-- The push is best-effort inside its own BEGIN/EXCEPTION: a push that
-- cannot be sent must never fail the upload.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_document(_title text, _category text, _staff_only boolean, _club_wide boolean, _team_ids uuid[], _storage_key text, _file_name text, _file_size bigint, _content_type text, _notify boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _doc uuid;
  _club uuid;
  _team uuid;
  _prefix_team uuid;
  _endpoint text;
  _secret text;
begin
  select club_id into _club from teams order by sort_order limit 1;

  if _club_wide then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can publish a club-wide document.'
        using errcode = '42501';
    end if;
  else
    if _team_ids is null or cardinality(_team_ids) = 0 then
      raise exception 'Choose at least one age group.' using errcode = '22023';
    end if;
    foreach _team in array _team_ids loop
      if not (private.is_admin_anywhere()
              or private.is_active_staff_of(_team)) then
        raise exception 'You can only publish to squads you staff.'
          using errcode = '42501';
      end if;
    end loop;
  end if;

  -- The key's prefix must be an authority the CALLER holds and, for a
  -- squad-prefixed key, one of the targeted squads — otherwise a coach
  -- could park a file under a squad the document does not name.
  _prefix_team := private.document_key_team(_storage_key);
  if split_part(_storage_key, '/', 1) = 'club' then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can file under club/.'
        using errcode = '42501';
    end if;
  elsif _prefix_team is null
     or (not _club_wide and not (_prefix_team = any(_team_ids))) then
    raise exception 'The storage key must live under club/ or a targeted squad.'
      using errcode = '22023';
  end if;

  insert into documents (club_id, title, category, staff_only, club_wide,
                         storage_key, file_name, file_size, content_type,
                         created_by)
  values (_club, trim(_title), _category, _staff_only, _club_wide,
          _storage_key, _file_name, _file_size, _content_type, auth.uid())
  returning id into _doc;

  if not _club_wide then
    insert into document_squads (document_id, team_id)
    select _doc, distinct_team from unnest(_team_ids) as distinct_team
    on conflict do nothing;
  end if;

  -- Optional push. Same vault plumbing as private.notify_notice_push; a
  -- push that cannot be sent must never fail the upload.
  if _notify then
    select decrypted_secret into _endpoint
      from vault.decrypted_secrets where name = 'push_notify_url';
    select decrypted_secret into _secret
      from vault.decrypted_secrets where name = 'approval_notify_secret';
    if _endpoint is null or _secret is null then
      raise warning 'create_document: vault secrets missing, no push sent';
    else
      begin
        perform net.http_post(
          url     := _endpoint,
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'x-approval-secret', _secret),
          body    := jsonb_build_object('document_id', _doc));
      exception when others then
        raise warning 'create_document push: % (document %)', sqlerrm, _doc;
      end;
    end if;
  end if;

  return _doc;
end;
$function$
;

REVOKE ALL ON FUNCTION public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) TO authenticated;


-- ---------------------------------------------------------------------
-- public.update_document(uuid, text, text, boolean, boolean, uuid[])
-- proacl: postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- ⚠️ RE-CAPTURED 31 Aug 2026 from pg_get_functiondef after
--   20260831_documents_policy_split — the prefix-invariant guard below.
--   proacl re-read from pg_proc after the CREATE OR REPLACE and is
--   unchanged (byte-identical to create_document's), which is the 20260821
--   ruling holding for a function that already existed — the case
--   20260831_documents_push_acl had to correct for one that did not.
--
-- ⚠️ METADATA ONLY. storage_key, file_name, file_size, content_type and
-- created_by are NOT in the column list and cannot be reached from the
-- app at all — there is no UPDATE policy on documents. That is the
-- set_my_photo reasoning: RLS grants rows, not columns.
--
-- ⚠️ THE PREFIX GUARD NARROWS STRANDING; IT DOES NOT ELIMINATE IT, AND A
-- RE-REVIEW (31 Aug 2026) CAUGHT THIS COMMENT CLAIMING MORE THAN IT PROVED.
-- What the guard guarantees: a squad-prefixed file's squad is always among
-- the document's targets, so THAT squad's staff (and admins) always hold
-- file authority. What it does not guarantee: that every row-deleter holds
-- it. Two residual arms, both accepted with eyes open: (1) on a MULTI-SQUAD
-- document, any targeted squad's staff may delete the row (Jay ruled to
-- keep the spec's manage rule) while only the prefix squad's staff or an
-- admin may remove the file; (2) created_by keeps row authority after their
-- memberships lapse. Either arm can orphan a file — invisible (no row, and
-- the bucket's only SELECT path is "document read") and, MEASURED in
-- db/tests/rls-documents.sql 13d-13f, removable by NO user JWT — DELETE
-- applies SELECT policies too, so only service_role clears an orphan (an
-- earlier version of this sentence claimed prefix staff or admins could).
-- It also names an admin restriction:
-- the guard has no admin bypass, so retargeting a squad-filed document to a
-- DIFFERENT squad requires delete-and-re-upload even for admins.
-- ⚠️ RESIDUAL: the club-wide flip does not check this. It is admin-only, so
-- it is a trusted actor's choice rather than an escalation; moving the object
-- is not something an RPC can do inside its own transaction. See the
-- 20260831_documents_policy_split header.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_document(_id uuid, _title text, _category text, _staff_only boolean, _club_wide boolean, _team_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _team uuid;
  _prefix_team uuid;
begin
  if not private.can_manage_document(_id) then
    raise exception 'Not your document to change.' using errcode = '42501';
  end if;

  if _club_wide then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can make a document club-wide.'
        using errcode = '42501';
    end if;
  else
    if _team_ids is null or cardinality(_team_ids) = 0 then
      raise exception 'Choose at least one age group.' using errcode = '22023';
    end if;
    foreach _team in array _team_ids loop
      if not (private.is_admin_anywhere()
              or private.is_active_staff_of(_team)) then
        raise exception 'You can only target squads you staff.'
          using errcode = '42501';
      end if;
    end loop;

    select private.document_key_team(storage_key) into _prefix_team
      from documents where id = _id;
    if _prefix_team is not null and not (_prefix_team = any(_team_ids)) then
      raise exception
        'The targeted squads must keep the squad the file is stored under.'
        using errcode = '22023';
    end if;
  end if;

  update documents
     set title = trim(_title), category = _category,
         staff_only = _staff_only, club_wide = _club_wide
   where id = _id;

  delete from document_squads where document_id = _id;
  if not _club_wide then
    insert into document_squads (document_id, team_id)
    select _id, t from unnest(_team_ids) as t
    on conflict do nothing;
  end if;
end;
$function$
;

REVOKE ALL ON FUNCTION public.update_document(uuid,text,text,boolean,boolean,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_document(uuid,text,text,boolean,boolean,uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_document(uuid,text,text,boolean,boolean,uuid[]) TO authenticated;


-- ---------------------------------------------------------------------
-- public.document_push_subscriptions(uuid)
-- proacl: postgres=X/postgres | service_role=X/postgres
--
-- ⚠️⚠️ THIS proacl IS THE SECOND MIGRATION, AND THE REASON THE CAPTURE
--   RULE IS "READ pg_proc, DO NOT TRANSCRIBE THE MIGRATION'S GRANTS".
--   20260831_documents.sql deliberately wrote NO grant lines here, citing
--   the 20260821 ruling that `create or replace` preserves the ACL. That
--   ruling is true only for a function that ALREADY EXISTS. This one was
--   NEW, so there was nothing to preserve and it was born with Supabase's
--   default `functions EXECUTE to PUBLIC/anon/authenticated` — the exact
--   trap db/schema/grants.sql section 1 warns about, measured live as:
--     =X | postgres=X | anon=X | authenticated=X | service_role=X
--   while all five siblings (notice_/squad_/message_/approval_/
--   availability_push_subscriptions) are postgres + service_role only.
--   It is SECURITY DEFINER and returns endpoint + p256dh + auth, which is
--   the material needed to push to a person's device. Closed the same day
--   by db/migrations/20260831_documents_push_acl.sql; re-measured after,
--   has_function_privilege('anon', …, 'EXECUTE') = false on all six.
--
-- distinct: a person in two targeted squads is pushed once — the
-- notice_multi_squad lesson. The uploader is excluded, and the 'document'
-- opt-out is respected.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_push_subscriptions(_document uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with doc as (select * from documents where id = _document),
  people as (
    select distinct m.profile_id
      from doc d
      join memberships m
        on m.status = 'active'
       and (d.club_wide
            or m.team_id in (select team_id from document_squads
                              where document_id = d.id))
     where (not d.staff_only or m.role in ('coach','manager','medic')))
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join doc d
   where p.profile_id <> d.created_by
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = p.profile_id and o.category = 'document');
$function$
;

REVOKE ALL ON FUNCTION public.document_push_subscriptions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_push_subscriptions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.document_push_subscriptions(uuid) FROM authenticated;


-- ═══════════════════════════════════════════════════════════════════════
--  Player leavers, 2 Sep 2026 (20260902_player_leavers.sql, then
--  20260902_player_leavers_left_grants_nothing.sql). Both applied to live
--  2 Sep 2026, Jay's go-ahead. claude/specs/2026-09-02-player-leavers-design.md.
--  proacl on both: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- ═══════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- public.mark_player_left(uuid)
--
-- Same authorisation predicate as the "player edit" policy: private.can_write_child()
-- OR private.is_team_staff(that player's team_id) -- the screen never decides
-- who may do this. Sets left_at/left_by and, in the SAME statement, clears
-- the photo columns on the row -- the storage OBJECT itself is removed by the
-- app afterwards via the Storage API (RESTORE.md: SQL cannot delete a storage
-- object). Every membership row for that player with role in
-- ('parent','player') moves from 'active'/'pending' to 'left'. Refuses if
-- already left.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_player_left(p_player_id uuid)
 RETURNS TABLE(id uuid, photo_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is not null then
    raise exception 'This player has already been marked as left.' using errcode = '22023';
  end if;

  update public.players p
     set left_at = now(), left_by = auth.uid(),
         photo_path = null, photo_focus_x = null, photo_focus_y = null
   where p.id = p_player_id;

  update public.memberships m
     set status = 'left'
   where m.player_id = p_player_id
     and m.role in ('parent','player')
     and m.status in ('active','pending');

  return query select ply.id, ply.photo_path;
end $function$
;

REVOKE ALL ON FUNCTION public.mark_player_left(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_player_left(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- public.restore_player(uuid)
--
-- Same authorisation predicate and grant as mark_player_left. Clears
-- left_at/left_by and flips that child's 'left' memberships back to
-- 'active' -- the family has its squad access back the moment this
-- returns. Refuses if the player is not currently a leaver.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_player(p_player_id uuid)
 RETURNS players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is null then
    raise exception 'This player has not been marked as left.' using errcode = '22023';
  end if;

  update public.players p set left_at = null, left_by = null where p.id = p_player_id;
  update public.memberships m set status = 'active'
   where m.player_id = p_player_id and m.role in ('parent','player') and m.status = 'left';

  select * into ply from public.players p where p.id = p_player_id;
  return ply;
end $function$
;

REVOKE ALL ON FUNCTION public.restore_player(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_player(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.is_team_staff(uuid)
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
--
-- ⚠️ CAPTURED FROM LIVE 2 Sep 2026, and it had been MISSING from this file
-- since it was created on 28 Aug (20260828_child_contacts_allowlist.sql).
-- That gap is why it is worth a note rather than a silent addition: this
-- function is the squad-staff arm of the "player edit" policy, of the
-- player_contacts / player_parents / player_private allowlists, of the
-- player-photo storage policy, and of both leavers RPCs — and a reader
-- auditing membership predicates from this file alone would not have seen it.
--
-- The non-admin arm of can_edit_team, split out on 28 Aug so a coach keeps
-- their own squad's contacts and DOB when the admin arm narrows. Note it
-- requires status = 'active': an unapproved coach is a REQUEST to be staff,
-- not staff. (Harness step 4a of db/tests/player-leavers.sql pins that.)
-- Live body on 2 Sep 2026 is equivalent to the creating migration's, so the
-- 2 Sep leavers work deliberately did not restate it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_team_staff(_team uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
     where m.profile_id=auth.uid() and m.status='active'
       and m.role in ('coach','manager','medic') and m.team_id=_team); $function$
;

REVOKE ALL ON FUNCTION private.is_team_staff(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.is_team_staff(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- private.can_write_child()
-- proacl: {postgres=X/postgres,authenticated=X/postgres}
--
-- ⚠️ CAPTURED FROM LIVE 2 Sep 2026, missing from this file since 28 Aug
-- (20260828_child_write_allowlist.sql) for the same reason as is_team_staff
-- above, and it matters more: this is the ADMIN arm of every write gate on a
-- child. It is deliberately NOT `is_admin` — a club admin with no relevant
-- job cannot write a child's row. Only a super admin, or one holding
-- clubadmin / youth / media.
--
-- ⚠️ It is also the ONE predicate that can be evaluated with no player row in
-- hand, which is why the leavers RPCs use it to decide whether a caller is
-- entitled to be told a player does not exist
-- (db/migrations/20260902_player_leavers_pending_and_feed.sql).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_write_child()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media']));
$function$
;

REVOKE ALL ON FUNCTION private.can_write_child() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.can_write_child() TO authenticated;
