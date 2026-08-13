-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — an ordinary admin cannot make themselves a super admin
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: everything runs
--  inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS, and why it is not obvious.
--
-- `memb manage` is FOR ALL and admin-only, so ANY ADMIN CAN ALREADY WRITE
-- MEMBERSHIP ROWS — including their own. Adding `is_super` as an ordinary
-- column would therefore have let any admin set it on themselves, and the
-- whole tier would be theatre.
--
-- ⚠️ RLS CANNOT CLOSE THAT. Policies authorise the ROW, not the COLUMN.
-- "an admin may write membership rows in their club" is true before and after
-- the row gains is_super. The protection is a COLUMN PRIVILEGE, exactly as
-- `profiles.email` is protected — see db/schema/grants.sql §4, which also
-- records that the Supabase dashboard offers to undo such grants in one click
-- and presents it as tidying up. ⚠️ THAT WARNING NOW APPLIES TO
-- public.memberships TOO.
--
-- ⚠️ AS `postgres` RLS AND COLUMN GRANTS ARE BOTH BYPASSED. A run that forgets
-- `set local role authenticated` passes while proving nothing. The super half
-- at the bottom is what proves the assertions can move at all.
--
-- ⚠️ THE RIGHTS GATE SCREENS, NOT DATA. Every admin already sees every child's
-- name, photo and contact details. `admin_rights` decides which specialist
-- dashboard appears — it withholds nothing. A future right that must genuinely
-- withhold data needs its own RLS policy; hiding a menu item is not security.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- One ordinary admin, one super admin, one bystander to be granted to.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('ad000000-0000-4000-8000-00000000ad01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plain.admin@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('5a000000-0000-4000-8000-0000000000ff','00000000-0000-0000-0000-000000000000','authenticated','authenticated','super@example.invalid', now(), '{}'::jsonb, now(), now());

insert into profiles (id, full_name, email) values
 ('ad000000-0000-4000-8000-00000000ad01','Plain Admin','plain.admin@example.invalid'),
 ('5a000000-0000-4000-8000-0000000000ff','Super Admin','super@example.invalid')
on conflict (id) do nothing;

insert into memberships (profile_id, club_id, role, status, is_super) values
 ('ad000000-0000-4000-8000-00000000ad01','00000000-0000-0000-0000-0000000000ad','admin','active', false),
 ('5a000000-0000-4000-8000-0000000000ff','00000000-0000-0000-0000-0000000000ad','admin','active', true);

-- ── As the ORDINARY admin ─────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-00000000ad01","role":"authenticated"}';

insert into _r values ('ordinary admin is not super', private.is_super_admin()::text || '  (expect false)');

do $$
begin
  update memberships set is_super = true
   where profile_id = 'ad000000-0000-4000-8000-00000000ad01';
  insert into _r values ('self-promote via UPDATE','FAIL — an ordinary admin promoted themselves');
exception
  when insufficient_privilege then
    insert into _r values ('self-promote via UPDATE','PASS — refused 42501 by the column privilege');
  when others then
    insert into _r values ('self-promote via UPDATE','refused '||sqlstate||' '||sqlerrm);
end $$;

do $$
begin
  perform public.set_admin_rights(
    (select id from memberships where profile_id='ad000000-0000-4000-8000-00000000ad01'),
    true, array['youth']);
  insert into _r values ('self-promote via RPC','FAIL — the RPC let a non-super through');
exception when others then
  insert into _r values ('self-promote via RPC','PASS — refused '||sqlstate);
end $$;

do $$
begin
  insert into memberships (profile_id, club_id, role, status, is_super)
  values ('5a000000-0000-4000-8000-0000000000ff','00000000-0000-0000-0000-0000000000ad','admin','active', true);
  insert into _r values ('INSERT a super row','FAIL — the insert path is open');
exception when others then
  insert into _r values ('INSERT a super row','PASS — refused '||sqlstate);
end $$;

-- ⚠️ AND THE REGRESSION CHECK. The column grant was rewritten, so the columns
-- an ordinary admin SHOULD still be able to write must be proved still
-- writable — otherwise this migration quietly breaks every ordinary grant.
do $$
begin
  update memberships set status = 'active'
   where profile_id = 'ad000000-0000-4000-8000-00000000ad01';
  insert into _r values ('ordinary admin writes allowed columns','PASS — still works');
exception when others then
  insert into _r values ('ordinary admin writes allowed columns','FAIL — broke ordinary admin: '||sqlstate);
end $$;

-- ── As the SUPER admin. Everything above must go the other way ────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a000000-0000-4000-8000-0000000000ff","role":"authenticated"}';

insert into _r values ('super admin is super', private.is_super_admin()::text || '  (expect true)');

do $$
declare _got memberships;
begin
  _got := public.set_admin_rights(
    (select id from memberships where profile_id='ad000000-0000-4000-8000-00000000ad01'),
    false, array['youth','media']);
  insert into _r values ('super grants rights','PASS — rights now '||_got.admin_rights::text);
exception when others then
  insert into _r values ('super grants rights','FAIL '||sqlstate||' '||sqlerrm);
end $$;

do $$
begin
  perform public.set_admin_rights(gen_random_uuid(), false, array['youth']);
  insert into _r values ('unknown membership id','FAIL — reported success on nothing');
exception when others then
  insert into _r values ('unknown membership id','PASS — refused '||sqlstate);
end $$;

select * from _r;


-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails.
--
--  Added 13 Aug 2026. `npm run db:check` throws on a SQL ERROR and on nothing
--  else, and it discarded every result set — so this harness reported `ok`
--  whatever the PASS/FAIL column said. The verdict was computed, written down,
--  and never compared to anything. NINE of the fifteen harnesses were in that
--  state, hours after the runner was written to fix "a check nobody RUNS is not
--  a check". A check that runs and cannot fail is not a check either.
--
--  The empty-table arm matters as much as the FAIL arm: a harness that recorded
--  no steps at all has proved nothing, and would otherwise pass silently.
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
--  EXPECTED — measured live 10 Aug 2026
--    ordinary admin is not super            false  (expect false)
--    self-promote via UPDATE                PASS — refused 42501 by the column privilege
--    self-promote via RPC                   PASS — refused 42501
--    INSERT a super row                     PASS — refused 42501
--    ordinary admin writes allowed columns  PASS — still works
--    super admin is super                   true  (expect true)
--    super grants rights                    PASS — rights now {youth,media}
--    unknown membership id                  PASS — refused P0002
--
--  ⚠️ IF THE LAST THREE DO NOT PASS, STOP. Everything above them is a false
--  green: a build that refuses EVERYONE looks identical to a working one from
--  the ordinary admin's side alone.
-- ══════════════════════════════════════════════════════════════════════════
