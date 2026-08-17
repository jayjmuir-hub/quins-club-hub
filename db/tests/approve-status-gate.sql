-- ══════════════════════════════════════════════════════════════════════════
--  APPROVAL GATE HARNESS — does a PENDING staff request grant the power to
--  approve?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 17 Aug 2026. A real "Unnamed player" appeared in the approval queue on the
-- live site. It was not a player at all — it was a `request_staff_role` row: a
-- pending COACH membership, which carries no player_id, rendered by a queue
-- written when a parent's registration was the only thing that could be
-- pending.
--
-- Chasing the label turned up the real question. Three sibling functions decide
-- what a membership entitles you to, and they do NOT agree:
--
--   private.can_see_team    ... and m.status = 'active' ...   yes
--   private.can_edit_team   ... and m.status = 'active' ...   yes
--   private.can_approve_team              — NO STATUS CHECK   <— this file
--
-- If that omission is load-bearing, then ASKING to be a coach of a squad is
-- itself enough to satisfy the approval gate for that squad — including
-- approving your own request, and admitting other people's children.
--
-- ⚠️ THE JAVASCRIPT SIDE OMITS IT TOO. src/lib/scope.js `canApproveAnything`
-- and `canApproveTeam` filter on role and team but never on status, and
-- loadMyMemberships selects every row regardless of status. So the client shows
-- the queue rather than hiding it, which is what makes this reachable through
-- the ordinary app rather than only by a crafted API call.
--
-- WHAT THIS ASSERTS
--
--   1. a PENDING coach of the squad may NOT approve            <- the finding
--   2. an ACTIVE coach of the squad MAY approve                <- control
--   3. an ACTIVE coach of a DIFFERENT squad may NOT approve    <- control
--
-- ⚠️ 2 AND 3 ARE NOT PADDING. Without 2, a "fix" that refuses everybody passes
-- this file while deleting squad approval entirely. Without 3, a fix that
-- allows every signed-in coach anywhere passes it too. Assertion 1 alone is
-- satisfied by both of those disasters. CLAUDE.md rule 6.
--
-- ⚠️ THREE SEPARATE PENDING ROWS, ONE PER ASSERTION, DELIBERATELY. Approval
-- mutates the row, so re-using one would make assertion 2 depend on whether
-- assertion 1 had already flipped it — and the failure would look like a bug in
-- the gate rather than in this file.
--
-- ⚠️ A SYNTHETIC CLUB, NOT THE REAL ONE. With the club invented, no live admin
-- can satisfy the gate for this squad, so a result here is about the fixture
-- and never about who happens to administer the real club today.
-- ⚠️ AND EVERY NAME IS INVENTED — CLAUDE.md rule 9. This repo is public and its
-- members are children; a harness comment is published the moment it is pushed.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   P   coach of the probe squad, PENDING. The suspect.
--   A   coach of the probe squad, ACTIVE.  The control.
--   O   coach of the OTHER squad,  ACTIVE. The scoping control.
--   X1..X3  parents with a child in the probe squad, PENDING — the rows being
--           approved, one per assertion.

insert into clubs (id, name) values
 ('b0000000-0000-4000-8000-0000000000c1','ZZ Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('b0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-pending-coach@example.invalid',   now(), '{}'::jsonb, now(), now()),
 ('b0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-active-coach@example.invalid',    now(), '{}'::jsonb, now(), now()),
 ('b0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-othersquad-coach@example.invalid',now(), '{}'::jsonb, now(), now()),
 ('b0000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-parent-one@example.invalid',      now(), '{}'::jsonb, now(), now()),
 ('b0000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-parent-two@example.invalid',      now(), '{}'::jsonb, now(), now()),
 ('b0000000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-parent-three@example.invalid',    now(), '{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('b0000000-0000-4000-8000-0000000000f1','b0000000-0000-4000-8000-0000000000c1','ZZ Probe Squad', 999),
 ('b0000000-0000-4000-8000-0000000000f2','b0000000-0000-4000-8000-0000000000c1','ZZ Other Squad', 998);

insert into players (id, club_id, team_id, full_name) values
 ('b0000000-0000-4000-8000-0000000000e1','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','ZZ Child One'),
 ('b0000000-0000-4000-8000-0000000000e2','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','ZZ Child Two'),
 ('b0000000-0000-4000-8000-0000000000e3','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','ZZ Child Three');

-- The staff rows. Note P carries player_id null and status pending — exactly
-- what public.request_staff_role inserts.
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1', null,'coach','pending'),
 ('b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1', null,'coach','active'),
 ('b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f2', null,'coach','active');

-- The three rows to be approved, with fixed ids so each assertion names its own.
insert into memberships (id, profile_id, club_id, team_id, player_id, role, status) values
 ('b0000000-0000-4000-8000-0000000000a1','b0000000-0000-4000-8000-000000000011','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','b0000000-0000-4000-8000-0000000000e1','parent','pending'),
 ('b0000000-0000-4000-8000-0000000000a2','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','b0000000-0000-4000-8000-0000000000e2','parent','pending'),
 ('b0000000-0000-4000-8000-0000000000a3','b0000000-0000-4000-8000-000000000013','b0000000-0000-4000-8000-0000000000c1','b0000000-0000-4000-8000-0000000000f1','b0000000-0000-4000-8000-0000000000e3','parent','pending');


-- ── 1. THE FINDING: a PENDING coach must not be able to approve ────────────
--
-- ⚠️ AS `postgres` RLS AND auth.uid() ARE BOTH MEANINGLESS. A run that forgets
-- `set local role authenticated` passes while proving nothing — the same trap
-- db/tests/announcements.sql records.

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    perform public.approve_membership('b0000000-0000-4000-8000-0000000000a1');
    insert into _r values ('1 pending coach approves', 'ALLOWED');
  exception when others then
    insert into _r values ('1 pending coach approves', 'refused (' || sqlstate || ')');
  end;
end $$;


-- ── 2. CONTROL: an ACTIVE coach of the same squad MUST be able to approve ──

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
begin
  begin
    perform public.approve_membership('b0000000-0000-4000-8000-0000000000a2');
    insert into _r values ('2 active coach approves', 'ALLOWED');
  exception when others then
    insert into _r values ('2 active coach approves', 'refused (' || sqlstate || ')');
  end;
end $$;


-- ── 3. CONTROL: an ACTIVE coach of ANOTHER squad must not ──────────────────

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
begin
  begin
    perform public.approve_membership('b0000000-0000-4000-8000-0000000000a3');
    insert into _r values ('3 other-squad coach approves', 'ALLOWED');
  exception when others then
    insert into _r values ('3 other-squad coach approves', 'refused (' || sqlstate || ')');
  end;
end $$;


-- ── 4. The verdict ────────────────────────────────────────────────────────

reset role;

do $$
declare
  r1 text; r2 text; r3 text;
  problems text := '';
begin
  select outcome into r1 from _r where step = '1 pending coach approves';
  select outcome into r2 from _r where step = '2 active coach approves';
  select outcome into r3 from _r where step = '3 other-squad coach approves';

  raise notice 'APPROVAL GATE: 1 pending=%  2 active=%  3 other squad=%', r1, r2, r3;

  -- The control first: if this is broken, assertion 1's result means nothing,
  -- because "refused" would be what everybody gets.
  if r2 is distinct from 'ALLOWED' then
    problems := problems ||
      'CONTROL FAILED: an ACTIVE coach of the squad could not approve (' || coalesce(r2,'no result') ||
      '). Every other assertion in this file is vacuous until that is true. ';
  end if;

  if r3 = 'ALLOWED' then
    problems := problems ||
      'CONTROL FAILED: a coach of a DIFFERENT squad could approve. The gate is not squad-scoped at all. ';
  end if;

  if r1 = 'ALLOWED' then
    problems := problems ||
      'APPROVAL GATE: a PENDING coach request was enough to approve a membership on that squad. '
      'private.can_approve_team has no `m.status = ''active''` test, unlike can_see_team and '
      'can_edit_team — so asking to coach a squad grants the power to admit people to it, '
      'including approving your own request. ';
  end if;

  if problems <> '' then
    raise exception '%', problems;
  end if;

  raise notice 'APPROVAL GATE: all checks passed.';
end $$;


-- ── 5. Undo everything ────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Sections 1-3 really did insert users, a club, a squad,
-- children and memberships into production, and really did call
-- approve_membership. The rollback is what makes that acceptable, and
-- scripts/db-check.mjs refuses any file here that could commit instead.

rollback;
