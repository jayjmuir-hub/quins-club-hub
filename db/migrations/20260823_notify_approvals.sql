-- Who gets the "somebody is waiting to be approved" email — 23 Aug 2026.
--
-- Jay: "admin needs a way to select who receives emails about people waiting
-- to be approved, right now the only option related to that is selecting
-- who's the head coach."
--
-- Until now the list was a RULE inside supabase/functions/notify-approval:
-- every super admin, plus the squad's head coach and managers. The only lever
-- an admin had was the head-coach flag, which is not what the flag is for.
--
-- This makes it a SWITCH per membership: `memberships.notify_approvals`.
--   admin   (team_id null)  → told about every registration in the club
--   coach / manager (squad) → told about registrations for that squad
-- Nobody else can hold it (constraint). Any admin sets it, from the Club
-- admin tab. It confers no authority — who may APPROVE is still
-- private.can_approve_team; this only decides who is TOLD.
--
-- BACKFILL so day one changes nothing: the people the old rule emailed are
-- switched on. The edge function reads the switch; if NOBODY in scope is
-- switched on it falls back to the super admins, so a registration is never
-- left unseen — the floor the old rule had, kept.
--
-- Same shape as is_head_coach (20260818_membership_head_coach.sql): a column
-- grant, because `authenticated` holds no table-level UPDATE on memberships
-- by design. `memb manage` (admin-only) is the policy that gates the write.

alter table public.memberships
  add column if not exists notify_approvals boolean not null default false;

comment on column public.memberships.notify_approvals is
  'Gets the email when somebody is waiting to be approved: an admin for the whole club, a coach or manager for their squad. Set by admins. Confers nothing. See db/migrations/20260823_notify_approvals.sql.';

alter table public.memberships
  drop constraint if exists memberships_notify_approvals_role;
alter table public.memberships
  add constraint memberships_notify_approvals_role
  check (not notify_approvals or role in ('admin', 'coach', 'manager'));

-- the old rule, made explicit
update public.memberships
   set notify_approvals = true
 where status = 'active'
   and (
     (role = 'admin' and is_super)
     or (role = 'coach' and is_head_coach)
     or (role = 'manager' and team_id is not null)
   );

grant update (notify_approvals) on public.memberships to authenticated;

-- The list an admin edits: every active admin, coach and manager in the
-- club, with name and squad. SECURITY DEFINER so it can read profiles.full_name
-- for people the admin shares no squad with; gated on is_admin.
create or replace function public.approval_recipients()
returns table (membership_id uuid, profile_id uuid, full_name text, role text, team_id uuid, team_name text, notify boolean)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1)
  select m.id, m.profile_id, p.full_name, m.role, m.team_id, t.name, m.notify_approvals
    from memberships m
    cross join club
    join profiles p on p.id = m.profile_id
    left join teams t on t.id = m.team_id
   where m.club_id = club.id
     and m.status = 'active'
     and m.role in ('admin', 'coach', 'manager')
     and (m.role = 'admin' or m.team_id is not null)
     and private.is_admin(club.id)
   order by case m.role when 'admin' then 0 else 1 end, t.sort_order nulls first, t.name, p.full_name;
$function$;
revoke all on function public.approval_recipients() from public, anon;
grant execute on function public.approval_recipients() to authenticated;
