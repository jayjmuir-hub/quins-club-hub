-- ══════════════════════════════════════════════════════════════════════════
--  PROFILES CONTACT REVOKE HARNESS (Phase 1b) — profiles.email/phone cannot be
--  read directly by `authenticated`, and the member_contacts reroute still works.
--  Run with `npm run db:check -- profiles-contact`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The only write is the
--  injected fault (re-granting email SELECT), discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260828_profiles_contact_revoke.sql revokes
-- table SELECT on profiles from `authenticated` and grants back every column
-- except email/phone, so a narrowed admin cannot pull a parent's login contact
-- with a raw PostgREST query. This asserts the DEPLOYED state — it goes green
-- only once that migration is applied.
--
-- ⚠️ THE DEFAULT IS AGAINST US: Supabase grants table SELECT to `authenticated`
-- on every new table. A green run here means the revoke stands.

begin;

do $harness$
declare me uuid; em text;
begin
  -- 1. The boundary: email/phone are not column-SELECTable by authenticated.
  if has_column_privilege('authenticated','public.profiles','email','SELECT') then
    raise exception 'PROFILES CONTACT: authenticated can SELECT profiles.email — the revoke is gone.';
  end if;
  if has_column_privilege('authenticated','public.profiles','phone','SELECT') then
    raise exception 'PROFILES CONTACT: authenticated can SELECT profiles.phone — the revoke is gone.';
  end if;

  -- 2. THE CONTROL: the rest of the table stays readable, or the app is dark.
  -- Also proves the check is not vacuous through a typo'd role/table name.
  if not has_column_privilege('authenticated','public.profiles','full_name','SELECT') then
    raise exception 'PROFILES CONTACT: authenticated lost SELECT on profiles.full_name (the grant is broken).';
  end if;

  -- 3. Adversarial, at the API: a real authenticated session''s raw email read
  -- is refused (not merely nulled) — the boundary is the privilege, not the row.
  select profile_id into me from memberships where status='active' and profile_id is not null limit 1;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', me)::text, true);
  begin
    perform email from public.profiles limit 1;
    reset role;
    raise exception 'PROFILES CONTACT: a raw SELECT of profiles.email SUCCEEDED for authenticated.';
  exception
    when insufficient_privilege then reset role;  -- expected
    when others then reset role; if sqlerrm like 'PROFILES CONTACT:%' then raise; end if;
  end;

  -- 4. The reroute is intact: a member still reads their OWN contact.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', me)::text, true);
  select email into em from public.member_contacts(array[me]);
  reset role;
  if em is null then
    raise exception 'PROFILES CONTACT: self cannot read own email via member_contacts — the reroute is broken.';
  end if;

  raise notice 'PROFILES CONTACT: email/phone unselectable; raw read refused; member_contacts self-read works.';
end $harness$;

-- ── ⚠️ THE SELF-TEST — grant email SELECT back and prove the check catches it. ─
grant select (email) on public.profiles to authenticated;
do $selftest$
begin
  if not has_column_privilege('authenticated','public.profiles','email','SELECT') then
    raise exception 'SELF-TEST FAILED: re-granting email SELECT did not register — has_column_privilege is not seeing what the check reads.';
  end if;
  raise notice 'SELF-TEST PASSED — the check reads the real privilege: re-granting email made it SELECTable again.';
end $selftest$;

rollback;
