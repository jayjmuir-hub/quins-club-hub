-- Applied to Supabase as migration "roles_manager_and_medic", 5 Aug 2026.
--
-- Two new squad-level roles: 'manager' (shown as "Team Manager") and
-- 'medic'. Both are IDENTICAL to 'coach' in what they may do -- the
-- distinction is documentary, so the club can record who fills which job.
--
-- Deliberately NOT an enum type: the existing roles are a text column with a
-- CHECK, and adding a value to a CHECK is a plain constraint swap, while
-- adding one to an enum is a separate committed transaction with its own
-- rules. Keeping the existing shape means the next role is the same one-line
-- change this migration is.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role = any (array['admin','coach','manager','medic','parent','player']));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role = any (array['admin','coach','manager','medic','parent','player']));

-- The ONLY policy-side change. Every RLS policy on every table calls a helper
-- rather than testing m.role directly, so widening "who may edit this squad"
-- happens in exactly one place. (An earlier estimate in this project claimed
-- a new role meant "RLS policy changes on every table" -- that was wrong, and
-- this migration is the evidence.)
--
-- private.can_see_team needs NO change: it already grants visibility to
-- anyone holding a membership row for the team, whatever the role, so a
-- manager or medic can see their squad the moment the row exists.
--
-- public.accept_invite needs NO change either: it copies invites.role through
-- to the membership row without inspecting it.
--
-- ⚠️ src/lib/scope.js's canEditTeam() MIRRORS this function, via
-- SQUAD_STAFF_ROLES. The two must stay in step. This one is the real
-- boundary; the JS one only decides what the UI offers, so drift can hide a
-- squad from someone entitled to it but can never let a write through that
-- this would refuse.
create or replace function private.can_edit_team(_team uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager','medic') and m.team_id = _team)));
$function$;
