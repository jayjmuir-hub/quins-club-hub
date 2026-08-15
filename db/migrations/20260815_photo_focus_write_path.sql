-- 15 Aug 2026 — storing where the face is.
--
-- Phase 2 of claude/plans/2026-08-15-photo-positioning.md. Applied to
-- production the same day, after 20260815_photo_focal_point.sql.
--
-- ══ ⚠️ NEW FUNCTIONS, NOT NEW ARGUMENTS ON THE EXISTING ONES ═══════════════
--
-- The obvious move is to add `_focus_x` / `_focus_y` with defaults to
-- `set_my_photo` and `set_own_player_photo`. It is wrong twice over:
--
--   - Adding defaulted parameters creates an OVERLOAD rather than replacing the
--     function, and PostgREST resolves an RPC by the JSON keys it is handed —
--     so an existing call carrying only `_photo_path` becomes AMBIGUOUS between
--     the two signatures and starts failing.
--   - Dropping and recreating instead would replace a function the live app is
--     calling, for no gain.
--
-- It is also truer to what a person actually does: repositioning a photo you
-- already uploaded should not mean uploading it again.
--
-- ══ AUTHORISATION IS COPIED, NOT GENERALISED ══════════════════════════════
--
-- Each function repeats the guard of the one it sits beside — self-only for a
-- profile, `private.is_own_player` for a player. A new write path must not
-- quietly become a new rule.

create or replace function public.set_my_photo_focus(_focus_x smallint, _focus_y smallint)
returns profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  update public.profiles
     set photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = auth.uid()
  returning * into updated;

  if not found then
    raise exception 'No profile for the signed-in user.' using errcode = 'P0002';
  end if;

  return updated;
end;
$function$;

create or replace function public.set_own_player_photo_focus(_player uuid, _focus_x smallint, _focus_y smallint)
returns players
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.players;
begin
  if not private.is_own_player(_player) then
    raise exception 'You can only change a photo for your own player.'
      using errcode = '42501';
  end if;

  update public.players
     set photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = _player
  returning * into updated;

  return updated;
end;
$function$;

revoke all on function public.set_my_photo_focus(smallint, smallint) from public;
revoke all on function public.set_own_player_photo_focus(uuid, smallint, smallint) from public;
grant execute on function public.set_my_photo_focus(smallint, smallint) to authenticated, service_role;
grant execute on function public.set_own_player_photo_focus(uuid, smallint, smallint) to authenticated, service_role;

-- ⚠️ AND THE REVOKE THAT THE PAIR ABOVE DOES NOT DO. `revoke ... from public`
-- does NOT remove an `anon` grant: Supabase's DEFAULT PRIVILEGES grant EXECUTE
-- on every new function in `public` to `anon` and `authenticated` EXPLICITLY,
-- and revoking from the PUBLIC pseudo-role leaves an explicit grant to a named
-- role untouched.
--
-- ⚠️ MEASURED, NOT ASSUMED: after the four lines above, `proacl` still read
-- `anon=X/postgres` on both functions. This is the same finding the security
-- advisor walk recorded earlier the same day against `register_my_player` —
-- reproduced within hours by a migration written by someone who had just read
-- it. Neither function was ever EXPOSED by it (both refuse a null `auth.uid()`
-- and an unowned player), but protection should come from the grant as well as
-- from the code behind it — the reasoning
-- 20260814_revoke_anon_table_privileges.sql already settled for tables.
--
-- After: `postgres | authenticated | service_role`, and both RPCs return 404 to
-- an anon key through PostgREST.
revoke execute on function public.set_my_photo_focus(smallint, smallint) from anon;
revoke execute on function public.set_own_player_photo_focus(uuid, smallint, smallint) from anon;
