-- ---------------------------------------------------------------------
-- Self-service profile editing for parents and players
--                                              (4 Aug 2026, Jay's brief)
--
-- Until now every write to a player's record required can_edit_team, i.e. a
-- coach or admin of that squad. A parent could see their own child and change
-- nothing, so a wrong phone number needed a coach.
--
-- WHAT JAY SCOPED IN, exactly: photo, the player's own contact row, and the
-- parent/carer rows. NOT name, NOT squad, NOT position, NOT jersey number.
-- Those stay club-controlled -- the important one being SQUAD, because a
-- self-editable team_id is a self-service route into another age group's
-- data, which is the whole safeguarding boundary.
--
-- The linkage that grants all of this is private.is_own_player(uuid): a
-- memberships row for auth.uid() with role parent/player and that player_id.
-- Nothing here invents a new notion of ownership.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. player_contacts: the owner may edit their own row
--
-- Read was already theirs (`contact read` includes is_own_player). This adds
-- the write half. The table has exactly two columns, phone and email, and no
-- column on it is club-controlled -- so unlike public.players below, a plain
-- RLS policy is sufficient and there is nothing to protect from the owner.
--
-- WITH CHECK repeats the predicate rather than trusting USING: without it an
-- owner could UPDATE their row and set player_id to somebody else's player,
-- moving their own contact details onto another child's record.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "contact edit own" ON public.player_contacts;
CREATE POLICY "contact edit own" ON public.player_contacts
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));


-- ---------------------------------------------------------------------
-- 2. player_parents: same again
--
-- A parent maintaining the household's own contact rows is the single most
-- common correction anyone will make in this app, and it is exactly the
-- information the club most wants current.
--
-- Same WITH CHECK reasoning: it stops a row being re-pointed at another
-- player. Note the effect of the two policies together -- "parent edit"
-- (coaches/admins of the squad) and this one are PERMISSIVE, so they OR.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "parent edit own" ON public.player_parents;
CREATE POLICY "parent edit own" ON public.player_parents
  AS PERMISSIVE FOR ALL TO public
  USING (private.is_own_player(player_id))
  WITH CHECK (private.is_own_player(player_id));


-- ---------------------------------------------------------------------
-- 3. The photo: storage write for the owner
--
-- The bucket policy keyed off can_edit_team only. Adding is_own_player here
-- lets a parent upload and replace their own child's head shot.
--
-- photo_player(name) parses the FIRST path segment of the object key as the
-- player id -- so this, like the read policy, depends on the
-- "<player_id>/<timestamp>.<ext>" key format being load-bearing. WITH CHECK
-- as well as USING, so an owner cannot upload INTO another player's folder.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "player photo write" ON storage.objects;
CREATE POLICY "player photo write" ON storage.objects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (
      private.can_edit_team(private.photo_team(name))
      OR private.is_own_player(private.photo_player(name))
    )
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (
      private.can_edit_team(private.photo_team(name))
      OR private.is_own_player(private.photo_player(name))
    )
  );


-- ---------------------------------------------------------------------
-- 4. players.photo_path -- a function, NOT a policy. This is the important
--    one, so it gets the long explanation.
--
-- The obvious move is another PERMISSIVE policy on public.players with
-- USING/WITH CHECK is_own_player(id). DO NOT DO THAT. RLS grants access to
-- ROWS, not to COLUMNS. An owner-update policy on players would let a parent
-- write EVERY column on their child's row -- full_name, position,
-- jersey_num, is_captain and, fatally, team_id. Moving their own child into
-- another squad would then be a legitimate, RLS-approved write, and it would
-- widen everything is_own_player-adjacent along with it.
--
-- Column-level GRANTs cannot save it either: those attach to the ROLE, and
-- coaches and parents are the same `authenticated` role. Narrowing the
-- column set for a parent narrows it for every coach too.
--
-- Nor can a policy compare old and new: USING sees the existing row and WITH
-- CHECK sees the proposed one, and no expression sees both, so "unchanged
-- except photo_path" is not statable as a policy.
--
-- So the write is a SECURITY DEFINER function with a hard-coded column list.
-- photo_path is the only thing it can possibly touch, whatever the caller
-- sends. Coaches and admins keep using the ordinary `player edit` policy and
-- never come through here.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_player_photo(_player uuid, _photo_path text)
 RETURNS public.players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.players;
begin
  -- The authorisation check is explicit and first. A SECURITY DEFINER
  -- function runs as the owner and bypasses RLS, so nothing else here is
  -- protecting the row.
  if not private.is_own_player(_player) then
    raise exception 'You can only change a photo for your own player.'
      using errcode = '42501';
  end if;

  -- Reject a key that does not live in this player's own folder. Without
  -- this an owner could point their child's photo_path at another player's
  -- object and read it back through the signed-URL route, sidestepping the
  -- storage read policy entirely.
  if _photo_path is not null and private.photo_player(_photo_path) is distinct from _player then
    raise exception 'That photo does not belong to this player.'
      using errcode = '42501';
  end if;

  update public.players
     set photo_path = _photo_path
   where id = _player
  returning * into updated;

  return updated;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_own_player_photo(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_own_player_photo(uuid, text) TO authenticated;
