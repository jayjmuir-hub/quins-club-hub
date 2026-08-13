-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — pitch requests: who may ask, who may answer, who may see
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE ONE THAT MATTERS: A COACH MUST NOT BE ABLE TO ANSWER THEIR OWN
-- REQUEST. That is the entire point of there being a request rather than a
-- pitch field they fill in themselves. It is enforced by the UPDATE policy
-- being `is_admin`, not `can_edit_team` — and `can_edit_team` is what lets
-- them CREATE the request, so the two look similar and are not.
--
-- ⚠️ AND THE REQUESTER MUST SEE THE OUTCOME. Jay asked for the request to be
-- trackable from submission to assignment "by also the coach or manager
-- submitting it". A read policy limited to admins would make the submitter's
-- dashboard impossible and turn the feature into a black hole with an email at
-- the end. The `requested_by = auth.uid()` arm of the read policy is that
-- requirement, and this harness is what stops it being "simplified" away.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing.
--
-- ⚠️ REPLACE THE ADMIN uuid BELOW if the club's admin changes. It is a PROFILE
-- id, not a membership id — an early version of this harness used a membership
-- id as the JWT subject and the admin appeared to have no access at all, which
-- looked exactly like a broken policy.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- Two coaches on DIFFERENT squads, so "can another coach see it?" is a real
-- question rather than one answered by them sharing a team.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-00000000c001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('c0000000-0000-4000-8000-00000000c002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','othercoach@example.invalid', now(), '{}'::jsonb, now(), now());

insert into profiles (id, full_name, email) values
 ('c0000000-0000-4000-8000-00000000c001','Coach A','coach@example.invalid'),
 ('c0000000-0000-4000-8000-00000000c002','Coach B','othercoach@example.invalid')
on conflict (id) do nothing;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000c001', club_id, id, 'coach','active'
from teams order by sort_order limit 1;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000c002', club_id, id, 'coach','active'
from teams order by sort_order offset 1 limit 1;

insert into events (id, club_id, team_id, type, title, starts_at, pitch)
select 'eee00000-0000-4000-8000-0000000000e1', club_id, id, 'match','HARNESS match',
       now() + interval '7 days', 'Pitch TBD'
from teams order by sort_order limit 1;

-- ── The requesting coach ──────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000c001","role":"authenticated"}';

do $$ begin
  insert into pitch_requests (event_id, requested_by, needs_referee, note)
  values ('eee00000-0000-4000-8000-0000000000e1','c0000000-0000-4000-8000-00000000c001', true, 'early KO please');
  insert into _r values ('coach requests for own squad','PASS');
exception when others then insert into _r values ('coach requests for own squad','FAIL '||sqlstate); end $$;

-- ⚠️ Filing in someone else's name would let a coach plant a request the read
-- policy then HIDES from them and SHOWS to a stranger.
do $$ begin
  insert into pitch_requests (event_id, requested_by)
  values ('eee00000-0000-4000-8000-0000000000e1','c0000000-0000-4000-8000-00000000c002');
  insert into _r values ('files in another persons name','FAIL — allowed');
exception when others then insert into _r values ('files in another persons name','PASS — refused '||sqlstate); end $$;

-- ⚠️ THE HEADLINE. A coach answering their own request defeats the feature.
do $$ declare n int; begin
  update pitch_requests set status='allocated' where event_id='eee00000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  insert into _r values ('coach ANSWERS OWN request',
    case when n=0 then 'PASS — filtered to zero rows' else 'FAIL — allowed' end);
exception when others then insert into _r values ('coach ANSWERS OWN request','PASS — refused '||sqlstate); end $$;

insert into _r values ('requester sees own (expect 1)', (select count(*)::text from pitch_requests));

-- ── A coach of a different squad ──────────────────────────────────────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000c002","role":"authenticated"}';
insert into _r values ('other squads coach sees it (expect 0)', (select count(*)::text from pitch_requests));

-- ── The admin ─────────────────────────────────────────────────────────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';

insert into _r values ('admin sees it (expect 1)', (select count(*)::text from pitch_requests));
do $$ declare n int; begin
  update pitch_requests set status='allocated', decided_at=now()
   where event_id='eee00000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  insert into _r values ('admin allocates', case when n=1 then 'PASS' else 'FAIL — zero rows' end);
exception when others then insert into _r values ('admin allocates','FAIL '||sqlstate); end $$;

-- ── Back to the requester: the tracking Jay asked for ─────────────────────
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000c001","role":"authenticated"}';

insert into _r values ('requester sees the OUTCOME', (select status from pitch_requests limit 1));

-- Withdrawing is only for an UNDECIDED request; the DELETE policy carries
-- `status = 'submitted'` so this must now be refused.
do $$ declare n int; begin
  delete from pitch_requests where event_id='eee00000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  insert into _r values ('requester withdraws AFTER a decision',
    case when n=0 then 'PASS — refused' else 'FAIL — deleted a decided request' end);
exception when others then insert into _r values ('requester withdraws AFTER a decision','PASS — refused '||sqlstate); end $$;

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
--  EXPECTED — measured live 11 Aug 2026
--    coach requests for own squad             PASS
--    files in another persons name            PASS — refused 42501
--    coach ANSWERS OWN request                PASS — filtered to zero rows
--    requester sees own (expect 1)            1
--    other squads coach sees it (expect 0)    0
--    admin sees it (expect 1)                 1
--    admin allocates                          PASS
--    requester sees the OUTCOME               allocated
--    requester withdraws AFTER a decision     PASS — refused
--
--  ⚠️ "admin allocates" and "requester sees the OUTCOME" are the two that
--  prove the assertions can move at all. A build that refused EVERYONE would
--  pass every line above them.
-- ══════════════════════════════════════════════════════════════════════════
