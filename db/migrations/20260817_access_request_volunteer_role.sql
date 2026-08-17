-- 'volunteer' becomes a thing somebody may say they are.
--
-- Spec: claude/plans/2026-08-16-account-creation-redesign.md, item 5. Jay's
-- call, 17 Aug 2026, choosing between three options: add the role and KEEP the
-- squad requirement.
--
-- ══ WHAT WAS ACTUALLY BROKEN ══════════════════════════════════════════════
--
-- The roll-call's fourth answer is "I help the club another way" — committee,
-- volunteer. `access_requests` is the only queue for somebody with no squad,
-- and it could not hold that person: the CHECK accepted exactly the five roles
-- that describe a parent, a player, or squad staff. So the only way to file one
-- was to make a committee member claim a role they do not hold — which is the
-- "I have no idea who they are" bug, reintroduced by the screen built to kill
-- it.
--
-- ══ ⚠️ THIS IS A ROLE SOMEBODY MAY CLAIM, NOT A ROLE ANYBODY MAY HOLD ══════
--
-- `access_requests.requested_role` is a STATEMENT: "this is who I say I am".
-- `memberships.role` is a GRANT. They are different columns on different tables
-- with different CHECKs, and 'volunteer' is deliberately added to the first and
-- NOT the second:
--
--     memberships_role_check  CHECK (role = ANY (ARRAY['admin','coach',
--                                    'manager','medic','parent','player']))
--
-- so an admin approving a volunteer still has to choose what access they
-- actually get, and the database refuses 'volunteer' if anything ever tries to
-- grant it. ⚠️ DO NOT "FINISH THE JOB" BY ADDING IT THERE. A membership row is
-- what private.can_see_team and private.can_edit_team read; a role that grants
-- nothing would be a row those functions have to learn to ignore, and the one
-- that forgot would be the hole.
--
-- ══ ⚠️ THE SQUAD REQUIREMENT IS UNTOUCHED, AND THAT WAS THE CHOICE ═════════
--
-- `access request insert own` (20260816_access_request_require_role.sql) refuses
-- a row without BOTH a role and a squad. That is four days old, was added at
-- Jay's explicit request — "i still have account requests coming in and have no
-- idea who they are" — and is the reason an admin can now tell one waiting
-- stranger from another. A club-wide committee member picks the squad they are
-- closest to, and says the rest in the note.
--
-- ⚠️ SO A VOLUNTEER'S SQUAD MEANS "WHERE TO ASK ABOUT THEM", NOT "WHAT THEY DO
-- THERE". Anything that later reads requested_team_id as a claim of squad
-- involvement has to know that. It is the honest trade Jay picked over relaxing
-- the policy, and relaxing it is the thing NOT to do quietly later.

begin;

alter table public.access_requests
  drop constraint if exists access_requests_requested_role_check;

alter table public.access_requests
  add constraint access_requests_requested_role_check
  check (
    requested_role is null
    or requested_role = any (array['parent','player','coach','manager','medic','volunteer'])
  );

comment on column public.access_requests.requested_role is
  'What the person says they are. NOT a grant — memberships.role is, and its '
  'own CHECK deliberately excludes ''volunteer''. NULL only on the seven rows '
  'that predate 16 Aug 2026; the INSERT policy has required it since.';

-- ── THE GUARD ──────────────────────────────────────────────────────────────
-- ⚠️ BOTH DIRECTIONS. A widened CHECK that accepts everything would pass a test
-- that only tried the new value, and this table's whole purpose is telling one
-- stranger from another.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.access_requests'::regclass
       and conname  = 'access_requests_requested_role_check'
       and pg_get_constraintdef(oid) like '%volunteer%'
  ) then
    raise exception 'ABORTING: the constraint does not mention volunteer.';
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.memberships'::regclass
       and conname  = 'memberships_role_check'
       and pg_get_constraintdef(oid) like '%volunteer%'
  ) then
    raise exception 'ABORTING: volunteer has reached memberships.role, which grants access.';
  end if;

  raise notice 'guard passed: volunteer is claimable and not grantable';
end $$;

commit;

-- ── VERIFY (run it; do not assume) ─────────────────────────────────────────
-- Inside a transaction that ROLLS BACK, against a real profile id:
--
--   begin;
--   insert into public.access_requests (profile_id, requested_role, requested_team_id)
--   values ('<a profile id>', 'volunteer', '<a team id>');      -- must succeed
--   insert into public.access_requests (profile_id, requested_role, requested_team_id)
--   values ('<another id>', 'chairman', '<a team id>');          -- must FAIL 23514
--   rollback;
