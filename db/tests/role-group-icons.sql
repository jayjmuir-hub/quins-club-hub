-- Harness for db/migrations/20260909_role_group_icons.sql — AN ICON FOR A ROLE.
-- Run with `npm run db:check -- role-group-icons`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- WHAT IT GUARDS. A profile_icons row with `role` set decorates everyone
-- holding that role in the club — dynamically, like a squad grant.
--
--  1. a 'manager' grant reaches the manager in club_icon_map, and NOT the
--     coach, the head coach or the parent (the controls)
--  2. a 'headcoach' grant reaches the head coach and NOT the plain coach
--  3. member_icons lists the manager's grant with the group label
--  4. a row with role AND team_id is refused — one target, still
--  5. a row with an unknown role is refused
--  6. FAULT: the manager's membership goes 'left' → the icon leaves them,
--     while the head coach keeps theirs (the grant is dynamic, not copied)
--  7. a parent's role-grant attempt is refused (the existing policy holds
--     for the new column too), the control being the super's grant in 1
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-000000000400','ZZ Roleprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select ('f0000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'zz-roleicon-' || n || '@example.invalid', now(), '{}'::jsonb, now(), now()
  from generate_series(10, 14) n;

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000401','f0000000-0000-4000-8000-000000000400','U11 ZZ Roleprobe', 1101);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-000000000420','f0000000-0000-4000-8000-000000000400','f0000000-0000-4000-8000-000000000401','ZZ Roleprobe Child');

-- personas: 10 super · 11 coach · 12 HEAD coach · 13 manager · 14 parent
insert into memberships (id, profile_id, club_id, team_id, player_id, role, status, is_super, is_head_coach) values
 ('f0000000-0000-4000-8000-000000000430','f0000000-0000-4000-8000-000000000410','f0000000-0000-4000-8000-000000000400', null, null, 'admin','active', true, false),
 ('f0000000-0000-4000-8000-000000000431','f0000000-0000-4000-8000-000000000411','f0000000-0000-4000-8000-000000000400','f0000000-0000-4000-8000-000000000401', null, 'coach','active', false, false),
 ('f0000000-0000-4000-8000-000000000432','f0000000-0000-4000-8000-000000000412','f0000000-0000-4000-8000-000000000400','f0000000-0000-4000-8000-000000000401', null, 'coach','active', false, true),
 ('f0000000-0000-4000-8000-000000000433','f0000000-0000-4000-8000-000000000413','f0000000-0000-4000-8000-000000000400','f0000000-0000-4000-8000-000000000401', null, 'manager','active', false, false),
 ('f0000000-0000-4000-8000-000000000434','f0000000-0000-4000-8000-000000000414','f0000000-0000-4000-8000-000000000400','f0000000-0000-4000-8000-000000000401','f0000000-0000-4000-8000-000000000420','parent','active', false, false);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260909_role_group_icons.sql,
--    verbatim (begin/commit stripped) ────────────────────────────────────────

alter table public.profile_icons
  add column if not exists role text
    check (role is null or role in ('coach','headcoach','manager','medic','admin'));

comment on column public.profile_icons.role is
  'A grant to everyone holding this role in the club (dynamic, like a squad grant). headcoach = a coach with is_head_coach.';

alter table public.profile_icons drop constraint if exists profile_icons_one_target;
alter table public.profile_icons add constraint profile_icons_one_target
  check ((profile_id is not null)::int + (team_id is not null)::int + (role is not null)::int = 1);

create or replace function private.icon_role_matches(_role text, _m public.memberships)
returns boolean
language sql
immutable
as $function$
  select _m.status = 'active' and case _role
    when 'coach'     then _m.role = 'coach'
    when 'headcoach' then _m.role = 'coach' and _m.is_head_coach
    when 'manager'   then _m.role = 'manager'
    when 'medic'     then _m.role = 'medic'
    when 'admin'     then _m.role = 'admin'
    else false end;
$function$;

create or replace function private.icon_role_label(_role text)
returns text
language sql
immutable
as $function$
  select case _role
    when 'coach'     then 'Every coach'
    when 'headcoach' then 'Every head coach'
    when 'manager'   then 'Every manager'
    when 'medic'     then 'Every medic'
    when 'admin'     then 'Every club admin'
    else _role end;
$function$;

create or replace function public.club_icon_map()
returns table (profile_id uuid, icon text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_club as (
    select m.club_id from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
     order by m.created_at limit 1
  ),
  worn as (
    select i.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i join my_club c on c.club_id = i.club_id
     where i.profile_id is not null
    union all
    select m.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i
      join my_club c on c.club_id = i.club_id
      join memberships m on m.team_id = i.team_id and m.status = 'active'
       and m.role in ('coach','manager','medic')
     where i.team_id is not null
    union all
    select m.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i
      join my_club c on c.club_id = i.club_id
      join memberships m on m.club_id = i.club_id and private.icon_role_matches(i.role, m)
     where i.role is not null
  )
  select distinct on (w.profile_id) w.profile_id, w.icon
    from worn w
   order by w.profile_id, w.is_primary desc, w.created_at desc;
$function$;

create or replace function public.member_icons(_profile uuid)
returns table (id uuid, icon text, reason text, is_primary boolean,
               team_name text, created_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_club as (
    select m.club_id from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
     order by m.created_at limit 1
  )
  select i.id, i.icon, i.reason, i.is_primary, null::text, i.created_at
    from profile_icons i join my_club c on c.club_id = i.club_id
   where i.profile_id = _profile
  union all
  select i.id, i.icon, i.reason, i.is_primary, t.name, i.created_at
    from profile_icons i
    join my_club c on c.club_id = i.club_id
    join teams t on t.id = i.team_id
   where i.team_id is not null
     and exists (select 1 from memberships m
        where m.profile_id = _profile and m.team_id = i.team_id
          and m.status = 'active' and m.role in ('coach','manager','medic'))
  union all
  select i.id, i.icon, i.reason, i.is_primary, private.icon_role_label(i.role), i.created_at
    from profile_icons i
    join my_club c on c.club_id = i.club_id
   where i.role is not null
     and exists (select 1 from memberships m
        where m.profile_id = _profile and m.club_id = i.club_id
          and private.icon_role_matches(i.role, m))
   order by is_primary desc, created_at desc;
$function$;

-- ── end of migration ─────────────────────────────────────────────────────────

-- What the club sees, read AS the super (an active member of the club).
create function pg_temp.worn(_pid uuid) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
  select icon into v from public.club_icon_map() where profile_id = _pid;
  reset role;
  return v;
end $$;

-- ── 1: a manager grant reaches the manager and nobody else ──────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
insert into profile_icons (club_id, role, icon, reason) values
 ('f0000000-0000-4000-8000-000000000400','manager','clipboard','Zz runs the show');
reset role;
do $a$
begin
  if pg_temp.worn('f0000000-0000-4000-8000-000000000413') is distinct from 'clipboard' then
    raise exception 'ASSERT 1 FAILED: the manager should wear the clipboard, got %', pg_temp.worn('f0000000-0000-4000-8000-000000000413');
  end if;
  if pg_temp.worn('f0000000-0000-4000-8000-000000000411') is not null
     or pg_temp.worn('f0000000-0000-4000-8000-000000000412') is not null
     or pg_temp.worn('f0000000-0000-4000-8000-000000000414') is not null then
    raise exception 'ASSERT 1 FAILED: the coach, head coach and parent must wear nothing';
  end if;
  insert into _log(line) values ('1 role grant: the manager wears the clipboard; coach, head coach and parent wear nothing');
end $a$;

-- ── 2: headcoach reaches the head coach, not the plain coach ─────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
insert into profile_icons (club_id, role, icon) values
 ('f0000000-0000-4000-8000-000000000400','headcoach','crown');
reset role;
do $a$
begin
  if pg_temp.worn('f0000000-0000-4000-8000-000000000412') is distinct from 'crown' then
    raise exception 'ASSERT 2 FAILED: the head coach should wear the crown, got %', pg_temp.worn('f0000000-0000-4000-8000-000000000412');
  end if;
  if pg_temp.worn('f0000000-0000-4000-8000-000000000411') is not null then
    raise exception 'ASSERT 2 FAILED: a plain coach must not wear the head-coach crown';
  end if;
  insert into _log(line) values ('2 headcoach grant: the head coach wears the crown; the plain coach does not');
end $a$;

-- ── 3: member_icons names the group ─────────────────────────────────────────
do $a$
declare r record;
begin
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
  select * into r from public.member_icons('f0000000-0000-4000-8000-000000000413') limit 1;
  reset role;
  if r.icon is distinct from 'clipboard' or r.team_name is distinct from 'Every manager' or r.reason is distinct from 'Zz runs the show' then
    raise exception 'ASSERT 3 FAILED: expected clipboard / Every manager / the reason, got % / % / %', r.icon, r.team_name, r.reason;
  end if;
  insert into _log(line) values ('3 member_icons: the manager''s card lists the clipboard as "Every manager" with its reason');
end $a$;

-- ── 4 and 5: still one target; unknown roles refused ────────────────────────
do $a$
declare refused boolean := false;
begin
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
  begin
    insert into profile_icons (club_id, role, team_id, icon) values
     ('f0000000-0000-4000-8000-000000000400','manager','f0000000-0000-4000-8000-000000000401','star');
  exception when check_violation then refused := true;
  end;
  reset role;
  if not refused then
    raise exception 'ASSERT 4 FAILED: a row with role AND team_id should be refused';
  end if;
  refused := false;
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000410');
  begin
    insert into profile_icons (club_id, role, icon) values
     ('f0000000-0000-4000-8000-000000000400','referee','star');
  exception when check_violation then refused := true;
  end;
  reset role;
  if not refused then
    raise exception 'ASSERT 5 FAILED: an unknown role should be refused';
  end if;
  insert into _log(line) values ('4+5 checks: role+team refused; unknown role refused');
end $a$;

-- ── 6: FAULT — the manager leaves; the icon leaves with them ─────────────────
update memberships set status = 'left' where id = 'f0000000-0000-4000-8000-000000000433';
do $a$
begin
  if pg_temp.worn('f0000000-0000-4000-8000-000000000413') is not null then
    raise exception 'ASSERT 6 FAILED: a manager who left must not keep the role icon, got %', pg_temp.worn('f0000000-0000-4000-8000-000000000413');
  end if;
  if pg_temp.worn('f0000000-0000-4000-8000-000000000412') is distinct from 'crown' then
    raise exception 'ASSERT 6 FAILED: the head coach should still wear the crown';
  end if;
  insert into _log(line) values ('6 dynamic: the manager who left lost the clipboard; the head coach kept the crown');
end $a$;

-- ── 7: a parent cannot grant a role icon ────────────────────────────────────
do $a$
declare refused boolean := false;
begin
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000414');
  begin
    insert into profile_icons (club_id, role, icon) values
     ('f0000000-0000-4000-8000-000000000400','coach','star');
  exception when insufficient_privilege then refused := true;
  end;
  reset role;
  if not refused then
    raise exception 'ASSERT 7 FAILED: a parent''s role grant should be refused by RLS';
  end if;
  insert into _log(line) values ('7 policy: a parent''s role grant is refused; the super''s in step 1 landed');
end $a$;

select line from _log order by seq;
rollback;
