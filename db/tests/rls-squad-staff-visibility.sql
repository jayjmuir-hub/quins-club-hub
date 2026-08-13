-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — public.my_squad_staff() shows a member their OWN squads' staff
--  and nobody else's.
--  Run via `npm run db:check` (claude/runbooks/db-harnesses.md), or paste into
--  the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing runs inside a
--  transaction that ROLLS BACK. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. `my_squad_staff` is SECURITY DEFINER, so it runs as the
-- owner and RLS does not apply to anything inside it. The ONLY thing standing
-- between a parent and every adult's phone number in the club is the
-- `private.can_see_team(m.team_id)` predicate in its body. That is exactly the
-- shape of function this repo insists on testing by execution.
--
-- ⚠️ AS `postgres` THE PREDICATE STILL RUNS, but `auth.uid()` is null and the
-- function returns nothing — so a run that forgets `set local role
-- authenticated` and the jwt claim produces zeroes everywhere and looks like a
-- pass. THE FAULT INJECTION AT THE BOTTOM IS WHAT MAKES THE ZEROES MEAN
-- SOMETHING: the same query must return a row once the person joins the other
-- squad.
--
-- ⚠️ `profiles` HAS NO `club_id` COLUMN. Two older harnesses in this directory
-- insert one and abort with 42703 before asserting anything. Measured 13 Aug
-- 2026 — the columns are id, full_name, created_at, email, first_name,
-- last_name, name_confirmed_at, phone.
--
-- ⚠️ THE TEMP TABLES ARE GRANTED TO `authenticated` ON PURPOSE. Without it the
-- inserts below fail with "permission denied for table _res" the moment the
-- role is switched, which reads as an RLS problem and is not one.

begin;

-- Two squads: the member's own (n = 1) and one they are NOT in (n = 2).
create temporary table _t on commit drop as
select id as team_id, club_id, row_number() over (order by sort_order) as n
from teams order by sort_order limit 2;
create temporary table _res (seq int, stage text, detail text) on commit drop;
grant select, insert on _t, _res to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('cee00000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','harness.coach.a@example.invalid',now(),'{}'::jsonb,now(),now()),
       ('cee00000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','harness.coach.b@example.invalid',now(),'{}'::jsonb,now(),now()),
       ('cee00000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','harness.pendingcoach@example.invalid',now(),'{}'::jsonb,now(),now()),
       ('cee00000-0000-4000-8000-0000000000f0','00000000-0000-0000-0000-000000000000','authenticated','authenticated','harness.parent@example.invalid',now(),'{}'::jsonb,now(),now());

insert into profiles (id, full_name, email, phone) values
 ('cee00000-0000-4000-8000-0000000000a1','Coach Ay','harness.coach.a@example.invalid','+971500000001'),
 ('cee00000-0000-4000-8000-0000000000b1','Coach Bee','harness.coach.b@example.invalid','+971500000002'),
 ('cee00000-0000-4000-8000-0000000000c1','Coach Pending','harness.pendingcoach@example.invalid','+971500000003'),
 ('cee00000-0000-4000-8000-0000000000f0','Harness Parent','harness.parent@example.invalid',null)
on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;

-- An ACTIVE coach on squad A, a PENDING coach on squad A, an ACTIVE coach on
-- squad B, and our parent — PENDING on squad A to begin with.
insert into memberships (profile_id, club_id, team_id, role, status, title)
select 'cee00000-0000-4000-8000-0000000000a1', club_id, team_id, 'coach', 'active', 'Head Coach' from _t where n = 1;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'cee00000-0000-4000-8000-0000000000c1', club_id, team_id, 'coach', 'pending' from _t where n = 1;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'cee00000-0000-4000-8000-0000000000b1', club_id, team_id, 'coach', 'active' from _t where n = 2;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'cee00000-0000-4000-8000-0000000000f0', club_id, team_id, 'parent', 'pending' from _t where n = 1;

-- ── A. A PENDING member gets nothing ──────────────────────────────────────
-- The gate is private.can_see_team, which requires status='active'. This is
-- the deliberate difference from `event read`, which uses the status-blind
-- is_attached_to_team because "fixtures are not sensitive". A volunteer's
-- mobile number is not a fixture.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cee00000-0000-4000-8000-0000000000f0","role":"authenticated"}';
insert into _res select 1, 'A pending member sees (expect 0)', count(*)::text from public.my_squad_staff();

-- ── B. Now ACTIVE on squad A ──────────────────────────────────────────────
reset role;
update memberships set status = 'active'
 where profile_id = 'cee00000-0000-4000-8000-0000000000f0';
set local role authenticated;
set local request.jwt.claims = '{"sub":"cee00000-0000-4000-8000-0000000000f0","role":"authenticated"}';

insert into _res select 2, 'B own squad (expect Coach Ay / Head Coach / phone / email)',
  coalesce(string_agg(full_name||' / '||coalesce(title,'-')||' / '||coalesce(phone,'-')||' / '||coalesce(email,'-'), ', '), 'NONE')
  from public.my_squad_staff();

insert into _res select 3, 'B other squad''s coach leaked? (expect 0)',
  count(*)::text from public.my_squad_staff() where full_name = 'Coach Bee';

-- A pending COACH is a different person from a pending CALLER, and both must
-- be excluded. Publishing an unapproved volunteer's number to thirty families
-- on the strength of their own request is the hole 20260809_squad_staff_approval
-- was written to close.
insert into _res select 4, 'B pending coach listed? (expect 0)',
  count(*)::text from public.my_squad_staff() where full_name = 'Coach Pending';

-- ⚠️ THE CONTROL THAT PROVES THE FUNCTION IS THE ONLY ROUTE. If this ever
-- returns 1, some policy on `profiles` has been widened and the function's
-- fixed column list is no longer the boundary — which is the entire design.
insert into _res select 5, 'B can read that coach''s profiles row directly? (expect 0)',
  count(*)::text from profiles where id = 'cee00000-0000-4000-8000-0000000000a1';

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE FAULT INJECTION. Attach the same person to squad B and the SAME
--  query must return Coach Bee. Without this, every zero above is equally
--  explained by "the function returns nothing to anyone", which is what a
--  forgotten `set local role` produces.
-- ══════════════════════════════════════════════════════════════════════════
reset role;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'cee00000-0000-4000-8000-0000000000f0', club_id, team_id, 'parent', 'active' from _t where n = 2;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cee00000-0000-4000-8000-0000000000f0","role":"authenticated"}';
insert into _res select 6, 'C INJECTED: joined squad B, Coach Bee now visible? (expect 1)',
  count(*)::text from public.my_squad_staff() where full_name = 'Coach Bee';

-- ⚠️ THE RETURN SHAPE IS ITSELF AN ASSERTION. `my_squad_staff` reads
-- `memberships`, which carries `is_super` and `admin_rights`. They are
-- unreachable only because they are not in the RETURNS TABLE — so if this
-- string ever grows a column, that is the review.
reset role;
insert into _res select 7, 'return columns (expect exactly these seven)',
  (select string_agg(a.attname, ',' order by a.attnum)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral unnest(p.proallargtypes, p.proargmodes, p.proargnames)
     with ordinality as a(atttypid, attmode, attname, attnum)
   where n.nspname = 'public' and p.proname = 'my_squad_staff' and a.attmode = 't');

-- ⚠️ `revoke … from public` DOES NOT KEEP anon OUT in a Supabase project —
-- default privileges grant to `anon` BY NAME. See the migration's write-up.
-- Six other public RPCs are still anon-executable; this one must not be.
insert into _res select 8, 'anon can execute? (expect false)',
  (select has_function_privilege('anon', p.oid, 'execute')::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_squad_staff');

select seq, stage, detail from _res order by seq;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 13 Aug 2026
--    1  A pending member sees                        0
--    2  B own squad          Coach Ay / Head Coach / +971500000001 / harness…
--    3  B other squad's coach leaked?                0
--    4  B pending coach listed?                      0
--    5  B direct profiles read                       0
--    6  C INJECTED Coach Bee now visible?            1   <-- MUST be 1
--    7  return columns  team_id,membership_id,full_name,title,role,email,phone
--    8  anon can execute?                            false
--
--  ⚠️ IF LINE 6 IS 0, STOP. Every zero above it is then meaningless — the run
--  was almost certainly executing as `postgres` with a null auth.uid(), where
--  this function returns nothing to anybody.
-- ══════════════════════════════════════════════════════════════════════════
