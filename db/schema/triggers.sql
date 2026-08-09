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
-- Creates the public.profiles row for a brand-new signup, carrying the
-- full_name from raw_user_meta_data and the email across. Upserts, so a
-- re-fire on an existing id refreshes the email rather than failing.
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
