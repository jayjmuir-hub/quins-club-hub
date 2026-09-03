-- Harness for db/migrations/20260904_admin_team_reach.sql — THE ADMIN SPLIT.
-- Run with `npm run db:check -- admin-team-reach`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- WHAT IT GUARDS. An admin row reaches no squad by itself. One persona per
-- admin right plus a ZERO-RIGHTS admin, a super, and a coach as the
-- unchanged control. Six probes each, at the table (RLS enforced, not the
-- menu):
--     players    — can they read the squad's player?           (can_see_team)
--     events     — can they read the squad's fixture?         (is_attached_to_team)
--     event_edit — can they change it?                        (event edit: edit ∪ events arm)
--     attendance — can they take the register?                (can_take_register)
--     squad_msgs — can they read the squad chat?              (can_see_team)
--     staff_msgs — can they read the staff chat?              (can_edit_team)
--
--  0. BASELINE, before the migration: the zero-rights admin reads the player
--     and the staff chat — proving the probes can see, and that it is the
--     migration, not the fixture, that closes the door
--  1. after the migration, every persona matches the matrix below exactly
--  2. ⚠️ the zero-rights admin reads 0 players but still reads the TEAMS
--     table — the control that the session is alive and RLS is on
--  3. the coach is unchanged in every probe (no legitimate staff loses access)
--  4. FAULT: drop 'training' from the attendance allowlist → the Training
--     persona's attendance probe flips to refused — the assertion is live
--
-- Expected after the migration (1 = allowed, 0 = refused):
--   persona     players events event_edit attendance squad_msgs staff_msgs
--   super          1      1        1          1          1          1
--   clubadmin      1      1        1          1          1          1
--   youth          1      1        1          1          1          1
--   media          1      1        1          0          1          0
--   pitches        1      1        1          0          1          0
--   training       1      1        0          1          1          0
--   welfare        1      1        0          0          1          0
--   zero           0      0        0          0          0          0
--   coach          1      1        1          1          1          1
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-000000000200','ZZ Reachprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select ('f0000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'zz-reach-' || n || '@example.invalid', now(), '{}'::jsonb, now(), now()
  from generate_series(10, 19) n;

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000201','f0000000-0000-4000-8000-000000000200','U14 ZZ Reachprobe', 1401);

-- personas: 10 super · 11 clubadmin · 12 youth · 13 media · 14 welfare ·
--           15 pitches · 16 training · 17 ZERO-RIGHTS admin · 18 coach · 19 spare
insert into memberships (profile_id, club_id, team_id, role, status, is_super, admin_rights) values
 ('f0000000-0000-4000-8000-000000000210','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', true,  array[]::text[]),
 ('f0000000-0000-4000-8000-000000000211','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['clubadmin']),
 ('f0000000-0000-4000-8000-000000000212','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['youth']),
 ('f0000000-0000-4000-8000-000000000213','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['media']),
 ('f0000000-0000-4000-8000-000000000214','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['welfare']),
 ('f0000000-0000-4000-8000-000000000215','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['pitches']),
 ('f0000000-0000-4000-8000-000000000216','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array['training']),
 ('f0000000-0000-4000-8000-000000000217','f0000000-0000-4000-8000-000000000200', null, 'admin', 'active', false, array[]::text[]),
 ('f0000000-0000-4000-8000-000000000218','f0000000-0000-4000-8000-000000000200','f0000000-0000-4000-8000-000000000201', 'coach', 'active', false, array[]::text[]);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-000000000202','f0000000-0000-4000-8000-000000000200','f0000000-0000-4000-8000-000000000201','ZZ Probe Player');

insert into events (id, club_id, team_id, type, starts_at) values
 ('f0000000-0000-4000-8000-000000000203','f0000000-0000-4000-8000-000000000200','f0000000-0000-4000-8000-000000000201','training', now() - interval '1 day');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- The coach writes one squad message and one staff message (the provenance
-- trigger stamps the author from auth.uid(), so these must be written AS the
-- coach, not as the owner).
select pg_temp.as_user('f0000000-0000-4000-8000-000000000218');
insert into messages (club_id, team_id, channel, body) values
 ('f0000000-0000-4000-8000-000000000200','f0000000-0000-4000-8000-000000000201','squad','zz squad probe'),
 ('f0000000-0000-4000-8000-000000000200','f0000000-0000-4000-8000-000000000201','staff','zz staff probe');
reset role;

-- Six probes, as one persona. Writes are attempted inside a savepoint-free
-- BEGIN/EXCEPTION block so a refusal is an answer, not an abort; a write that
-- RLS silently filters (UPDATE touching 0 rows) is read off the row count.
create function pg_temp.probe(_pid uuid)
returns table(players int, events int, event_edit int, attendance int, squad_msgs int, staff_msgs int)
language plpgsql as $fn$
declare
  n int;
  team constant uuid := 'f0000000-0000-4000-8000-000000000201';
  ev   constant uuid := 'f0000000-0000-4000-8000-000000000203';
  pl   constant uuid := 'f0000000-0000-4000-8000-000000000202';
begin
  perform pg_temp.as_user(_pid::text);
  select count(*) into players from public.players p where p.team_id = team;
  select count(*) into events  from public.events e where e.id = ev;
  begin
    update public.events e set notes = 'zz edited' where e.id = ev;
    get diagnostics n = row_count;
    event_edit := n;
  exception when insufficient_privilege then event_edit := 0;
  end;
  begin
    insert into public.attendance (event_id, player_id, status) values (ev, pl, 'present');
    attendance := 1;
    delete from public.attendance a where a.event_id = ev and a.player_id = pl;
  exception when insufficient_privilege or check_violation then attendance := 0;
  end;
  select count(*) into squad_msgs from public.messages x where x.team_id = team and x.channel = 'squad';
  select count(*) into staff_msgs from public.messages x where x.team_id = team and x.channel = 'staff';
  reset role;
  return next;
end $fn$;

create function pg_temp.probe_line(_label text, _pid uuid) returns text language sql as $$
  select _label || ': ' || p.players || ' ' || p.events || ' ' || p.event_edit || ' ' || p.attendance || ' ' || p.squad_msgs || ' ' || p.staff_msgs
    from pg_temp.probe(_pid) p;
$$;

-- ── 0: BASELINE, before the migration ────────────────────────────────────────
do $b$
declare r record;
begin
  select * into r from pg_temp.probe('f0000000-0000-4000-8000-000000000217');
  if r.players <> 1 or r.staff_msgs <> 1 then
    raise exception 'ASSERT 0 FAILED: before the migration the zero-rights admin should read the player and the staff chat (got % %) — the probe cannot see, so nothing below would prove anything', r.players, r.staff_msgs;
  end if;
  insert into _log(line) values ('0 baseline: zero-rights admin reads player=' || r.players || ' staff_msgs=' || r.staff_msgs || ' BEFORE the migration');
end $b$;

-- ── migration under test: db/migrations/20260904_admin_team_reach.sql,
--    verbatim (begin/commit stripped) ────────────────────────────────────────

create or replace function private.admin_team_reach(_team uuid, _mode text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role = 'admin'
       and m.club_id = (select club_id from teams where id = _team)
       and (m.is_super
            or m.admin_rights && case _mode
                 when 'edit'       then array['clubadmin','youth']
                 when 'see'        then array['clubadmin','youth','media','welfare','pitches','training']
                 when 'events'     then array['clubadmin','youth','media','pitches']
                 when 'attendance' then array['clubadmin','youth','training']
                 else array[]::text[]
               end));
$function$;

revoke all on function private.admin_team_reach(uuid, text) from public;
revoke execute on function private.admin_team_reach(uuid, text) from anon;
grant execute on function private.admin_team_reach(uuid, text) to authenticated;

create or replace function private.can_edit_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'edit')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status = 'active'
             and m.role in ('coach','manager','medic')
             and m.team_id = _team);
$function$;

create or replace function private.can_see_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'see')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status = 'active'
             and m.team_id = _team);
$function$;

create or replace function private.is_attached_to_team(_team uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.admin_team_reach(_team, 'see')
      or exists (select 1 from memberships m
           where m.profile_id = auth.uid()
             and m.status <> 'left'
             and m.team_id = _team);
$function$;

drop policy "event edit" on public.events;
create policy "event edit" on public.events
  for all
  using (private.can_edit_team(team_id)
         or private.admin_team_reach(team_id, 'events')
         or (team_id is null and private.is_admin(club_id)))
  with check (private.can_edit_team(team_id)
         or private.admin_team_reach(team_id, 'events')
         or (team_id is null and private.is_admin(club_id)));

create or replace function private.can_take_register(_event uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select private.can_edit_team(e.team_id)
      or private.admin_team_reach(e.team_id, 'attendance')
    from events e where e.id = _event;
$function$;

revoke all on function private.can_take_register(uuid) from public;
revoke execute on function private.can_take_register(uuid) from anon;
grant execute on function private.can_take_register(uuid) to authenticated;

drop policy "attendance read" on public.attendance;
create policy "attendance read" on public.attendance
  for select using (private.can_take_register(event_id) or private.is_own_player(player_id));

drop policy "attendance write insert" on public.attendance;
create policy "attendance write insert" on public.attendance
  for insert with check (private.can_take_register(event_id));

drop policy "attendance write update" on public.attendance;
create policy "attendance write update" on public.attendance
  for update using (private.can_take_register(event_id))
  with check (private.can_take_register(event_id));

drop policy "attendance write delete" on public.attendance;
create policy "attendance write delete" on public.attendance
  for delete using (private.can_take_register(event_id));

-- ── assertions ───────────────────────────────────────────────────────────

create function pg_temp.assert_reach() returns void language plpgsql as $fn$
declare
  expected constant text[] := array[
    'super: 1 1 1 1 1 1',
    'clubadmin: 1 1 1 1 1 1',
    'youth: 1 1 1 1 1 1',
    'media: 1 1 1 0 1 0',
    'pitches: 1 1 1 0 1 0',
    'training: 1 1 0 1 1 0',
    'welfare: 1 1 0 0 1 0',
    'zero: 0 0 0 0 0 0',
    'coach: 1 1 1 1 1 1'
  ];
  pids constant uuid[] := array[
    'f0000000-0000-4000-8000-000000000210','f0000000-0000-4000-8000-000000000211',
    'f0000000-0000-4000-8000-000000000212','f0000000-0000-4000-8000-000000000213',
    'f0000000-0000-4000-8000-000000000215','f0000000-0000-4000-8000-000000000216',
    'f0000000-0000-4000-8000-000000000214','f0000000-0000-4000-8000-000000000217',
    'f0000000-0000-4000-8000-000000000218'];
  labels constant text[] := array['super','clubadmin','youth','media','pitches','training','welfare','zero','coach'];
  got text; n int; i int;
begin
  -- 1: every persona matches the matrix
  for i in 1..array_length(pids,1) loop
    got := pg_temp.probe_line(labels[i], pids[i]);
    if got <> expected[i] then
      raise exception 'ASSERT 1 FAILED: % (wanted %)', got, expected[i];
    end if;
    insert into _log(line) values ('1 ' || got);
  end loop;

  -- 2: the zero-rights admin still reads the teams table — the session is alive
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000217');
  select count(*) into n from public.teams t where t.id = 'f0000000-0000-4000-8000-000000000201';
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: zero-rights admin reads % teams rows — the 0s above are not RLS, the session is dead', n; end if;
  insert into _log(line) values ('2 control: zero-rights admin still reads the teams table (' || n || ')');

  -- 3: the coach is unchanged (row 9 above) — recorded as its own line
  insert into _log(line) values ('3 coach unchanged: every probe allowed');
end $fn$;

select pg_temp.assert_reach();

-- ── 4: FAULT — drop 'training' from the attendance allowlist; Training must lose the register
create or replace function private.admin_team_reach(_team uuid, _mode text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role = 'admin'
       and m.club_id = (select club_id from teams where id = _team)
       and (m.is_super
            or m.admin_rights && case _mode
                 when 'edit'       then array['clubadmin','youth']
                 when 'see'        then array['clubadmin','youth','media','welfare','pitches','training']
                 when 'events'     then array['clubadmin','youth','media','pitches']
                 when 'attendance' then array['clubadmin','youth']
                 else array[]::text[]
               end));
$function$;

do $f$
declare got text;
begin
  got := pg_temp.probe_line('training', 'f0000000-0000-4000-8000-000000000216');
  if got <> 'training: 1 1 0 0 1 0' then
    raise exception 'ASSERT 4 FAILED: with training dropped from the attendance list the probe should read "training: 1 1 0 0 1 0", got "%"', got;
  end if;
  insert into _log(line) values ('4 fault: dropping training from the attendance allowlist flips the register to refused (' || got || ')');
end $f$;

select line from _log order by seq;
rollback;
