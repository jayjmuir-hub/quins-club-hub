-- ══════════════════════════════════════════════════════════════════════════
--  ADMIN GATE HARNESS — does a PENDING admin membership confer admin powers?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- The sibling of db/tests/approve-status-gate.sql, and the same bug one level
-- up. On 17 Aug 2026 private.can_approve_team was found to ask about role and
-- team but never about STATUS, so asking to coach a squad satisfied the
-- approval gate for it. That was fixed. private.is_admin had the identical
-- omission and was deliberately left, because nothing could create a pending
-- admin row and it backs most of the admin RLS surface.
--
-- 18 Aug 2026: taken, and the audit found it was FOUR functions, not one.
-- Every one of them asks "is the caller an admin" and none tested status:
--
--   private.is_admin(uuid)               15 policies across 9 tables
--   private.is_admin_anywhere()           2 policies (access_requests,
--                                                     photo_backup_runs)
--   private.shares_admin_club(uuid)       2 policies (profiles)
--   private.can_admin_see_pending(uuid)   1 policy   (profiles)
--
-- The last two matter more than their policy count suggests: they back
-- `profiles`, so the omission let a pending admin row read every member's NAME
-- and E-MAIL. That is the same thing the 17 Aug bug leaked, by a different
-- route.
--
-- WHAT THIS ASSERTS
--
--   1. a PENDING admin gets FALSE from all four functions        <- the finding
--   2. an ACTIVE admin gets TRUE from all four                   <- control
--   3. an ordinary ACTIVE parent gets FALSE from all four        <- control
--   4. end to end, under RLS: a PENDING admin cannot read another
--      member's profile row, and an ACTIVE admin can             <- both
--
-- ⚠️ 2 AND 3 ARE NOT PADDING. Without 2, a "fix" that refuses everybody passes
-- this file while deleting admin access entirely. Without 3, a fix that lets
-- every signed-in member through passes it too. Assertion 1 alone is satisfied
-- by both of those disasters. CLAUDE.md rule 6.
--
-- ⚠️ 4 IS NOT A DUPLICATE OF 1-3. The functions could be right while the
-- policies call something else, or call it with the wrong argument. Only a
-- real SELECT under `set local role authenticated` proves the fix reaches the
-- thing a person actually does.
--
-- ⚠️ A SYNTHETIC CLUB, NOT THE REAL ONE, so a result here is about the fixture
-- and never about who happens to administer the real club today.
-- ⚠️ AND EVERY NAME IS INVENTED — CLAUDE.md rule 9. This repo is public and its
-- members are children; a harness comment is published the moment it is pushed.
--
-- ⚠️ THE FIXTURE CREATES A PENDING ADMIN ROW, WHICH PRODUCTION CANNOT.
-- `request_staff_role` refuses any role but coach/manager/medic and
-- `set_admin_rights` writes active, which is exactly why the bug was
-- unreachable and why it was safe to defer. A harness that waited for a real
-- one to appear would never run at all.

begin;

-- ── The cast ──────────────────────────────────────────────────────────────
--   PA  admin of the probe club, PENDING. The suspect.
--   AA  admin of the probe club, ACTIVE.  The control.
--   PP  parent in the probe club, ACTIVE. The scoping control.
--   NR  a signed-up person with NO membership rows at all — the argument
--       can_admin_see_pending is designed to answer TRUE for.

insert into clubs (id, name) values
 ('c0000000-0000-4000-8000-0000000000c1','ZZ Admin Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-pending-admin@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-active-admin@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-plain-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('c0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-no-rows@example.invalid',       now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('c0000000-0000-4000-8000-0000000000f1','c0000000-0000-4000-8000-0000000000c1','ZZ Admin Probe Squad', 997);

insert into players (id, club_id, team_id, full_name) values
 ('c0000000-0000-4000-8000-0000000000e1','c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000f1','ZZ Probe Child');

-- ⚠️ An admin row carries team_id null — admin is club-wide, not squad-scoped.
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c1', null, null, 'admin','pending'),
 ('c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-0000000000c1', null, null, 'admin','active'),
 ('c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000f1','c0000000-0000-4000-8000-0000000000e1','parent','active');


-- ── The check, as a function so the self-test can run it a second time ────
--
-- ⚠️ auth.uid() READS request.jwt.claims, so the claim is what makes each
-- probe a different person. set_config(..., true) is transaction-local and
-- goes with the rollback.
--
-- ⚠️ EVERY MEASUREMENT GOES INTO `_log` AS WELL AS INTO A NOTICE, and the last
-- statement before the rollback selects it. `npm run db:check` prints notices;
-- a runner that shows only ROWS — the Supabase SQL editor, the MCP tool —
-- would otherwise report a silent success and none of the numbers behind it.

create temporary table _log(seq serial, phase text, line text) on commit drop;

create function pg_temp.assert_admin_gates(_phase text) returns void language plpgsql as $fn$
declare
  subject  record;
  problems text := '';
  answers  text := '';
  seen     int;

  club constant uuid := 'c0000000-0000-4000-8000-0000000000c1';
  pa   constant uuid := 'c0000000-0000-4000-8000-000000000001';
  aa   constant uuid := 'c0000000-0000-4000-8000-000000000002';
  pp   constant uuid := 'c0000000-0000-4000-8000-000000000003';
  nr   constant uuid := 'c0000000-0000-4000-8000-000000000004';
begin
  -- ── 1-3. The four gates, for each of the three people ──────────────────
  for subject in
    select * from (values ('pending admin', pa), ('active admin', aa), ('plain parent', pp))
                  as t(label, uid)
  loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', subject.uid, 'role', 'authenticated')::text, true);

    declare
      a1 boolean := private.is_admin(club);
      a2 boolean := private.is_admin_anywhere();
      a3 boolean := private.shares_admin_club(pp);
      a4 boolean := private.can_admin_see_pending(nr);
      -- The ACTIVE admin is the only one of the three who should get TRUE, and
      -- should get it from all four. That single expectation is what makes
      -- assertions 2 and 3 controls rather than repetitions of assertion 1.
      expected boolean := (subject.label = 'active admin');
    begin
      answers := answers || format('%s: %s/%s/%s/%s   ', subject.label, a1, a2, a3, a4);
      if a1 is distinct from expected or a2 is distinct from expected
         or a3 is distinct from expected or a4 is distinct from expected then
        problems := problems || format(
          'ADMIN GATE: %s got is_admin=%s is_admin_anywhere=%s shares_admin_club=%s '
          'can_admin_see_pending=%s, expected all %s. ',
          subject.label, a1, a2, a3, a4, expected);
      end if;
    end;
  end loop;

  raise notice 'ADMIN GATE  is_admin/anywhere/shares/see_pending — %', answers;
  insert into _log(phase, line)
    values (_phase, 'is_admin/anywhere/shares/see_pending — ' || answers);

  -- ── 4. End to end, under RLS, as the role a browser actually uses ──────
  --
  -- ⚠️ WITHOUT `set local role authenticated` THIS SECTION PASSES WHILE
  -- PROVING NOTHING — postgres bypasses RLS, so every read succeeds and the
  -- pending-admin arm would look like a leak that is not one. Same trap
  -- db/tests/announcements.sql records.

  perform set_config('request.jwt.claims',
                     json_build_object('sub', pa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.profiles where id = pp;
  reset role;

  raise notice 'ADMIN GATE  pending admin reads % profile row(s) of another member', seen;
  insert into _log(phase, line)
    values (_phase, format('under RLS, PENDING admin reads %s profile row(s) of another member (want 0)', seen));
  if seen <> 0 then
    problems := problems || format(
      'ADMIN GATE: a PENDING admin read %s profile row(s) belonging to another member. '
      'private.shares_admin_club and can_admin_see_pending have no status test, so '
      'asking for admin is enough to read the club''s names and e-mail addresses. ', seen);
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', aa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.profiles where id = pp;
  reset role;

  raise notice 'ADMIN GATE  active admin reads % profile row(s) of another member', seen;
  insert into _log(phase, line)
    values (_phase, format('under RLS, ACTIVE admin reads %s profile row(s) of another member (want 1)', seen));
  if seen <> 1 then
    problems := problems || format(
      'CONTROL FAILED: an ACTIVE admin read %s profile rows for a member of their own '
      'club, expected 1. Every other assertion in this file is vacuous until that is '
      'true — a fix that refused everybody would otherwise pass. ', seen);
  end if;

  if problems <> '' then
    raise exception '%', problems;
  end if;
end
$fn$;


-- ── Run it unmodified. This must pass. ────────────────────────────────────

do $$
begin
  perform pg_temp.assert_admin_gates('as it stands');
  raise notice 'ADMIN GATE: all checks passed.';
  insert into _log(phase, line) values ('as it stands', 'ADMIN GATE: all checks passed.');
end $$;


-- ── SELF-TEST: put the fault back and prove the check catches it ──────────
--
-- ⚠️ NOT OPTIONAL, AND NOT DECORATION. Every assertion above is of the form
-- "this person is refused". A typo'd uuid, a claim that never took, or a
-- function renamed out from under this file makes all of them vacuously true.
-- The only way to know the check works is to break the thing on purpose and
-- watch it fail. CLAUDE.md rule 6.
--
-- These four bodies are the PRE-18 Aug 2026 originals, verbatim. They exist on
-- production for the length of this transaction and go with the rollback.

create or replace function private.is_admin(_club uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid() and m.club_id = _club and m.role = 'admin');
$function$;

create or replace function private.is_admin_anywhere()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.role = 'admin'
  );
$function$;

create or replace function private.shares_admin_club(_profile uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1
    from memberships target
    join memberships mine on mine.club_id = target.club_id
    where target.profile_id = _profile
      and mine.profile_id = auth.uid()
      and mine.role = 'admin'
  );
$function$;

create or replace function private.can_admin_see_pending(_profile uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
           select 1 from memberships mine
           where mine.profile_id = auth.uid() and mine.role = 'admin'
         )
     and not exists (
           select 1 from memberships m where m.profile_id = _profile
         );
$function$;

do $$
declare caught text;
begin
  begin
    perform pg_temp.assert_admin_gates('fault injected');
    raise exception
      'SELF-TEST FAILED — the four functions were reverted to their pre-18 Aug bodies, '
      'with no status test at all, and this harness still passed. It is not measuring '
      'what it claims to. Do not trust a green run from this file until that is fixed.';
  exception when others then
    caught := sqlerrm;
    -- ⚠️ THE SELF-TEST'S OWN FAILURE MUST NOT BE SWALLOWED BY ITS OWN HANDLER.
    -- Without this re-raise, "the check did not catch it" would be caught here
    -- and reported as "the check caught it" — the exact inversion this section
    -- exists to prevent.
    if caught like 'SELF-TEST FAILED%' then
      raise exception '%', caught;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', caught;
    insert into _log(phase, line)
      values ('fault injected', 'SELF-TEST PASSED — the check caught it: ' || caught);
  end;
end $$;


-- ── What was measured, for a runner that shows rows rather than notices ───

select phase, line from _log order by seq;


-- ── Undo everything ──────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file really did insert users, a club, a squad, a child
-- and memberships into production, and really did replace four live security
-- functions with their broken originals. The rollback is what makes that
-- acceptable, and scripts/db-check.mjs refuses any file here that could commit
-- instead.

rollback;
