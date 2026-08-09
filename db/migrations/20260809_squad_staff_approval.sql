-- Coaches and team managers approve pending registrations FOR THEIR OWN
-- SQUADS. Admins keep approving everywhere (Jay, 9 Aug 2026).
--
-- Apply as migration `20260809xxxxxx squad_staff_approval`.
--
-- ══ WHY THIS IS AN RPC AND NOT A WIDER POLICY ═══════════════════════════
-- The obvious change is to add a coach clause to `memb manage`. Read what
-- that policy actually is first:
--
--     "memb manage"  FOR ALL  USING private.is_admin(club_id)
--                             WITH CHECK private.is_admin(club_id)
--
-- FOR ALL. Not "for update of status" — SELECT, INSERT, UPDATE and DELETE on
-- public.memberships, and RLS grants ROWS, NOT COLUMNS. Widening it to
-- coaches would hand every coach the ability to change anyone's ROLE on their
-- squad (including to 'admin'), to reassign a membership to another team, and
-- to DELETE access. Approving a registration and administering the club would
-- become the same permission.
--
-- So the write stays admin-only at the policy level, and approval moves into
-- a SECURITY DEFINER function whose body can only ever set one column.
--
-- ══ MEDIC IS DELIBERATELY EXCLUDED ══════════════════════════════════════
-- private.can_edit_team is `role in ('coach','manager','medic')`. This new
-- helper is NOT that function and must not be "simplified" into it: Jay chose
-- coach and manager (9 Aug 2026). A medic keeps full squad access — they can
-- still see and edit players, which is the point of the role — but admitting
-- a stranger to a children's squad is not a medical decision.
--
-- ⚠️ If someone later decides medics should approve, change THIS function.
-- Do not repoint the callers at can_edit_team; that would also silently
-- re-include any role added to that list in future.

begin;

-- ── 1. Who may approve for a squad ─────────────────────────────────────
create or replace function private.can_approve_team(_team uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      -- Admin rows carry team_id = null and a club_id, so an admin is matched
      -- through the team's club rather than through the team. Same shape as
      -- private.can_edit_team and private.can_see_team; do not "tidy" it into
      -- a team_id comparison or every admin loses approval everywhere.
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager') and m.team_id = _team)));
$function$;

comment on function private.can_approve_team(uuid) is
  'May the caller approve a pending registration on this squad? Admin '
  'anywhere in the club, or coach/manager of this squad. ⚠️ NOT medic, and '
  'therefore NOT the same list as private.can_edit_team — Jay, 9 Aug 2026.';

-- Matches the four existing private helpers.
revoke execute on function private.can_approve_team(uuid) from public;
grant execute on function private.can_approve_team(uuid) to authenticated, anon;

-- ── 2. Letting squad staff SEE what they are approving ─────────────────
-- `memb read` is (own row) OR is_admin, so a coach cannot see the pending
-- membership at all — the queue would be permanently empty for them.
--
-- ⚠️ SCOPED TO status = 'pending', NOT to the whole squad. A coach does not
-- need the squad's membership table to approve a registration, and handing it
-- over would be a disclosure nobody asked for. The row leaves their view the
-- moment they approve it, which is correct: it is no longer waiting.
--
-- PERMISSIVE policies OR together, so this only ever adds rows. It cannot
-- take anything away from `memb read`.
drop policy if exists "memb read squad staff pending" on public.memberships;
create policy "memb read squad staff pending" on public.memberships
  for select using (status = 'pending' and private.can_approve_team(team_id));

-- ── 3. And the person's NAME and EMAIL ─────────────────────────────────
-- The queue shows a child's name, the parent's name and the parent's email.
-- Without this the coach sees a card with two blanks on it and no way to
-- judge whether the person is real — which is the entire decision they are
-- being asked to make.
create or replace function private.can_squad_staff_see_pending(_profile uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- ⚠️ EXISTS OVER THE TARGET'S *PENDING* ROWS ONLY. Not "this person is on
  -- my squad" — that would expose every parent's email on the squad to every
  -- coach. Once the last pending row is approved the profile stops being
  -- visible through this path, which is the intended lifetime.
  select exists (
    select 1 from memberships m
     where m.profile_id = _profile
       and m.status = 'pending'
       and private.can_approve_team(m.team_id)
  );
$function$;

revoke execute on function private.can_squad_staff_see_pending(uuid) from public;
grant execute on function private.can_squad_staff_see_pending(uuid) to authenticated, anon;

drop policy if exists "profile read squad staff pending" on public.profiles;
create policy "profile read squad staff pending" on public.profiles
  for select using (private.can_squad_staff_see_pending(id));

-- ── 4. The approval itself ─────────────────────────────────────────────
-- ⚠️ THE ONLY THING THIS FUNCTION CAN WRITE IS `status`. That is not a
-- convention, it is the whole security argument for existing: the caller
-- supplies an id and nothing else, and the SET list is a literal. There is no
-- parameter through which a role, a team or a player could be changed.
create or replace function public.approve_membership(p_membership_id uuid)
 returns public.memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target public.memberships;
begin
  -- Fail-safe guard, matching the other SECURITY DEFINER functions here.
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

  -- ⚠️ IDEMPOTENT, NOT AN ERROR. Two coaches opening the queue on a Sunday
  -- evening and both tapping Approve is the NORMAL case, and the second one
  -- has done nothing wrong. Returning the row unchanged makes the second tap
  -- a no-op instead of a red banner blaming them for someone else's click.
  if target.status = 'active' then
    return target;
  end if;

  update public.memberships
     set status = 'active'
   where id = p_membership_id
  returning * into target;

  return target;
end;
$function$;

revoke execute on function public.approve_membership(uuid) from public;
grant execute on function public.approve_membership(uuid) to authenticated;

-- ── THE GUARD ──────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  -- `memb manage` must be untouched. If a later edit widens it, this is the
  -- line that notices — the RPC above becomes pointless the moment coaches
  -- can UPDATE the table directly.
  select count(*) into n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'memberships' and p.polname = 'memb manage'
     and pg_get_expr(p.polqual, p.polrelid) = 'private.is_admin(club_id)';
  if n <> 1 then
    raise exception 'ABORTING: "memb manage" is not admin-only any more. Approval must not be a table write.';
  end if;

  if private.can_approve_team(null) then
    raise exception 'ABORTING: can_approve_team(null) is true — a membership with no team would be approvable by anyone.';
  end if;

  raise notice 'guard passed: memb manage still admin-only, can_approve_team fails closed on null';
end $$;

commit;
