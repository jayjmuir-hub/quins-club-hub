-- Applied live as `20260808191310 profile_phone_and_column_grants`.
--
-- 1. A phone number that belongs to the PERSON, not to a child.
--
-- player_contacts.phone is a CHILD's contact details, maintained per player.
-- This is the signed-in person's own number: it follows them across squads,
-- survives their child changing age group, and exists for someone with no
-- linked player at all — which is the state a real parent was actually in on
-- 8 Aug 2026, with no way to enter anything about herself.
alter table public.profiles add column if not exists phone text;

comment on column public.profiles.phone is
  'The signed-in person''s own number, stored E.164. Distinct from player_contacts.phone, which is a CHILD''s contact details and is per-player.';

-- 2. ⚠️ RLS GRANTS ROWS, NOT COLUMNS — and that was a hole.
--
-- `profile update own` is USING (id = auth.uid()) with no column restriction,
-- so a signed-in person could rewrite ANY column on their own profile row,
-- including `email`. Proved live on 8 Aug 2026 in a rolled-back transaction:
--
--     profiles.email  -> 'someone.else@example.invalid'
--     auth.users.email still 'real@example.invalid'      they_disagree = true
--
-- It matters because Accounts.jsx shows profiles.email to an admin as the
-- person's LOGIN address — and tells them "Email addresses come from each
-- person's login and can't be changed here". They could be, just not there.
-- With self-registration live, the approval decision is made about a STRANGER
-- largely on that email, so it must be one they cannot choose.
--
-- Column privileges are checked IN ADDITION to RLS, which makes this the
-- precise tool: the policies are untouched and only the writable surface
-- shrinks. An explicit ALLOW-LIST rather than revoking `email` alone, so a
-- column added later is NOT writable by default and somebody has to think.
--
-- ⚠️ handle_new_user() and handle_user_email_change() are SECURITY DEFINER and
-- run as the owner, so the email sync path is unaffected.
--
-- Verified after applying, both directions: rewriting one's own email is
-- refused 42501, while first_name/last_name/name_confirmed_at/phone still save.
revoke update on public.profiles from authenticated;
grant update (full_name, first_name, last_name, name_confirmed_at, phone)
  on public.profiles to authenticated;
