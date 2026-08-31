-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — staff head shots: who may upload one, and who may look at one.
--  Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction, rolled
--  back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. Two independent boundaries that have to agree:
--
--   WRITE — `staff photo write` is own-prefix-only, narrower than the player
--     equivalent (where a coach may upload for a child). ⚠️ It is FOR ALL with
--     BOTH `using` and `with check`, and the `with check` is the half that
--     matters: `using` governs UPDATE/DELETE against the row as it EXISTS,
--     while an INSERT consults `with check` ALONE. With `using` only, anybody
--     signed in could create an object under somebody else's prefix.
--
--   READ — `staff photo read` runs private.can_see_staff_photo. ⚠️ WIDENED
--     26 Aug 2026 by ruling C (20260826_member_contact_card): any ACTIVE
--     member may see any active STAFF/ADMIN's photo, club-wide — the member
--     contact card shows every staff face. Squad membership no longer gates
--     the read; what still does is the caller being active, and the subject
--     being active staff.
--
-- ⚠️ THE `status = 'active'` ON BOTH SIDES IS THE SUBTLE PART. It is about two
-- DIFFERENT people: the caller, and the person being looked at. A pending
-- member has been approved by nobody; a pending coach is not yet this squad's
-- coach.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY and every refusal below becomes a
-- success. The injection at the bottom is what makes the refusals mean
-- something.

begin;

create temporary table _t on commit drop as
select id as team_id, club_id, row_number() over (order by sort_order) as n
from teams order by sort_order limit 2;
create temporary table _r (seq int, stage text, detail text) on commit drop;
grant select, insert on _t, _r to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('dee00000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.coach@example.invalid',now(),'{}'::jsonb,now(),now()),
       ('dee00000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.parent@example.invalid',now(),'{}'::jsonb,now(),now());

insert into profiles (id, full_name, email) values
 ('dee00000-0000-4000-8000-0000000000c1','H Coach','h.coach@example.invalid'),
 ('dee00000-0000-4000-8000-0000000000f1','H Parent','h.parent@example.invalid')
on conflict (id) do nothing;

-- A coach on squad A. The parent starts on squad B — NOT the coach's.
insert into memberships (profile_id, club_id, team_id, role, status)
select 'dee00000-0000-4000-8000-0000000000c1', club_id, team_id, 'coach', 'active' from _t where n = 1;
-- ⚠️ A DISPOSABLE CHILD ON EACH SQUAD THE PARENT EVER SITS ON.
-- `memberships_family_role_needs_player` (20260817) forbids a 'parent' row
-- with no player_id; this fixture predates it, so the harness died on this
-- INSERT and asserted nothing. Unnoticed because the nightly db-check was
-- inert without a SUPABASE_DB_URL secret and passed reporting "did not run".
--
-- ⚠️ 'parent' IS THE POINT and must not be swapped for a staff role to
-- satisfy the constraint — the whole harness is about what a FAMILY member
-- can reach in the staff-photo bucket.
insert into players (id, club_id, team_id, full_name)
select 'dee00000-0000-4000-8000-0000000000e2', club_id, team_id, 'ZZ Probe Child B' from _t where n = 2;
insert into players (id, club_id, team_id, full_name)
select 'dee00000-0000-4000-8000-0000000000e1', club_id, team_id, 'ZZ Probe Child A' from _t where n = 1;

insert into memberships (profile_id, club_id, team_id, player_id, role, status)
select 'dee00000-0000-4000-8000-0000000000f1', club_id, team_id,
       'dee00000-0000-4000-8000-0000000000e2', 'parent', 'active' from _t where n = 2;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dee00000-0000-4000-8000-0000000000f1","role":"authenticated"}';

-- ⚠️ REPOINTED 31 Aug 2026, and the EXPECTATION FLIPPED — this is ruling C,
-- not a regression. Until 26 Aug a member of another squad could NOT see this
-- coach's photo, and this step expected false. 20260826_member_contact_card
-- carries the ruling in the function body itself: "any active member may see
-- any staff/admin's photo" — the member contact card shows every staff face
-- club-wide. What still discriminates: the CALLER must be an active member
-- (step 7), the SUBJECT must be active (step 8) and staff/admin (step 9).
insert into _r select 1, 'READ: not in the coach''s squad (expect true — ruling C)',
  private.can_see_staff_photo('dee00000-0000-4000-8000-0000000000c1')::text;

-- ⚠️ THE CONTROL. Without it, "cannot see the coach" is equally explained by
-- "this function returns false to everybody", which a lost `set local role`
-- produces.
insert into _r select 2, 'READ: own photo (expect true)',
  private.can_see_staff_photo('dee00000-0000-4000-8000-0000000000f1')::text;

do $$ begin
  perform public.set_my_photo('dee00000-0000-4000-8000-0000000000c1/1.jpg');
  insert into _r values (3, 'RPC: key under ANOTHER person''s id', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (3, 'RPC: key under ANOTHER person''s id', 'refused ('||sqlstate||')');
end $$;

do $$ begin
  perform public.set_my_photo('dee00000-0000-4000-8000-0000000000f1/1.jpg');
  insert into _r values (4, 'RPC: key under OWN id', 'allowed');
exception when others then
  insert into _r values (4, 'RPC: key under OWN id', 'REFUSED <<< WRONG: '||sqlerrm);
end $$;

-- ⚠️ THE `with check` TEST. An INSERT consults it alone.
do $$ begin
  insert into storage.objects (bucket_id, name, owner)
  values ('staff-photos','dee00000-0000-4000-8000-0000000000c1/x.jpg', auth.uid());
  insert into _r values (5, 'STORAGE: upload under ANOTHER person''s prefix', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (5, 'STORAGE: upload under ANOTHER person''s prefix', 'refused ('||sqlstate||')');
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name, owner)
  values ('staff-photos','dee00000-0000-4000-8000-0000000000f1/x.jpg', auth.uid());
  insert into _r values (6, 'STORAGE: upload under OWN prefix', 'allowed');
exception when others then
  insert into _r values (6, 'STORAGE: upload under OWN prefix', 'REFUSED <<< WRONG ('||sqlstate||')');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE FAULT INJECTION — the CALLER arm. Ruling C made step 1 true for any
--  active member, so the old injection (join the coach's squad, watch false
--  flip to true) stopped discriminating: it started from true. What still has
--  to flip is the caller's OWN standing — demote the parent to pending and
--  the SAME read must go false, or "true" above is equally explained by
--  "this function says true to everybody".
-- ══════════════════════════════════════════════════════════════════════════
reset role;
update memberships set status = 'pending'
 where profile_id = 'dee00000-0000-4000-8000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"dee00000-0000-4000-8000-0000000000f1","role":"authenticated"}';

insert into _r select 7, 'INJECTED: the caller demoted to pending (expect false)',
  private.can_see_staff_photo('dee00000-0000-4000-8000-0000000000c1')::text;

-- Restore the caller for the arms below — step 8 must be about the COACH's
-- status alone, with the caller active again.
reset role;
update memberships set status = 'active'
 where profile_id = 'dee00000-0000-4000-8000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"dee00000-0000-4000-8000-0000000000f1","role":"authenticated"}';

-- ⚠️ AND THE STATUS ARM, which the injection above does not reach. Demote the
-- COACH to pending: the parent is still in that squad, so only `status` can
-- change the answer.
reset role;
update memberships set status = 'pending'
 where profile_id = 'dee00000-0000-4000-8000-0000000000c1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"dee00000-0000-4000-8000-0000000000f1","role":"authenticated"}';

insert into _r select 8, 'a PENDING coach''s photo (expect false)',
  private.can_see_staff_photo('dee00000-0000-4000-8000-0000000000c1')::text;

-- ⚠️ THE SUBJECT-ROLE ARM — ruling C is STAFF/ADMIN subjects only. The coach
-- (restored active) looks at the PARENT: an active member, but not staff, not
-- in the coach's squad, not self. If this reads true, ruling C has widened
-- from "every staff face" to "every member's face", which nobody ruled.
reset role;
update memberships set status = 'active'
 where profile_id = 'dee00000-0000-4000-8000-0000000000c1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"dee00000-0000-4000-8000-0000000000c1","role":"authenticated"}';

insert into _r select 9, 'a NON-STAFF member''s photo, seen by staff (expect false)',
  private.can_see_staff_photo('dee00000-0000-4000-8000-0000000000f1')::text;

reset role;
select seq, stage, detail from _r order by seq;

-- ══════════════════════════════════════════════════════════════════════════
--  THE ASSERTIONS. The SELECT above is for a human; this is what fails.
--  `npm run db:check` throws on a SQL error and on nothing else — see
--  scripts/db-check.mjs for the nine harnesses that could not report a wrong
--  answer until 13 Aug 2026.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _d text;
  _bad text;
begin
  if (select count(*) from _r) <> 9 then
    raise exception 'FAIL: expected 9 recorded steps, got %. The harness did not run everything it claims to.',
      (select count(*) from _r);
  end if;

  select string_agg(seq || ': ' || stage || ' -> ' || detail, ' | ') into _bad
    from _r where detail like '%<<< WRONG%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  select detail into _d from _r where seq = 1;
  if _d <> 'true' then
    raise exception 'FAIL: an active member of another squad CANNOT see this coach''s photo (%). Ruling C (26 Aug 2026, 20260826_member_contact_card) says any active member may see any staff/admin''s photo — the member contact card depends on it.', _d;
  end if;

  select detail into _d from _r where seq = 2;
  if _d <> 'true' then
    raise exception 'FAIL: a person cannot see their OWN photo (%) — the upload control on /more would show a blank after a successful save.', _d;
  end if;

  select detail into _d from _r where seq = 3;
  if _d not like 'refused (42501)%' then
    raise exception 'FAIL: set_my_photo accepted a key under another person''s id (%). my_squad_staff would hand that key out and the reader''s own permission would sign it — one volunteer''s face under another''s name.', _d;
  end if;

  select detail into _d from _r where seq = 5;
  if _d not like 'refused%' then
    raise exception 'FAIL: an upload under another person''s prefix was allowed (%). The `with check` half of "staff photo write" is missing — `using` alone does not constrain an INSERT.', _d;
  end if;

  -- ⚠️ THE TWO THAT MAKE THE REFUSALS ABOVE MEAN ANYTHING.
  select detail into _d from _r where seq = 7;
  if _d <> 'false' then
    raise exception 'FAIL: the injected fault did not take — demoted to pending, the caller can STILL see the coach''s photo (%). The "true" in step 1 is therefore equally explained by "this function says true to everybody". STOP: this run proved nothing.', _d;
  end if;

  select detail into _d from _r where seq = 8;
  if _d <> 'false' then
    raise exception 'FAIL: a PENDING coach''s photo is visible to the squad (%). can_see_staff_photo has stopped checking status on the person being looked at, and my_squad_staff has drifted from it.', _d;
  end if;

  select detail into _d from _r where seq = 9;
  if _d <> 'false' then
    raise exception 'FAIL: staff can see a NON-STAFF member''s photo (%). Ruling C is staff/admin subjects only — this would widen it to every member''s face, which nobody ruled.', _d;
  end if;

  raise notice 'SELF-TEST PASSED — 9 steps: ruling-C read club-wide, writes own-prefix-only, caller demotion flipped, both subject arms held.';
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 31 Aug 2026 (row 1 flipped by ruling C, 26 Aug;
--  the 13 Aug measurement had it false and the injection joined the squad)
--    1  READ: not in the coach's squad                true   <-- ruling C
--    2  READ: own photo                               true
--    3  RPC: key under ANOTHER person's id            refused (42501)
--    4  RPC: key under OWN id                         allowed
--    5  STORAGE: upload under ANOTHER prefix          refused (42501)
--    6  STORAGE: upload under OWN prefix              allowed
--    7  INJECTED: caller demoted to pending           false  <-- MUST be false
--    8  a PENDING coach's photo                       false
--    9  a NON-STAFF member's photo, seen by staff     false
-- ══════════════════════════════════════════════════════════════════════════
