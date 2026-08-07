-- ---------------------------------------------------------------------
-- players.gender                                (7 Aug 2026, Jay's brief)
--
-- Jay asked for Male/Female buttons on a player. Four things follow from
-- that, and only the first is obvious.
--
-- 1. THE COLUMN MUST BE NULLABLE. All 307 existing players have no value and
--    there is no way to derive one -- the club's insurance export does not
--    carry it and the squad name does not imply it (the U-groups are mixed).
--    So "not recorded" is a real, permanent third state whether or not the
--    UI offers a button for it. Jay chose two buttons; the null is still
--    there underneath, and every reader has to handle it.
--
-- 2. It is CHECK-constrained rather than an enum type. An enum would need a
--    migration to add a value and cannot be dropped back to text easily;
--    this is a two-value list that may yet grow, so the cheap-to-change
--    form wins. The constraint is what stops the importer or a stray client
--    writing 'M', 'boy' or ''.
--
-- 3. Empty string is NOT a synonym for null and is refused. Without the
--    explicit check a form that sends '' on "no answer" would create a
--    fourth state that reads as "recorded" to every `gender is not null`
--    test in the app.
--
-- 4. Parents can set it, which is why part 2 of this migration exists. See
--    the long note there -- it is the same trap 20260804_self_service_profile
--    documented for photo_path, and the answer is the same.
-- ---------------------------------------------------------------------

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_gender_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.players.gender IS
  'male | female | NULL. NULL means not recorded and is the default for every '
  'player predating 7 Aug 2026. Readable squad-wide via the "player read" '
  'policy, so treat it as visible to any parent in the same age group.';


-- ---------------------------------------------------------------------
-- set_own_player_gender -- a function, NOT a policy.
--
-- Jay scoped this so a parent can set it for their own child, which means a
-- write to public.players from someone who does not hold can_edit_team.
--
-- DO NOT ADD AN OWNER-UPDATE POLICY ON public.players TO ACHIEVE THIS. The
-- reasoning is set out in full in 20260804_self_service_profile.sql and has
-- not changed: RLS grants access to ROWS, not COLUMNS, so such a policy
-- would hand a parent full_name, position, is_captain and -- fatally --
-- team_id, making "move my own child into another squad" an RLS-approved
-- write. Column GRANTs cannot fix it (they attach to the `authenticated`
-- role, which coaches and parents share) and no policy expression can see
-- the old and new row at once, so "unchanged except gender" is not statable.
--
-- So: SECURITY DEFINER, hard-coded to one column, authorisation checked
-- explicitly and first. Modelled line for line on set_own_player_photo.
-- Coaches and admins never come through here -- they have the ordinary
-- `player edit` policy and use upsertPlayer.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_player_gender(_player uuid, _gender text)
 RETURNS public.players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.players;
begin
  -- First and explicit. SECURITY DEFINER runs as the owner and bypasses RLS,
  -- so this line is the only thing protecting the row.
  if not private.is_own_player(_player) then
    raise exception 'You can only change details for your own player.'
      using errcode = '42501';
  end if;

  -- Validated here as well as by the table constraint. The constraint would
  -- catch a bad value anyway, but it would surface as a raw Postgres
  -- constraint-violation string in the parent's error box; this raises the
  -- sentence a person can act on.
  if _gender is not null and _gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.'
      using errcode = '22023';
  end if;

  update public.players
     set gender = _gender
   where id = _player
  returning * into updated;

  return updated;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_own_player_gender(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_own_player_gender(uuid, text) TO authenticated;
