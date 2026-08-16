-- An access request must say WHO is asking and for WHICH squad.
--
-- Jay, 16 Aug 2026: "we need to force people to select a requested role for age
-- groups when creating an account, i still have account requests coming in and
-- have no idea who they are because they don't type any extra info".
--
-- ⚠️ THE REASON IT WAS FREE TEXT IS A REAL CONSTRAINT, NOT AN OVERSIGHT, and it
-- is the whole difficulty of this change. src/components/RequestAccess.jsx says
-- it plainly: every SELECT policy in this schema bottoms out in a memberships
-- row for auth.uid(), so a person with no membership reads ZERO ROWS FROM EVERY
-- TABLE, `teams` included. There was nothing to populate a dropdown with. A note
-- box was the only thing that could work.
--
-- So this migration does two things: it adds the columns, and it gives a
-- membership-less caller a way to see the squad list at all.
--
-- ⚠️ IT DELIBERATELY DOES NOT ENFORCE THE REQUIREMENT. That is
-- 20260816_access_request_require_role.sql, and it MUST NOT RUN UNTIL THE NEW
-- FORM IS LIVE. This file is additive and safe to apply against the running
-- app: the form deployed today does not send these columns, and nothing here
-- makes it start failing. Tightening the INSERT policy in the same breath would
-- refuse every signup between the migration and the deploy — a stranger trying
-- to join the club would be told, in effect, that they are not allowed.

begin;

-- 1 ── WHAT THE REQUEST NOW CARRIES ─────────────────────────────────────────
--
-- ⚠️ BOTH NULLABLE, DESPITE BEING REQUIRED. Existing rows have neither, and a
-- NOT NULL would either fail outright or need a backfill inventing an answer on
-- behalf of people who never gave one. The requirement is enforced on the INSERT
-- policy below, which applies to new rows only — exactly the distinction NOT
-- NULL cannot express.
alter table public.access_requests
  add column if not exists requested_role    text,
  add column if not exists requested_team_id uuid references public.teams(id) on delete set null;

-- ⚠️ NO 'admin' IN THE LIST. Every other role here is squad-scoped and granted
-- by a coach or manager approving a stranger; admin is club-wide and is granted
-- by an existing admin, deliberately, on a different screen. A self-service
-- "I would like to be an admin" is not a request this club wants to receive.
alter table public.access_requests
  drop constraint if exists access_requests_requested_role_check;
alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (requested_role is null
         or requested_role in ('parent', 'player', 'coach', 'manager', 'medic'));

-- 2 ── THE SQUAD LIST, FOR SOMEBODY WHO CAN READ NOTHING ────────────────────
--
-- ⚠️ A NARROW SECURITY DEFINER FUNCTION, NOT A WIDER `teams` POLICY. Widening
-- the table's SELECT to every authenticated user would be simpler and is the
-- wrong shape: it grants a standing read of `teams` — including `scoring_kinds`
-- and `self_registration_allowed` — to anyone who can sign up, forever, to solve
-- a problem that exists for one form. This returns three columns and nothing
-- else. Same reasoning, and the same shape, as `claim_roster_access`: a person
-- with no memberships needs exactly one thing, so give them exactly that.
--
-- ⚠️ THE auth.uid() GUARD MATCHES THE OTHER DEFINER FUNCTIONS in this schema.
-- Without it the function is callable by `anon` if the grant is ever widened,
-- and a squad list is not something to hand an unauthenticated caller.
create or replace function public.list_squads_for_access_request()
returns table (id uuid, name text, sort_order integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  return query
    select t.id, t.name, t.sort_order
      from public.teams t
     order by t.sort_order, t.name;
end;
$function$;

revoke all on function public.list_squads_for_access_request() from public;
grant execute on function public.list_squads_for_access_request() to authenticated;

commit;
