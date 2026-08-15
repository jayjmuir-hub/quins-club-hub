-- 15 Aug 2026 — where the face is in a photo.
--
-- Phase 1 of claude/plans/2026-08-15-photo-positioning.md.
--
-- ══ ⚠️ A FOCAL POINT, NOT A CROP, AND THE REASON IS THE LAYOUT ═════════════
--
-- The same photograph is rendered at three very different shapes: the
-- squad-contact LEAD tile, which for a six-person squad measures 175x712 — a
-- 1:4 strip; the HALF tiles at roughly 1.9:1 landscape; and a 28px circle in a
-- collapsed squad header. A crop that frames somebody's face in the tall tile
-- is a sliver of forehead in the landscape one.
--
-- There is no single crop that is right for all three, so storing one would
-- mean asking a volunteer to be wrong twice. A focal point has no such problem:
-- one answer to "where is the face", and every shape renders `object-position`
-- from it — including shapes that do not exist yet. Nobody re-uploads when a
-- layout changes.
--
-- ══ ⚠️ TWO SMALLINTS, NOT ONE TEXT COLUMN, AND THAT IS A SECURITY CHOICE ═══
--
-- The obvious shape is a single `text` holding "50% 35%" — the CSS value — and
-- it is the wrong one. That string is written by a user and ends up inside a
-- style attribute, so a text column makes the database a place where arbitrary
-- CSS can be stored and later rendered. Two integers with a CHECK cannot carry
-- anything but two integers. The client composes the CSS; the database holds
-- data. `src/components/PhotoPositioner.jsx` sanitises on the way out as well,
-- because defence that exists in one place only is defence that moves.
--
-- ══ NULL MEANS CENTRE ══════════════════════════════════════════════════════
--
-- Deliberately nullable with no default. Every photo already uploaded predates
-- this column and nobody has positioned it, and "unset" is a truer statement
-- than "the person chose the centre" — it lets a later prompt ask them to
-- position it without nagging the people who already have. The renderer treats
-- null as 50/50, so nothing changes visually until somebody drags.

alter table public.players
  add column if not exists photo_focus_x smallint,
  add column if not exists photo_focus_y smallint;

alter table public.profiles
  add column if not exists photo_focus_x smallint,
  add column if not exists photo_focus_y smallint;

-- ⚠️ THE CHECK IS THE POINT OF USING SMALLINT AT ALL. Without it this is just a
-- number column and the "cannot carry anything but two integers" argument above
-- is only half true — a negative or a 10000 would still round-trip and produce
-- a nonsense `object-position`.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_photo_focus_range') then
    alter table public.players
      add constraint players_photo_focus_range
      check (
        (photo_focus_x is null or photo_focus_x between 0 and 100)
        and (photo_focus_y is null or photo_focus_y between 0 and 100)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_photo_focus_range') then
    alter table public.profiles
      add constraint profiles_photo_focus_range
      check (
        (photo_focus_x is null or photo_focus_x between 0 and 100)
        and (photo_focus_y is null or photo_focus_y between 0 and 100)
      );
  end if;
end $$;

-- ⚠️ NO GRANTS ARE ADDED HERE, AND THAT IS DELIBERATE. `anon` holds no table
-- privileges since 20260814_revoke_anon_table_privileges.sql, and these columns
-- inherit whatever the TABLE allows — adding a column does not widen access.
-- The write path is the existing SECURITY DEFINER functions (`set_my_photo`,
-- `set_own_player_photo`), which phase 2 extends to carry the focal point, so
-- authorisation stays where it already is rather than moving to a new place.
