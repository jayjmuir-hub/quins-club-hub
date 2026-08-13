-- 13 Aug 2026 — a face on the Squad contacts card.
--
-- Phase 4 (the last) of claude/plans/2026-08-13-squad-staff-on-home.md. Phases
-- 1-3 shipped earlier the same day: the admin directory, `memberships.title`,
-- and the member-facing card fed by `public.my_squad_staff()`.
--
-- ⚠️ THE PLAN CALLS THIS "roughly half the work of the whole feature and the
-- least of the four things by value", and that is still true. It is built
-- because the other three are done, not because it is the important one.
--
-- ══ ⚠️ A SEPARATE BUCKET. NOT `player-photos`. ═════════════════════════════
--
-- `player-photos` holds head shots of CHILDREN, behind policies written around
-- squad membership (`private.photo_team`, `private.can_see_team`). These are
-- photographs of ADULTS, supplied by the adult themselves about themselves, and
-- the authorisation question is a different one. The same ruling the social
-- ideas bucket was given on 12 Aug: mixing them would put one kind of image
-- behind policies written for another.
--
-- ⚠️ AND THE BLAST RADIUS IS THE REASON IT MATTERS. A mistake in a policy over
-- `player-photos` exposes children. Keeping staff photos out of that bucket
-- means nothing written here can ever widen it.
--
-- ══ ⚠️ THE KEY CONVENTION IS LOAD-BEARING ═════════════════════════════════
--
--     <profile_id>/<timestamp>.<ext>
--
-- A storage policy sees only a filename, so the first path segment IS the
-- identity. `private.staff_photo_owner()` reads it and every policy below keys
-- off that. Never write a key in another shape.
--
-- The timestamp (rather than a fixed name per person) is the same cache
-- decision `src/data/photos.js` documents for players: a fixed key would be
-- held by the browser and any CDN, so replacing a photo would keep showing the
-- old one. A new key per upload sidesteps invalidation entirely.

alter table public.profiles
  add column if not exists photo_path text;

-- ⚠️ NO COLUMN GRANT, DELIBERATELY, AND THAT IS THE OPPOSITE OF WHAT
-- 20260813_membership_title.sql DID. `memberships.title` is written by an ADMIN
-- through the ordinary `memb manage` policy, so it needed `grant update
-- (title)`. This column is written by the person THEMSELVES, and a column grant
-- on `profiles` applies to the whole `authenticated` role — it would let any
-- signed-in account update photo_path on any row the `profile` policies expose,
-- which for an admin is every profile in the club. The write goes through the
-- SECURITY DEFINER RPC at the foot of this file instead, exactly as
-- `set_own_player_photo` does and for the same reason.

-- ── The bucket ─────────────────────────────────────────────────────────────
-- PRIVATE. A public bucket hands out a permanent unauthenticated URL per
-- object; every read here goes through a short-lived signed URL instead. These
-- are adults rather than children, so the stake is lower than `player-photos` —
-- but a volunteer's face is still theirs, and "lower" is not "none".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── Who owns an object key ─────────────────────────────────────────────────
--
-- ⚠️ `search_path` IS PINNED, AND THE THREE-WAY TEST IN db/schema/functions.sql
-- IS WHY. This is SECURITY INVOKER, IMMUTABLE and touches no table — the same
-- shape as `private.squad_expects_gender`, which is deliberately NOT pinned.
-- The difference is the one that decided `private.social_idea_owner` on 13 Aug:
-- **this function is called from storage RLS policies, so it decides who may
-- write.** A helper in that position gets pinned whatever its volatility
-- markers say.
create or replace function private.staff_photo_owner(_key text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  -- NULL rather than an error on a malformed key: a policy comparing NULL to
  -- auth.uid() yields NULL, which is not true, so a key in the wrong shape
  -- fails CLOSED. Raising instead would turn a bad filename into a 500.
  select nullif(split_part(_key, '/', 1), '')::uuid;
$function$;

revoke execute on function private.staff_photo_owner(text) from public;
revoke execute on function private.staff_photo_owner(text) from anon;
grant execute on function private.staff_photo_owner(text) to authenticated;

-- ── Who may LOOK at one ────────────────────────────────────────────────────
--
-- ⚠️ THIS MIRRORS `public.my_squad_staff()` AND MUST KEEP MIRRORING IT. The
-- card draws a name, a title and a face from two different places: the name and
-- title come through that function, the face comes through this policy. If the
-- two rules drift, a parent sees a photograph of somebody whose name the app
-- will not tell them, or the reverse.
--
--   * yourself — always, so the upload control on /more can show what you just
--     uploaded before anybody else can see it;
--   * an ACTIVE member of a squad that person ACTIVELY staffs — the same
--     `status = 'active'` on both sides that my_squad_staff() applies, and the
--     same reason: a pending member has been approved by nobody, and a pending
--     coach is not yet this squad's coach;
--   * an admin of the club — who can already read every profile row through
--     `profile read club admin`, so this grants nothing new.
create or replace function private.can_see_staff_photo(_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    _profile = auth.uid()
    or private.shares_admin_club(_profile)
    or exists (
      select 1
      from memberships staff
      join memberships mine
        on mine.team_id = staff.team_id
       and mine.profile_id = auth.uid()
       and mine.status = 'active'
      where staff.profile_id = _profile
        and staff.status = 'active'
        and staff.role in ('coach', 'manager', 'medic')
        and staff.team_id is not null
    );
$function$;

revoke execute on function private.can_see_staff_photo(uuid) from public;
revoke execute on function private.can_see_staff_photo(uuid) from anon;
grant execute on function private.can_see_staff_photo(uuid) to authenticated;

-- ── The policies ───────────────────────────────────────────────────────────

drop policy if exists "staff photo read" on storage.objects;
create policy "staff photo read" on storage.objects
  for select using (
    bucket_id = 'staff-photos'
    and private.can_see_staff_photo(private.staff_photo_owner(name))
  );

-- ⚠️ FOR ALL, WITH **BOTH** `using` AND `with check`, AND THE PLAN NAMES THIS
-- AS THE TRAP TO COPY. `20260804_self_service_profile.sql` needed the
-- `with_check` as well as the `using` so that an owner could not upload INTO
-- ANOTHER PERSON'S FOLDER: `using` is tested against the row as it EXISTS and
-- governs UPDATE/DELETE, while `with check` is tested against the row being
-- WRITTEN and is the only one an INSERT consults. With `using` alone, anybody
-- signed in could create an object under any other person's prefix — and then
-- that person's own photo would be one somebody else put there.
--
-- ⚠️ OWN PHOTO ONLY. NOT `can_edit_team`, and this is a deliberate narrowing
-- against the player-photo precedent, where a coach may upload for a child who
-- cannot do it themselves. A coach is an adult with their own login. Nobody
-- else picks the picture of your face that thirty families see.
drop policy if exists "staff photo write" on storage.objects;
create policy "staff photo write" on storage.objects
  for all
  using (
    bucket_id = 'staff-photos'
    and private.staff_photo_owner(name) = auth.uid()
  )
  with check (
    bucket_id = 'staff-photos'
    and private.staff_photo_owner(name) = auth.uid()
  );

-- ── Recording the key against the profile ──────────────────────────────────
--
-- ⚠️ AN RPC, NOT AN UPDATE POLICY, FOR THE REASON `set_own_player_photo`
-- RECORDS: **RLS grants access to ROWS, not COLUMNS.** An owner-update policy on
-- `public.profiles` would let a person write `email` — the mirror of their login
-- address, which other things key off — as well as `photo_path`. The RPC has a
-- hard-coded SET list, so photo_path is the only thing it can touch whatever the
-- client sends.
create or replace function public.set_my_photo(_photo_path text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _saved text;
begin
  -- ⚠️ THE KEY MUST BELONG TO THE CALLER. Without this a person could point
  -- their profile at somebody else's object key — the storage policy would
  -- still refuse them the WRITE, but `my_squad_staff()` would hand the key out
  -- and the reader's own permission would sign it. The result is one
  -- volunteer's face appearing as another's, with no policy violated anywhere.
  if _photo_path is not null
     and private.staff_photo_owner(_photo_path) is distinct from auth.uid() then
    raise exception 'A photo key must live under your own id.'
      using errcode = '42501';
  end if;

  update profiles
     set photo_path = _photo_path
   where id = auth.uid()
  returning photo_path into _saved;

  -- No row means no profile for this uid, which should be impossible for a
  -- signed-in caller. Say so rather than reporting a silent success.
  if not found then
    raise exception 'No profile for the signed-in user.' using errcode = 'P0002';
  end if;

  return _saved;
end;
$function$;

revoke execute on function public.set_my_photo(text) from public;
revoke execute on function public.set_my_photo(text) from anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- ── The card's read ────────────────────────────────────────────────────────
--
-- ⚠️ ADDING A COLUMN TO THIS RETURNS TABLE IS A SECURITY REVIEW, and the
-- function's own header says so: `is_super` and `admin_rights` sit on a table it
-- reads and are unreachable only because they are not named. `photo_path` is a
-- storage KEY, not an image and not a URL — it is worthless without the
-- `staff photo read` policy above, which is checked again at signing time.
--
-- ⚠️ DROP FIRST. `create or replace` CANNOT ADD A COLUMN TO A `RETURNS TABLE`
-- — Postgres refuses with 42P13 "cannot change return type of existing
-- function". It must be dropped and recreated, which is why the grants below
-- are restated rather than assumed.
--
-- ⚠️ THE `drop` LOOKS LIKE THE DESTRUCTIVE CASE THE 12 Aug RULE IS ABOUT, AND
-- IT IS NOT. Two things make this safe to apply BEFORE the deploy, and both had
-- to be checked rather than assumed:
--
--   1. DDL is transactional in Postgres and this migration is one transaction,
--      so no client can observe the moment between the drop and the create.
--      There is no window in which `my_squad_staff` does not exist.
--   2. The change is ADDITIVE from a caller's point of view — one extra column.
--      The bundle currently serving reads the six fields it names out of each
--      row and ignores the rest, so it neither sees nor cares about photo_path.
--
-- The 12 Aug rule bites when a live bundle SENDS or READS something that stops
-- existing (`400 / PGRST204` on the match sheet). Nothing here removes anything
-- a running client depends on.
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
  photo_path text
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
    p.photo_path
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.role in ('coach', 'manager', 'medic')
    and m.status = 'active'
    and m.team_id is not null
    and private.can_see_team(m.team_id);
$function$;

-- ⚠️ THE DROP ABOVE TOOK EVERY GRANT WITH IT, AND A RECREATED FUNCTION IS
-- ANON-EXECUTABLE AGAIN THE INSTANT IT EXISTS — Supabase's default privileges
-- grant to `anon` BY NAME on every new function in `public`. That is the whole
-- finding of 20260813_revoke_anon_execute.sql, and dropping a function is the
-- easiest way to undo it without noticing. db/tests/grants.sql §3b is what
-- catches it if these three lines are ever lost.
revoke execute on function public.my_squad_staff() from public;
revoke execute on function public.my_squad_staff() from anon;
grant execute on function public.my_squad_staff() to authenticated;
