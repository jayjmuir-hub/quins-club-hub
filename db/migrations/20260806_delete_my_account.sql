-- public.delete_my_account()
--
-- Google Play requires any app offering account creation to offer account
-- DELETION, both in-app and via a public web link. This is the one and only
-- thing that performs it, and it deletes the caller's own account only --
-- there is no id parameter, deliberately, so it cannot be aimed at anyone else.
--
-- WHAT GOES, AND WHAT DELIBERATELY STAYS (decided 6 Aug 2026 with Jay):
--
--   GOES  the auth user, which cascades to profiles, and from there to
--         memberships, access_requests and calendar_tokens.
--   STAYS the player. A child's squad place is a CLUB record, not the
--         parent's, and one parent leaving must not delete a player from a
--         coach's team sheet mid-season.
--   STAYS player_contacts and player_parents -- same reasoning: they are the
--         club's contact records for a child, entered by the club.
--
-- WARNING, AND IT IS DOCUMENTED IN THE PRIVACY POLICY RATHER THAN HIDDEN:
-- because the roster email stays, signing in again re-matches through
-- public.claim_roster_access() and rebuilds the person's access automatically.
-- That is intended -- "your account is gone; if you come back, you come back"
-- -- but it is surprising if nobody tells you, so we tell people.
--
-- THREE COLUMNS MUST BE CUT LOOSE FIRST. events.created_by,
-- invites.created_by and availability.updated_by are all ON DELETE NO ACTION
-- (verified against pg_constraint, 6 Aug 2026). Without these updates the
-- delete does not cascade -- it RAISES, and nothing at all is removed. An
-- admin who has ever added a fixture could not delete their account.
-- They are set to null, never deleted: the fixture is the club's.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.delete_my_account() is
  'Deletes the CALLING user''s account. Takes no id, so it cannot be aimed at anyone else. Keeps player, player_contacts and player_parents rows -- those are club records. Refuses for the last remaining admin. See claude/decisions/2026-08-06-account-deletion.md';

-- authenticated only. Unlike the policy helpers, this is an RPC that anon has
-- no business calling, and the null-uid guard above makes a stray call loud
-- rather than dangerous.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
