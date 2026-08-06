-- Applied to Supabase as migration `claim_roster_access`, 6 Aug 2026.
--
-- Grants a newly signed-in person the squads their children (or they
-- themselves, for adult squads) already appear in on the club roster.
--
-- This REPLACES emailed invites for parents. The invite path stays in service
-- for staff, whose roles cannot be derived from roster data.
--
-- SECURITY MODEL, stated plainly: access is granted on the strength of
-- "this person proved they can receive mail at an address the club already has
-- on file for that player". That is the SAME proof accept_invite relies on --
-- it checks the invited address against the caller's authenticated address --
-- and it is stronger than an emailed token, which can be forwarded.
--
-- The email is read from auth.users, NEVER taken as a parameter. A parameter
-- would let any signed-in user claim any family's access by typing their
-- address.
create or replace function public.claim_roster_access()
returns setof public.memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_email text;
begin
  -- Fail-safe guard, matching the four existing anon-callable SECURITY DEFINER
  -- functions in this schema.
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  -- ONLY for accounts that hold NO access at all.
  --
  -- Running this on every sign-in would automatically pick up a newly-rostered
  -- sibling, which is genuinely useful -- but it would ALSO silently resurrect
  -- access an admin had deliberately revoked, with no record that it happened.
  -- Re-granting revoked access is the worse failure, so it is refused here.
  -- Auto-adding siblings needs a ledger of what was granted automatically;
  -- that is separate work, deliberately not smuggled in here.
  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id)
  select auth.uid(),
         p.club_id,
         p.team_id,
         -- teams.is_senior, never teams.name. A squad rename must not be able
         -- to hand an adult a 'parent' role.
         case when t.is_senior then 'player' else 'parent' end,
         p.id
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
  -- Belt and braces against a double-submit racing the zero-membership guard
  -- above. memberships_unique_grant is what actually makes this safe.
  on conflict do nothing
  returning *;
end;
$function$;

comment on function public.claim_roster_access() is
  'Grants roster-matched squad access to a signed-in user with no memberships. Reads the caller email from auth.users, never from a parameter. Returns the rows created, empty when nothing matched or the caller already has access.';

-- ---------------------------------------------------------------------------
-- VERIFIED LIVE, in a transaction that raises at the end so nothing persists.
-- Temporary auth.users rows were created against REAL roster addresses, so
-- this exercised genuine data rather than a fixture.
--
--   anon (no JWT claims)          -> refused, 42501
--   junior roster address          -> 1 membership, role = parent
--   immediate second call          -> 0 rows (idempotent)
--   sibling address (2 players)    -> 2 memberships across 2 squads
--   senior roster address          -> 1 membership, role = player
--   address not on the roster      -> 0 rows
--   caller who already has access  -> 0 rows (no resurrection)
--   memberships before=5 after=9, all rolled back
--
-- FAULT INJECTION -- each fault flips the assertion that guards it:
--
--   | injected fault                  | healthy | faulty |
--   |---------------------------------|---------|--------|
--   | email match broken              | 1 row   | 0 rows |
--   | is_senior ignored               | player  | parent |
--   | zero-membership guard removed   | 0 rows  | 1 row  |
--   | unique index absent (admin dup) | refused | allowed|
-- ---------------------------------------------------------------------------
