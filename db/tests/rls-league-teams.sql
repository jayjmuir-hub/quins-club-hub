-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — league_teams: who may name the club's competing teams
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE ONE THAT MATTERS: A COACH MUST NOT BE ABLE TO WRITE THIS TABLE.
-- `rcm_name` is the field that tells Rugby Club Management whose result a match
-- sheet is. If a coach can rename a league team, they can file a result against
-- another team's name — and the club would find out from the league table, not
-- from the app. Writes are `private.is_admin`, reads are any signed-in member.
--
-- ⚠️ READS ARE DELIBERATELY WIDE. A coach filling a match sheet has to pick
-- their league team, so `league team read` is `auth.uid() is not null` rather
-- than a membership check. There is nothing sensitive here: it is the club's
-- own team names, which the opposition already knows.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing.
--
-- ⚠️ THE JWT SUBJECT IS A PROFILE id, NOT A MEMBERSHIP id. An early version of
-- the pitch-request harness used a membership id and the admin appeared to have
-- no access at all, which looks exactly like a broken policy.

begin;

create temporary table _r(step text, outcome text) on commit drop;
-- ⚠️ `anon` TOO, and this is not tidiness. The first run of this harness
-- granted only `authenticated` and died at the last step with
-- "permission denied for table _r" — which reads exactly like an RLS failure
-- on league_teams and is nothing of the kind. A harness that cannot record its
-- own result reports a policy bug that does not exist.
grant insert, select on _r to authenticated, anon;

-- A coach and an admin, both synthetic, so this harness depends on no real
-- person and keeps working after the club's admins change.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-00000000d001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lt-coach@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('c0000000-0000-4000-8000-00000000d002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lt-admin@example.invalid', now(), '{}'::jsonb, now(), now());

insert into profiles (id, full_name, email) values
 ('c0000000-0000-4000-8000-00000000d001','LT Coach','lt-coach@example.invalid'),
 ('c0000000-0000-4000-8000-00000000d002','LT Admin','lt-admin@example.invalid')
on conflict (id) do nothing;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000d001', club_id, id, 'coach','active'
from teams order by sort_order limit 1;

insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000d002', club_id, null, 'admin','active'
from teams order by sort_order limit 1;

-- A league team to read, created as postgres so the read tests have a subject
-- that exists regardless of whether the write tests pass.
insert into league_teams (id, club_id, team_id, rcm_name, division)
select 'a1100000-0000-4000-8000-0000000000a1', club_id, id, 'HARNESS-ADHQ9', 'C'
from teams order by sort_order limit 1;

-- ── The coach: may READ, may NOT write ────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d001","role":"authenticated"}';

insert into _r
select 'coach reads the league team',
       case when count(*) = 1 then 'PASS' else 'FAIL — a coach cannot see the team they must pick on a match sheet' end
from league_teams where id = 'a1100000-0000-4000-8000-0000000000a1';

do $$
begin
  begin
    insert into league_teams (club_id, team_id, rcm_name)
    select club_id, id, 'HARNESS-SHOULD-NOT-EXIST' from teams order by sort_order limit 1;
    insert into _r values ('coach INSERT refused', 'FAIL — a coach created a league team');
  exception
    -- ⚠️ THE ERRCODE IS ASSERTED, NOT JUST THE FAILURE. A refusal caused by a
    -- mistyped table name, a null violation or a missing grant would otherwise
    -- read as "RLS works". 42501 is insufficient_privilege — the policy.
    when insufficient_privilege then
      insert into _r values ('coach INSERT refused', 'PASS');
    when others then
      insert into _r values ('coach INSERT refused',
        'FAIL — refused, but by ' || sqlstate || ' (' || sqlerrm || '), not by RLS');
  end;
end $$;

do $$
begin
  begin
    update league_teams set rcm_name = 'HARNESS-RENAMED'
    where id = 'a1100000-0000-4000-8000-0000000000a1';
    if found then
      insert into _r values ('coach UPDATE refused', 'FAIL — a coach renamed a league team');
    else
      -- ⚠️ RLS filters an UPDATE to zero rows rather than raising. "Changed
      -- nothing" IS the refusal here, and it is why this branch exists.
      insert into _r values ('coach UPDATE refused', 'PASS (matched no rows)');
    end if;
  exception when insufficient_privilege then
    insert into _r values ('coach UPDATE refused', 'PASS (raised 42501)');
  end;
end $$;

-- ── The admin: may write ──────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d002","role":"authenticated"}';

do $$
begin
  begin
    insert into league_teams (club_id, team_id, rcm_name, division)
    select club_id, id, 'HARNESS-ADMIN-MADE-THIS', 'A' from teams order by sort_order limit 1;
    insert into _r values ('admin INSERT allowed', 'PASS');
  exception when others then
    insert into _r values ('admin INSERT allowed',
      'FAIL — the admin was refused: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- ── anon: may not read ────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '';

insert into _r
select 'anon reads nothing',
       case when count(*) = 0 then 'PASS' else 'FAIL — anon read the club''s league teams' end
from league_teams;

reset role;
select * from _r order by step;

rollback;
