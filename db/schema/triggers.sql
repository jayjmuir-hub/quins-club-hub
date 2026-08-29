-- =====================================================================
-- db/schema/triggers.sql
-- CAPTURE of every non-internal trigger relevant to this app in Supabase
-- project lusmshimxdcxpnrktlgz (quins-club-hub), 2026-08-03.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md.
--
-- Source: pg_trigger + pg_get_triggerdef(oid), filtered to schemas
-- public, private and auth, excluding tgisinternal (FK enforcement
-- triggers) — verbatim.
--
-- ⚠️ RE-CAPTURED 2026-08-07: THIS FILE'S HEADLINE CLAIM IS NO LONGER TRUE.
-- It said "exactly TWO triggers exist, both on auth.users. There are NO
-- triggers on any `public` or `private` table." There are now THREE, and the
-- third IS on a public table: profiles_sync_name on public.profiles, added
-- 2026-08-06 with the split first/last name work. See the end of this file.
--
-- ⚠️ RE-CAPTURED 2026-08-09. There are now FOUR, and the fourth is also on a
-- public table: notify_pending_membership on public.memberships, added
-- 2026-08-09 by migration 20260809093858 (notify_pending_membership). See the
-- end of this file.
--
-- ⚠️ RE-CAPTURED 2026-08-11. There are now SIX. Both new ones are on
-- public.pitch_requests and both call private.notify_pitch_request, added by
-- 20260811051334 (pitch_request_notify). They were live from 11 Aug with no
-- entry in this file until this re-capture. ⚠️ **A trigger is the easiest
-- object in this schema to leave uncaptured**, because unlike a function or a
-- policy nothing in the app names it — the code that causes it to fire is an
-- ordinary INSERT that looks like every other INSERT.
--
-- Migrations since the 7 Aug capture that touch anything in this file:
--   20260807153404 sync_profile_name_pin_search_path  (already noted below)
--   20260808084615 sync_profile_name_single_word      → the "KNOWN BUG" note
--                                                       below is now FIXED
--   20260809093858 notify_pending_membership          → the new trigger
-- The other twelve migrations of 8-9 Aug created no triggers and dropped
-- none. No trigger was dropped, disabled or renamed since 7 Aug.
--
-- ⚠️ No unexplained drift found in this file on 9 Aug: every one of the four
-- triggers traces to a migration, and all four are enabled in ORIGIN mode
-- (tgenabled = 'O').
--
-- Still true: there is no updated_at maintenance trigger anywhere —
-- availability.updated_at is only ever set by its DEFAULT now() on insert and
-- by the application explicitly on update.
--
-- Because the FIRST TWO below sit on auth.users, they are OUTSIDE the tables the
-- Supabase dashboard's table editor shows. They are easy to forget and
-- easy to lose if auth schema objects are ever recreated. Their function
-- bodies are in functions.sql (private.handle_new_user,
-- private.handle_user_email_change).
-- =====================================================================


-- ---------------------------------------------------------------------
-- auth.users → on_auth_user_created
-- Creates the public.profiles row for a brand-new signup and, when the signup
-- carried a signup_intent, writes the pending access_requests row and applies
-- the intent once the email is confirmed. Upserts the profile, so a re-fire on
-- an existing id refreshes email/confirmation rather than failing. Full body in
-- functions.sql — re-captured 2026-08-29 after it had drifted well behind live.
-- ---------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();


-- ---------------------------------------------------------------------
-- auth.users → on_auth_user_email_updated
-- Keeps public.profiles.email in sync when a user changes their login
-- email. Fires only when the email actually changed (WHEN clause), so a
-- routine UPDATE on auth.users does not touch profiles.
--
-- This matters for correctness, not just tidiness: the RLS policy
-- "invites read own" and private.is_own_invite() both match invites on
-- lower(auth.jwt() ->> 'email'), while the Accounts screen reads
-- profiles.email. If this trigger were lost, those two would drift apart
-- and an admin would be looking at a stale address.
-- ---------------------------------------------------------------------
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION private.handle_user_email_change();


-- ---------------------------------------------------------------------
-- public.profiles → profiles_sync_name          ADDED 2026-08-06
--
-- Keeps full_name in step with first_name / last_name in BOTH directions, so
-- callers may write either side. first/last win when both change in one
-- statement: they are the explicit input, full_name is the derived display
-- value.
--
-- ⚠️ NOT SECURITY DEFINER — plain LANGUAGE plpgsql, so it runs as the caller.
-- (claude/state-of-play.md called it SECURITY DEFINER on 7 Aug; that was
-- wrong.) Its search_path was pinned to '' on 2026-08-07 —
-- db/migrations/20260807_sync_profile_name_search_path.sql.
--
-- ⚠️ THE SINGLE-WORD BUG IS FIXED — this note said "KNOWN BUG, recorded not
-- fixed" until the 9 Aug re-capture, and that is no longer true. It described
-- a SINGLE-WORD full_name coming back out with last_name set to the same
-- word, because stripping the last word off a one-word string leaves the
-- string unchanged rather than empty, so the guard never fired. Migration
-- 20260808084615 (sync_profile_name_single_word) replaced the function body:
-- it now tests `position(' ' in full_in) = 0` and decides on the split BEFORE
-- deriving either name, setting first_name to the whole word and last_name to
-- NULL. Verified against the live body on 9 Aug. The trigger DEFINITION below
-- is unchanged — only the function it calls was replaced, so the fix is
-- visible in functions.sql, not here.
-- ---------------------------------------------------------------------
CREATE TRIGGER profiles_sync_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.sync_profile_name();


-- ---------------------------------------------------------------------
-- public.memberships → notify_pending_membership     ADDED 2026-08-09
--
-- Fires only on an INSERT whose status is 'pending' (the WHEN clause), i.e.
-- only on a self-registration awaiting approval. An ordinary membership
-- created by an admin or by accept_invite() lands as 'active' and does not
-- touch this path at all.
--
-- ⚠️ IT SENDS AN EMAIL, from inside the transaction that inserts the row.
-- private.notify_pending_membership() is SECURITY DEFINER with search_path
-- pinned to 'public'; it reads two vault secrets (approval_notify_url,
-- approval_notify_secret) and calls net.http_post with the membership id.
-- Two consequences worth knowing before touching either side:
--   * It CANNOT fail the insert. The body ends in `exception when others
--     then raise warning ...; return new;`, and a missing vault secret only
--     raises a warning too. A registration is never lost because the mail
--     path is broken — but equally, a broken mail path is SILENT except in
--     the Postgres log.
--   * The trigger is the only thing that fires it. Nothing calls the
--     function directly.
--
-- Immediate one-email-per-registration rather than a digest was Jay's ruling
-- — claude/decisions/2026-08-09-approvals-emails-and-accounts.md.
--
-- Body in functions.sql. This is the FIRST trigger in this project that
-- reaches outside the database.
-- ---------------------------------------------------------------------
CREATE TRIGGER notify_pending_membership
  AFTER INSERT ON public.memberships
  FOR EACH ROW
  WHEN ((new.status = 'pending'::text))
  EXECUTE FUNCTION private.notify_pending_membership();


-- ---------------------------------------------------------------------
-- public.pitch_requests → notify_pitch_request_asked      ADDED 2026-08-11
--
-- Mails whoever holds Pitch Management, and every super admin, when a coach files a
-- request. No WHEN clause: a row in this table IS a question being asked, and
-- there is no state it can be inserted in that nobody needs telling about.
--
-- ⚠️ SUPER ADMINS ARE RECIPIENTS DELIBERATELY. A super holds every admin right
-- implicitly, so a recipient query filtering on the `pitches` right alone would
-- exclude the one person certain to be able to act. The recipient list is built
-- in the edge function, not here — this trigger posts only the request id.
--
-- Body and the "why the database sends it" argument: functions.sql.
-- ---------------------------------------------------------------------
CREATE TRIGGER notify_pitch_request_asked
  AFTER INSERT ON public.pitch_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_pitch_request();


-- ---------------------------------------------------------------------
-- public.pitch_requests → notify_pitch_request_answered   ADDED 2026-08-11
--
-- Mails the coach who asked, once the request is decided. Same function as
-- above; the edge function tells the two cases apart from the row's status.
--
-- ⚠️ THE WHEN CLAUSE IS THE WHOLE DESIGN, and every clause in it is load-bearing:
--   * `AFTER UPDATE OF status` alone is NOT enough — Postgres fires an
--     `UPDATE OF col` trigger when the column is in the SET list, whether or not
--     the value changed. `old.status IS DISTINCT FROM new.status` is what stops
--     a decision_note correction emailing the coach the same answer twice.
--   * `new.status = ANY (ARRAY['allocated','declined'])` keeps it to DECIDED
--     states. 'cancelled' is excluded because nobody needs telling about a
--     question that has stopped being asked, and 'withdrawn' is a DELETE, which
--     cannot reach an UPDATE trigger at all.
--
-- ⚠️ THE ORDER OF THE TWO WRITES IN allocatePitch IS WHAT MAKES THIS EMAIL
-- CORRECT. src/data/pitchRequests.js writes `events.pitch` FIRST and closes the
-- request SECOND — chosen so a refused fixture write leaves the request open
-- rather than telling a coach they have a pitch they do not have. The side
-- effect is that by the time this trigger fires, events.pitch already holds the
-- real pitch, which is what the mail reads back. **Reversing those two writes
-- would email "you are on Pitch TBD".**
-- ---------------------------------------------------------------------
CREATE TRIGGER notify_pitch_request_answered
  AFTER UPDATE OF status ON public.pitch_requests
  FOR EACH ROW
  WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = ANY (ARRAY['allocated'::text, 'declined'::text]))))
  EXECUTE FUNCTION private.notify_pitch_request();


-- ---------------------------------------------------------------------
-- social_ideas_provenance  (captured 12 Aug 2026)
--
-- BEFORE INSERT on public.social_ideas. Stamps submitted_by, club_id and
-- from_staff from the submitter's own membership, and forces status to 'new'.
--
-- ⚠️ THIS IS THE ONLY THING STOPPING A CLIENT CLAIMING STAFF STATUS. A policy
-- authorises a ROW; it does not stop a caller putting `from_staff: true` in
-- the payload. Same class of hole as memberships.is_super.
-- ---------------------------------------------------------------------
CREATE TRIGGER social_ideas_provenance
  BEFORE INSERT ON public.social_ideas
  FOR EACH ROW EXECUTE FUNCTION private.set_social_idea_provenance();

-- ── events_result_from_components, 12 Aug 2026 ──────────────────────────────
--
-- ⚠️ BEFORE INSERT OR UPDATE, AND GUARDED PER SIDE. A side with no components
-- recorded keeps whatever result it already had. That guard is not tidiness:
-- fixtures exist whose result was typed by hand before components existed, and
-- an unconditional recompute turns a real 22-12 into 0-0 with no error anywhere.
drop trigger if exists events_result_from_components on public.events;
create trigger events_result_from_components
  before insert or update on public.events
  for each row execute function private.events_result_from_components();

-- ── notify_access_request_asked, 12 Aug 2026 ────────────────────────────────
--
-- AFTER INSERT on public.access_requests. Tells every active admin that
-- somebody has asked to be let in.
--
-- ⚠️ THE `when` CLAUSE IS NOT BELT-AND-BRACES, AND REMOVING IT SENDS A WRONG
-- EMAIL. dismissAccessRequest (src/data/accessRequests.js) UPSERTS, and an
-- upsert that finds no existing row is an INSERT — of a row that is already
-- `dismissed`. Without the guard, dismissing a stranger who never asked would
-- email every admin "somebody is asking to join" about the person the admin had
-- just turned away.
-- ⚠️ Proved by removing it inside a transaction on 12 Aug 2026: the queue delta
-- for that insert went 0 → 1. The guard is what makes it 0.
--
-- ⚠️ INSERT ONLY. The other two writes to this table are an UPDATE to
-- 'dismissed' (an admin telling themselves something they just did) and a
-- DELETE (restoreAccessRequest — there is no row left to describe). Both
-- measured at a queue delta of 0.
drop trigger if exists notify_access_request_asked on public.access_requests;
create trigger notify_access_request_asked
after insert on public.access_requests
for each row
when (new.status = 'pending')
execute function private.notify_access_request();


-- ---------------------------------------------------------------------
-- public.announcements  (captured 14 Aug 2026, pg_get_triggerdef)
-- Migration: db/migrations/20260814_announcements.sql
--
-- announcements_provenance OVERWRITES rather than defaults. Assigning
-- author_id/club_id only when null would leave a caller able to supply their
-- own, which is the entire hole it exists to close: a policy authorises a ROW,
-- it does not stop a client putting somebody else's uuid in the payload.
--
-- announcements_touch IS WHY updated_at IS NOT COLUMN-GRANTED. It is written
-- here so that an edit cannot claim not to have happened, which is the only
-- thing the column is for. It also pins author_id/club_id/team_id/created_at
-- back to their OLD values -- belt to the grants' braces, so that restoring a
-- grant by accident does not silently make authorship editable.
-- ---------------------------------------------------------------------
CREATE TRIGGER announcements_provenance BEFORE INSERT ON public.announcements FOR EACH ROW EXECUTE FUNCTION private.set_announcement_provenance();
CREATE TRIGGER announcements_touch BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION private.touch_announcement();


-- ---------------------------------------------------------------------
-- public.players        → players_sync_name          ADDED 2026-08-16
-- public.player_parents → player_parents_sync_name   ADDED 2026-08-16
--
-- ⚠️ THERE ARE NOW EIGHT TRIGGERS, NOT SIX. Both of these run
-- private.sync_person_name(), added by migration split_player_and_parent_names.
-- They are the players/player_parents counterpart of profiles_sync_name, and
-- the function body is deliberately a copy of private.sync_profile_name rather
-- than a generalisation of it — including its 8 Aug single-word fix, where a
-- one-word name must become a FIRST name and not a last one.
--
-- ⚠️ WHY THE COPY IS THE RIGHT CALL. sync_profile_name is pinned to
-- `search_path TO ''` and is load-bearing for the sign-in name gate. Rewriting
-- it to serve three tables would put every profile's name behind a change made
-- for a roster problem. Two functions that are textually identical today are
-- cheaper than one function two features depend on.
--
-- BOTH directions, on INSERT and UPDATE:
--   write full_name          -> first_name/last_name are derived
--   write first_name/last_name -> full_name is composed
--   write both in one statement -> first/last WIN (they are the explicit input)
--
-- ⚠️ THIS IS WHY THE NAME SPLIT CHANGED NO READERS. Around thirty files read
-- players.full_name; all of them still work, because full_name is still
-- maintained. Do not "finish the migration" by dropping it.
--
-- Proved on production 16 Aug 2026 inside a rolled-back transaction, all seven
-- cases: full->split, split->full, one word (last stays NULL), update full,
-- update split, both-at-once, and the same reconciler on player_parents.
-- ---------------------------------------------------------------------
CREATE TRIGGER players_sync_name
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_person_name();

CREATE TRIGGER player_parents_sync_name
  BEFORE INSERT OR UPDATE ON public.player_parents
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_person_name();


-- ---------------------------------------------------------------------
-- public.messages  (captured 23 Aug 2026, pg_get_triggerdef, rolled-back apply)
-- Migration: db/migrations/20260823_squad_chat.sql
--
-- messages_provenance OVERWRITES author_id/club_id/author_role/author_title
-- and, for a reply, team_id/channel/event_id from the parent — the
-- announcements reasoning. messages_touch freezes everything but body,
-- pinned and deleted_at, and blanks the body on soft delete.
-- messages_push fires per row; the FUNCTION decides (staff top-level only).
-- ---------------------------------------------------------------------
CREATE TRIGGER messages_provenance BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.set_message_provenance();
CREATE TRIGGER messages_touch BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION private.touch_message();
CREATE TRIGGER messages_push AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.notify_message_push();


-- ---------------------------------------------------------------------
-- public.message_reports / public.player_private  (23 Aug 2026 — squad chat phase 3)
-- Migration: db/migrations/20260823_squad_chat_phase3.sql
--
-- message_reports_provenance stamps reporter_id and club_id (from the
-- message) and nulls resolved_*; message_reports_touch stamps resolved_by
-- when resolved_at is first set and freezes the rest.
-- player_private_staff_dm_opt_in refuses an opt-in change from anybody but a
-- linked guardian or an admin, and stamps who/when.
-- ---------------------------------------------------------------------
CREATE TRIGGER message_reports_provenance BEFORE INSERT ON public.message_reports FOR EACH ROW EXECUTE FUNCTION private.set_report_provenance();
CREATE TRIGGER message_reports_touch BEFORE UPDATE ON public.message_reports FOR EACH ROW EXECUTE FUNCTION private.touch_report();
CREATE TRIGGER player_private_staff_dm_opt_in BEFORE UPDATE ON public.player_private FOR EACH ROW EXECUTE FUNCTION private.guard_staff_dm_opt_in();


-- ---------------------------------------------------------------------
-- public.memberships → memberships_write_parent_row    ADDED 2026-08-25
-- Migration: db/migrations/20260825_player_parents_from_parent_membership.sql
--
-- ✅ LIVE SINCE 25 Aug 2026, LATER THE SAME DAY IT WAS FOUND MISSING. The
-- 25 Aug re-capture measured this block as NOT LIVE — the migration was
-- committed (squash a5c5efd) with the capture written as if applied, but
-- never run. Applied with Jay's yes that evening: trigger and helper
-- measured present, the backfill wrote 21 rows (player_parents 62 -> 83,
-- zero children left with a parent membership and an empty list), and the
-- trigger was fault-injected in a rolled-back transaction — a fixture
-- parent membership produced exactly one profile-linked primary row, and
-- the rollback was confirmed with a positive control.
--
-- When a parent-role membership lands with a player_id, copy the adult's
-- profile (name, email, phone, profile_id) onto public.player_parents if
-- that child has no row for this adult yet. Needs Attention counts that
-- table, not Club Hub accounts; register_my_player / apply_signup_intent
-- used to leave it empty. Coaches saving a child with no parent membership
-- are not covered — the badge is then telling the truth.
--
-- WHEN (role = 'parent' AND player_id IS NOT NULL): self-register is
-- role='player' and must not write a parent row of the child themselves.
-- The function swallows unexpected errors so a registration cannot fail
-- for a contact copy; blank names are skipped, not raised.
-- ---------------------------------------------------------------------
CREATE TRIGGER memberships_write_parent_row
  AFTER INSERT ON public.memberships
  FOR EACH ROW
  WHEN ((new.role = 'parent'::text) AND (new.player_id IS NOT NULL))
  EXECUTE FUNCTION private.memberships_write_parent_row();


-- =====================================================================
-- RE-CAPTURED 2026-08-25 — FIFTEEN TRIGGERS THIS FILE WAS MISSING
--
-- Live holds 33 non-internal triggers (public + auth); this file captured
-- 20. The push-notification set, the feedback set, the welcome-mail pair on
-- auth.users, the membership audit, and chat round 2's quote guard were all
-- live with no line here. Definitions verbatim from pg_get_triggerdef; all
-- tgenabled='O'. The 19 previously-captured shared triggers were compared
-- and match live verbatim.
-- =====================================================================

CREATE TRIGGER notice_push AFTER INSERT ON public.announcements REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION private.notify_notice_push();

CREATE TRIGGER on_auth_user_confirmed_welcome AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (((old.email_confirmed_at IS NULL) AND (new.email_confirmed_at IS NOT NULL))) EXECUTE FUNCTION private.notify_welcome();

CREATE TRIGGER on_auth_user_created_welcome AFTER INSERT ON auth.users FOR EACH ROW WHEN (((new.email IS NOT NULL) AND (new.email_confirmed_at IS NOT NULL))) EXECUTE FUNCTION private.notify_welcome();

CREATE TRIGGER on_auth_user_email_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN ((old.email_confirmed_at IS DISTINCT FROM new.email_confirmed_at)) EXECUTE FUNCTION private.handle_user_email_confirmed();

CREATE TRIGGER fixture_added_push AFTER INSERT ON public.events REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION private.notify_fixture_added();

CREATE TRIGGER fixture_cancelled_push AFTER DELETE ON public.events REFERENCING OLD TABLE AS deleted FOR EACH STATEMENT EXECUTE FUNCTION private.notify_fixture_cancelled();

CREATE TRIGGER fixture_changed_push AFTER UPDATE ON public.events REFERENCING OLD TABLE AS updated_old NEW TABLE AS updated_new FOR EACH STATEMENT EXECUTE FUNCTION private.notify_fixture_changed();

CREATE TRIGGER notify_feedback AFTER INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION private.notify_feedback();

CREATE TRIGGER notify_feedback_reply_push AFTER UPDATE ON public.feedback FOR EACH ROW WHEN (((new.status IS DISTINCT FROM old.status) OR (new.admin_note IS DISTINCT FROM old.admin_note))) EXECUTE FUNCTION private.notify_feedback_reply_push();

CREATE TRIGGER stamp_feedback BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION private.stamp_feedback();

CREATE TRIGGER notify_invite AFTER INSERT ON public.invites FOR EACH ROW EXECUTE FUNCTION private.notify_invite();

CREATE TRIGGER lineups_touch BEFORE UPDATE ON public.lineups FOR EACH ROW EXECUTE FUNCTION private.touch_lineup();

CREATE TRIGGER audit_membership AFTER INSERT OR DELETE OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.audit_membership();

CREATE TRIGGER pending_membership_push AFTER INSERT ON public.memberships FOR EACH ROW WHEN ((new.status = 'pending'::text)) EXECUTE FUNCTION private.notify_pending_membership_push();

CREATE TRIGGER messages_quote_guard BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.messages_quote_guard();
