-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — `availability`: the seven-caller matrix the policy merge
--  preserved, asserted against the MERGED policies that ship today.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ REPOINTED 19 Aug 2026. WHAT THIS FILE USED TO BE ══════════════════
--
-- It was written to run against the **PRE-MERGE** schema: it recorded what
-- seven kinds of caller could do, applied the merge, recorded the matrix
-- again, and printed '*** CHANGED ***' on any cell that moved. The merge
-- shipped 9 Aug 2026 (`scale_indexes_and_availability_policy_merge`), after
-- which the file aborted at its own fixture guard — correctly, because the
-- fault it detected could no longer be injected.
--
-- ⚠️ IT THEREFORE FAILED EVERY NIGHTLY RUN from the moment `SUPABASE_DB_URL`
-- was added (19 Aug 2026) — a permanently red check, which gets ignored just
-- as thoroughly as a permanently green one. **CLAUDE.md rule 7: an anchor that
-- can no longer be triggered is REPOINTED, never deleted.** So the comparison
-- is gone and the MATRIX IT PROVED is now asserted directly, against the
-- policies that ship today. Same evidence, now a live regression check.
--
-- ══ WHAT THE MERGE DID, KEPT BECAUSE IT EXPLAINS THE ODD-LOOKING POLICY ══
--
-- Before, `availability` carried FOUR permissive policies over THREE commands:
--
--     avail coach manage   FOR ALL     can_edit_team(<event's team>)
--     avail read           SELECT      can_see_team(...) OR is_own_player
--     avail own insert     INSERT      is_own_player
--     avail own update     UPDATE      is_own_player
--
-- Permissive policies are OR'd and Postgres evaluates EVERY one per candidate
-- row, so SELECT, INSERT and UPDATE each ran two policy expressions — each
-- containing a subquery — where one would do. Free at 6 players; not free at
-- 700, where one row per player per event is ~70,000 rows.
--
-- ══ ⚠️ THE MERGE CAUGHT A REAL DIFFERENCE ON ITS FIRST ATTEMPT ═══════════
--
-- The first version wrote SELECT as `can_see_team OR is_own_player`, dropping
-- the `can_edit_team` arm on the reasoning that for an ACTIVE staff member the
-- second implies the first. True — but **`can_edit_team` does NOT check
-- `status` and `can_see_team` DOES** (it gained `status = 'active'` on 8 Aug).
-- So a PENDING coach came back `1 -> 0` on SELECT and `ALLOWED -> NO ROWS` on
-- UPDATE and DELETE.
--
-- **That is why the shipped SELECT policy has three arms and looks redundant.
-- The redundancy is what made it a refactor instead of a behaviour change** —
-- and row 2 below is the assertion that keeps it that way. If somebody
-- "simplifies" that third arm away, row 2 is what goes red.
--
-- ══ THE MATRIX AS IT STANDS, AND THE THREE ROWS THAT MOVED ═══════════════
--
--     caller             sel   ins       upd       del
--     1_coach_active      1    ALLOWED   ALLOWED   ALLOWED
--     2_coach_pending     0    DENIED    NO ROWS   NO ROWS   <- moved
--     3_parent_active     1    ALLOWED   ALLOWED   NO ROWS
--     4_parent_pending    1    ALLOWED   ALLOWED   NO ROWS   <- moved
--     5_outsider          0    DENIED    NO ROWS   NO ROWS
--     6_admin             1    ALLOWED   ALLOWED   ALLOWED
--     7_anon              0    DENIED    DENIED    DENIED    <- moved
--
-- ⚠️ THREE ROWS DIFFER FROM THE 9 Aug 2026 MEASUREMENT, AND ALL THREE ARE
-- DELIBERATE CHANGES MADE SINCE. Each is owned by another migration and
-- asserted by another harness; this file records them so that the NEXT
-- movement is visibly a new one rather than more of the same.
--
--   2_coach_pending  was  1 / ALLOWED / ALLOWED / ALLOWED.
--     `can_edit_team` did not test status, so a coach who had merely ASKED to
--     join a squad could read and rewrite its availability. Closed 18 Aug 2026
--     when the admin gates were made to require an ACTIVE membership — the
--     same change db/tests/rls-can-edit-team-status.sql exists to hold.
--
--   4_parent_pending was  0 / DENIED / NO ROWS / NO ROWS.
--     The mirror image, and a deliberate WIDENING. A pending parent could
--     write their child's availability through `is_own_player` and then not
--     see it back, because `avail read` was `can_see_team` — the answer
--     vanished and read as "the app lost my answer". `is_own_player` is now an
--     arm of `avail read`. db/tests/rls-pending-membership.sql owns this.
--
--   7_anon           was  0 / DENIED / NO ROWS / NO ROWS.
--     Now DENIED on every verb rather than silently matching nothing, because
--     20260814_revoke_anon_table_privileges took anon's table grants away. The
--     outcome is unchanged and the MECHANISM is stronger: refused by the grant
--     before RLS is consulted at all.
--
-- ⚠️ ROW 3's `del` IS THE ONE PEOPLE ASSUME IS A BUG. A parent may SET their
-- child's availability and may CHANGE it, but may not DELETE the row —
-- `avail write delete` is `can_edit_team` alone. That asymmetry is deliberate:
-- clearing an answer entirely is a coach's action, and "no answer" and "was
-- withdrawn" are different things to the person reading the team sheet.
--
-- ⚠️ DENIED vs NO ROWS IS NOT COSMETIC. An INSERT refused by a policy RAISES;
-- an UPDATE or DELETE that matches no visible row simply reports zero. Both
-- mean "not allowed", they fail differently, and collapsing them would hide a
-- SELECT policy that had quietly widened.

begin;

create temporary table _m(caller text, sel int, ins text, upd text, del text)
  on commit drop;

-- ── Fixture ───────────────────────────────────────────────────────────────
-- One squad, one event on it, one child on it, and seven callers.

create temp table fx on commit drop as
select t.id as team_id, t.club_id as club_id,
       (select e.id from public.events e
         where e.team_id = t.id order by e.starts_at limit 1) as event_id,
       (select p.id from public.players p
         where p.team_id = t.id order by p.full_name limit 1) as player_id
from public.teams t
where t.name = 'U16B';

do $$
declare f record;
begin
  select * into f from fx;
  -- ⚠️ ABORT ON AN INCOMPLETE FIXTURE. Every count below would otherwise read
  -- 0, which looks exactly like a correctly locked-down caller rather than a
  -- dead harness.
  if f.team_id is null or f.event_id is null or f.player_id is null then
    raise exception
      'AVAILABILITY MATRIX: fixture incomplete (squad/event/child) — this '
      'harness would report false refusals.';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
select v.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       v.email, now(), jsonb_build_object('full_name', v.nm), now(), now()
from (values
  ('0a000000-0000-4000-8000-000000000001'::uuid,'m.coach.active@example.invalid','MX Coach Active'),
  ('0a000000-0000-4000-8000-000000000002'::uuid,'m.coach.pending@example.invalid','MX Coach Pending'),
  ('0a000000-0000-4000-8000-000000000003'::uuid,'m.parent.active@example.invalid','MX Parent Active'),
  ('0a000000-0000-4000-8000-000000000004'::uuid,'m.parent.pending@example.invalid','MX Parent Pending'),
  ('0a000000-0000-4000-8000-000000000005'::uuid,'m.outsider@example.invalid','MX Outsider'),
  ('0a000000-0000-4000-8000-000000000006'::uuid,'m.admin@example.invalid','MX Admin')
) as v(id,email,nm);

insert into public.memberships (profile_id, club_id, team_id, role, status)
select '0a000000-0000-4000-8000-000000000001', club_id, team_id, 'coach','active' from fx;
insert into public.memberships (profile_id, club_id, team_id, role, status)
select '0a000000-0000-4000-8000-000000000002', club_id, team_id, 'coach','pending' from fx;
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '0a000000-0000-4000-8000-000000000003', club_id, team_id, 'parent', player_id, 'active' from fx;
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '0a000000-0000-4000-8000-000000000004', club_id, team_id, 'parent', player_id, 'pending' from fx;
-- ⚠️ 5_outsider gets NO membership at all, deliberately: the shape of somebody
-- who has an account and has been approved by nobody.
insert into public.memberships (profile_id, club_id, team_id, role, status)
select '0a000000-0000-4000-8000-000000000006', club_id, null, 'admin','active' from fx;

-- The row the update and delete arms act on. Created as the OWNER so it exists
-- regardless of any policy.
insert into public.availability (event_id, player_id, status)
select event_id, player_id, 'in' from fx
on conflict do nothing;

grant select, insert on _m to authenticated, anon;
grant select on fx to authenticated, anon;

-- ── The probe, once per caller ────────────────────────────────────────────

create function pg_temp.probe(_label text, _who uuid) returns void
language plpgsql as $fn$
declare f record; _sel int; _ins text; _upd text; _del text; n int;
begin
  select * into f from fx;

  if _who is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', _who, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;

  -- ⚠️ WRAPPED, BECAUSE `anon` IS REFUSED BY THE TABLE GRANT AND THAT IS
  -- AN ERROR RATHER THAN AN EMPTY RESULT. 20260814_revoke_anon_table_privileges
  -- took anon's SELECT away, so a bare count here aborts the whole probe with
  -- "permission denied for table availability" — a failure about a grant three
  -- migrations away, reported against this file. Zero rows and refused-by-grant
  -- are both "sees nothing", which is what row 7 asserts.
  begin
    select count(*) into _sel from public.availability
     where event_id = f.event_id and player_id = f.player_id;
  exception when insufficient_privilege then
    _sel := 0;
  end;

  begin
    insert into public.availability (event_id, player_id, status)
    values (f.event_id, f.player_id, 'maybe')
    on conflict (event_id, player_id) do update set status = 'maybe';
    _ins := 'ALLOWED';
  exception when others then
    _ins := 'DENIED';
  end;

  begin
    update public.availability set status = 'out'
     where event_id = f.event_id and player_id = f.player_id;
    get diagnostics n = row_count;
    _upd := case when n > 0 then 'ALLOWED' else 'NO ROWS' end;
  exception when others then
    _upd := 'DENIED';
  end;

  begin
    delete from public.availability
     where event_id = f.event_id and player_id = f.player_id;
    get diagnostics n = row_count;
    _del := case when n > 0 then 'ALLOWED' else 'NO ROWS' end;
  exception when others then
    _del := 'DENIED';
  end;

  insert into _m values (_label, _sel, _ins, _upd, _del);
  perform set_config('role', 'none', true);

  -- ⚠️ PUT THE ROW BACK. Each caller must meet the same fixture, and a
  -- successful DELETE by caller 1 would otherwise make callers 2-7 measure an
  -- empty table and report a lock-down that is really an absence.
  insert into public.availability (event_id, player_id, status)
  select f.event_id, f.player_id, 'in'
  on conflict (event_id, player_id) do update set status = 'in';
end
$fn$;

select pg_temp.probe('1_coach_active',  '0a000000-0000-4000-8000-000000000001');
select pg_temp.probe('2_coach_pending', '0a000000-0000-4000-8000-000000000002');
select pg_temp.probe('3_parent_active', '0a000000-0000-4000-8000-000000000003');
select pg_temp.probe('4_parent_pending','0a000000-0000-4000-8000-000000000004');
select pg_temp.probe('5_outsider',      '0a000000-0000-4000-8000-000000000005');
select pg_temp.probe('6_admin',         '0a000000-0000-4000-8000-000000000006');
select pg_temp.probe('7_anon',          null);

select * from _m order by caller;


-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; this is the
--  thing that fails. `npm run db:check` throws on a SQL error and on nothing
--  else, so a printed matrix nobody compares is not a check.
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare _bad text; _rows int;
begin
  select count(*) into _rows from _m;
  if _rows <> 7 then
    raise exception
      'AVAILABILITY MATRIX: %, expected 7 callers. A short matrix proves '
      'nothing about the ones that are missing.', _rows;
  end if;

  select string_agg(format('%s: sel=%s ins=%s upd=%s del=%s',
                           caller, sel, ins, upd, del), ' | ' order by caller)
    into _bad
  from _m
  where (caller, least(sel,1)::text, ins, upd, del) not in (
    ('1_coach_active',  '1', 'ALLOWED', 'ALLOWED', 'ALLOWED'),
    ('2_coach_pending', '0', 'DENIED',  'NO ROWS', 'NO ROWS'),
    ('3_parent_active', '1', 'ALLOWED', 'ALLOWED', 'NO ROWS'),
    ('4_parent_pending','1', 'ALLOWED', 'ALLOWED', 'NO ROWS'),
    ('5_outsider',      '0', 'DENIED',  'NO ROWS', 'NO ROWS'),
    ('6_admin',         '1', 'ALLOWED', 'ALLOWED', 'ALLOWED'),
    ('7_anon',          '0', 'DENIED',  'DENIED',  'DENIED')
  );

  if _bad is not null then
    raise exception
      'AVAILABILITY MATRIX moved: %. Every cell here is a deliberate decision '
      'with a migration behind it — see the header, which names the three that '
      'have legitimately moved since 9 Aug 2026 and why. A cell that changes '
      'is an authorisation change, whatever the commit message called it. '
      'Row 3 del and row 4 sel are the two most likely to be "fixed" by '
      'somebody who has not read the header.', _bad;
  end if;

  raise notice 'AVAILABILITY MATRIX: all seven callers as expected.';
end $$;


-- ── ⚠️ THE SELF-TEST — widen SELECT and prove the matrix notices ───────────
--
-- The fault is the exact mistake the merge made on its first attempt: drop the
-- `can_edit_team` arm from `avail read`, on the reasoning that an active coach
-- is already admitted by `can_see_team`. A PENDING coach is not, so row 2 must
-- move. If it does not, this file is decoration.

do $$
declare original text; _moved boolean;
begin
  original := 'alter policy "avail read" on public.availability using (' ||
              pg_get_expr(polqual, polrelid) || ')'
    from pg_policy where polrelid = 'public.availability'::regclass
      and polname = 'avail read';

  alter policy "avail read" on public.availability
    using ((private.can_see_team((select e.team_id from events e where e.id = availability.event_id)))
           or private.can_edit_team((select e.team_id from events e where e.id = availability.event_id)));

  delete from _m;
  perform pg_temp.probe('4_parent_pending','0a000000-0000-4000-8000-000000000004');

  -- ⚠️ A PENDING PARENT IS ADMITTED BY `is_own_player` ALONE — neither
  -- can_see_team nor can_edit_team will have them — so removing that arm must
  -- take their sight of the row away. Row 4 is the sharpest probe for it.
  --
  -- ⚠️ THE OBVIOUS FAULT NO LONGER WORKS, AND FINDING THAT OUT IS WORTH MORE
  -- THAN THE TEST WAS. This used to drop the `can_edit_team` arm, which on
  -- 9 Aug cost a PENDING coach their access. Since 18 Aug 2026 can_edit_team
  -- ALSO requires an ACTIVE membership, so every caller it admits is already
  -- admitted by can_see_team: the arm is redundant TODAY and removing it moves
  -- nothing. A self-test built on it passes while proving nothing. Measured,
  -- not reasoned. ⚠️ Do NOT read that as "so delete the arm" — it costs one
  -- boolean and keeps `avail read` from drifting if that status test is ever
  -- taken back out of can_edit_team.
  select (sel <> 1) into _moved from _m where caller = '4_parent_pending';

  execute original;

  if not _moved then
    raise exception
      'SELF-TEST FAILED — the is_own_player arm was removed from `avail read` '
      'and a parent could still see their own child''s answer. The matrix is '
      'not protecting the one arm that is load-bearing.';
  end if;
  raise notice 'SELF-TEST PASSED — dropping the is_own_player arm blinded a parent, as it must.';
end $$;


-- ── Undo everything ───────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file created users, memberships and an availability
-- row on production, and the self-test really did alter a live policy. All of
-- it is transactional and all of it goes back here.

rollback;
