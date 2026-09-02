-- ══════════════════════════════════════════════════════════════════════════
--  players.left_at / left_by, membership status 'left',
--  mark_player_left() and restore_player()
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/specs/2026-09-02-player-leavers-design.md
-- Plan:    claude/plans/2026-09-02-player-leavers-implementation.md
-- Harness: db/tests/player-leavers.sql (written FIRST and watched failing)
--
-- WHAT IT IS FOR. A child quits. Until now the only tool was Delete, which
-- erases attendance and selection history, leaves the parent's membership
-- ACTIVE with a blank player link, strands the photo, and is refused outright
-- for any child with a linked parent (memberships_family_role_needs_player) or
-- a past invite (invites.player_id has no ON DELETE rule). Jay ruled: keep the
-- history. Leaving is never a delete.
--
-- ⚠️ 'left' IS A STATUS AND NOT A DELETE OF THE MEMBERSHIP ROW. Every predicate
-- in this schema tests status = 'active' (122 sites, measured 2 Sep 2026;
-- none test <> 'pending'), so a 'left' row grants exactly nothing. Keeping it
-- is what makes restore_player work without a sign-in or an approval — since
-- 14 Aug the re-match only makes people PENDING.
--
-- ⚠️ invites_grant_status_check MIRRORS memberships_status_check ON PURPOSE
-- (tables.sql). Widen both or an accepted invite is burnt half way through.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing player is current.
--
-- NOT YET APPLIED TO PRODUCTION — this migration is committed for review only.
-- Applying it requires Jay's explicit go-ahead (plan Task 1, step 4).

alter table public.players
  add column if not exists left_at timestamptz,
  add column if not exists left_by uuid references public.profiles(id) on delete set null;

comment on column public.players.left_at is 'When the player was marked as left. NULL = current player. Never a delete.';
comment on column public.players.left_by is 'Who marked the player as left.';

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status = any (array['pending'::text, 'active'::text, 'left'::text]));

alter table public.invites drop constraint if exists invites_grant_status_check;
alter table public.invites add constraint invites_grant_status_check
  check (grant_status = any (array['active'::text, 'pending'::text, 'left'::text]));

-- ── mark_player_left ──────────────────────────────────────────────────────
-- Same predicate as the "player edit" policy: can_write_child() OR
-- is_team_staff(team). The screen never decides who may do this.
-- Returns the OLD photo path so the client can remove the storage object;
-- the row's photo columns are cleared here. Storage cannot be reached from
-- SQL (RESTORE.md), so the object is the client's job, best-effort.
create or replace function public.mark_player_left(p_player_id uuid)
returns table (id uuid, photo_path text)
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is not null then
    raise exception 'This player has already been marked as left.' using errcode = '22023';
  end if;

  update public.players p
     set left_at = now(), left_by = auth.uid(),
         photo_path = null, photo_focus_x = null, photo_focus_y = null
   where p.id = p_player_id;

  -- Only THIS child's family rows. A parent with two children in the squad
  -- has two rows, one per player_id; the sibling's is untouched.
  update public.memberships m
     set status = 'left'
   where m.player_id = p_player_id
     and m.role in ('parent','player')
     and m.status in ('active','pending');

  return query select ply.id, ply.photo_path;
end $$;
revoke all on function public.mark_player_left(uuid) from public, anon;
grant execute on function public.mark_player_left(uuid) to authenticated;

-- ── restore_player ────────────────────────────────────────────────────────
create or replace function public.restore_player(p_player_id uuid)
returns public.players
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is null then
    raise exception 'This player has not been marked as left.' using errcode = '22023';
  end if;

  update public.players p set left_at = null, left_by = null where p.id = p_player_id;
  update public.memberships m set status = 'active'
   where m.player_id = p_player_id and m.role in ('parent','player') and m.status = 'left';

  select * into ply from public.players p where p.id = p_player_id;
  return ply;
end $$;
revoke all on function public.restore_player(uuid) from public, anon;
grant execute on function public.restore_player(uuid) to authenticated;

-- ── claim_roster_access: skip leavers ─────────────────────────────────────
-- Live body captured 2 Sep 2026 via pg_get_functiondef('public.claim_roster_access()'::regprocedure).
-- ⚠️ ONE line added to the join's where clause: `and p.left_at is null`.
-- Without it a leaver's parent signing in raises an approval request for a
-- child who has left, and squad staff have to notice and decline it.
create or replace function public.claim_roster_access()
returns setof memberships
language plpgsql security definer set search_path to 'public' as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select auth.uid(),
         p.club_id,
         p.team_id,
         case when t.is_senior then 'player' else 'parent' end,
         p.id,
         'pending'
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
    and p.left_at is null            -- ← the only change
  on conflict do nothing
  returning *;
end;
$$;

-- ── invite_parent: refuse a leaver ────────────────────────────────────────
-- Live body captured 2 Sep 2026 via pg_get_functiondef('public.invite_parent(uuid)'::regprocedure).
-- ⚠️ ONE guard added directly after the existing
--   "That contact is not attached to a player." check.
create or replace function public.invite_parent(p_parent_row uuid)
returns public.invites
language plpgsql security definer set search_path to 'public' as $$
declare
  row_p     public.player_parents%rowtype;
  ply       public.players%rowtype;
  clean     text;
  may_edit  boolean;
  may_grant boolean;
  existing  public.invites;
  made      public.invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into row_p from public.player_parents where id = p_parent_row;
  if row_p.id is null then
    raise exception 'That contact no longer exists.' using errcode = '22023';
  end if;

  select * into ply from public.players where id = row_p.player_id;
  if ply.id is null then
    raise exception 'That contact is not attached to a player.' using errcode = '22023';
  end if;

  if ply.left_at is not null then
    raise exception 'That player has left the squad, so nobody can be invited to them.' using errcode = '22023';
  end if;

  may_edit := private.is_own_player(row_p.player_id)
              or private.can_edit_team(ply.team_id);
  if not may_edit then
    raise exception 'You cannot invite that person.' using errcode = '42501';
  end if;

  clean := lower(nullif(btrim(row_p.email), ''));
  if clean is null then
    raise exception 'There is no email address on that contact yet. Add one first.'
      using errcode = '22023';
  end if;
  if position('@' in clean) = 0 then
    raise exception 'That contact''s email address does not look right.' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles pr where lower(pr.email) = clean) then
    raise exception 'That person already has an account. Ask an admin to connect them instead.'
      using errcode = '42710';
  end if;

  select * into existing
    from public.invites i
   where lower(i.email) = clean
     and i.player_id    = row_p.player_id
     and i.accepted_at is null
   limit 1;
  if existing.id is not null then
    return existing;
  end if;

  may_grant := private.can_approve_team(ply.team_id);

  insert into public.invites (club_id, email, role, team_id, player_id, created_by, grant_status)
  values (ply.club_id, clean, 'parent', ply.team_id, row_p.player_id, auth.uid(),
          case when may_grant then 'active' else 'pending' end)
  returning * into made;

  update public.player_parents set invited_at = now() where id = row_p.id;

  return made;
end;
$$;

-- register_my_player and private.apply_signup_intent are DELIBERATELY
-- UNCHANGED: their duplicate check must keep seeing leavers so a returning
-- child is told to ask the club (→ Restore) rather than getting a second row.
-- Harness step 9 fails if a future edit changes this.
