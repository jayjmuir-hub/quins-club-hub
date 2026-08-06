-- Applied to Supabase as migration `profiles_name_confirmed_at`, 6 Aug 2026.
--
-- "This human has told us their own name", as opposed to "a name arrived from
-- somewhere".
--
-- WHY A COLUMN AND NOT `first_name is null`: private.sync_profile_name() splits
-- full_name on INSERT, and private.handle_new_user() seeds full_name from
-- Google's raw_user_meta_data. So a Google sign-up now lands with first_name
-- and last_name ALREADY POPULATED, and "is it null" can no longer tell an
-- unconfirmed guess from a confirmed answer.
--
-- That distinction is the whole point of the gate. Google supplied "Jason Muir"
-- for an account whose owner is known at this club as "Jay Muir" -- the name was
-- present, populated, and wrong. A confirm step is what catches that, and it
-- can only fire if the database records whether the person has confirmed.
--
-- WHY NOT localStorage: NamePrompt used to suppress itself with a localStorage
-- key, which is per-device. A hard gate must not be escapable by opening the
-- app on a phone, and must not re-nag someone who already answered on their
-- laptop.
alter table public.profiles
  add column name_confirmed_at timestamptz;

comment on column public.profiles.name_confirmed_at is
  'Set when the person themselves confirms first/last name in the sign-in gate. NULL means "not yet asked or not yet answered" — an auto-populated name from Google does NOT count as confirmed.';

-- The four existing accounts are real people whose names are already correct
-- and who have been using the app for days. Gating them on next load would be
-- a nag, not a check.
--
-- ⚠️ CONSEQUENCE FOR TESTING: Jay will NOT see the gate on his own account.
-- To exercise it live:
--   update public.profiles set name_confirmed_at = null where email = '<address>';
update public.profiles set name_confirmed_at = now() where name_confirmed_at is null;
