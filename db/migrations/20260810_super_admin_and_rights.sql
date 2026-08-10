-- ══════════════════════════════════════════════════════════════════════════
--  Super admin, and per-admin rights
--  10 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- THE MODEL (Jay, 10 Aug 2026):
--   base admin      unchanged — full club data, exactly as today
--   admin rights    ADDITIVE specialist capabilities, each unlocking a
--                   dashboard: 'youth', 'media', 'pitches'
--   super admin     assigns rights, and assigns admin itself
--
-- ⚠️ A FLAG, NOT A ROLE VALUE, and the reason is measured rather than a
-- preference. TWELVE places in this schema test `m.role = 'admin'`:
-- is_admin, is_admin_anywhere, can_edit_team, can_see_team,
-- is_attached_to_team, can_admin_see_pending, can_approve_team,
-- can_manage_invite, shares_admin_club and the storage policies. A new role
-- VALUE would have to be added to every one, and each is a chance to miss one
-- — where a miss SILENTLY STRIPS a super admin of an ordinary admin power.
-- A boolean makes a super admin an admin, in the same row, so all twelve keep
-- working untouched and only new checks read the flag. Nothing can regress.
--
-- ⚠️ RIGHTS GATE SCREENS, NOT DATA — and this is the sentence to re-read
-- before adding a fourth right. Every admin already sees every child's name,
-- photo and contact details (Jay, 10 Aug: "trusted volunteers"), so a right
-- does not withhold anything; it decides which specialist dashboard appears.
-- This repo's own rule applies: A SCREEN THAT HIDES A ROW IS NOT SECURITY. If
-- a future right must genuinely withhold data — finances, safeguarding notes —
-- that one needs an RLS policy, and hiding the menu item will not do.
--
-- ⚠️ NO CHECK CONSTRAINT ON THE RIGHT NAMES, deliberately. The vocabulary
-- lives in src/lib/scope.js (ADMIN_RIGHTS), the same "change one, change both"
-- arrangement SQUAD_STAFF_ROLES already uses. A CHECK here would mean a
-- migration every time Jay names a new job, for a value that gates a screen
-- and cannot do harm: an unrecognised right matches no dashboard and is inert.

alter table public.memberships
  add column if not exists is_super boolean not null default false,
  add column if not exists admin_rights text[] not null default '{}';

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE PART THAT MAKES THE TIER REAL RATHER THAN DECORATIVE
-- ══════════════════════════════════════════════════════════════════════════
--
-- `memb manage` is FOR ALL and admin-only, so ANY ADMIN CAN ALREADY WRITE
-- MEMBERSHIP ROWS — including their own. Without what follows, any admin can
-- simply set is_super = true on themselves and the whole tier is theatre.
--
-- ⚠️ RLS CANNOT FIX THIS. Policies authorise the ROW, not the COLUMN: `memb
-- manage` says "an admin may write membership rows in their club", and it is
-- true both before and after the row gains is_super. The protection has to be
-- a COLUMN PRIVILEGE.
--
-- This schema already does exactly this for `profiles.email`, for the same
-- reason and with the same reasoning recorded in db/schema/grants.sql §4 —
-- including that the Supabase dashboard offers to undo it in one click and
-- presents it as tidying up. THE SAME WARNING APPLIES TO THIS TABLE NOW.
--
-- So: `authenticated` may write every membership column EXCEPT these two.
revoke update on public.memberships from authenticated;
grant update (profile_id, club_id, team_id, player_id, role, status)
  on public.memberships to authenticated;

-- ⚠️ INSERT IS NOT COLUMN-RESTRICTED, AND THAT IS NOT AN OVERSIGHT.
-- A column grant on INSERT would block the DEFAULTS as well, so a plain
-- `insert into memberships (profile_id, role, ...)` would fail. The insert
-- path is guarded instead by the policy below, which refuses a row that
-- arrives already carrying the flag.
drop policy if exists "memb no self promotion" on public.memberships;
create policy "memb no self promotion" on public.memberships
  as restrictive
  for insert
  with check (
    -- A new row may only carry super/rights if the caller is already super.
    (is_super = false and coalesce(array_length(admin_rights, 1), 0) = 0)
    or private.is_super_admin()
  );

-- ══════════════════════════════════════════════════════════════════════════
--  The helper, and the one write path
-- ══════════════════════════════════════════════════════════════════════════

-- ⚠️ `status = 'active'` for the same reason can_edit_team gained it hours
-- earlier today: a pending super admin is a state nothing creates, and a
-- check that costs nothing is cheaper than the day something does.
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.role = 'admin'
      and m.status = 'active'
      and m.is_super);
$$;

revoke all on function private.is_super_admin() from public;
grant execute on function private.is_super_admin() to authenticated;

-- The only way to set either column from the app.
--
-- ⚠️ SECURITY DEFINER, so it can write columns `authenticated` was just
-- revoked from — that is the entire point. It is therefore the one place a
-- mistake grants everything, which is why the caller check is the FIRST
-- statement and why it raises rather than returning quietly: a silent no-op
-- would look exactly like success to the screen that called it.
--
-- Same shape as public.approve_membership, which exists because widening a
-- policy would have granted role changes as a side effect.
create or replace function public.set_admin_rights(
  _membership_id uuid,
  _is_super boolean,
  _rights text[]
)
returns memberships
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _row memberships;
begin
  if not private.is_super_admin() then
    raise exception 'Only a super admin can change admin rights'
      using errcode = '42501';
  end if;

  update memberships
     set is_super = coalesce(_is_super, false),
         admin_rights = coalesce(_rights, '{}')
   where id = _membership_id
     and role = 'admin'
  returning * into _row;

  -- ⚠️ A missing row is a REFUSAL, not a success. Without this the caller
  -- gets a null and PostgREST answers 200, which reads as "saved" on screen.
  -- The same zero-row-200 shape this codebase has been bitten by twice.
  if _row.id is null then
    raise exception 'No admin membership with that id'
      using errcode = 'P0002';
  end if;

  return _row;
end;
$$;

revoke all on function public.set_admin_rights(uuid, boolean, text[]) from public;
grant execute on function public.set_admin_rights(uuid, boolean, text[]) to authenticated;
