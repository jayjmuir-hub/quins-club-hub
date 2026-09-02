-- ══════════════════════════════════════════════════════════════════════════
--  Leavers, third pass: a PENDING row stays pending, a leaver comes off
--  FUTURE selection, the calendar feed respects 'left', and neither RPC
--  reveals whether a player exists
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/specs/2026-09-02-player-leavers-design.md
-- Plan:    claude/plans/2026-09-02-player-leavers-implementation.md
-- Harness: db/tests/player-leavers.sql (the new steps were written FIRST and
--          watched failing against live, before this file was applied)
-- Follows: db/migrations/20260902_player_leavers.sql
--          db/migrations/20260902_player_leavers_left_grants_nothing.sql
--
-- WHAT IT IS FOR. A final whole-branch review on 2 Sep 2026 found six things
-- the first two migrations got wrong or left undone. Each fix is named at its
-- own edit below; the short version:
--
--   1. CRITICAL — a PENDING membership could become ACTIVE by leaving and
--      being restored. mark_player_left flipped 'active' AND 'pending' rows to
--      'left'; restore_player flips every 'left' row to 'active'. So mark then
--      restore promoted a parent who had never been approved. A pending row
--      grants nothing and must stay pending. Separately, a pending request
--      raised BEFORE the child left could still be approved afterwards, which
--      re-attaches a family to a squad their child has quit — approve_membership
--      now refuses while the player is a leaver.
--   2. The ICS calendar feed (calendar_events_for_token) joined memberships
--      with no status test at all, so a 'left' family kept receiving the
--      squad's fixtures in their phone calendar indefinitely. That is the
--      third membership predicate found without a status test, after the two
--      the previous migration fixed, and it is an INLINE join rather than a
--      private.* helper — which is why the earlier audit missed it.
--   3. Both RPCs told an unauthorised caller "That player no longer exists."
--      before checking whether the caller was allowed to touch the player at
--      all, so the error message was an oracle for whether a given uuid names
--      a real player. Same failure the invite_parent guard was moved for.
--   4. Leaving took a child off the roster but left their FUTURE availability
--      and lineup rows behind, so a Saturday selection made on Thursday still
--      named them. Past rows are history and stay.
--   5. Neither RPC locked the players row it read, so two concurrent calls
--      could both pass the "already left" / "not left" test.
--
-- ⚠️ THE PREVIOUS BODIES ARE REPRODUCED IN FULL, so this migration is
-- REVERSIBLE: every function below was captured live with pg_get_functiondef
-- on 2 Sep 2026 before it was edited, and the pre-edit text is quoted above
-- each one. Re-applying the quoted body restores the earlier behaviour
-- exactly. Nothing here was reconstructed from db/schema/functions.sql or from
-- an older migration — the creating migration is a function's OLDEST version
-- and editing from it silently reverts everything applied since.
--
-- ⚠️ private.is_team_staff was CHECKED and NOT TOUCHED. Its live body on
-- 2 Sep 2026 is character-for-character equivalent to the one
-- db/migrations/20260828_child_contacts_allowlist.sql defines (whitespace
-- only), so there is nothing here to re-state. It is added to
-- db/schema/functions.sql in this same commit, where it was missing.
--
-- ⚠️ NOTHING IS BACKFILLED. No player is a leaver on live yet.
--
-- NOT YET APPLIED TO PRODUCTION — committed for review only. Applying it
-- requires Jay's explicit go-ahead.


-- ── mark_player_left ──────────────────────────────────────────────────────
-- PREVIOUS BODY, captured live 2 Sep 2026 via
--   pg_get_functiondef('public.mark_player_left(uuid)'::regprocedure):
--
--   CREATE OR REPLACE FUNCTION public.mark_player_left(p_player_id uuid)
--    RETURNS TABLE(id uuid, photo_path text)
--    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   declare
--     ply public.players%rowtype;
--   begin
--     select * into ply from public.players p where p.id = p_player_id;
--     if ply.id is null then
--       raise exception 'That player no longer exists.' using errcode = '22023';
--     end if;
--     if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
--       raise exception 'You are not allowed to change this player.' using errcode = '42501';
--     end if;
--     if ply.left_at is not null then
--       raise exception 'This player has already been marked as left.' using errcode = '22023';
--     end if;
--
--     update public.players p
--        set left_at = now(), left_by = auth.uid(),
--            photo_path = null, photo_focus_x = null, photo_focus_y = null
--      where p.id = p_player_id;
--
--     update public.memberships m
--        set status = 'left'
--      where m.player_id = p_player_id
--        and m.role in ('parent','player')
--        and m.status in ('active','pending');
--
--     return query select ply.id, ply.photo_path;
--   end $function$
--
-- FOUR CHANGES, and nothing else:
--   (a) `for update` on the players read — review finding #14.
--   (b) the null-row branch no longer names the player to a caller who is not
--       allowed to touch players at all — review finding #5.
--   (c) `and m.status = 'active'` on the memberships update — review finding
--       #1, the critical one.
--   (d) future availability and lineup rows are deleted — review finding #6.
create or replace function public.mark_player_left(p_player_id uuid)
returns table (id uuid, photo_path text)
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  -- ⚠️ FOR UPDATE. Without the lock two concurrent calls both read left_at as
  -- null, both pass the guard below, and the second one overwrites left_by and
  -- left_at with its own — and, worse, runs the membership update twice, which
  -- is harmless only by luck. The row is held until this transaction ends.
  select * into ply from public.players p where p.id = p_player_id for update;

  if ply.id is null then
    -- ⚠️ THE ERROR MESSAGE IS AN ORACLE IF IT COMES BEFORE AUTHORISATION.
    -- A caller who may not write any player must not be able to tell a uuid
    -- that names a real player from one that names nothing; "no longer
    -- exists" versus "not allowed" is exactly that distinction. can_write_child
    -- is the only predicate that can be evaluated without a row (is_team_staff
    -- needs a team_id), and an admin who holds it is entitled to the honest
    -- answer. Same reasoning as the invite_parent guard ordering in
    -- db/migrations/20260902_player_leavers.sql.
    if private.can_write_child() then
      raise exception 'That player no longer exists.' using errcode = '22023';
    end if;
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
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

  -- Only THIS child's family rows. A parent with two children in the squad has
  -- two rows, one per player_id; the sibling's is untouched.
  --
  -- ⚠️ `= 'active'`, NOT `in ('active','pending')`. A PENDING row is a request
  -- that was never granted: it already grants nothing, so there is nothing for
  -- leaving to take away. Flipping it to 'left' would make restore_player --
  -- which turns every 'left' row back to 'active' -- APPROVE it, and a parent
  -- who was never let in would be let in by a mark-then-restore. Leaving it
  -- pending means a 'left' row can only ever have come from an 'active' one,
  -- which is what makes restore_player's blanket 'active' safe.
  --
  -- The stale pending request itself is dealt with by approve_membership
  -- below: it cannot be approved while the child is a leaver.
  update public.memberships m
     set status = 'left'
   where m.player_id = p_player_id
     and m.role in ('parent','player')
     and m.status = 'active';

  -- ⚠️ HISTORY IS KEPT; A SATURDAY SELECTION MADE ON THURSDAY IS NOT HISTORY.
  -- Attendance, past availability and past team sheets all stay — that is the
  -- whole point of marking rather than deleting. But a child who has quit must
  -- not still be answering "in" for next weekend, nor still be named in a
  -- lineup for a fixture that has not happened. Only rows attached to an event
  -- in the future go.
  delete from public.availability a
   using public.events e
   where e.id = a.event_id
     and a.player_id = p_player_id
     and e.starts_at > now();

  -- lineup_players has no event_id of its own: it links through
  -- lineups(event_id). Checked against the live schema 2 Sep 2026 rather than
  -- assumed.
  delete from public.lineup_players lp
   using public.lineups l, public.events e
   where l.id = lp.lineup_id
     and e.id = l.event_id
     and lp.player_id = p_player_id
     and e.starts_at > now();

  return query select ply.id, ply.photo_path;
end $$;
revoke all on function public.mark_player_left(uuid) from public, anon;
grant execute on function public.mark_player_left(uuid) to authenticated;


-- ── restore_player ────────────────────────────────────────────────────────
-- PREVIOUS BODY, captured live 2 Sep 2026 via
--   pg_get_functiondef('public.restore_player(uuid)'::regprocedure):
--
--   CREATE OR REPLACE FUNCTION public.restore_player(p_player_id uuid)
--    RETURNS players
--    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   declare
--     ply public.players%rowtype;
--   begin
--     select * into ply from public.players p where p.id = p_player_id;
--     if ply.id is null then
--       raise exception 'That player no longer exists.' using errcode = '22023';
--     end if;
--     if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
--       raise exception 'You are not allowed to change this player.' using errcode = '42501';
--     end if;
--     if ply.left_at is null then
--       raise exception 'This player has not been marked as left.' using errcode = '22023';
--     end if;
--
--     update public.players p set left_at = null, left_by = null where p.id = p_player_id;
--     update public.memberships m set status = 'active'
--      where m.player_id = p_player_id and m.role in ('parent','player') and m.status = 'left';
--
--     select * into ply from public.players p where p.id = p_player_id;
--     return ply;
--   end $function$
--
-- TWO CHANGES: the `for update` lock (#14) and the existence-leak guard (#5).
-- ⚠️ The membership update is UNCHANGED and stays a blanket 'left' → 'active'.
-- That is correct ONLY because mark_player_left above no longer produces a
-- 'left' row from a 'pending' one, so every 'left' row it can find was
-- 'active' before it left. The two edits are one change and must not be
-- separated.
create or replace function public.restore_player(p_player_id uuid)
returns public.players
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id for update;

  if ply.id is null then
    -- See mark_player_left: authorisation before the message says anything
    -- about whether the row exists.
    if private.can_write_child() then
      raise exception 'That player no longer exists.' using errcode = '22023';
    end if;
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
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


-- ── approve_membership: a leaver's stale request cannot be approved ────────
-- PREVIOUS BODY, captured live 2 Sep 2026 via
--   pg_get_functiondef('public.approve_membership(uuid)'::regprocedure):
--
--   CREATE OR REPLACE FUNCTION public.approve_membership(p_membership_id uuid)
--    RETURNS memberships
--    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   declare
--     target public.memberships;
--   begin
--     if auth.uid() is null then
--       raise exception 'You must be signed in.' using errcode = '42501';
--     end if;
--
--     select * into target from public.memberships where id = p_membership_id;
--     if target.id is null then
--       raise exception 'That registration no longer exists.' using errcode = '42704';
--     end if;
--
--     if not private.can_approve_team(target.team_id) then
--       raise exception 'You can only approve players for your own age groups.'
--         using errcode = '42501';
--     end if;
--
--     if target.status = 'active' then
--       return target;
--     end if;
--
--     update public.memberships
--        set status = 'active'
--      where id = p_membership_id
--     returning * into target;
--
--     return target;
--   end;
--   $function$
--
-- ONE guard added, and nothing else changed.
create or replace function public.approve_membership(p_membership_id uuid)
returns public.memberships
language plpgsql security definer set search_path to 'public' as $$
declare
  target public.memberships;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into target from public.memberships where id = p_membership_id;
  if target.id is null then
    raise exception 'That registration no longer exists.' using errcode = '42704';
  end if;

  if not private.can_approve_team(target.team_id) then
    raise exception 'You can only approve players for your own age groups.'
      using errcode = '42501';
  end if;

  -- ⚠️ THE OTHER HALF OF THE PENDING FIX. mark_player_left deliberately leaves
  -- a pending request pending, which closes the promotion route through
  -- restore_player but leaves the request itself sitting in the approvals
  -- queue for a child who has quit. Approving it would hand a family full
  -- access to a squad their child has left. Refuse while the player is a
  -- leaver; Restore clears left_at and the request becomes approvable again,
  -- which is the order the club actually does these things in.
  --
  -- Placed AFTER can_approve_team so the message cannot tell somebody who may
  -- not approve for this squad anything about the child behind the row.
  -- A membership with a null player_id (staff, admins) is unaffected: the
  -- exists() below cannot match.
  if exists (
    select 1 from public.players p
     where p.id = target.player_id
       and p.left_at is not null
  ) then
    raise exception 'That player has left the squad. Restore them first if they are back.'
      using errcode = '22023';
  end if;

  if target.status = 'active' then
    return target;
  end if;

  update public.memberships
     set status = 'active'
   where id = p_membership_id
  returning * into target;

  return target;
end;
$$;


-- ── calendar_events_for_token: a 'left' family stops receiving fixtures ────
-- PREVIOUS BODY, captured live 2 Sep 2026 via
--   pg_get_functiondef('public.calendar_events_for_token(uuid)'::regprocedure).
-- The whole body is reproduced below unchanged apart from ONE line, marked at
-- the point of the edit. The memberships join carried no status test of any
-- kind, so a family whose only membership is 'left' — and, before this, a
-- family who had never been approved at all — kept every fixture of the squad
-- arriving in their phone calendar for as long as the token existed.
--
--   ...
--     from public.calendar_tokens ct
--     join public.memberships m on m.profile_id = ct.profile_id
--     where ct.token = _token
--       and (
--   ...
--
-- ⚠️ `<> 'left'`, NOT `= 'active'`, for the same reason
-- 20260902_player_leavers_left_grants_nothing.sql gives: a PENDING parent's
-- feed is a separate question from this one, it works today, and narrowing it
-- here would be an unrelated behaviour change smuggled in under a leavers fix.
-- If pending should not receive fixtures either, that is its own decision with
-- its own harness step.
create or replace function public.calendar_events_for_token(_token uuid)
returns table (
  id uuid, type text, title text, opponent text, home boolean, venue text,
  pitch text, competition text, starts_at timestamptz, ends_at timestamptz,
  notes text, team_name text, league_team_name text, league_division text,
  round smallint, time_tbd boolean, competition_type text, info_only boolean,
  all_day boolean
)
language sql stable security definer set search_path to 'public' as $$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type, e.info_only, e.all_day
  from public.events e
  left join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and m.status <> 'left'          -- ← the only change
      and (
        (m.role = 'admin' and m.club_id = e.club_id)
        or m.team_id = e.team_id
        or (e.team_id is null and m.club_id = e.club_id)
      )
  )
  and e.starts_at > now() - interval '6 months'
  and e.tournament_id is null
  order by e.starts_at;
$$;
