-- ---------------------------------------------------------------------
-- Player parents + head-shot photos            (3 Aug 2026, Jay's brief)
--
-- Adds three things:
--   1. public.player_parents  — N parent/carer rows per player.
--   2. public.players.photo_path — pointer into the photo bucket.
--   3. A PRIVATE storage bucket `player-photos` with its own policies.
--
-- WHY A TABLE AND NOT "mother_email"/"father_phone" COLUMNS:
-- fixed mother/father columns force every family into one shape. The club
-- is a large expat club with single parents, step-parents, guardians and
-- same-sex parents. A grandmother typed into a column called "father" is
-- data that lies. Rows with a free-text `relationship` label cover the
-- ordinary two-parent case exactly as well and do not break on the rest.
--
-- "At least one parent" is NOT enforced here, deliberately (Jay's ruling:
-- warn, never block). ~159 existing players have no parent rows at all; a
-- NOT NULL-style constraint would make every one of them unsaveable and
-- would break the bulk importer. The warning lives in the UI instead.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. player_parents
--
-- full_name is the only required field. A parent with a name and no
-- contact details is still worth recording (you know who to ask for);
-- a contact detail with nobody attached to it is not.
--
-- `relationship` is text with no enum and no CHECK constraint. The UI
-- restricts it to a FIXED list — Mother, Father, Step-mother, Step-father,
-- Aunt, Uncle, Grandmother, Grandfather, Guardian — with no free entry
-- (Jay's ruling, 4 Aug 2026, closing the earlier "suggestion list" idea).
-- The constraint deliberately lives in the UI, not the database, so
-- widening the list is a one-line UI change rather than a migration.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_parents (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  player_id     uuid        NOT NULL,
  full_name     text        NOT NULL,
  relationship  text,
  email         text,
  phone         text,
  is_primary    boolean              DEFAULT false,
  sort_order    integer              DEFAULT 0,
  created_at    timestamptz          DEFAULT now(),
  CONSTRAINT player_parents_pkey           PRIMARY KEY (id),
  CONSTRAINT player_parents_player_id_fkey FOREIGN KEY (player_id)
    REFERENCES public.players(id) ON DELETE CASCADE,
  -- A blank name would render an empty row with a phone number beside it
  -- and no way to tell whose it is.
  CONSTRAINT player_parents_name_not_blank  CHECK (btrim(full_name) <> '')
);

-- Every read of this table filters by player_id, and the RLS policy below
-- runs a subquery per row. Unlike memberships.profile_id (still unindexed,
-- see RESTORE.md's open items) this one is cheap to get right on day one.
CREATE INDEX IF NOT EXISTS player_parents_player_id_idx
  ON public.player_parents (player_id);

ALTER TABLE public.player_parents ENABLE ROW LEVEL SECURITY;

-- Policies deliberately mirror public.player_contacts exactly — same two
-- policies, same predicates, same helper functions. Parent details are the
-- same class of safeguarding-sensitive data as a player's own contact
-- details, so they get the same boundary, not a new one to reason about:
--   read : coaches/admins of that player's squad, plus that player's own
--          account or their linked parent account.
--   edit : coaches/admins of that player's squad only.
-- A parent therefore sees their own child's parent rows and NOBODY else's,
-- including other parents in the same squad.
DROP POLICY IF EXISTS "parent read" ON public.player_parents;
CREATE POLICY "parent read" ON public.player_parents
  AS PERMISSIVE FOR SELECT TO public
  USING (
    private.can_edit_team((SELECT p.team_id FROM public.players p
                            WHERE p.id = player_parents.player_id))
    OR private.is_own_player(player_id)
  );

DROP POLICY IF EXISTS "parent edit" ON public.player_parents;
CREATE POLICY "parent edit" ON public.player_parents
  AS PERMISSIVE FOR ALL TO public
  USING (
    private.can_edit_team((SELECT p.team_id FROM public.players p
                            WHERE p.id = player_parents.player_id))
  )
  WITH CHECK (
    private.can_edit_team((SELECT p.team_id FROM public.players p
                            WHERE p.id = player_parents.player_id))
  );


-- ---------------------------------------------------------------------
-- 2. players.photo_path
--
-- The object key inside the `player-photos` bucket, e.g.
--   "<player_id>/1754236800000.jpg"
-- NOT a URL. The bucket is private, so a URL would be a signed one with an
-- expiry baked in — storing that would mean storing something that stops
-- working. The app signs a fresh short-lived URL from this path on read.
--
-- Nullable: most players have no photo and that is a normal state, not a
-- gap to fill.
-- ---------------------------------------------------------------------
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS photo_path text;


-- ---------------------------------------------------------------------
-- 3. The photo bucket
--
-- PRIVATE (public = false). These are head shots of children. A public
-- bucket hands out a permanent unauthenticated URL for every one of them:
-- anyone who ever sees a photo — forwarded, screenshotted, scraped from a
-- browser cache — keeps working access to it forever, with no login, no
-- expiry and no way to revoke short of deleting the file. Private + signed
-- URLs means every view is authorised at request time against the same RLS
-- helpers the rest of the app uses.
--
-- 5 MB cap and an explicit image allow-list: the bucket is reachable by
-- every coach, so it should not be able to become a general file drop.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-photos', 'player-photos', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- Path → player, and path → that player's squad. Two small helpers so the
-- storage policies read like the table policies above.
--
-- split_part(name,'/',1) rather than storage.foldername(): it keeps these
-- functions inside `public`'s search_path with no dependency on the storage
-- schema, and it cannot error on a key with no slash in it.
--
-- The regex guard matters. An object key is attacker-controlled text, and
-- `'not-a-uuid'::uuid` RAISES rather than returning null — inside a policy
-- that is an error surfaced to the caller on every unrelated storage
-- operation. The guard makes a malformed key return NULL instead, and a
-- NULL team id makes can_see_team/can_edit_team false, so a junk path is
-- refused rather than blowing up.
-- search_path is pinned here to match live. It was pinned on the database
-- after this file was first written but the file was not updated, so for a
-- day re-applying this migration would have silently un-pinned it. Corrected
-- 4 Aug 2026 during the db/schema/ re-capture — do not drop it again.
CREATE OR REPLACE FUNCTION private.photo_player(_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when split_part(_key, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION private.photo_team(_key text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.team_id from public.players p
   where p.id = private.photo_player(_key);
$function$;

GRANT EXECUTE ON FUNCTION private.photo_player(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.photo_team(text)   TO authenticated;

-- Read: anyone who can SEE the squad. This matches public.players' own
-- "player read" policy (can_see_team) rather than the stricter contact
-- rule, because the photo sits beside the name in the roster and the name
-- is already visible to exactly this audience — so a parent sees their own
-- squad's head shots and no others.
-- TO TIGHTEN to coaches/admins + the player's own account only, swap
-- can_see_team for can_edit_team and add `OR private.is_own_player(...)`,
-- exactly as "parent read" above is written.
DROP POLICY IF EXISTS "player photo read" ON storage.objects;
CREATE POLICY "player photo read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND private.can_see_team(private.photo_team(name))
  );

-- Write/replace/delete: coaches and admins of that player's squad only,
-- the same people who can edit the player record itself. WITH CHECK as
-- well as USING, so a coach cannot upload INTO another squad's folder.
DROP POLICY IF EXISTS "player photo write" ON storage.objects;
CREATE POLICY "player photo write" ON storage.objects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND private.can_edit_team(private.photo_team(name))
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND private.can_edit_team(private.photo_team(name))
  );
