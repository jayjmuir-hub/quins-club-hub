-- ══════════════════════════════════════════════════════════════════════════
--  Phase 1b, step B (DESTRUCTIVE) — close the direct column read of
--  profiles.email / profiles.phone.
--  28 Aug 2026 · admin-rights redesign
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DEPLOY-FIRST. This removes a read path every screen relied on. It MUST NOT
-- be applied until the rerouted frontend is LIVE (the 6 reads now go through
-- public.member_contacts — src/data/contacts.js). Order:
--   20260828_member_contacts_fn.sql → deploy the reroute → THIS.
-- Applied before the reroute deploys, the Accounts list, the admin member sheet,
-- /more's phone, the profile-edit save, the Rights log and the Staff directory
-- all error.
--
-- WHY A COLUMN GRANT. RLS is row-level and cannot hide two columns while still
-- returning the name (a Pitch admin keeps names — S1). Column privileges are the
-- only tool, and `authenticated` holds TABLE-level SELECT, so we revoke it and
-- grant SELECT back on every column EXCEPT email/phone. This is the same pattern
-- db/schema/grants.sql §4 documents for the UPDATE side of these columns.
--
-- ⚠️⚠️ THE COLUMN-LIST TRAP. A NEW column added to public.profiles is NOT
-- readable by `authenticated` until it is added to the grant below. That is a
-- FAIL-CLOSED default (safe), but it looks like a bug: the column reads as null/
-- absent app-wide. Any migration adding a profiles column MUST extend this grant,
-- and db/schema/grants.sql must be updated to match. The same trap already
-- applies to the UPDATE grants and is recorded there.
--
-- Proven in db/tests/profiles-contact-revoke.sql.

begin;

revoke select on public.profiles from authenticated;

grant select (
  id, full_name, created_at, first_name, last_name, name_confirmed_at,
  photo_path, photo_focus_x, photo_focus_y, no_player_confirmed_at,
  no_role_confirmed_at, email_confirmed_at, signup_intent,
  signup_intent_applied_at, welcomed_at, last_seen_at
) on public.profiles to authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') then
    raise exception 'ABORTING: authenticated can still SELECT profiles.email.';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT') then
    raise exception 'ABORTING: authenticated can still SELECT profiles.phone.';
  end if;
  -- Controls: the rest of the table must stay readable, or the whole app breaks.
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT') then
    raise exception 'ABORTING: authenticated lost SELECT on profiles.full_name.';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'last_seen_at', 'SELECT') then
    raise exception 'ABORTING: authenticated lost SELECT on profiles.last_seen_at (a new column may be missing from the grant).';
  end if;
  raise notice 'profiles.email/phone are no longer directly SELECTable by authenticated.';
end $$;

commit;
