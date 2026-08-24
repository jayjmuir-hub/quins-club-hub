-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — pitch_occupancy: the redacted club-wide booking read
--  Paste into the Supabase SQL editor, or `npm run db:check -- pitch`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS
--  BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE ONE THAT MATTERS: the CONTROL. `event read` scopes the events table
-- to squads the reader is attached to, and this harness proves the coach
-- CANNOT read the probe event from the table while the function hands them
-- its redacted occupancy row. If the control ever fails, the function has
-- stopped being the only path and this feature needs re-arguing, not fixing.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing.
--
-- Ran green inside a rolled-back transaction against production on
-- 22 Aug 2026, BEFORE the migration was applied — the create-or-replace at
-- the top makes this file self-sufficient either way.

begin;

-- Self-sufficient: (re)create the function exactly as the migration does, so
-- the harness also serves as a pre-application rehearsal.
create or replace function public.pitch_occupancy(_from timestamptz, _to timestamptz)
returns table (id uuid, team_id uuid, team_name text, type text, starts_at timestamptz, ends_at timestamptz, pitch text, group_id uuid)
language sql stable security definer set search_path to 'public'
as $$
  select e.id, e.team_id, t.name, e.type, e.starts_at, e.ends_at, e.pitch, e.group_id
  from events e join teams t on t.id = e.team_id
  where e.starts_at >= _from and e.starts_at < _to
    and exists (select 1 from memberships m
      where m.profile_id = auth.uid() and m.status = 'active'
        and (m.role = 'admin' or (m.role in ('coach','manager','medic') and m.team_id is not null)));
$$;
revoke execute on function public.pitch_occupancy(timestamptz, timestamptz) from public;
revoke execute on function public.pitch_occupancy(timestamptz, timestamptz) from anon;
grant execute on function public.pitch_occupancy(timestamptz, timestamptz) to authenticated;

create temporary table _r(step text, outcome text) on commit drop;
grant select, insert on _r to authenticated;

-- Invented people — this repo is public.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pocoach@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('c0000000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','poparent@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values
 ('c0000000-0000-4000-8000-0000000000a1','Harness Coach','pocoach@example.invalid'),
 ('c0000000-0000-4000-8000-0000000000a2','Harness Parent','poparent@example.invalid')
on conflict (id) do nothing;

-- The parent role's membership needs a player (memberships_family_role_needs_player).
insert into players (id, club_id, team_id, full_name)
select 'aaee0000-0000-4000-8000-0000000000d1'::uuid, club_id, id, 'Harness Child' from teams order by sort_order limit 1;

-- Coach on the FIRST squad; the probe event sits on the SECOND — so "can they
-- see another squad's booking" is a real question.
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-0000000000a1', club_id, id, 'coach','active' from teams order by sort_order limit 1;
insert into memberships (profile_id, club_id, team_id, role, status, player_id)
select 'c0000000-0000-4000-8000-0000000000a2', club_id, id, 'parent','active', 'aaee0000-0000-4000-8000-0000000000d1'::uuid from teams order by sort_order limit 1;

insert into events (id, club_id, team_id, type, title, opponent, starts_at, ends_at, pitch)
select 'eee00000-0000-4000-8000-0000000000f1', club_id, id, 'match', 'HARNESS secret title', 'HARNESS secret opponent',
       now() + interval '3 days', now() + interval '3 days 90 minutes', 'D2'
from teams order by sort_order offset 1 limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into _r select 'coach sees other squad''s booking via the function',
  case when exists (select 1 from public.pitch_occupancy(now(), now() + interval '7 days') where pitch = 'D2' and id = 'eee00000-0000-4000-8000-0000000000f1') then 'PASS' else 'FAIL' end;

insert into _r select 'control: coach CANNOT read that event from the table',
  case when not exists (select 1 from events where id = 'eee00000-0000-4000-8000-0000000000f1') then 'PASS' else 'FAIL' end;

set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
insert into _r select 'a parent gets zero rows from the function',
  case when not exists (select 1 from public.pitch_occupancy(now(), now() + interval '7 days')) then 'PASS' else 'FAIL' end;

reset role;
select * from _r;

-- ⚠️ THE RUNNER ONLY FAILS ON A THROWN ERROR. A FAIL row in _r prints and
-- carries on — this gate is what turns it into a red run. Without it,
-- db-check REFUSES the whole suite ("cannot FAIL"), which is how this file
-- silently broke the nightly from 22 Aug 2026 until this block was added.
do $$
declare bad text;
begin
  select string_agg(step, '; ') into bad from _r where outcome <> 'PASS';
  if bad is not null then
    raise exception 'pitch-occupancy: FAILED — %', bad;
  end if;
end $$;

rollback;
