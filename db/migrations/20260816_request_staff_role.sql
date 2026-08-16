-- public.request_staff_role() — a signed-in member says they coach, manage or
-- medic a squad, and gets a PENDING membership for it.
--
-- Spec: claude/plans/2026-08-16-account-creation-redesign.md, item 1.
-- Pairs with 20260816_profile_no_role_confirmed.sql, which records the "no, I
-- don't" answer so the question is asked once rather than at every sign-in.
--
-- ⚠️ WHY A FUNCTION AND NOT AN INSERT POLICY. Two independent reasons, and both
-- would have to be undone to "simplify" this:
--
--   1. `memb no self promotion` is RESTRICTIVE on INSERT, so a caller cannot
--      insert their own membership row at all. Widening it is the wrong fix:
--      it is the single thing standing between an ordinary admin and
--      `is_super = true`.
--   2. Even with a policy, the caller would be supplying `role`, `status` and
--      `club_id`. Every one of those has to be derived rather than accepted —
--      the same argument register_my_player's header makes at length. Here the
--      caller supplies a squad and a role and NOTHING else; the club comes from
--      the squad, and the status is not a parameter at any point.
--
-- ⚠️ IT GRANTS NOTHING. This is the line to keep in view: a stranger typing the
-- name of a squad must never be able to read that squad's children.
-- `private.can_see_team` requires status = 'active', so a pending row attaches
-- the person to the squad's FIXTURES and to nothing else. The whole design of
-- claude/decisions/2026-08-08-parent-self-registration.md rests on that, and
-- this function is a second caller of the same state, not a new kind of access.
--
-- ⚠️ SECURITY DEFINER BYPASSES RLS, INCLUDING THE RESTRICTIVE POLICY ABOVE.
-- So `is_super` and `admin_rights` are deliberately NOT set here and are left
-- to their column defaults (false, '{}'). Naming them at all would make this
-- function a second place where a super admin could be minted. It is not one,
-- and must never become one.

create or replace function public.request_staff_role(
  p_team_id uuid,
  p_role    text
)
 returns public.memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_email   text;
  confirmed_at   timestamptz;
  team_row       public.teams;
  pending_count  int;
  existing       public.memberships;
  new_membership public.memberships;
begin
  -- 1. Signed in. Same fail-safe guard as every other anon-callable
  --    SECURITY DEFINER function in this schema.
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- 2. ⚠️ EMAIL MUST BE CONFIRMED, and for a sharper reason here than for a
  --    parent registering a child. The row this creates lands in a coach's
  --    approval queue claiming a STAFF role on a children's squad. If the
  --    address behind it was never proved, the queue is showing somebody a
  --    claim with nothing at all behind it.
  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;
  if confirmed_at is null then
    raise exception 'Please confirm your email address first.' using errcode = '42501';
  end if;

  -- 3. ⚠️ NO 'admin', AND NO 'parent' OR 'player' EITHER.
  --    'admin' is club-wide and is granted by an existing admin on a different
  --    screen — the same carve-out REQUESTABLE_ROLES makes in
  --    src/components/RequestAccess.jsx, and the same one the CHECK constraint
  --    on access_requests makes. 'parent' and 'player' are excluded from the
  --    other direction: those come with a child or with being one, and
  --    register_my_player is the only thing that may create them.
  --
  --    ⚠️ MEDIC BELONGS IN THIS LIST, with coach and manager. It is squad-scoped
  --    staff, it is in REQUESTABLE_ROLES, and it is in private.can_edit_team.
  --    A first draft of the plan filed it under "I help another way" and that
  --    was wrong.
  if p_role is null or p_role not in ('coach', 'manager', 'medic') then
    raise exception 'Choose coach, team manager or medic.' using errcode = '22023';
  end if;

  -- 4. The squad decides the club. ⚠️ The caller must not supply club_id —
  --    same rule as register_my_player, and for the same reason: it is the
  --    column that decides which club's data a row belongs to.
  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That squad does not exist.' using errcode = '22023';
  end if;

  -- 5. ⚠️ ALREADY HOLDS IT -> RETURN IT, DO NOT RAISE. `memberships_unique_grant`
  --    is UNIQUE NULLS NOT DISTINCT over (profile_id, club_id, role, team_id,
  --    player_id), and both columns that would differ here — status and
  --    created_at — are outside it. So a second call would hit a unique
  --    violation and surface as a database error on a screen, for somebody who
  --    has done nothing wrong except tap twice. Returning the existing row makes
  --    this idempotent, which is what a gate that can be re-rendered needs.
  --
  --    It also covers the case that matters most: an ACTIVE coach who somehow
  --    reaches this gate is handed back their real membership rather than
  --    having a pending duplicate created underneath it.
  select * into existing
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.club_id    = team_row.club_id
     and m.team_id    = p_team_id
     and m.role       = p_role
     and m.player_id is null
   limit 1;

  if existing.id is not null then
    return existing;
  end if;

  -- 6. ⚠️ A CEILING ON PENDING STAFF CLAIMS, and it counts PENDING rows only —
  --    the same shape as register_my_player's cap and for the same stated
  --    reason: "an approved coach adding a second squad later is normal and
  --    must not be blocked by their own history". Without it one account can
  --    file a claim on every squad in the club and put a request in front of
  --    every coach at once.
  select count(*) into pending_count
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.status     = 'pending'
     and m.player_id is null
     and m.role in ('coach', 'manager', 'medic');

  if pending_count >= 5 then
    raise exception 'You already have % squad requests waiting to be approved.', pending_count
      using errcode = '42901';
  end if;

  -- 7. ⚠️ status = 'pending' IS WRITTEN, NOT INHERITED. The column defaults to
  --    'active' (load-bearing for the 8 Aug migration, see tables.sql), so a
  --    row that relied on the default here would grant squad-wide access to a
  --    stranger who typed a squad name. claim_roster_access carries the same
  --    note from the other direction, where 'active' is the deliberate answer.
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, p_team_id, p_role, null, 'pending')
  returning * into new_membership;

  -- ⚠️ The `notify_pending_membership` trigger fires on this insert and emails
  -- the squad's coaches, managers and club admins. It cannot fail the insert
  -- (its body swallows everything into a warning), so a broken mail path never
  -- costs somebody their request — and equally, is silent. The SCREEN is the
  -- source of truth; the email is a prompt to go and look at it.
  return new_membership;
end;
$function$
;

-- ⚠️ `revoke ... from public` IS NOT ENOUGH ON SUPABASE, AND THIS WAS MEASURED
-- RATHER THAN ASSUMED. This file originally carried only the two lines below
-- and claimed in a comment that anon was excluded. It was not: reading
-- `pg_proc.proacl` straight after applying showed
--
--     postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role`, so a newly created function arrives with
-- anon holding an EXPLICIT grant. `revoke from public` removes the implicit
-- PUBLIC entry and leaves that explicit one untouched.
--
-- ⚠️ AND `public.register_my_player` HAS THE SAME anon GRANT ON PRODUCTION FOR
-- THE SAME REASON — measured 16 Aug 2026. It is not a hole: every guard in both
-- functions keys on auth.uid() and an anon caller is refused at the first line.
-- It is recorded because three other public RPCs (accept_invite,
-- claim_roster_access, set_admin_rights) do NOT carry it, so the schema looks
-- deliberate and is not. Left alone here rather than tidied — see
-- claude/open-items.md.
revoke all on function public.request_staff_role(uuid, text) from public;
revoke execute on function public.request_staff_role(uuid, text) from anon;
grant execute on function public.request_staff_role(uuid, text) to authenticated;
