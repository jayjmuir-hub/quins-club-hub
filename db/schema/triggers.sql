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
-- Still true: there is no updated_at maintenance trigger anywhere —
-- availability.updated_at is only ever set by its DEFAULT now() on insert and
-- by the application explicitly on update.
--
-- Both are enabled in ORIGIN mode (tgenabled = 'O').
--
-- Because these sit on auth.users, they are OUTSIDE the tables the
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
-- ⚠️ KNOWN BUG, recorded not fixed: a SINGLE-WORD full_name comes back out
-- with last_name set to the same word, which the function's own comment says
-- must not happen. The `if new.first_name is null` guard never fires, because
-- stripping the last word off a one-word string leaves the string unchanged
-- rather than empty. Latent — no live row has hit it — but it fires the first
-- time someone types one word into the name gate. Detail and fix in
-- claude/state-of-play.md.
-- ---------------------------------------------------------------------
CREATE TRIGGER profiles_sync_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.sync_profile_name();
