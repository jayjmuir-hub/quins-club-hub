-- 15 Aug 2026 — the focal point reaches the card that draws the face.
--
-- Closes the gap phases 1-4 of claude/plans/2026-08-15-photo-positioning.md
-- left open: the picker WRITES `profiles.photo_focus_x/y`, `/admin/staff` reads
-- them back and previews them, and the Squad contacts block on Home — the one
-- surface the whole feature exists to control — could not see them at all.
--
-- ⚠️ THE SYMPTOM WAS "REPOSITIONING DOES NOTHING", AND IT LOOKED LIKE A BROKEN
-- PICKER. Jay, 15 Aug 2026, on the U18B head coach's tile: "no matter how many
-- times i try to adjust this head coaches photo, it always cuts off the top of
-- his head in that double tall pill, like it isn't adjusting the photo in the
-- pill at all". It was not adjusting it. The value saved correctly every time
-- and nothing downstream of this function had any way to know it existed.
--
-- ══ ⚠️ WHY THE COLUMN CANNOT SIMPLY BE SELECTED IN THE CLIENT ══════════════
--
-- A parent cannot read another member's `profiles` row — the four SELECT
-- policies are own / club-admin / two pending cases. That is the whole reason
-- this function is SECURITY DEFINER with a FIXED column list, and it means the
-- ONLY way a focal point reaches Home is by being named here. The client-side
-- fix on its own would have read `undefined` forever.
--
-- ══ ⚠️ ADDING A COLUMN MEANS A DROP, AND A DROP LOSES EVERY GRANT ═════════
--
-- `create or replace` cannot change a RETURNS TABLE — 42P13. The same trap
-- 20260813_staff_photos.sql hit when it added `photo_path`, and its note is
-- restated because it is the easiest thing in this repo to lose by accident:
-- **a recreated function is anon-executable again the instant it exists**,
-- because Supabase's default privileges grant EXECUTE to `anon` BY NAME. The
-- three lines at the foot are load-bearing, not tidiness. db/tests/grants.sql
-- §3b is what catches it if they are ever dropped.
--
-- ══ SAFE AGAINST THE LIVE BUNDLE, FOR THE TWO REASONS THE 13 Aug ONE GAVE ══
--
--   1. DDL is transactional and this migration is one transaction, so no client
--      can observe the moment between the drop and the create. There is no
--      window in which `my_squad_staff` does not exist.
--   2. The change is ADDITIVE — two extra columns. The bundle currently serving
--      reads the fields it names out of each row and ignores the rest, so it
--      neither sees nor cares about the focal point. Applying this BEFORE the
--      deploy is therefore safe, and applying it AFTER would leave every face
--      centred until it landed.
--
-- The 12 Aug rule bites when a live bundle SENDS or READS something that stops
-- existing. Nothing here removes anything a running client depends on.
--
-- ⚠️ ADDING A COLUMN TO THE RETURNS TABLE IS THE REVIEW — this function's own
-- header in db/schema/functions.sql says so, because `is_super` and
-- `admin_rights` sit on `memberships` and are unreachable purely by not being
-- named. Two smallints holding 0-100 under a range CHECK
-- (20260815_photo_focal_point.sql) carry nothing about anybody's rights.
drop function if exists public.my_squad_staff();

create or replace function public.my_squad_staff()
returns table (
  team_id uuid,
  membership_id uuid,
  full_name text,
  title text,
  role text,
  email text,
  phone text,
  photo_path text,
  photo_focus_x smallint,
  photo_focus_y smallint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    m.team_id,
    m.id,
    p.full_name,
    m.title,
    m.role,
    p.email,
    p.phone,
    p.photo_path,
    p.photo_focus_x,
    p.photo_focus_y
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.role in ('coach', 'manager', 'medic')
    and m.status = 'active'
    and m.team_id is not null
    and private.can_see_team(m.team_id);
$function$;

-- ⚠️ THE DROP ABOVE TOOK EVERY GRANT WITH IT. See the note at the head of this
-- file: without these three lines the function comes back anon-executable.
revoke execute on function public.my_squad_staff() from public;
revoke execute on function public.my_squad_staff() from anon;
grant execute on function public.my_squad_staff() to authenticated;
