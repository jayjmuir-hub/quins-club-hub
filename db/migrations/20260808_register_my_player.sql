-- public.register_my_player() — a signed-in parent registers their own child
-- and gets a PENDING membership.
--
-- Apply as migration `20260808xxxxxx register_my_player`.
-- Spec: claude/decisions/2026-08-08-parent-self-registration.md
--
-- ⚠️ THIS IS THE FUNCTION THAT LETS AN UNAPPROVED STRANGER CREATE ROWS.
-- Everything below is a deliberate limit on that, and every one of them is
-- load-bearing. Read the whole header before changing a line.
--
-- SECURITY DEFINER because a parent has no INSERT rights on players — and
-- must not be given any. `player edit` is can_edit_team; an owner-insert
-- policy on players would hand them team_id, which is the column that decides
-- which squad's children they can see. RLS grants rows, not columns. So the
-- creation happens HERE, once, where the rules are visible, rather than being
-- spread across three policies nobody can read together.

create or replace function public.register_my_player(
  p_full_name text,
  p_team_id   uuid
)
 returns public.memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_email  text;
  confirmed_at  timestamptz;
  pending_count int;
  new_player    public.players;
  new_membership public.memberships;
  clean_name    text;
  team_row      public.teams;
begin
  -- 1. Signed in. Fail-safe guard matching the other anon-callable
  --    SECURITY DEFINER functions in this schema.
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- 2. ⚠️ EMAIL MUST BE CONFIRMED. This is the whole basis of trust.
  --    Without it anyone can register any address and attach themselves to a
  --    squad, and the approval screen would be showing a coach a name with
  --    nothing behind it. Registration is worthless as evidence otherwise.
  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;
  if confirmed_at is null then
    raise exception 'Please confirm your email address before adding a player.'
      using errcode = '42501';
  end if;

  -- 3. Name. Trimmed, present, and bounded — this lands on a coach's screen
  --    and in an approval queue, so a 10,000-character "name" is a denial of
  --    service against a volunteer with a phone.
  clean_name := nullif(btrim(p_full_name), '');
  if clean_name is null then
    raise exception 'Enter the player''s name.' using errcode = '22023';
  end if;
  if length(clean_name) > 80 then
    raise exception 'That name is too long.' using errcode = '22023';
  end if;

  -- 4. ⚠️ club_id IS DERIVED, NEVER SUPPLIED. The caller passes a team; the
  --    club comes from that team. Accepting a club_id parameter would let a
  --    caller attach a player to one club while pointing the membership at
  --    another, and every visibility check downstream assumes those agree.
  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That age group does not exist.' using errcode = '22023';
  end if;

  -- 5. ⚠️ RATE LIMIT. Without this one confirmed address can fabricate a
  --    squad's worth of children, and each one is a row a volunteer has to
  --    look at and decide about. Five covers a large family and stops a
  --    script. Counts PENDING only: an approved parent adding a second child
  --    later is normal and must not be blocked by their own history.
  select count(*) into pending_count
    from public.memberships
   where profile_id = auth.uid() and status = 'pending';
  if pending_count >= 5 then
    raise exception 'You already have % players waiting to be approved. '
                    'Please wait for the club to review them.', pending_count
      using errcode = '42901';
  end if;

  -- 6. Create the player.
  insert into public.players (club_id, team_id, full_name)
  values (team_row.club_id, team_row.id, clean_name)
  returning * into new_player;

  -- 7. The contact, from auth.users — NEVER from a parameter. Same property
  --    that makes claim_roster_access safe: the address is one the person has
  --    demonstrably received mail at, not one they typed. It is also what
  --    lets roster matching pick this family up later if the club site ever
  --    becomes the roster master.
  insert into public.player_contacts (player_id, email)
  values (new_player.id, lower(btrim(caller_email)));

  -- 8. The membership — PENDING. Role mirrors claim_roster_access: driven by
  --    teams.is_senior, never teams.name, so a squad rename cannot hand an
  --    adult a 'parent' role.
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, team_row.id,
          case when team_row.is_senior then 'player' else 'parent' end,
          new_player.id, 'pending')
  returning * into new_membership;

  return new_membership;
end;
$function$;

-- Matches the other anon-callable helpers. The function refuses an anonymous
-- caller itself (step 1), which is the actual guard; the grant shape is kept
-- uniform so an asymmetry here never becomes a mystery later.
revoke execute on function public.register_my_player(text, uuid) from public;
grant execute on function public.register_my_player(text, uuid) to authenticated, anon;

-- ── VERIFY (run these; do not assume) ────────────────────────────────────
-- All inside a transaction that ROLLS BACK:
--   * anon caller                        -> 42501
--   * unconfirmed email                  -> 42501
--   * blank name / 100-char name         -> 22023
--   * unknown team id                    -> 22023
--   * a supplied club_id                 -> impossible, there is no parameter
--   * 6th pending registration           -> 42901
--   * success -> exactly ONE players row, ONE player_contacts row with the
--     AUTH email (not a passed one), ONE memberships row with status='pending'
--   * and then, as that caller, the RLS harness must still show 1 player.
