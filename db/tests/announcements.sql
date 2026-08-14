-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — notices: who may post, who may read, and what the numbers mean
--  Paste into the Supabase SQL editor, or run `npm run db:check`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260814_announcements.sql.
--
-- ⚠️ THE TWO ASSERTIONS THAT ARE NOT OBVIOUS, and both were reached by running
-- this against live rather than by reading the policy:
--
--   * STEP 7 — A PARENT WITH TWO CHILDREN IN ONE SQUAD HOLDS TWO ACTIVE
--     MEMBERSHIP ROWS, and the audience count must still say ONE PERSON.
--     ⚠️ `memberships_unique_grant` is `(profile_id, club_id, role, team_id,
--     player_id)`, so the duplicate is only reachable when `player_id` DIFFERS —
--     which is exactly what a second child produces. This is a real shape in a
--     real club, not a contrived one, and `count(*)` instead of
--     `count(distinct m.profile_id)` reports a squad of 24 as 26 and can report
--     "25 of 26 seen" when every family has read it.
--
--   * STEP 10 — AN AUTHOR MUST NOT BE ABLE TO RE-SCOPE A SQUAD NOTICE TO THE
--     WHOLE CLUB after it has been posted. Enforced by `team_id` being absent
--     from the column grants, NOT by the policy. A grant restored "for
--     consistency" would silently reopen it and every existing test would stay
--     green.
--
-- ⚠️ STEP 5 IS THE ONE A FUTURE SESSION WILL "FIX". A PENDING member must NOT
-- read notices, which is deliberately different from `event read` — that policy
-- uses `is_attached_to_team` (status-blind) because fixtures are not sensitive.
-- The reasoning is in the migration header, and the second half of it is that
-- the audience count has to mean something. If this line goes red because
-- somebody aligned the two policies, read that header before "fixing" it back.
--
-- ⚠️ THE NAMES ARE SET BY UPDATE, NOT BY THE INSERT, AND THAT IS A REAL TRAP.
-- `auth.users` carries an `on_auth_user_created` trigger calling
-- `handle_new_user()`, which creates the `profiles` row with
-- `full_name = coalesce(raw_user_meta_data->>'full_name','')` — i.e. EMPTY.
-- So an `insert into profiles … on conflict (id) do nothing` afterwards does
-- nothing at all and every person in the fixture ends up nameless. This harness
-- asserted an ordering by name on 14 Aug 2026 and went red for exactly that
-- reason, which looked like a bug in `announcement_audience` and was not.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing.
--
-- ⚠️ AND READ THE FAULT-INJECTION SECTION AT THE BOTTOM BEFORE TRUSTING A GREEN
-- RUN. CLAUDE.md rule 6: a check that has never failed is not a check.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   A  coach of the probe squad, ACTIVE. Not an admin.
--   B  parent, ACTIVE, TWO children in the probe squad -> two membership rows.
--   C  parent, PENDING, probe squad.
--   D  parent, ACTIVE, a DIFFERENT squad.
--
-- ⚠️ A FRESH SQUAD RATHER THAN A REAL ONE. The counts in steps 7-9 are exact,
-- so the audience must contain nobody but this fixture. Selecting a real squad
-- would make every assertion depend on the club's live membership.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('a0000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('a0000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','twochildren@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('a0000000-0000-4000-8000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pending@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('a0000000-0000-4000-8000-00000000000d','00000000-0000-0000-0000-000000000000','authenticated','authenticated','othersquad@example.invalid', now(), '{}'::jsonb, now(), now());

-- See the header: the trigger already made these rows, empty-named.
update profiles set full_name = 'AAA Test Coach' where id = 'a0000000-0000-4000-8000-00000000000a';
update profiles set full_name = 'BBB Two Children' where id = 'a0000000-0000-4000-8000-00000000000b';
update profiles set full_name = 'CCC Pending Parent' where id = 'a0000000-0000-4000-8000-00000000000c';
update profiles set full_name = 'DDD Other Squad' where id = 'a0000000-0000-4000-8000-00000000000d';

insert into teams (id, club_id, name, sort_order) values
 ('a0000000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-0000000000ad','ZZ Probe Squad', 999),
 ('a0000000-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-0000000000ad','ZZ Other Squad', 998);

insert into players (id, club_id, team_id, full_name) values
 ('a0000000-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1','ZZ Child One'),
 ('a0000000-0000-4000-8000-0000000000e2','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1','ZZ Child Two');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('a0000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1', null, 'coach','active'),
 ('a0000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1','a0000000-0000-4000-8000-0000000000e1','parent','active'),
 ('a0000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1','a0000000-0000-4000-8000-0000000000e2','parent','active'),
 ('a0000000-0000-4000-8000-00000000000c','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f1', null, 'parent','pending'),
 ('a0000000-0000-4000-8000-00000000000d','00000000-0000-0000-0000-0000000000ad','a0000000-0000-4000-8000-0000000000f2', null, 'parent','active');

-- ── 1-3. Who may post ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

do $$
begin
  insert into announcements (team_id, title, body)
  values ('a0000000-0000-4000-8000-0000000000f1','Kit for Friday','Away strip, meet 14:30.');
  insert into _r values ('01 coach posts to own squad', 'ALLOWED - pass');
exception when others then
  insert into _r values ('01 coach posts to own squad', 'REFUSED - FAIL ' || sqlerrm);
end $$;

-- ⚠️ THE ONE THAT KEEPS A COACH OUT OF EVERY FAMILY'S HOME SCREEN. `can_edit_team`
-- would happily authorise a squad row; only the `team_id is null` arm of
-- "announcement create" refuses this, and it asks for `is_admin`.
do $$
begin
  insert into announcements (team_id, title, body) values (null,'Club wide','Everyone.');
  insert into _r values ('02 non-admin coach posts CLUB-WIDE', 'ALLOWED - FAIL');
exception when others then
  insert into _r values ('02 non-admin coach posts CLUB-WIDE', 'REFUSED - pass');
end $$;

do $$
begin
  insert into announcements (team_id, title, body)
  values ('a0000000-0000-4000-8000-0000000000f2','Not my squad','x');
  insert into _r values ('03 coach posts to ANOTHER squad', 'ALLOWED - FAIL');
exception when others then
  insert into _r values ('03 coach posts to ANOTHER squad', 'REFUSED - pass');
end $$;

-- ── 4-6. Who may read ─────────────────────────────────────────────────────
--
-- ⚠️ STEP 4 IS THE CONTROL AND IT IS NOT PADDING. Without it, steps 5 and 6
-- would both pass against a policy that refuses EVERYBODY — a fix that reads as
-- green and deletes the feature.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
do $$
declare _n int;
begin
  select count(*) into _n from announcements where title = 'Kit for Friday';
  insert into _r values ('04 ACTIVE parent reads squad notice',
    case when _n = 1 then 'YES - pass' else 'NO - FAIL' end);
  insert into announcement_reads (announcement_id, profile_id)
  select id, 'a0000000-0000-4000-8000-00000000000b'
    from announcements where title = 'Kit for Friday';
end $$;

do $$
declare _n int;
begin
  select count(*) into _n from announcement_reads;
  insert into _r values ('04b a member sees only their own read rows (expect 1)',
    case when _n = 1 then '1 - pass' else _n::text || ' - FAIL' end);
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}';
do $$
declare _n int;
begin
  select count(*) into _n from announcements where title = 'Kit for Friday';
  insert into _r values ('05 PENDING parent reads squad notice',
    case when _n = 0 then 'NO - pass' else 'YES - FAIL' end);
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000d","role":"authenticated"}';
do $$
declare _n int;
begin
  select count(*) into _n from announcements where title = 'Kit for Friday';
  insert into _r values ('06 OTHER-squad parent reads notice',
    case when _n = 0 then 'NO - pass' else 'YES - FAIL' end);
end $$;

-- ── 7-9. What the numbers mean ────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
do $$
declare _aud int; _seen int; _rows int; _first text;
begin
  select audience_count, seen_count into _aud, _seen
    from announcement_stats() s
    join announcements a on a.id = s.announcement_id
   where a.title = 'Kit for Friday';

  -- The coach and the two-child parent. NOT three.
  insert into _r values ('07 audience dedupes two-child parent (expect 2)',
    case when _aud = 2 then '2 - pass' else coalesce(_aud::text,'null') || ' - FAIL' end);
  insert into _r values ('08 seen_count (expect 1)',
    case when _seen = 1 then '1 - pass' else coalesce(_seen::text,'null') || ' - FAIL' end);

  select count(*) into _rows from announcement_audience(
    (select id from announcements where title = 'Kit for Friday'));
  insert into _r values ('09 audience rows (expect 2)',
    case when _rows = 2 then '2 - pass' else _rows::text || ' - FAIL' end);

  -- Unread first — the whole point of the receipts screen is the people who
  -- have NOT seen it. The coach has not read their own notice; the parent has.
  select full_name into _first from announcement_audience(
    (select id from announcements where title = 'Kit for Friday')) limit 1;
  insert into _r values ('09b unread listed first (expect AAA Test Coach)',
    case when _first = 'AAA Test Coach' then 'coach - pass' else coalesce(nullif(_first,''),'(blank)') || ' - FAIL' end);
end $$;

-- ── 10-11. What an author may change ──────────────────────────────────────
do $$
begin
  update announcements set team_id = null where title = 'Kit for Friday';
  insert into _r values ('10 author re-scopes squad notice club-wide', 'ALLOWED - FAIL');
exception when others then
  insert into _r values ('10 author re-scopes squad notice club-wide', 'REFUSED - pass');
end $$;

-- The control for step 10: editing must still WORK.
do $$
begin
  update announcements set title = 'Kit for Friday v2' where title = 'Kit for Friday';
  insert into _r values ('11 author edits own title', 'ALLOWED - pass');
exception when others then
  insert into _r values ('11 author edits own title', 'REFUSED - FAIL ' || sqlerrm);
end $$;

-- ── 12-13. What an ordinary member may not do ─────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
do $$
declare _n int;
begin
  -- SECURITY DEFINER bypasses RLS, so the function's own WHERE clause is the
  -- only gate on the club's entire notice history. This is that gate.
  select count(*) into _n from announcement_stats();
  insert into _r values ('12 ordinary parent gets stats rows (expect 0)',
    case when _n = 0 then '0 - pass' else _n::text || ' - FAIL' end);
end $$;

do $$
begin
  delete from announcements where title like 'Kit for Friday%';
  if found then
    insert into _r values ('13 parent deletes someone elses notice', 'DELETED - FAIL');
  else
    insert into _r values ('13 parent deletes someone elses notice', 'NO ROWS - pass');
  end if;
end $$;

reset role;
select * from _r order by step;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails. `npm run db:check` throws on a SQL ERROR and nothing else.
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
--  ⚠️ PROVE THE HARNESS CAN FAIL — do this once, and record that you did
-- ══════════════════════════════════════════════════════════════════════════
--
-- CLAUDE.md rule 6. Three injections, each aimed at a different assertion.
-- Run each inside its own transaction you will roll back.
--
-- A. THE COUNT. Replace `count(distinct m.profile_id)` with `count(*)` in
--    public.announcement_stats, then re-run steps 1-8.
--    EXPECTED: step 7 flips to "3 - FAIL" (the two-child parent counted twice)
--    and step 8 stays green. ⚠️ If step 7 stays at 2, the fixture's second
--    membership row was rejected — check `memberships_unique_grant` and that
--    the two `player_id` values really differ, because without that this
--    harness is asserting nothing about deduplication at all.
--
-- B. THE PENDING GATE. Replace `private.can_see_team(team_id)` with
--    `private.is_attached_to_team(team_id)` in "announcement read", then re-run
--    steps 4-6.
--    EXPECTED: step 5 flips to "YES - FAIL", steps 4 and 6 stay green.
--
-- C. THE COLUMN GRANT. `grant update (team_id) on public.announcements to
--    authenticated;` then re-run steps 10-11.
--    EXPECTED: step 10 flips to "ALLOWED - FAIL" and step 11 stays green.
--    ⚠️ This is the injection worth doing even if you skip the others — the
--    grant is the whole enforcement and the policy looks like it covers this.
--
-- ⚠️ IF ANY INJECTION LEAVES EVERY STEP GREEN, the harness is not testing what
-- it claims — most likely `set local role authenticated` was lost by a `reset
-- role` earlier in your paste, so everything ran as `postgres` with RLS
-- bypassed. Fix the harness before believing the schema.
