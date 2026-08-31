-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — the documents repo: tiers, targeting, prefixes and orphans
--  Paste into the Supabase SQL editor, or run `npm run db:check -- documents`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS
--  BACK. Every fixture below — users, profiles, probe children, memberships,
--  documents and storage objects — disappears with it.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers 20260831_documents.sql, 20260831_documents_push_acl.sql,
-- 20260831_documents_policy_split.sql and 20260831_documents_grant_trim.sql.
--
-- ⚠️ THE THREE CLAIMS THAT MATTER, AND WHY EACH IS HERE RATHER THAN ASSUMED:
--
--  1. THE TIER. `staff_only` is the difference between a coaching plan and a
--     parent newsletter. A parent of a targeted squad may read the members
--     tier and must not read the staff tier. Probe 01 is the control that the
--     probe can see anything at all; probe 02 is the claim.
--
--  2. THE ORPHAN. 20260831_documents.sql claimed "an orphan key is signable
--     by NOBODY, which is what makes the app's file-first upload order safe",
--     and that claim was FALSE the day it was applied: the single `for all`
--     "document write" policy's USING arm was also the bucket's SELECT arm, so
--     the PREFIX rule granted SELECT and any T1 coach could sign any object
--     under `T1/`, row or no row. 20260831_documents_policy_split.sql split it
--     into insert/update/delete and left "document read" as the bucket's only
--     SELECT path. Probe 08b is that claim turned into a measurement, and it
--     is the probe that would have caught the original bug.
--
--  3. THE PREFIX INVARIANT ACROSS A RETARGET. create_document refuses a
--     squad-prefixed key whose squad is not targeted; update_document did not,
--     so the same invariant could be broken a second later by retargeting.
--     Probe 11 exercises it with a coach who staffs BOTH squads, so the
--     staffing loop cannot be what refuses — only the prefix guard can be.
--
-- ⚠️⚠️ AND ONE FINDING THIS HARNESS PRODUCED RATHER THAN CONFIRMED, 31 Aug
-- 2026. 20260831_documents_policy_split.sql accepts the file-stranding
-- residual partly on the grounds that "the prefix squad's staff or any admin
-- can still remove it". MEASURED: they cannot — probes 13d and 13e. A DELETE
-- whose WHERE clause reads the table's own columns applies the SELECT
-- policies too, and since the split, "document read" is the bucket's only
-- SELECT path — so an orphan, which by design nobody can SELECT (probe 08d),
-- is by the same fact an orphan nobody holding a user JWT can DELETE. Probe
-- 13f pins the mechanism: the same coach, the same prefix, an object that
-- still HAS a readable row — allowed. Not an escalation; a wider residual
-- than was written down, and only `service_role` can clear it. The probes
-- record the measurement; the migration headers still carry the claim.
--
--  4. THE PUSH AUDIENCE, added 31 Aug 2026 at final review. Section 14 is the
--     one part of this feature RLS cannot speak for: public.
--     document_push_subscriptions is reached by the edge function as
--     `service_role`, which is RLS-exempt, so its audience rules are ordinary
--     SQL in a function body and no policy above constrains what it returns.
--     A tier bug there would put a coaching plan's title on every parent's
--     lock screen while probes 01-05 stayed green, because the ROW would
--     still be correctly hidden. Read that section's own header before
--     changing it — its probes run as `postgres` on purpose, against the rule
--     immediately below.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing. Every probe
-- below is preceded by `reset role;` and a fresh `set local role` + claims —
-- EXCEPT section 14's output probes, where service-role reach is the thing
-- under test and the grant half is pinned separately by 14h and 10c.
--
-- ⚠️ `storage.allow_delete_query` IS SET BELOW ON PURPOSE, AND WITHOUT IT
-- PROBE 13 WOULD TEST THE WRONG GATE. storage.objects carries a statement
-- trigger, `protect_objects_delete`, which raises 42501 on ANY direct delete
-- unless that setting is 'true'. It fires before RLS filters a single row, so
-- a "refused" result would have come from the trigger and told us nothing
-- about the "document delete" policy. This is CLAUDE.md rule 6's corollary:
-- a negative check that fails for the wrong reason proves nothing.
--
-- ⚠️ INVENTED NAMES ONLY (CLAUDE.md rule 9). This repo is public and its
-- members are mostly children. Nothing below identifies a real person; the
-- only real rows touched are `teams` and `clubs`, which are read, not written.
--
-- ⚠️ AND READ THE FAULT-INJECTION SECTION AT THE BOTTOM BEFORE TRUSTING A
-- GREEN RUN. CLAUDE.md rule 6: a check that has never failed is not a check.

begin;

-- The delete gate above. Transaction-local; the rollback would drop it anyway.
set local storage.allow_delete_query = 'true';

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- Team ids are looked UP, not hard-coded: a harness that names a squad id
-- rots the day somebody reorders the age groups. T1 and T2 are simply the
-- first two by sort_order.
create temporary table _fix(k text primary key, v uuid) on commit drop;
grant insert, select on _fix to authenticated;

insert into _fix(k, v)
select 't1', id from teams order by sort_order limit 1;
insert into _fix(k, v)
select 't2', id from teams order by sort_order offset 1 limit 1;
insert into _fix(k, v)
select 'club', club_id from teams order by sort_order limit 1;

do $$
begin
  if (select count(*) from _fix where k in ('t1','t2')) <> 2 then
    raise exception 'FAIL: this harness needs at least two squads to exist; found fewer. Nothing it claims to test about targeting can be measured with one.';
  end if;
end $$;

-- ── Personas ───────────────────────────────────────────────────────────────
--  a1 ADMIN       active `admin` (club-wide, no team)
--  a2 COACH1      active `coach` on T1
--  a3 COACH2      active `coach` on T2
--  a4 COACH_BOTH  active `coach` on T1 AND T2 — probe 11's whole point
--  a5 MEDIC1      active `medic` on T1 (reads staff documents, curates none)
--  a6 PARENT1     active `parent` on T1
--  a7 PARENT2     active `parent` on T2
--  a8 PENDING     `parent` on T1 with status='pending' — approved by nobody

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('d0c00000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-admin@example.invalid',      now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-coach1@example.invalid',     now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-coach2@example.invalid',     now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-coachboth@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-medic1@example.invalid',     now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-parent1@example.invalid',    now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a7','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-parent2@example.invalid',    now(),'{}'::jsonb, now(), now()),
 ('d0c00000-0000-4000-8000-0000000000a8','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-pending@example.invalid',    now(),'{}'::jsonb, now(), now());

insert into profiles (id, full_name, email) values
 ('d0c00000-0000-4000-8000-0000000000a1','ZZ Probe Admin',      'probe-admin@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a2','ZZ Probe CoachOne',   'probe-coach1@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a3','ZZ Probe CoachTwo',   'probe-coach2@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a4','ZZ Probe CoachBoth',  'probe-coachboth@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a5','ZZ Probe Medic',      'probe-medic1@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a6','ZZ Probe ParentOne',  'probe-parent1@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a7','ZZ Probe ParentTwo',  'probe-parent2@example.invalid'),
 ('d0c00000-0000-4000-8000-0000000000a8','ZZ Probe ParentWait', 'probe-pending@example.invalid')
on conflict (id) do nothing;

-- ⚠️ DISPOSABLE PROBE CHILDREN FIRST — the trap rls-social-upload.sql
-- documents. `memberships_family_role_needs_player` (20260817) forbids a
-- 'parent' row with no player_id, so a parent fixture that skips this throws
-- and the harness asserts nothing from the day that constraint shipped.
--
-- ⚠️ THE ROLE MUST STAY 'parent'. What is under test is an ordinary family
-- member's access to the documents repo. Switching to 'coach' to dodge the
-- constraint would satisfy it and quietly test a more privileged person —
-- and would make probe 02, the tier claim, vacuous.
insert into players (id, club_id, team_id, full_name) values
 ('d0c00000-0000-4000-8000-0000000000c1',
  (select v from _fix where k='club'), (select v from _fix where k='t1'), 'ZZ Probe Child One'),
 ('d0c00000-0000-4000-8000-0000000000c2',
  (select v from _fix where k='club'), (select v from _fix where k='t2'), 'ZZ Probe Child Two'),
 ('d0c00000-0000-4000-8000-0000000000c3',
  (select v from _fix where k='club'), (select v from _fix where k='t1'), 'ZZ Probe Child Three');

insert into memberships (profile_id, club_id, team_id, player_id, role, status)
values
 ('d0c00000-0000-4000-8000-0000000000a1',(select v from _fix where k='club'), null,                              null, 'admin',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a2',(select v from _fix where k='club'),(select v from _fix where k='t1'),  null, 'coach',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a3',(select v from _fix where k='club'),(select v from _fix where k='t2'),  null, 'coach',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a4',(select v from _fix where k='club'),(select v from _fix where k='t1'),  null, 'coach',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a4',(select v from _fix where k='club'),(select v from _fix where k='t2'),  null, 'coach',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a5',(select v from _fix where k='club'),(select v from _fix where k='t1'),  null, 'medic',  'active'),
 ('d0c00000-0000-4000-8000-0000000000a6',(select v from _fix where k='club'),(select v from _fix where k='t1'),'d0c00000-0000-4000-8000-0000000000c1','parent','active'),
 ('d0c00000-0000-4000-8000-0000000000a7',(select v from _fix where k='club'),(select v from _fix where k='t2'),'d0c00000-0000-4000-8000-0000000000c2','parent','active'),
 ('d0c00000-0000-4000-8000-0000000000a8',(select v from _fix where k='club'),(select v from _fix where k='t1'),'d0c00000-0000-4000-8000-0000000000c3','parent','pending');

-- ── Fixture documents, created through the RPC ─────────────────────────────
--
-- ⚠️ THE THREE T1 DOCUMENTS ARE CREATED BY THE ADMIN, NOT BY COACH1, AND THAT
-- IS THE DIFFERENCE BETWEEN A TEST AND A TAUTOLOGY. `can_read_document` and
-- `can_manage_document` both begin `d.created_by = auth.uid()`, so a document
-- COACH1 created would satisfy every later COACH1 probe through the creator
-- arm without the squad-staff arm ever being consulted. Made by somebody else,
-- COACH1's authority has to come from staffing T1 — which is the claim.
--
-- The multi-squad document IS created by COACH_BOTH, because probes 11 and 13
-- are about a squad coach's own file and the RPC's staffing loop is exactly
-- what they need exercised.

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a1","role":"authenticated"}';

do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  insert into _fix(k, v) values ('doc_m_t1', public.create_document(
    'ZZ Probe members T1', 'policies', false, false, array[_t1],
    _t1 || '/d0c00000-0000-4000-8000-0000000000f1.pdf',
    'members.pdf', 1024, 'application/pdf'));

  insert into _fix(k, v) values ('doc_s_t1', public.create_document(
    'ZZ Probe staff T1', 'coaching', true, false, array[_t1],
    _t1 || '/d0c00000-0000-4000-8000-0000000000f2.pdf',
    'staff.pdf', 1024, 'application/pdf'));

  insert into _fix(k, v) values ('doc_club', public.create_document(
    'ZZ Probe club wide', 'registration', false, true, null::uuid[],
    'club/d0c00000-0000-4000-8000-0000000000f3.pdf',
    'clubwide.pdf', 1024, 'application/pdf'));
exception when others then
  insert into _r values ('00 fixture: admin create_document', 'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a4","role":"authenticated"}';

do $$
declare _t1 uuid := (select v from _fix where k='t1');
        _t2 uuid := (select v from _fix where k='t2');
begin
  insert into _fix(k, v) values ('doc_both', public.create_document(
    'ZZ Probe multi squad', 'fixtures', false, false, array[_t1, _t2],
    _t1 || '/d0c00000-0000-4000-8000-0000000000f4.pdf',
    'both.pdf', 1024, 'application/pdf'));
exception when others then
  insert into _r values ('00 fixture: coach_both create_document', 'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- The fixtures are themselves an assertion: a coach staffing both squads may
-- publish to both, and an admin may file under club/ and under a squad.
do $$
declare _n int;
begin
  select count(*) into _n from _fix
   where k in ('doc_m_t1','doc_s_t1','doc_club','doc_both');
  if _n = 4 then
    insert into _r values ('00 fixtures created through create_document', '4 documents — ✅ pass');
  else
    insert into _r values ('00 fixtures created through create_document',
      _n || ' of 4 documents — ❌ FAIL');
  end if;
end $$;

-- ══ 01 PARENT1 reads the T1 MEMBERS document — ALLOWED ════════════════════
-- The control. Without it every "0 rows" below is satisfied by a policy that
-- refuses everybody, which is a fix that reads as green and deletes the
-- feature.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a6","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from documents where id = (select v from _fix where k='doc_m_t1');
  insert into _r values ('01 PARENT1 reads T1 members doc',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 02 PARENT1 reads the T1 STAFF-ONLY document — REFUSED ═════════════════
-- THE TIER CLAIM. PARENT1 is an active member of a targeted squad, so every
-- arm of can_read_document passes for them EXCEPT the role filter. That is
-- what makes this discriminating rather than a re-test of targeting.
do $$
declare _n int;
begin
  select count(*) into _n from documents where id = (select v from _fix where k='doc_s_t1');
  insert into _r values ('02 PARENT1 reads T1 staff-only doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- The junction table must not leak the targeting either — a reader who cannot
-- see the document must not be able to enumerate which squads it went to.
do $$
declare _n int;
begin
  select count(*) into _n from document_squads
   where document_id = (select v from _fix where k='doc_s_t1');
  insert into _r values ('02b PARENT1 reads the staff doc''s squad rows',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 03 PARENT2 reads a T1 document — REFUSED ══════════════════════════════
-- THE TARGETING CLAIM, and 03b is its control: PARENT2 is not blind, they
-- simply are not in the audience for T1's documents.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a7","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from documents
   where id in ((select v from _fix where k='doc_m_t1'),
                (select v from _fix where k='doc_s_t1'));
  insert into _r values ('03 PARENT2 reads either T1 doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  select count(*) into _n from documents where id = (select v from _fix where k='doc_club');
  insert into _r values ('03b CONTROL PARENT2 reads the club-wide doc',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 04 PENDING reads ANYTHING — REFUSED ═══════════════════════════════════
-- Approved by nobody. Same squad, same child, same role as PARENT1; the ONLY
-- difference is status='pending', so only the status filter can refuse. The
-- club-wide document is in the set on purpose: club_wide is the arm most
-- likely to be written without a status check.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a8","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from documents
   where id in ((select v from _fix where k='doc_m_t1'),
                (select v from _fix where k='doc_s_t1'),
                (select v from _fix where k='doc_club'),
                (select v from _fix where k='doc_both'));
  insert into _r values ('04 PENDING reads any probe doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 05 MEDIC1 reads the T1 STAFF-ONLY document — ALLOWED ══════════════════
-- The staff READ set includes medic and the MANAGE set does not (the split
-- 20260831_documents.sql makes deliberately). 05b is the other half of that
-- one sentence, and it is the half a "tidy-up" that collapses the two sets
-- into one would break.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a5","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from documents where id = (select v from _fix where k='doc_s_t1');
  insert into _r values ('05 MEDIC1 reads T1 staff-only doc',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  delete from documents where id = (select v from _fix where k='doc_s_t1');
  get diagnostics _n = row_count;
  insert into _r values ('05b MEDIC1 DELETES the T1 staff-only doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 06 COACH1 publishes to a squad they do not staff — REFUSED ════════════
-- errcode 42501, from create_document's staffing loop. Asserted on the CODE,
-- not on "an exception happened": a malformed call would also throw, and would
-- pass a looser check while testing nothing.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _t2 uuid := (select v from _fix where k='t2');
        _ignore uuid;
begin
  _ignore := public.create_document(
    'ZZ Probe trespass', 'other', false, false, array[_t2],
    _t2 || '/d0c00000-0000-4000-8000-0000000000f5.pdf',
    'trespass.pdf', 1024, 'application/pdf');
  insert into _r values ('06 COACH1 publishes to unstaffed T2', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('06 COACH1 publishes to unstaffed T2',
    case when sqlstate = '42501' then 'REFUSED 42501 — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- 06b CONTROL — the same call for T1 must SUCCEED, or 06 is only telling us
-- that create_document refuses coaches.
do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  insert into _fix(k, v) values ('doc_coach1', public.create_document(
    'ZZ Probe coach own squad', 'other', false, false, array[_t1],
    _t1 || '/d0c00000-0000-4000-8000-0000000000f6.pdf',
    'own.pdf', 1024, 'application/pdf'));
  insert into _r values ('06b CONTROL COACH1 publishes to staffed T1', 'ALLOWED — ✅ pass');
exception when others then
  insert into _r values ('06b CONTROL COACH1 publishes to staffed T1',
    'REFUSED ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- 06c COACH1 files under club/ — REFUSED, and by the club/ arm (42501).
do $$
declare _t1 uuid := (select v from _fix where k='t1');
        _ignore uuid;
begin
  _ignore := public.create_document(
    'ZZ Probe club prefix', 'other', false, false, array[_t1],
    'club/d0c00000-0000-4000-8000-0000000000f7.pdf',
    'clubprefix.pdf', 1024, 'application/pdf');
  insert into _r values ('06c COACH1 files a key under club/', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('06c COACH1 files a key under club/',
    case when sqlstate = '42501' then 'REFUSED 42501 — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ══ 07 PARENT1 publishes to their OWN squad — REFUSED ═════════════════════
-- An active member of the targeted squad, with a correctly-prefixed key. Only
-- is_active_staff_of can refuse this.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a6","role":"authenticated"}';

do $$
declare _t1 uuid := (select v from _fix where k='t1');
        _ignore uuid;
begin
  _ignore := public.create_document(
    'ZZ Probe parent publishes', 'other', false, false, array[_t1],
    _t1 || '/d0c00000-0000-4000-8000-0000000000f8.pdf',
    'parent.pdf', 1024, 'application/pdf');
  insert into _r values ('07 PARENT1 publishes to their own squad', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('07 PARENT1 publishes to their own squad',
    case when sqlstate = '42501' then 'REFUSED 42501 — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ══ 08 The storage PREFIX rule, as COACH1 ═════════════════════════════════
-- club/ refused, own squad allowed, another squad refused. The middle one is
-- the assertion a "fix" that over-narrows the policy would break, and without
-- it the two refusals are satisfied by a policy that refuses everyone.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'club/d0c00000-0000-4000-8000-00000000e001.pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
  insert into _r values ('08a COACH1 writes under club/', 'ALLOWED — ❌ FAIL');
exception when others then
  -- ⚠️ A BARE `when others` PASSED ON ANY EXCEPTION AND SO WOULD HAVE PASSED
  -- ON A TYPO IN THE BUCKET NAME OR A CHANGED COLUMN LIST. The refusal has to
  -- be the RLS one, in the words Postgres uses for it.
  insert into _r values ('08a COACH1 writes under club/',
    case when sqlstate = '42501' and sqlerrm like '%row-level security%'
         then 'REFUSED by RLS — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  -- ⚠️ THIS OBJECT IS DELIBERATELY AN ORPHAN — no documents row names it.
  -- Probe 08b depends on that; do not "tidy" it by creating a row for it.
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', _t1 || '/d0c00000-0000-4000-8000-00000000e002.pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
  insert into _r values ('08b COACH1 writes under their own squad prefix', 'ALLOWED — ✅ pass');
exception when others then
  insert into _r values ('08b COACH1 writes under their own squad prefix',
    'REFUSED ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

do $$
declare _t2 uuid := (select v from _fix where k='t2');
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', _t2 || '/d0c00000-0000-4000-8000-00000000e003.pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
  insert into _r values ('08c COACH1 writes under ANOTHER squad prefix', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('08c COACH1 writes under ANOTHER squad prefix',
    case when sqlstate = '42501' and sqlerrm like '%row-level security%'
         then 'REFUSED by RLS — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ══ 08d THE ORPHAN PROPERTY — nobody can SELECT a file with no row ════════
--
-- ⚠️ THIS IS THE PROBE THAT WOULD HAVE CAUGHT THE `for all` BUG, and the
-- persona that matters most is COACH1 — the object's own uploader, sitting
-- under a prefix they hold full write authority over. Under the original
-- single "document write" policy this returned 1 and the migration's
-- orphan claim was false. Under the split policies "document read" is the
-- bucket's only SELECT path, and no row means no read.
--
-- 08e is its control and is not optional: COACH1 must be able to SELECT an
-- object that DOES have a readable row, or 08d is satisfied by a bucket
-- nobody can read at all.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

-- The objects for the T1 documents, so there is something legitimately
-- readable: f1 = doc_m_t1 (08e's control, and 13f's), f4 = doc_both (probe 13).
--
-- ⚠️ BOTH CONTROLS USE f1, WHOSE DOCUMENT THE ADMIN CREATED. An object
-- belonging to a document COACH1 created would be readable through
-- can_read_document's `created_by = auth.uid()` arm, so the control would
-- prove COACH1 can reach their own upload rather than that a T1 coach can
-- reach a T1 document — the same created_by shortcut the fixture section
-- above goes out of its way to avoid.
do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', _t1 || '/d0c00000-0000-4000-8000-0000000000f1.pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', _t1 || '/d0c00000-0000-4000-8000-0000000000f4.pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
exception when others then
  insert into _r values ('08 fixture: objects for the T1 documents',
    'REFUSED ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-00000000e002.pdf';
  insert into _r values ('08d COACH1 SELECTs the orphan they uploaded',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f1.pdf';
  insert into _r values ('08e CONTROL COACH1 SELECTs an object WITH a readable row',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- The admin is the other half of the original bug: `for all`'s USING arm gave
-- an admin SELECT on anything in the bucket.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a1","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-00000000e002.pdf';
  insert into _r values ('08f ADMIN SELECTs the orphan',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a5","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-00000000e002.pdf';
  insert into _r values ('08g MEDIC1 SELECTs the orphan',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 14 THE PUSH AUDIENCE — the one path RLS cannot cover ══════════════════
--
-- ⚠️ EVERY PROBE ABOVE MEASURES WHAT A POLICY REFUSES. This section measures
-- what a FUNCTION RETURNS, and that is a different kind of claim requiring a
-- different kind of probe. public.document_push_subscriptions is SECURITY
-- DEFINER and is reached by the push-send edge function as `service_role`,
-- which is RLS-exempt — so no policy in this file governs its OUTPUT. Its
-- audience rules (the staff tier, the targeting, the uploader exclusion, the
-- 'document' opt-out) are ordinary SQL in the function body, and until now
-- nothing here exercised them. A tier bug in that body would send a coaching
-- plan's lock-screen title to every parent in the squad while probes 01-05
-- stayed green, because the ROW would still be correctly hidden.
--
-- ⚠️ THESE PROBES RUN AS `postgres`, DELIBERATELY, AND THAT IS THE OPPOSITE OF
-- THE RULE AT THE HEAD OF THIS FILE. Everywhere else, a missing `set local
-- role authenticated` is the bug that makes a harness pass while proving
-- nothing. Here, service-role reach IS the thing under test: the function is
-- EXECUTE-closed to anon and authenticated (probe 10c), so a browser cannot
-- call it at all and calling it as a persona would measure the grant, not the
-- audience. Probe 14h is the grant half, and it is the one that stays as
-- `authenticated`.
--
-- ⚠️ NOTE THE SEARCH_PATH INCONSISTENCY, RECORDED SO IT READS AS SEEN RATHER
-- THAN MISSED. document_push_subscriptions pins `set search_path to 'public'`
-- where PR #587's siblings pin `''` and schema-qualify everything. Defensible
-- here: every table it reads (documents, document_squads, memberships,
-- push_subscriptions, notification_opt_outs) lives in public, and on Supabase
-- `authenticated` holds no CREATE on public, so there is no object-shadowing
-- route in. It is an inconsistency, not a hole — do not "fix" it in a sweep
-- without re-running this section.
--
-- ⚠️ THE SUBSCRIPTION ROWS ARE INVENTED AND DISPOSABLE (rule 9). The endpoints
-- are a real-shaped FCM host with a `zz-probe-` path that no device holds, and
-- the keys are nonsense; they exist for a join to find, and the rollback takes
-- them. Nothing here can reach a real handset.

reset role;

do $$
begin
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
   ('d0c00000-0000-4000-8000-0000000000a2',
    'https://fcm.googleapis.com/fcm/send/zz-probe-coach1',  'zzprobep256dhcoach1',  'zzprobeauthcoach1'),
   ('d0c00000-0000-4000-8000-0000000000a5',
    'https://fcm.googleapis.com/fcm/send/zz-probe-medic1',  'zzprobep256dhmedic1',  'zzprobeauthmedic1'),
   ('d0c00000-0000-4000-8000-0000000000a6',
    'https://fcm.googleapis.com/fcm/send/zz-probe-parent1', 'zzprobep256dhparent1', 'zzprobeauthparent1');
  insert into _r values ('14 fixture: disposable push subscriptions', '3 rows — ✅ pass');
exception when others then
  insert into _r values ('14 fixture: disposable push subscriptions',
    'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- ── 14a/14b THE TIER, on the STAFF-ONLY document ──────────────────────────
-- MEDIC1 is in the staff READ set, PARENT1 is not, and both are active members
-- of the SAME targeted squad — so the role filter is the only thing that can
-- separate them. 14a is also the control for every "0 rows" below: it proves
-- the function returns anybody at all.
do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_s_t1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a5';
  insert into _r values ('14a MEDIC1 is in the STAFF-ONLY doc''s push audience',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_s_t1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a6';
  insert into _r values ('14b PARENT1 is NOT in the STAFF-ONLY doc''s push audience',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ── 14c THE TIER'S OTHER HALF, on the MEMBERS document ────────────────────
-- The same PARENT1 who is refused above must be pushed here, or 14b is
-- satisfied by an audience function that returns no parents at all.
do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_m_t1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a6';
  insert into _r values ('14c PARENT1 IS in the MEMBERS doc''s push audience',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ── 14d/14e THE UPLOADER EXCLUSION ────────────────────────────────────────
--
-- ⚠️ doc_coach1 IS USED HERE AND doc_s_t1 IS NOT, AND THE CHOICE IS THE WHOLE
-- PROBE. doc_s_t1 was created by the ADMIN, whose membership row carries
-- team_id null — so the admin is not in the audience CTE for a squad-targeted
-- document in the first place, and asserting their absence would pass without
-- the `p.profile_id <> d.created_by` line existing at all. doc_coach1 was
-- created by COACH1, an ACTIVE COACH OF THE TARGETED SQUAD, who therefore
-- qualifies on every other count. Only the uploader exclusion can drop them.
--
-- 14e is its control: somebody else in the same squad must still be returned
-- for that document, or 14d is satisfied by an empty result.
do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_coach1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a2';
  insert into _r values ('14d the UPLOADER is not pushed their own document',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_coach1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a6';
  insert into _r values ('14e CONTROL PARENT1 IS pushed the same coach-uploaded doc',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ── 14f/14g THE 'document' OPT-OUT, both directions ───────────────────────
--
-- ⚠️ ASSERTED AS A PAIR, INSERT THEN DELETE, AGAINST THE SAME PERSONA AND THE
-- SAME DOCUMENT AS 14a. One direction alone cannot tell "the opt-out works"
-- from "this persona dropped out for some other reason": 14a said MEDIC1 was
-- in this audience a moment ago, 14f says they are not while a row exists, and
-- 14g says they are back once it is gone. The only variable is the row.
--
-- ⚠️ IF 14f THROWS on notification_opt_outs_category_check, that is a REAL
-- FINDING, not a harness bug: it means 'document' never reached the live
-- constraint and the Task 8 opt-out toggle writes a value the database
-- refuses. Read the error rather than adjusting the probe.
do $$
declare _n int;
begin
  insert into notification_opt_outs (profile_id, category)
  values ('d0c00000-0000-4000-8000-0000000000a5', 'document');

  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_s_t1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a5';
  insert into _r values ('14f MEDIC1 opts out of ''document'' and leaves the audience',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
exception when others then
  insert into _r values ('14f MEDIC1 opts out of ''document'' and leaves the audience',
    'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

do $$
declare _n int;
begin
  delete from notification_opt_outs
   where profile_id = 'd0c00000-0000-4000-8000-0000000000a5' and category = 'document';

  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_s_t1')) a
    join push_subscriptions s on s.id = a.id
   where s.profile_id = 'd0c00000-0000-4000-8000-0000000000a5';
  insert into _r values ('14g MEDIC1 removes the opt-out and returns to the audience',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ── 14h THE GRANT GATE — the actual first line of defence ─────────────────
--
-- ⚠️ THE BEHAVIOURAL TWIN OF PROBE 10c, AND NOT A DUPLICATE OF IT. 10c counts
-- ACL rows and would go red if somebody granted EXECUTE; this one tries the
-- call and is red if the grant ever actually works. The pair matters because
-- every probe above runs as `postgres`, and an output-only section would keep
-- passing unchanged if the function were opened up to `authenticated`
-- tomorrow — the audience would be just as correct, and reachable from a
-- browser, and this file would say nothing about it. The function returns push
-- ENDPOINTS AND KEYS; reachability is the claim worth pinning behaviourally.
--
-- 14a is its control: the same call, as the service-reached role, succeeds —
-- so this refusal is the grant and not a broken function.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _n int;
begin
  select count(*) into _n
    from public.document_push_subscriptions((select v from _fix where k='doc_m_t1'));
  insert into _r values ('14h COACH1 (a browser JWT) calls document_push_subscriptions',
    'ALLOWED, ' || _n || ' rows — ❌ FAIL');
exception when others then
  insert into _r values ('14h COACH1 (a browser JWT) calls document_push_subscriptions',
    case when sqlstate = '42501' and sqlerrm like '%permission denied%'
         then 'REFUSED 42501 by the GRANT — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ── 14i THE club_wide DB HALF, which no UI can reach ──────────────────────
--
-- ⚠️ THE UI NEVER OFFERS THIS, WHICH IS EXACTLY WHY IT IS PROBED HERE.
-- DocumentUploadSheet renders the whole-club switch only for admins, so the
-- create_document club-wide branch is unexercised by every UI test on the
-- branch — the "club_wide short-circuit unexercised" note carried forward from
-- Task 8's review. A screen that does not draw a control is not a boundary;
-- this is the boundary.
--
-- ⚠️ THE ASSERTION IS ON errcode 42501 AND ON 'admin' IN THE MESSAGE, because
-- create_document has FOUR ways to refuse and only one of them is this claim.
-- The club_wide branch is taken first and returns before the staffing loop and
-- the prefix guard are reached at all, so a refusal from either of those would
-- mean the branch was NOT taken — a different bug wearing the same 42501.
-- Remove the club_wide admin check and this probe goes red either way: the
-- call then either succeeds, or is refused by a LATER gate whose code and
-- wording are not these. A bare `when others` would have passed on all three.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _ignore uuid;
begin
  _ignore := public.create_document(
    'ZZ Probe coach goes club-wide', 'other', false, true, null::uuid[],
    'club/d0c00000-0000-4000-8000-00000000e00c.pdf',
    'clubwide-trespass.pdf', 1024, 'application/pdf');
  insert into _r values ('14i COACH1 publishes a CLUB-WIDE document', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('14i COACH1 publishes a CLUB-WIDE document',
    case when sqlstate = '42501' and sqlerrm like '%admin%'
         then 'REFUSED 42501 (admin-only) — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ══ 11 update_document keeps the key-prefix invariant ═════════════════════
--
-- ⚠️ COACH_BOTH IS THE WHOLE POINT OF THIS PROBE. doc_both is filed under
-- T1/ and targeted [T1,T2]. Retargeting it to [T2] only must be refused — and
-- because COACH_BOTH staffs T2, the staffing loop passes, so the ONLY thing
-- that can refuse is the prefix guard. A refusal from the staffing check would
-- be the wrong gate and would leave the invariant untested, which is why the
-- outcome is asserted on errcode 22023 AND on the message.
--
-- 11b is the control: dropping T2 and keeping T1 must SUCCEED. 11c puts the
-- fixture back for probe 13.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a4","role":"authenticated"}';

do $$
declare _t2 uuid := (select v from _fix where k='t2');
begin
  perform public.update_document((select v from _fix where k='doc_both'),
    'ZZ Probe multi squad', 'fixtures', false, false, array[_t2]);
  insert into _r values ('11 COACH_BOTH retargets a T1-filed doc to T2 only', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('11 COACH_BOTH retargets a T1-filed doc to T2 only',
    case when sqlstate = '22023' and sqlerrm like '%squad the file is stored under%'
           then 'REFUSED 22023 (prefix guard) — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  perform public.update_document((select v from _fix where k='doc_both'),
    'ZZ Probe multi squad', 'fixtures', false, false, array[_t1]);
  insert into _r values ('11b CONTROL COACH_BOTH retargets to T1 only (prefix kept)', 'ALLOWED — ✅ pass');
exception when others then
  insert into _r values ('11b CONTROL COACH_BOTH retargets to T1 only (prefix kept)',
    'REFUSED ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

do $$
declare _t1 uuid := (select v from _fix where k='t1');
        _t2 uuid := (select v from _fix where k='t2');
begin
  perform public.update_document((select v from _fix where k='doc_both'),
    'ZZ Probe multi squad', 'fixtures', false, false, array[_t1, _t2]);
  insert into _r values ('11c fixture restored to [T1,T2] for probe 13', 'ALLOWED — ✅ pass');
exception when others then
  insert into _r values ('11c fixture restored to [T1,T2] for probe 13',
    'REFUSED ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- ══ 12 The GRANT ceiling — a direct INSERT never reaches RLS ══════════════
--
-- 20260831_documents_grant_trim.sql revoked INSERT and UPDATE on both tables
-- from `authenticated`. That is a belt to RLS's braces: there is no INSERT
-- policy either, so the write was already refused. This probe records WHICH
-- of the two refuses, because they are not the same failure and a future
-- policy mistake would be caught only by the grant.
--
-- ⚠️ THE SQLSTATE ALONE CANNOT TELL THE TWO APART, AND ASSERTING ON IT WAS A
-- BUG IN THIS FILE UNTIL 31 Aug 2026 (found in review, fixed the same day).
-- BOTH refusals raise 42501:
--
--     the GRANT  ->  42501  permission denied for table documents
--     RLS        ->  42501  new row violates row-level security policy for
--                           table "documents"
--
-- so `exception when insufficient_privilege` passed for either, and reverting
-- 20260831_documents_grant_trim.sql — the exact regression these probes exist
-- to catch — would have left 12 and 12b GREEN. The outcome is therefore
-- asserted on the MESSAGE, the same way probe 11 is: `permission denied` must
-- be present and `row-level security` must be absent. Proved by simulating the
-- revert (see the appendix at the foot of this file).
--
-- ⚠️ 12c IS THE ODD ONE OUT ON PURPOSE. An UPDATE that RLS refuses does not
-- raise at all — with no UPDATE policy the USING arm matches no rows and the
-- statement quietly reports 0. So if the grant came back, 12c reaches the
-- no-exception arm rather than a wrong-message arm, and that arm is a FAIL.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _t1 uuid := (select v from _fix where k='t1');
begin
  insert into public.documents (club_id, title, category, staff_only, club_wide,
                                storage_key, file_name, file_size, content_type,
                                created_by)
  values ((select v from _fix where k='club'), 'ZZ Probe direct insert', 'other',
          false, false, _t1 || '/d0c00000-0000-4000-8000-00000000e009.pdf',
          'direct.pdf', 1024, 'application/pdf',
          'd0c00000-0000-4000-8000-0000000000a2');
  insert into _r values ('12 COACH1 INSERTs into documents directly',
    'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('12 COACH1 INSERTs into documents directly',
    case when sqlstate = '42501'
          and sqlerrm like '%permission denied%'
          and sqlerrm not like '%row-level security%'
         then 'REFUSED 42501 by the GRANT (' || sqlerrm || ') — ✅ pass'
         when sqlerrm like '%row-level security%'
         then 'REFUSED by RLS, not the GRANT — the INSERT grant is back (' || sqlerrm || ') — ❌ FAIL'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

do $$
begin
  insert into public.document_squads (document_id, team_id)
  values ((select v from _fix where k='doc_m_t1'), (select v from _fix where k='t2'));
  insert into _r values ('12b COACH1 INSERTs into document_squads directly',
    'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('12b COACH1 INSERTs into document_squads directly',
    case when sqlstate = '42501'
          and sqlerrm like '%permission denied%'
          and sqlerrm not like '%row-level security%'
         then 'REFUSED 42501 by the GRANT — ✅ pass'
         when sqlerrm like '%row-level security%'
         then 'REFUSED by RLS, not the GRANT — the INSERT grant is back (' || sqlerrm || ') — ❌ FAIL'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

do $$
begin
  update public.documents set title = 'ZZ Probe direct update'
   where id = (select v from _fix where k='doc_m_t1');
  insert into _r values ('12c COACH1 UPDATEs documents directly',
    'NO ERROR — the UPDATE grant is back and RLS silently matched 0 rows — ❌ FAIL');
exception when others then
  insert into _r values ('12c COACH1 UPDATEs documents directly',
    case when sqlstate = '42501'
          and sqlerrm like '%permission denied%'
          and sqlerrm not like '%row-level security%'
         then 'REFUSED 42501 by the GRANT — ✅ pass'
         else 'REFUSED ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL' end);
end $$;

-- ══ 13 THE ACCEPTED STRANDING RESIDUAL, MEASURED ═════════════════════════
--
-- ⚠️ THIS PROBE BLESSES BEHAVIOUR THAT LOOKS LIKE A BUG. Jay ruled on 31 Aug
-- 2026 to KEEP the spec's rule: on a document targeted at several squads, ANY
-- targeted squad's staff may delete the ROW. doc_both is targeted [T1,T2] and
-- FILED under T1/. COACH2 staffs T2 only.
--
--   13a COACH2 deletes the row      → ALLOWED (the ruling)
--   13b the file is still there     → the row and the file came apart
--   13c COACH2 removes the file     → REFUSED (they do not hold T1's prefix)
--   13d COACH1 removes the file     → REFUSED ⚠️ SEE BELOW
--   13e ADMIN  removes the file     → REFUSED ⚠️ SEE BELOW
--   13f CONTROL COACH1 removes a file that STILL HAS a readable row → ALLOWED
--
-- ⚠️⚠️ 13d AND 13e CONTRADICT 20260831_documents_policy_split.sql's HEADER,
-- AND THE HARNESS RECORDS THE MEASUREMENT RATHER THAN THE CLAIM. That header
-- accepts the stranding residual partly because "the prefix squad's staff or
-- any admin can still remove it". Measured on production, 31 Aug 2026: they
-- cannot. Nobody holding only a user JWT can.
--
-- THE MECHANISM, and it is a Postgres rule rather than a mistake in any
-- predicate here: a DELETE whose WHERE clause reads the table's own columns
-- applies the SELECT policies as well as the DELETE policy. The prefix-based
-- "document delete" policy does permit COACH1 — but "document read" is the
-- bucket's ONLY SELECT path since the policy split, and an orphan has no row,
-- so the DELETE matches nothing to delete. The very property probe 08d exists
-- to prove — an orphan is invisible to everyone — is what makes the orphan
-- unclearable. Invisibility and unreachability are the same fact seen twice.
--
-- 13f is what turns that from a guess into a diagnosis: the SAME persona, the
-- SAME prefix, the SAME policy — the only difference is whether a readable
-- documents row still names the object — and it comes back ALLOWED. So 13d is
-- not "coaches cannot delete files"; it is precisely the orphan case.
--
-- WHAT THIS MEANS FOR THE RESIDUAL: an orphan is still invisible and still
-- costs only storage, so it is not an escalation. But it can only be cleared
-- by `service_role` (the storage service's own admin path, or a sweeper in
-- the photo-orphans style), never by the club. That is a wider residual than
-- was written down, and it strengthens rather than weakens the case for the
-- sweeper the header already names as the fix.
--
-- If 13c ever flips to ALLOWED the prefix rule has been widened. If 13d or
-- 13e flips to ALLOWED, somebody has given the bucket a second SELECT path —
-- check probe 10b, which is the same fact from the other side.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a3","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from documents where id = (select v from _fix where k='doc_both');
  get diagnostics _n = row_count;
  insert into _r values ('13a COACH2 (T2 staff) deletes a [T1,T2] doc filed under T1',
    case when _n = 1 then '1 row — ✅ pass (Jay''s ruling, 31 Aug 2026)'
         else _n || ' rows — ❌ FAIL' end);
end $$;

reset role;
do $$
declare _n int;
begin
  select count(*) into _n from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f4.pdf';
  insert into _r values ('13b the FILE survives the row delete (stranded)',
    case when _n = 1 then '1 object — ✅ pass (the accepted residual)'
         else _n || ' objects — ❌ FAIL' end);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a3","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f4.pdf';
  get diagnostics _n = row_count;
  insert into _r values ('13c COACH2 removes the stranded file from T1''s prefix',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
exception when others then
  insert into _r values ('13c COACH2 removes the stranded file from T1''s prefix',
    'THREW ' || sqlstate || ' (wrong gate: ' || sqlerrm || ') — ❌ FAIL');
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f4.pdf';
  get diagnostics _n = row_count;
  insert into _r values ('13d COACH1 (T1 staff, holds the prefix) removes the stranded file',
    case when _n = 0 then '0 rows — ✅ pass (⚠️ NOT what the migration header claims)'
         else _n || ' rows — ❌ FAIL' end);
exception when others then
  insert into _r values ('13d COACH1 (T1 staff, holds the prefix) removes the stranded file',
    'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a1","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f4.pdf';
  get diagnostics _n = row_count;
  insert into _r values ('13e ADMIN removes the stranded file',
    case when _n = 0 then '0 rows — ✅ pass (⚠️ NOT what the migration header claims)'
         else _n || ' rows — ❌ FAIL' end);
exception when others then
  insert into _r values ('13e ADMIN removes the stranded file',
    'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- ⚠️ 13f IS THE DIAGNOSIS, NOT A FORMALITY. Same persona and same prefix as
-- 13d; the ONLY difference is that a readable documents row still names this
-- object. Without it, 13d and 13e are satisfied by a bucket in which nobody
-- can delete anything, and the finding above would be mis-stated.
--
-- ⚠️ IT DELETES f1 — doc_m_t1's file, and doc_m_t1 was created by the ADMIN.
-- COACH1's read of it therefore comes from the T1 staff arm, not from
-- `created_by = auth.uid()`. Pointing this control at a document COACH1
-- created would have made it pass through the creator shortcut and proved
-- something weaker than it claims.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from storage.objects
   where bucket_id = 'documents'
     and name = (select v from _fix where k='t1') || '/d0c00000-0000-4000-8000-0000000000f1.pdf';
  get diagnostics _n = row_count;
  insert into _r values ('13f CONTROL COACH1 removes a file that STILL HAS a readable row',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
exception when others then
  insert into _r values ('13f CONTROL COACH1 removes a file that STILL HAS a readable row',
    'THREW ' || sqlstate || ' ' || sqlerrm || ' — ❌ FAIL');
end $$;

-- ══ 09 DELETING A ROW: targeting decides, and staff may ═══════════════════
-- Run late because probe 08e's control needs doc_m_t1 alive.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a7","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from documents where id = (select v from _fix where k='doc_m_t1');
  get diagnostics _n = row_count;
  insert into _r values ('09a PARENT2 deletes the T1 members doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- PARENT1 can READ it (probe 01) and must still not be able to DELETE it —
-- reading and managing are different sets and this is the pair that proves it.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a6","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from documents where id = (select v from _fix where k='doc_m_t1');
  get diagnostics _n = row_count;
  insert into _r values ('09b PARENT1 (who can READ it) deletes the T1 members doc',
    case when _n = 0 then '0 rows — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0c00000-0000-4000-8000-0000000000a2","role":"authenticated"}';

do $$
declare _n int;
begin
  delete from documents where id = (select v from _fix where k='doc_m_t1');
  get diagnostics _n = row_count;
  insert into _r values ('09c COACH1 deletes the T1 members doc',
    case when _n = 1 then '1 row — ✅ pass' else _n || ' rows — ❌ FAIL' end);
end $$;

-- ══ 10 CONTROL — the wrong-bucket canary ══════════════════════════════════
--
-- ⚠️ NOT PADDING, and the same canary rls-social-upload.sql carries. The
-- obvious wrong fix for anything above is to reach into every storage policy
-- "for consistency". player-photos has its own reasoning and its own harness;
-- if this line goes red, a documents fix landed in the wrong bucket.
reset role;
do $$
begin
  perform 1 from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polname = 'staff photo write';
  if found then
    insert into _r values ('10 CONTROL staff photo write still present', 'YES — ✅ pass');
  else
    insert into _r values ('10 CONTROL staff photo write still present', 'MISSING — ❌ FAIL');
  end if;
end $$;

-- 10b The shape 20260831_documents_policy_split.sql exists to guarantee:
-- exactly ONE permissive SELECT policy on storage.objects mentions this
-- bucket. Two would mean `for all` (or an equivalent) is back and 08d's
-- claim is only as true as this run.
--
-- ⚠️ `polpermissive` IS IN THE FILTER DELIBERATELY. The count is about how
-- many policies can GRANT a read, and permissive policies OR together — that
-- is the shape that let `for all` leak a second SELECT path. A RESTRICTIVE
-- policy ANDs, so it can only ever narrow the bucket; counting one would turn
-- this control red for a TIGHTENING, which is the wrong way for a canary to
-- fail. The comment above said "permissive" before the query did.
do $$
declare _n int;
begin
  select count(*) into _n
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects'
     and p.polcmd in ('r','*')
     and p.polpermissive
     and pg_get_expr(p.polqual, p.polrelid) like '%''documents''%';
  if _n = 1 then
    insert into _r values ('10b exactly one SELECT policy governs the documents bucket',
      '1 — ✅ pass');
  else
    insert into _r values ('10b exactly one SELECT policy governs the documents bucket',
      _n || ' — ❌ FAIL');
  end if;
end $$;

-- 10c The push-audience function must stay unreachable from a browser
-- (20260831_documents_push_acl.sql — it returns push endpoints and keys).
--
-- ⚠️ 10d IS NOT A DUPLICATE OF 10c, AND WITHOUT IT 10c IS VACUOUS. "count the
-- rows that hold a grant" returns 0 when the function has been DROPPED, so a
-- deleted function reads as a secured one. The existence assertion is the
-- control that makes the absence assertion mean something — the same reason
-- every "this is refused" probe in this file is paired with a "this is
-- allowed" one.
do $$
declare _n int;
begin
  select count(*) into _n from pg_proc
   where proname = 'document_push_subscriptions'
     and (has_function_privilege('authenticated', oid, 'execute')
          or has_function_privilege('anon', oid, 'execute'));
  insert into _r values ('10c document_push_subscriptions is service_role-only',
    case when _n = 0 then 'no anon/authenticated EXECUTE — ✅ pass'
         else _n || ' grant(s) — ❌ FAIL' end);
end $$;

do $$
declare _n int;
begin
  select count(*) into _n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'document_push_subscriptions';
  insert into _r values ('10d CONTROL document_push_subscriptions still EXISTS',
    case when _n = 1 then '1 function — ✅ pass'
         else _n || ' functions — ❌ FAIL' end);
end $$;

reset role;
select * from _r order by step;


-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails. `npm run db:check` throws on a SQL ERROR and on nothing
--  else — a harness that only prints a PASS/FAIL column reports `ok` whatever
--  that column says.
--
--  The empty-table arm matters as much as the FAIL arm: a harness that
--  recorded no steps has proved nothing and would otherwise pass silently.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _bad text;
  _n int;
begin
  select count(*) into _n from _r;
  if _n = 0 then
    raise exception 'FAIL: this harness recorded NO steps — nothing it claims to test was actually exercised.';
  end if;

  select string_agg(step || ' -> ' || outcome, ' | ') into _bad
    from _r where outcome like '%FAIL%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  raise notice 'SELF-TEST PASSED — % step(s), none reported FAIL.', _n;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ PROVE THE HARNESS CAN FAIL — done once, on 31 Aug 2026, recorded here
-- ══════════════════════════════════════════════════════════════════════════
--
-- CLAUDE.md rule 6, and its corollary from the overflow gate: an injection
-- that fails to go red is data about the CHECK, not a clean bill of health.
--
-- INJECTION. Inside a transaction you will roll back, replace
-- private.can_read_document with a body whose `staff_only` arm is GONE — any
-- active member of a targeted (or, club-wide, of any) squad may read — then
-- re-run probes 01, 02 and 05:
--
--     begin;
--     create or replace function private.can_read_document(_doc uuid)
--     returns boolean language sql stable security definer
--     set search_path to 'public' as $f$
--       select exists (
--         select 1 from documents d
--         where d.id = _doc
--           and (private.is_admin_anywhere()
--                or d.created_by = auth.uid()
--                or (d.club_wide and exists (
--                      select 1 from memberships m
--                      where m.profile_id = auth.uid() and m.status = 'active'))
--                or (not d.club_wide and exists (
--                      select 1 from document_squads ds
--                      join memberships m on m.team_id = ds.team_id
--                       and m.profile_id = auth.uid() and m.status = 'active'
--                      where ds.document_id = _doc))));
--     $f$;
--     -- ... the fixtures and probes 01, 02, 05 here ...
--     rollback;
--
-- EXPECTED: probe 02 flips to "❌ FAIL" and 01 and 05 stay green.
--
-- ⚠️ MEASURED 31 Aug 2026, on a scratch copy of this file with the block
-- above spliced in after `begin;`, run through `npm run db:check`. The whole
-- run went RED and the runner named the flipped steps:
--
--     FAIL: 02 PARENT1 reads T1 staff-only doc -> 1 rows — ❌ FAIL
--         | 02b PARENT1 reads the staff doc's squad rows -> 1 rows — ❌ FAIL
--
--     01 PARENT1 reads T1 members doc     — ✅ pass, unchanged
--     05 MEDIC1 reads T1 staff-only doc   — ✅ pass, unchanged
--     every other step                    — ✅ pass, unchanged
--
-- ⚠️ RE-RUN UNCHANGED after the review fixes of 31 Aug 2026, because probe
-- 13f now deletes an object whose readability runs through this very function
-- (a DELETE ... WHERE applies the SELECT policies — the finding at the head of
-- this file). It stayed green, as expected: doc_m_t1 is members-tier and
-- COACH1 staffs T1, so the removed arm was never what admitted them.
--
-- ⚠️ 02b FLIPPING TOO IS THE CORRECT RESULT, NOT NOISE, and it is worth
-- knowing before somebody reads this as an over-broad injection: "document
-- squads read" is defined as can_read_document(document_id), so the junction
-- table is the SAME claim seen through a second policy. A weakening that
-- moved 02 without moving 02b would mean the two had drifted apart.
--
-- The self-test block raised, so `npm run db:check` went red rather than
-- printing a FAIL nobody reads. The tier claim is therefore a measurement and
-- not a restatement of the migration.
--
-- ⚠️ AND THE ROLLBACK WAS VERIFIED AFTERWARDS, not assumed:
-- pg_get_functiondef('private.can_read_document(uuid)'::regprocedure) still
-- contains `staff_only` and `medic` on production, checked against a negative
-- control token that must NOT be found (rule 6 — a search that cannot come
-- back empty proves nothing). The scratch copy was deleted, and `git status`
-- confirmed clean before this was written.
--
-- ⚠️ IF PROBE 02 STAYS GREEN, THE HARNESS IS NOT TESTING THE TIER — most
-- likely `set local role authenticated` was lost by a `reset role` earlier in
-- your paste, so everything ran as `postgres` with RLS bypassed, or PARENT1's
-- membership insert threw on `memberships_family_role_needs_player` and the
-- persona has no membership at all. Fix the harness before believing the
-- policy.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ SECOND INJECTION — THE GRANT, WHICH THE FIRST VERSION OF PROBE 12
--  COULD NOT SEE. Added 31 Aug 2026 after review.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Probes 12/12b originally caught the refusal with `exception when
-- insufficient_privilege`. Both the GRANT and RLS raise 42501, so that arm
-- passed for either — and the regression the probes exist to catch (somebody
-- reverting 20260831_documents_grant_trim.sql) would have left them GREEN.
-- A check that cannot distinguish its two outcomes is not checking the one it
-- names.
--
-- INJECTION. Inside a transaction you will roll back, put the grants back and
-- re-run the bodies of 12, 12b and 12c:
--
--     begin;
--     grant insert, update on public.documents to authenticated;
--     grant insert, update on public.document_squads to authenticated;
--     -- ... probe 12, 12b, 12c bodies here, as COACH1 ...
--     rollback;
--
-- ⚠️ MEASURED, and all three went red:
--
--   12   REFUSED by RLS, not the GRANT — the INSERT grant is back
--        (new row violates row-level security policy for table "documents")
--   12b  REFUSED by RLS, not the GRANT — the INSERT grant is back
--   12c  NO ERROR — the UPDATE grant is back and RLS silently matched 0 rows
--
-- ⚠️ NOTE 12c's DIFFERENT SHAPE, because it is the thing most likely to
-- confuse the next reader: an UPDATE that RLS refuses raises NOTHING. With no
-- UPDATE policy the USING arm matches no rows and the statement reports 0. So
-- 12c fails through its no-exception arm, not through a wrong-message arm.
--
-- The grants were confirmed absent on production afterwards
-- (has_table_privilege('authenticated', …, 'insert'/'update') = false on both
-- tables, with 'select' = true as the control proving the probe can see a
-- privilege that IS held).
--
-- ⚠️ IF PROBE 01 OR 05 ALSO FLIPS, something other than the staff_only arm is
-- doing the work and the finding is mis-diagnosed. Stop and re-read the live
-- function with:
--
--     select pg_get_functiondef('private.can_read_document(uuid)'::regprocedure);
--
-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THIRD, FOURTH AND FIFTH INJECTIONS — SECTION 14, THE PUSH AUDIENCE.
--  Added 31 Aug 2026 at final review, with the section itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Section 14 asserts on what a function RETURNS rather than on what a policy
-- refuses, so "it went green" is even weaker evidence than usual here: an
-- audience function that returned NOTHING would satisfy every 0-rows probe in
-- it. Each claim was therefore broken on purpose, on a scratch copy of this
-- file with the fragment spliced in immediately after `begin;` and run through
-- `npm run db:check`. All three went red, and — the part that matters — each
-- flipped ONLY the steps that name its claim.
--
-- INJECTION 3 — THE TIER. document_push_subscriptions replaced with a body
-- whose `where (not d.staff_only or m.role in (...))` line is GONE:
--
--     FAIL: 14b PARENT1 is NOT in the STAFF-ONLY doc's push audience
--           -> 1 rows — ❌ FAIL
--
--     14a MEDIC1 in the staff-only audience      — ✅ pass, unchanged
--     14c PARENT1 in the members audience        — ✅ pass, unchanged
--     14d/14e/14f/14g/14h/14i                    — ✅ pass, unchanged
--
-- ⚠️ THAT 14a AND 14c DID NOT MOVE IS THE POINT OF THE INJECTION, not a
-- footnote. A weakening that took 14b down WITH them would have meant the
-- three probes were measuring one thing between them.
--
-- INJECTION 4 — THE GRANT. `grant execute on function
-- public.document_push_subscriptions(uuid) to authenticated;` (transactional,
-- so the rollback takes it):
--
--     FAIL: 14h COACH1 (a browser JWT) calls document_push_subscriptions
--           -> ALLOWED, 4 rows — ❌ FAIL
--         | 10c document_push_subscriptions is service_role-only
--           -> 1 grant(s) — ❌ FAIL
--
-- ⚠️ BOTH HALVES OF THE PAIR FIRING IS THE CORRECT RESULT. 10c counts ACL rows
-- and 14h makes the call; they are the same claim seen through a static and a
-- behavioural probe, and a leak that moved one without the other would mean
-- they had drifted apart. Note "4 rows" rather than a bare refusal — the
-- injected grant really did hand a squad coach four people's push endpoints
-- and keys, which is what the pair exists to make impossible to miss.
--
-- INJECTION 5 — THE UPLOADER EXCLUSION AND THE OPT-OUT, removed together
-- (the `where p.profile_id <> d.created_by and not exists (... opt_outs ...)`
-- tail deleted, everything else intact):
--
--     FAIL: 14d the UPLOADER is not pushed their own document
--           -> 1 rows — ❌ FAIL
--         | 14f MEDIC1 opts out of 'document' and leaves the audience
--           -> 1 rows — ❌ FAIL
--
--     14e and 14g, the two controls, — ✅ pass, unchanged
--
-- ⚠️ AND THE ROLLBACKS WERE VERIFIED AFTERWARDS, not assumed. On production:
-- pg_get_functiondef('public.document_push_subscriptions(uuid)'::regprocedure)
-- still contains `staff_only`, `created_by` AND `opt_outs`, checked alongside
-- a negative control token that must NOT be found and was not (rule 6 — a
-- search that cannot come back empty proves nothing);
-- has_function_privilege(...,'execute') is false for both `authenticated` and
-- `anon` with `service_role` true as the positive control; and zero probe
-- rows survived in push_subscriptions, documents or profiles. The scratch
-- copy and the three fragments were deleted and `git status` confirmed clean
-- before this was written.
