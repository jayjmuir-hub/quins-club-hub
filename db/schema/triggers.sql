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
-- Result: exactly TWO triggers exist, both on auth.users. There are NO
-- triggers on any `public` or `private` table. In particular there is no
-- updated_at maintenance trigger anywhere — availability.updated_at is
-- only ever set by its DEFAULT now() on insert and by the application
-- explicitly on update.
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
