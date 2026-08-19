-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — coaches and managers approve for THEIR OWN squads
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE MISTAKE THIS FILE WAS WRITTEN TO AVOID, made on the first run.
--
-- The first version looked the membership id up AS THE CALLER UNDER TEST:
--
--     perform public.approve_membership(
--       (select id from public.memberships where status = 'pending' limit 1));
--
-- An unauthorised caller cannot SEE that row, so the subquery returned NULL,
-- the function raised "That registration no longer exists." — and the test
-- recorded a refusal. Every case passed. None of them had reached the
-- authorisation check at all.
--
-- The ids are therefore captured AS OWNER, before any impersonation, into a
-- temp table. A refusal only counts if the message is the authorisation one.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED AND auth.uid() IS NULL. A test that
-- forgets `set local role authenticated` passes while proving nothing.
--
-- WHAT IT GUARDS
--   * a coach approves their own squad, and only their own
--   * a MANAGER can too (Jay, 9 Aug 2026)
--   * a MEDIC cannot, though can_edit_team says they may edit that squad —
--     approval is deliberately a shorter list than editing
--   * a parent cannot approve THEMSELVES, which is the one that turns the
--     whole pending design into theatre if it ever breaks
--   * a coach still cannot UPDATE public.memberships directly. That is the
--     entire reason approval is an RPC: `memb manage` is FOR ALL, so widening
--     it would also hand every coach role changes and revocation.

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
select v.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       v.email, now(), jsonb_build_object('full_name', v.nm), now(), now()
from (values
  ('00000000-aaaa-0000-0000-000000000001'::uuid,'coach-u16@example.invalid','Coach U16'),
  ('00000000-aaaa-0000-0000-000000000002'::uuid,'coach-u18@example.invalid','Coach U18'),
  ('00000000-aaaa-0000-0000-000000000003'::uuid,'medic-u16@example.invalid','Medic U16'),
  ('00000000-aaaa-0000-0000-000000000005'::uuid,'mgr-u16@example.invalid','Manager U16'),
  ('00000000-aaaa-0000-0000-000000000006'::uuid,'parent-only@example.invalid','Plain Parent'),
  ('00000000-aaaa-0000-0000-000000000004'::uuid,'newparent@example.invalid','New Parent')
) as v(id,email,nm);

insert into public.memberships (profile_id, club_id, team_id, role, status)
select '00000000-aaaa-0000-0000-000000000001', t.club_id, t.id, 'coach','active'
  from teams t where t.name='U16B';
insert into public.memberships (profile_id, club_id, team_id, role, status)
select '00000000-aaaa-0000-0000-000000000002', t.club_id, t.id, 'coach','active'
  from teams t where t.name='U18B';
insert into public.memberships (profile_id, club_id, team_id, role, status)
select '00000000-aaaa-0000-0000-000000000003', t.club_id, t.id, 'medic','active'
  from teams t where t.name='U16B';
insert into public.memberships (profile_id, club_id, team_id, role, status)
select '00000000-aaaa-0000-0000-000000000005', t.club_id, t.id, 'manager','active'
  from teams t where t.name='U16B';

insert into public.players (club_id, team_id, full_name)
select t.club_id, t.id, 'Harness Child A' from teams t where t.name='U16B';
insert into public.players (club_id, team_id, full_name)
select t.club_id, t.id, 'Harness Child B' from teams t where t.name='U16B';

insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '00000000-aaaa-0000-0000-000000000004', t.club_id, t.id, 'parent',
       (select id from players where full_name='Harness Child A'), 'pending'
  from teams t where t.name='U16B';
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select '00000000-aaaa-0000-0000-000000000006', t.club_id, t.id, 'parent',
       (select id from players where full_name='Harness Child B'), 'pending'
  from teams t where t.name='U16B';

-- ⚠️ AS OWNER. See the header — this is the whole difference between a test
-- and a test-shaped thing.
create temp table ids (label text, id uuid);
insert into ids select 'pendingA', id from public.memberships
  where profile_id='00000000-aaaa-0000-0000-000000000004';
insert into ids select 'pendingB', id from public.memberships
  where profile_id='00000000-aaaa-0000-0000-000000000006';
grant select on ids to authenticated;

create temp table probe (who text, check_name text, result text);
grant insert, select on probe to authenticated;

-- ── U18 coach: right role, wrong squad ─────────────────────────────────
select set_config('request.jwt.claims','{"sub":"00000000-aaaa-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ declare mid uuid; begin
  select id into mid from ids where label='pendingA';
  begin
    perform public.approve_membership(mid);
    insert into probe values ('U18 coach','approve a U16 registration','ALLOWED <<< WRONG');
  exception when others then
    insert into probe values ('U18 coach','approve a U16 registration','refused: '||SQLERRM);
  end;
end $$;
-- ⚠️ SCOPED TO THIS FIXTURE'S OWN ROWS, AND THAT IS THE WHOLE FIX.
-- This counted EVERY pending membership in the database, so its answer
-- depended on whether real families happened to be waiting for approval.
-- Measured 19 Aug 2026: production held 2 genuine pending registrations, so
-- the harness reported "pending membership rows still visible: U16 coach -> 2"
-- and read exactly like a squad coach seeing rows they should not.
--
-- ⚠️ IT WAS NOT A DISCLOSURE, AND THAT WAS CHECKED RATHER THAN ASSUMED.
-- Both real rows were on the coach's OWN squad, and a U16B coach was measured
-- seeing 0 pending rows belonging to any other squad. RLS was right; the
-- fixture was counting the club.
insert into probe select 'U18 coach','pending rows visible',
  (select count(*)::text from memberships
    where status='pending'
      and profile_id in ('00000000-aaaa-0000-0000-000000000004',
                         '00000000-aaaa-0000-0000-000000000006'));
reset role;

-- ── U16 medic: right squad, excluded role ──────────────────────────────
select set_config('request.jwt.claims','{"sub":"00000000-aaaa-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ declare mid uuid; begin
  select id into mid from ids where label='pendingA';
  begin
    perform public.approve_membership(mid);
    insert into probe values ('U16 medic','approve own squad','ALLOWED <<< WRONG, medic is excluded');
  exception when others then
    insert into probe values ('U16 medic','approve own squad','refused: '||SQLERRM);
  end;
end $$;
reset role;

-- ── A plain parent, including on their OWN row ─────────────────────────
select set_config('request.jwt.claims','{"sub":"00000000-aaaa-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$ declare mid uuid; begin
  select id into mid from ids where label='pendingA';
  begin
    perform public.approve_membership(mid);
    insert into probe values ('plain parent','approve someone else','ALLOWED <<< WRONG');
  exception when others then
    insert into probe values ('plain parent','approve someone else','refused: '||SQLERRM);
  end;
  -- ⚠️ THE ONE THAT MATTERS MOST. They CAN see this row (memb read allows
  -- your own). If self-approval ever works, the pending design is theatre.
  select id into mid from ids where label='pendingB';
  begin
    perform public.approve_membership(mid);
    insert into probe values ('plain parent','approve THEMSELVES','ALLOWED <<< WRONG, self-approval');
  exception when others then
    insert into probe values ('plain parent','approve THEMSELVES','refused: '||SQLERRM);
  end;
end $$;
reset role;

-- ── U16 manager: allowed ───────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"00000000-aaaa-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$ declare mid uuid; m public.memberships; begin
  select id into mid from ids where label='pendingB';
  begin
    m := public.approve_membership(mid);
    insert into probe values ('U16 manager','approve own squad','allowed, status='||m.status);
  exception when others then
    insert into probe values ('U16 manager','approve own squad','REFUSED <<< WRONG: '||SQLERRM);
  end;
end $$;
reset role;

-- ── U16 coach: allowed, idempotent, and no table write ─────────────────
select set_config('request.jwt.claims','{"sub":"00000000-aaaa-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into probe select 'U16 coach','sees parent name on the card',
  coalesce((select full_name from profiles where id='00000000-aaaa-0000-0000-000000000004'),
           'BLANK <<< the card is unusable');
do $$ declare mid uuid; m public.memberships; n int; begin
  select id into mid from ids where label='pendingA';
  m := public.approve_membership(mid);
  insert into probe values ('U16 coach','approve own squad','allowed, status='||m.status);
  -- Two coaches both tapping Approve on a Sunday evening is the normal case.
  m := public.approve_membership(mid);
  insert into probe values ('U16 coach','approve twice','no-op, status='||m.status);
  -- THE REASON THIS IS AN RPC.
  update public.memberships set role='admin' where id=mid;
  get diagnostics n = row_count;
  insert into probe values ('U16 coach','promote a member via the table','rows written: '||n);
end $$;
-- Same scoping as the U18 step above — this file's two registrations only,
-- never the club's.
insert into probe select 'U16 coach','pending rows visible after approving',
  (select count(*)::text from memberships
    where status='pending'
      and profile_id in ('00000000-aaaa-0000-0000-000000000004',
                         '00000000-aaaa-0000-0000-000000000006'));
reset role;

select * from probe;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. `select * from probe` was the whole verdict, and
--  `npm run db:check` discards result sets — so this file reported `ok` no
--  matter what the probe said. Added 13 Aug 2026; nine harnesses were in that
--  state. See scripts/db-check.mjs.
--
--  ⚠️ MATCHED ON PATTERNS, NOT ON THE EXACT REFUSAL WORDING. The message is
--  "You can only approve…", which is user-facing copy and may legitimately be
--  reworded; asserting it verbatim would make a copy edit look like a security
--  regression. What must not change is WHICH SIDE of the line each person
--  falls on.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _n int;
  _bad text;
begin
  select count(*) into _n from probe;
  if _n = 0 then
    raise exception 'FAIL: the probe is empty — nothing this harness claims to test was exercised.';
  end if;

  -- 1. EVERYONE WHO MUST BE REFUSED. A coach of the wrong squad, a medic, and
  --    a plain parent approving anybody — including themselves.
  select string_agg(who || ' / ' || check_name || ' -> ' || result, ' | ') into _bad
    from probe
   where check_name like '%approve%'
     and who in ('U18 coach', 'U16 medic', 'plain parent')
     and result not like 'refused%';
  if _bad is not null then
    raise exception 'FAIL: somebody who must not approve was NOT refused: %', _bad;
  end if;

  -- 2. THE TABLE PATH MUST BE SHUT. This is the reason approve_membership is
  --    an RPC at all: a coach writing `memberships` directly must affect zero
  --    rows, or a squad coach can promote a member to admin.
  select string_agg(who || ' -> ' || result, ' | ') into _bad
    from probe
   where check_name like '%promote a member%'
     and result <> 'rows written: 0';
  if _bad is not null then
    raise exception 'FAIL: the direct-table promotion path is OPEN: %', _bad;
  end if;

  -- 3. NO PENDING ROW MAY REMAIN VISIBLE once approving is done.
  select string_agg(who || ' -> ' || result, ' | ') into _bad
    from probe
   where check_name like '%pending%visible%'
     and result <> '0';
  if _bad is not null then
    raise exception 'FAIL: pending membership rows still visible: %', _bad;
  end if;

  -- 4. ⚠️ THE NON-VACUITY ARM, AND WITHOUT IT EVERY CHECK ABOVE IS FREE.
  --    A build that refused ABSOLUTELY EVERYONE would satisfy 1, 2 and 3. The
  --    squad's own coach and manager MUST be able to approve their own squad.
  select count(*) into _n
    from probe
   where check_name like '%approve own squad%'
     and result like 'allowed%';
  if _n < 2 then
    raise exception 'FAIL: only % of the entitled approvals succeeded, expected the U16 coach AND the U16 manager. Every refusal asserted above is therefore equally explained by "nobody can approve anything", which is not the feature.', _n;
  end if;

  raise notice 'SELF-TEST PASSED — % probe rows; refusals held and % entitled approval(s) succeeded.', (select count(*) from probe), _n;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — verified against production 9 Aug 2026
--
--   U18 coach    approve a U16 registration   refused: You can only approve…
--   U18 coach    pending rows visible          0
--   U16 medic    approve own squad             refused: You can only approve…
--   plain parent approve someone else          refused: You can only approve…
--   plain parent approve THEMSELVES            refused: You can only approve…
--   U16 manager  approve own squad             allowed, status=active
--   U16 coach    sees parent name on the card  New Parent
--   U16 coach    approve own squad             allowed, status=active
--   U16 coach    approve twice                 no-op, status=active
--   U16 coach    promote a member via table    rows written: 0
--   U16 coach    pending visible after approve 0
--
--  ⚠️ EVERY REFUSAL MUST QUOTE THE AUTHORISATION MESSAGE. "That registration
--  no longer exists." means the caller could not see the row and the id was
--  null — the check was never reached. That is the false green described at
--  the top of this file.
-- ══════════════════════════════════════════════════════════════════════════
--
--  FAULT INJECTION — a green test that cannot go red is decoration.
--
--    begin;
--    create or replace function private.can_approve_team(_team uuid)
--     returns boolean language sql stable security definer set search_path to 'public'
--    as $f$ select true $f$;
--    -- ...then the fixture + cases above...
--    -- EXPECTED: the medic and the plain parent both become ALLOWED, and
--    -- "approve THEMSELVES" succeeds. If anything still reads refused, the
--    -- harness is not testing what it claims.
--    rollback;
