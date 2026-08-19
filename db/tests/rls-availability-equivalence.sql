-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — proving the `availability` policy merge changed NOTHING
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK — including the DDL it applies
--  halfway through. Nothing survives it and it can be re-run at will.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THIS FILE IS WRITTEN TO RUN AGAINST THE **PRE-MERGE** SCHEMA. The merge
-- was applied on 9 Aug 2026 (`scale_indexes_and_availability_policy_merge`),
-- so re-running it today aborts at the fixture guard — correctly. It is kept
-- because it IS the evidence for that migration, and because the shape is the
-- one to copy the next time a policy set is merged. To re-prove it, run it
-- against a branch database restored to before that migration.
--
-- ══ WHAT IT PROVED ══════════════════════════════════════════════════════
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
-- ⚠️ A POLICY MERGE IS AN AUTHORISATION CHANGE WEARING A PERFORMANCE HAT.
-- "Obviously equivalent" is exactly how access quietly widens, so this asks
-- the database instead of arguing: it records what seven kinds of caller can
-- do BEFORE, applies the merge, records the same matrix AFTER, and prints
-- '*** CHANGED ***' on any cell that moved.
--
-- RESULT, run against production 9 Aug 2026 — all seven 'same':
--
--     caller             sel      ins                  upd            del
--     1_coach_active     1 -> 1   ALLOWED -> ALLOWED   ALLOWED->ALLOWED  ALLOWED->ALLOWED
--     2_coach_pending    1 -> 1   ALLOWED -> ALLOWED   ALLOWED->ALLOWED  ALLOWED->ALLOWED
--     3_parent_active    1 -> 1   ALLOWED -> ALLOWED   ALLOWED->ALLOWED  NO ROWS->NO ROWS
--     4_parent_pending   0 -> 0   DENIED  -> DENIED    NO ROWS->NO ROWS  NO ROWS->NO ROWS
--     5_outsider         0 -> 0   DENIED  -> DENIED    NO ROWS->NO ROWS  NO ROWS->NO ROWS
--     6_admin            1 -> 1   ALLOWED -> ALLOWED   ALLOWED->ALLOWED  ALLOWED->ALLOWED
--     7_anon             0 -> 0   DENIED  -> DENIED    NO ROWS->NO ROWS  NO ROWS->NO ROWS
--
-- ══ ⚠️ IT CAUGHT A REAL DIFFERENCE ON THE FIRST ATTEMPT ═════════════════
--
-- The first version of the merge wrote SELECT as `can_see_team OR
-- is_own_player`, dropping the `can_edit_team` arm on the reasoning that for
-- an ACTIVE staff member the second implies the first. True — but
-- **`can_edit_team` does NOT check `status` and `can_see_team` DOES** (it
-- gained `status = 'active'` on 8 Aug). So `2_coach_pending` came back
-- `1 -> 0` on SELECT and `ALLOWED -> NO ROWS` on UPDATE and DELETE.
--
-- That is why the shipped SELECT policy has three arms and looks redundant.
-- **The redundancy is what makes it a refactor instead of a behaviour change.**
--
-- ══ ⚠️ AND THE FAULT INJECTION, WHICH IS NOT OPTIONAL ═══════════════════
--
-- A harness that only ever reports 'same' is indistinguishable from one that
-- cannot see anything. Both directions were injected and both were caught:
--
--   * NARROWING — the two-arm SELECT above: `2_coach_pending` went 1 -> 0.
--   * WIDENING  — `create policy "avail read" ... using (true)`: the
--                 unrelated `5_outsider` went 0 -> 1.
--
-- ══ THE TWO WAYS THIS GOES FALSELY GREEN ════════════════════════════════
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED ENTIRELY. Every probe sets
-- `request.jwt.claims` AND `set local role authenticated`. Forget either and
-- every case passes while proving nothing. This project has already shipped
-- that mistake once — see db/tests/rls-squad-staff-approval.sql.
--
-- ⚠️ IDS ARE CAPTURED AS OWNER, BEFORE IMPERSONATION. Look a row up as the
-- caller under test and an unauthorised caller cannot SEE it, so the lookup
-- returns NULL, the statement touches nothing, and "0 rows" reads as a
-- refusal it never made.
--
-- ⚠️ AND 'NO ROWS' IS NOT 'DENIED'. An RLS refusal on UPDATE/DELETE filters
-- the row out of the statement's view and reports 0 rows rather than raising;
-- only INSERT raises 42501. Collapsing the two into one verdict would hide
-- exactly the difference this file exists to detect.

begin;

-- ── Fixture ──────────────────────────────────────────────────────────────
-- Built on the existing U16B Contact squad, which carries the 6 test players
-- and 26 events. ⚠️ That squad was named 'U16' until 9 Aug 2026 and KEPT ITS
-- ID through the rename, so this is the same fixture the other harnesses use.
create temp table fixture as
select
  t.id as team_id, t.club_id as club_id,
  (select id from public.teams t2 where t2.club_id = t.club_id and t2.id <> t.id
    order by t2.sort_order limit 1)                                as other_team_id,
  (select id from public.events e where e.team_id = t.id
    order by e.starts_at limit 1)                                  as event_id,
  (select id from public.events e where e.team_id = t.id
    order by e.starts_at offset 1 limit 1)                         as event2_id,
  (select id from public.players p where p.team_id = t.id
    order by p.full_name limit 1)                                  as player_id,
  (select id from public.players p where p.team_id = t.id
    order by p.full_name offset 1 limit 1)                         as player2_id
from public.teams t where t.name = 'U16B';

-- ⚠️ ABORT on an incomplete fixture. Every count below would otherwise read
-- 0, which looks exactly like a correctly locked-down caller rather than a
-- dead harness.
do $$
declare f record;
begin
  select * into f from fixture;
  if f.team_id is null or f.event_id is null or f.event2_id is null
     or f.player_id is null or f.player2_id is null or f.other_team_id is null then
    raise exception 'FIXTURE INCOMPLETE - this harness would report false refusals';
  end if;
  if (select count(*) from pg_policies
       where schemaname='public' and tablename='availability'
         and policyname in ('avail coach manage','avail own insert','avail own update')) <> 3 then
    raise exception 'This database is already merged. Run against a pre-merge branch.';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
select v.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       v.email, now(), '{"full_name":"Availability probe"}'::jsonb, now(), now()
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,'probe-coach-active@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,'probe-coach-pending@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,'probe-parent-active@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000004'::uuid,'probe-parent-pending@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000005'::uuid,'probe-outsider@example.invalid'),
  ('aaaaaaaa-0000-0000-0000-000000000006'::uuid,'probe-admin@example.invalid')
) as v(id,email);

-- ⚠️ The outsider is a real, ACTIVE parent — of a child on a DIFFERENT squad.
-- "Signed in but unrelated" is the case that matters; a user with no
-- membership at all is refused by almost every policy and proves less.
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, f.club_id, f.team_id, 'coach',  null::uuid,  'active'  from fixture f
union all select 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, f.club_id, f.team_id, 'coach',  null::uuid,  'pending' from fixture f
union all select 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, f.club_id, f.team_id, 'parent', f.player_id, 'active'  from fixture f
union all select 'aaaaaaaa-0000-0000-0000-000000000004'::uuid, f.club_id, f.team_id, 'parent', f.player2_id,'pending' from fixture f
union all select 'aaaaaaaa-0000-0000-0000-000000000005'::uuid, f.club_id, f.other_team_id,'parent', null::uuid,'active' from fixture f
-- Admin memberships carry team_id = NULL; admin is club-wide.
union all select 'aaaaaaaa-0000-0000-0000-000000000006'::uuid, f.club_id, null::uuid, 'admin', null::uuid, 'active'  from fixture f;

-- One row to read, update and delete. Inserted as OWNER, so its existence is
-- not itself under test. ⚠️ status must be one of in/out/maybe — the CHECK
-- constraint rejects 'yes', which cost a run.
insert into public.availability (event_id, player_id, status)
select f.event_id, f.player_id, 'in' from fixture f;

create temp table matrix (phase text, caller text, can_select int,
                          can_insert text, can_update text, can_delete text);

-- ⚠️ EVERY WRITE IS ROLLED BACK TO ITS OWN SAVEPOINT. A plpgsql
-- BEGIN/EXCEPTION block IS a savepoint, so raising after a successful write
-- undoes it while keeping the verdict. Without this the 'before' phase would
-- leave rows behind and the 'after' phase would measure a different database.
create or replace function pg_temp.probe(_phase text) returns void language plpgsql as $fn$
declare f record; u record; n int; v_sel int; v_ins text; v_upd text; v_del text;
begin
  select * into f from fixture;
  for u in select * from (values
      ('1_coach_active', 'aaaaaaaa-0000-0000-0000-000000000001'),
      ('2_coach_pending','aaaaaaaa-0000-0000-0000-000000000002'),
      ('3_parent_active','aaaaaaaa-0000-0000-0000-000000000003'),
      ('4_parent_pending','aaaaaaaa-0000-0000-0000-000000000004'),
      ('5_outsider',     'aaaaaaaa-0000-0000-0000-000000000005'),
      ('6_admin',        'aaaaaaaa-0000-0000-0000-000000000006'),
      ('7_anon',         null)) as v(name,uid)
  loop
    if u.uid is null then
      perform set_config('request.jwt.claims','{"role":"anon"}',true);
      set local role anon;
    else
      perform set_config('request.jwt.claims',
        format('{"sub":"%s","role":"authenticated"}', u.uid), true);
      set local role authenticated;
    end if;

    select count(*) into v_sel from public.availability;

    -- A DIFFERENT event, so this cannot collide with the seeded row's unique
    -- (event_id, player_id) and report a constraint violation as a refusal.
    begin
      insert into public.availability (event_id, player_id, status)
      values (f.event2_id, f.player_id, 'out');
      v_ins := 'ALLOWED';
      raise exception 'undo' using errcode='P0001';
    exception when sqlstate 'P0001' then null;
              when others then v_ins := 'DENIED ' || sqlstate;
    end;

    begin
      update public.availability set status='maybe'
       where event_id=f.event_id and player_id=f.player_id;
      get diagnostics n = row_count;
      v_upd := case when n > 0 then 'ALLOWED' else 'NO ROWS' end;
      raise exception 'undo' using errcode='P0001';
    exception when sqlstate 'P0001' then null;
              when others then v_upd := 'DENIED ' || sqlstate;
    end;

    begin
      delete from public.availability
       where event_id=f.event_id and player_id=f.player_id;
      get diagnostics n = row_count;
      v_del := case when n > 0 then 'ALLOWED' else 'NO ROWS' end;
      raise exception 'undo' using errcode='P0001';
    exception when sqlstate 'P0001' then null;
              when others then v_del := 'DENIED ' || sqlstate;
    end;

    reset role;
    insert into matrix values (_phase, u.name, v_sel, v_ins, v_upd, v_del);
  end loop;
  reset role;
end;
$fn$;

select pg_temp.probe('before');

-- ── The merge, exactly as `scale_indexes_and_availability_policy_merge`
--    applies it. DDL is transactional, so the ROLLBACK undoes this too.
drop policy "avail coach manage" on public.availability;
drop policy "avail own insert"   on public.availability;
drop policy "avail own update"   on public.availability;
drop policy "avail read"         on public.availability;

-- ⚠️ THREE ARMS. can_edit_team looks redundant beside can_see_team and is not
-- — see the header. Removing it fails 2_coach_pending.
create policy "avail read" on public.availability for select using (
  private.can_see_team((select e.team_id from public.events e where e.id = event_id))
  or private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id));

create policy "avail write insert" on public.availability for insert with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id));

create policy "avail write update" on public.availability for update using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id))
with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id));

create policy "avail write delete" on public.availability for delete using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id)));

select pg_temp.probe('after');

-- ── The verdict ──────────────────────────────────────────────────────────
select b.caller,
       b.can_select||' -> '||a.can_select as sel,
       b.can_insert||' -> '||a.can_insert as ins,
       b.can_update||' -> '||a.can_update as upd,
       b.can_delete||' -> '||a.can_delete as del,
       case when b.can_select is not distinct from a.can_select
             and b.can_insert is not distinct from a.can_insert
             and b.can_update is not distinct from a.can_update
             and b.can_delete is not distinct from a.can_delete
            then 'same' else '*** CHANGED ***' end as verdict
from matrix b join matrix a on a.caller=b.caller and a.phase='after'
where b.phase='before' order by b.caller;

-- ⚠️ EXPECTED: seven rows, every one 'same'. Anything else means the merge
-- is not the refactor it claims to be — or the probe never reached a policy.

rollback;
