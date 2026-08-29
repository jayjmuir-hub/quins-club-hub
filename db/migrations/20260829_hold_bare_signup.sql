-- Hold "bare" signups out of the admin's active review list.
--
-- Background (29 Aug 2026): a login turned up in Accounts as "hasn't said what
-- they need" — a confirmed account with no name, no role and no access request.
-- It was created by a signup that never went through the sign-up wizard: a bot,
-- a stale-cache client, or a magic-link/OTP sign-in for an unknown email (which
-- Supabase's signInWithOtp creates by default). See the client half of this
-- fix in src/lib/auth.jsx (shouldCreateUser: false on the magic-link call).
--
-- ⚠️ THE JUNK SIGNATURE IS UNAMBIGUOUS: no signup_intent AND no name. Every
-- legitimate current path produces one or the other —
--   * the sign-up wizard always carries signup_intent (name + role);
--   * Google OAuth carries a name from the provider;
--   * an invited member SIGNS IN first (wizard or Google) and only THEN redeems
--     the token via accept_invite — the invite never creates a bare account.
-- So a profile born with neither is not a real half-finished member; it is
-- noise. private.handle_new_user seeds the profile from whatever the signup
-- carried, so a bare signup lands with full_name '' and signup_intent NULL —
-- exactly what this trigger keys on.
--
-- ⚠️ HOLD, NOT REJECT — and that is deliberate. Raising in the universal signup
-- path risks blocking every signup if the condition is ever mis-scoped, and it
-- gives a real straggler a confusing hard error. Instead we pre-DISMISS the
-- junk: it drops out of the active "waiting / didn't finish setup" lists into
-- "Show dismissed", where it is harmless (a login with no membership already
-- sees nothing) and RECOVERABLE — if the person later completes the request
-- form, that write flips the row back to pending and they reappear.
--
-- ⚠️ AFTER INSERT ON profiles, NOT a change to handle_new_user. Isolated from
-- that large SECURITY DEFINER function so it cannot affect the wizard/OAuth
-- paths, and its only action is a single guarded, always-valid insert
-- (access_requests.profile_id FKs the row we are in the trigger for; 'dismissed'
-- is a legal status; requested_role is nullable; ON CONFLICT protects a real
-- pending request). It can never raise, so it can never break a signup.
--
-- Existing bare accounts predating this trigger are unaffected (triggers fire on
-- new inserts only) — dismiss those from the admin screen as usual.

create or replace function private.hold_bare_signup()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(btrim(new.full_name), '') = '' and new.signup_intent is null then
    insert into public.access_requests (profile_id, status)
    values (new.id, 'dismissed')
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.hold_bare_signup() from public;

drop trigger if exists hold_bare_signup on public.profiles;
create trigger hold_bare_signup after insert on public.profiles
  for each row execute function private.hold_bare_signup();
