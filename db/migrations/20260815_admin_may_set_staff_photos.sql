-- 15 Aug 2026 — a club admin may set a staff member's photo.
--
-- ⚠️ THIS REVERSES A DELIBERATE NARROWING, AND THE ONE IT REVERSES IS RIGHT
-- ABOUT THE PRINCIPLE. 20260813_staff_photos.sql restricted the write policy to
-- own-photo-only: "A coach is an adult with their own login. Nobody else picks
-- the picture of your face that thirty families see."
--
-- Overruled by Jay on 15 Aug 2026, knowing that, on a fact the original did not
-- weigh: two of fifteen staff have a photo and most will never log in to fix
-- it, so the principle was producing no faces rather than consented ones.
-- Reasoning: claude/decisions/2026-08-15-admin-may-set-staff-photos.md
--
-- ⚠️ AND IT MATCHES THE PLAYER-PHOTO RULE, DELIBERATELY. Jay, the same day:
-- "just like teamsnap, sometimes photos need to be uploaded by staff when
-- parents forget". That is already live for player photos and always has been —
-- `can_edit_team(photo_team(name)) or is_own_player(photo_player(name))`.
--
-- A first pass made this club-admins-only, which was a conservative reading of
-- the overrule rather than something anyone asked for, and it left a split
-- nobody would defend: a U16 coach could upload a child's photo but not a
-- fellow coach's. So `can_edit_team` is in, and the 13 Aug argument against it
-- is fully retired rather than half.

-- ── The predicate ──────────────────────────────────────────────────────────
--
-- ⚠️ ONE FUNCTION, TWO CALLERS — the storage policy and the RPC. Two copies of
-- an authorisation rule is how they drift apart.
--
-- ⚠️ `coalesce(..., false)` IS LOAD-BEARING AND WAS ADDED AFTER A MEASUREMENT.
-- Without it this returns NULL when there is no signed-in user, because
-- `_profile = auth.uid()` is NULL when auth.uid() is, and `NULL or false` is
-- NULL. The two callers then DISAGREE: a policy treats NULL as not-true and
-- denies, but `if not <NULL> then raise` never fires, so the RPC would fall
-- through to its UPDATE. Nothing was exposed — anon holds no EXECUTE — but a
-- predicate that can return NULL is one every future caller must remember
-- something about.
create or replace function private.may_set_staff_photo(_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    _profile is not null
    and (
      _profile = auth.uid()
      or exists (
        select 1 from public.memberships m
        where m.profile_id = _profile
          and (
            (m.club_id is not null and private.is_admin(m.club_id))
            or (m.team_id is not null and private.can_edit_team(m.team_id))
          )
      )
    ),
    false
  );
$function$;

revoke all on function private.may_set_staff_photo(uuid) from public;

-- ── The storage policy ─────────────────────────────────────────────────────
--
-- ⚠️ BOTH `using` AND `with check`, for the reason 20260813_staff_photos.sql
-- gives: `using` is tested against the row as it EXISTS and governs
-- UPDATE/DELETE, `with check` against the row being WRITTEN and is the only one
-- an INSERT consults. Widening one and not the other either blocks the upload
-- or allows one nobody can then manage.
drop policy if exists "staff photo write" on storage.objects;
create policy "staff photo write" on storage.objects
  for all
  using (
    bucket_id = 'staff-photos'
    and private.may_set_staff_photo(private.staff_photo_owner(name))
  )
  with check (
    bucket_id = 'staff-photos'
    and private.may_set_staff_photo(private.staff_photo_owner(name))
  );

-- ── Recording the key ──────────────────────────────────────────────────────
--
-- ⚠️ A SEPARATE FUNCTION; `set_my_photo` STAYS SELF-ONLY. The self-serve path
-- is used by everybody and keeps the narrowest rule — widening it would hand
-- every caller an admin's reach. And it is an RPC rather than an update policy
-- for the reason set_my_photo already records: RLS grants access to ROWS, not
-- COLUMNS, so a policy on `profiles` would also expose `email`.
create or replace function public.set_staff_photo(
  _profile uuid,
  _photo_path text,
  _focus_x smallint default null,
  _focus_y smallint default null
)
returns profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.profiles;
begin
  if not private.may_set_staff_photo(_profile) then
    raise exception 'Only a club admin can set that person''s photo.'
      using errcode = '42501';
  end if;

  if _photo_path is not null
     and private.staff_photo_owner(_photo_path) is distinct from _profile then
    raise exception 'A photo key must live under that person''s id.'
      using errcode = '42501';
  end if;

  update public.profiles
     set photo_path = _photo_path,
         photo_focus_x = _focus_x,
         photo_focus_y = _focus_y
   where id = _profile
  returning * into updated;

  if not found then
    raise exception 'No such profile.' using errcode = 'P0002';
  end if;

  return updated;
end;
$function$;

-- ⚠️ THE REVOKE NAMES `anon`. `revoke ... from public` does NOT remove it —
-- Supabase's default privileges grant EXECUTE to `anon` by name, proved earlier
-- the same day by 20260815_photo_focus_write_path.sql getting it wrong.
revoke all on function public.set_staff_photo(uuid, text, smallint, smallint) from public;
revoke execute on function public.set_staff_photo(uuid, text, smallint, smallint) from anon;
grant execute on function public.set_staff_photo(uuid, text, smallint, smallint) to authenticated, service_role;
