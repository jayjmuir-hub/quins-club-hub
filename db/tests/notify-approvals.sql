-- Harness for db/migrations/20260823_notify_approvals.sql.
-- Run with `npm run db:check -- notify-approvals`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below, AFTER the cast, so its backfill
-- runs over the probe club. Cast borrowed from squad-chat-phase3, plus a super
-- admin, a head coach and a manager. ⚠️ EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. the backfill switches on exactly the people the old rule emailed:
--     the super admin, the head coach, the manager — not the parents
--  2. the constraint refuses the switch on a parent
--  3. an admin flips the coach off and on (column grant + memb manage);
--     a coach cannot flip anybody (0 rows)
--  4. approval_recipients(): an admin sees admin, coach, manager with the squad
--     name; a parent sees nothing

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Notify Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-notify-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000c5','U16B ZZ Probe', 1001),
 ('f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000c5','U10 ZZ Probe', 1002);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000d1','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Sixteen'),
 ('f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Nodob'),
 ('f0000000-0000-4000-8000-0000000000d3','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Childseven'),
 ('f0000000-0000-4000-8000-0000000000d4','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','Zz Probe Childeight');

insert into player_private (player_id, date_of_birth) values
 ('f0000000-0000-4000-8000-0000000000d1', current_date - interval '16 years');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000041','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000042','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','parent','active'),
 ('f0000000-0000-4000-8000-000000000043','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d3','parent','active'),
 ('f0000000-0000-4000-8000-000000000044','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','player','active'),
 ('f0000000-0000-4000-8000-000000000045','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d2','player','active'),
 ('f0000000-0000-4000-8000-000000000046','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000d4','parent','active'),
 ('f0000000-0000-4000-8000-000000000047','f0000000-0000-4000-8000-0000000000c5', null, null, 'admin','active');
update memberships set is_super = true where profile_id = 'f0000000-0000-4000-8000-000000000047';
update memberships set is_head_coach = true where profile_id = 'f0000000-0000-4000-8000-000000000041';
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000046','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe', null, 'manager','active');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-notify-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-notify-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-notify-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-notify-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;


alter table public.memberships
  add column if not exists notify_approvals boolean not null default false;

comment on column public.memberships.notify_approvals is
  'Gets the email when somebody is waiting to be approved: an admin for the whole club, a coach or manager for their squad. Set by admins. Confers nothing. See db/migrations/20260823_notify_approvals.sql.';

alter table public.memberships
  drop constraint if exists memberships_notify_approvals_role;
alter table public.memberships
  add constraint memberships_notify_approvals_role
  check (not notify_approvals or role in ('admin', 'coach', 'manager'));

-- the old rule, made explicit
update public.memberships
   set notify_approvals = true
 where status = 'active'
   and (
     (role = 'admin' and is_super)
     or (role = 'coach' and is_head_coach)
     or (role = 'manager' and team_id is not null)
   );

grant update (notify_approvals) on public.memberships to authenticated;

-- The list an admin edits: every active admin, coach and manager in the
-- club, with name and squad. SECURITY DEFINER so it can read profiles.full_name
-- for people the admin shares no squad with; gated on is_admin.
create or replace function public.approval_recipients()
returns table (membership_id uuid, profile_id uuid, full_name text, role text, team_id uuid, team_name text, notify boolean)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1)
  select m.id, m.profile_id, p.full_name, m.role, m.team_id, t.name, m.notify_approvals
    from memberships m
    cross join club
    join profiles p on p.id = m.profile_id
    left join teams t on t.id = m.team_id
   where m.club_id = club.id
     and m.status = 'active'
     and m.role in ('admin', 'coach', 'manager')
     and (m.role = 'admin' or m.team_id is not null)
     and private.is_admin(club.id)
   order by case m.role when 'admin' then 0 else 1 end, t.sort_order nulls first, t.name, p.full_name;
$function$;
revoke all on function public.approval_recipients() from public, anon;
grant execute on function public.approval_recipients() to authenticated;


create function pg_temp.assert_notify() returns void language plpgsql as $fn$
declare
  n int; caught text;
  coach constant uuid := 'f0000000-0000-4000-8000-000000000041';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  manager constant uuid := 'f0000000-0000-4000-8000-000000000046';
  admin constant uuid := 'f0000000-0000-4000-8000-000000000047';
  club constant uuid := 'f0000000-0000-4000-8000-0000000000c5';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fe';
  coach_m uuid; parent_m uuid;
begin
  select id into coach_m from memberships where profile_id = coach and role = 'coach';
  select id into parent_m from memberships where profile_id = parent and role = 'parent';

  -- 1
  select count(*) into n from memberships where club_id = club and notify_approvals;
  if n <> 3 then raise exception 'ASSERT 1 FAILED: % switched on (want super admin, head coach, manager)', n; end if;
  select count(*) into n from memberships where club_id = club and notify_approvals and role not in ('admin','coach','manager');
  if n <> 0 then raise exception 'ASSERT 1 FAILED: a non-staff row is switched on'; end if;
  select count(*) into n from memberships where club_id = club and notify_approvals and team_id = squad_a and role = 'manager';
  if n <> 1 then raise exception 'ASSERT 1 FAILED: the manager was not switched on'; end if;
  insert into _log(line) values ('1 backfill: super admin, head coach and manager on; parents off');

  -- 2
  begin update memberships set notify_approvals = true where id = parent_m; caught := null; exception when others then caught := sqlerrm; end;
  if caught is null then raise exception 'ASSERT 2 FAILED: a parent was switched on'; end if;
  insert into _log(line) values ('2 a parent cannot be switched on: ' || caught);

  -- 3
  perform pg_temp.as_user(admin::text);
  update memberships set notify_approvals = false where id = coach_m;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: admin could not switch the coach off'; end if;
  perform pg_temp.as_user(coach::text);
  update memberships set notify_approvals = true where id = coach_m;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: a coach switched themself on'; end if;
  perform pg_temp.as_user(admin::text);
  update memberships set notify_approvals = true where id = coach_m;
  reset role;
  insert into _log(line) values ('3 an admin flips the switch; a coach cannot');

  -- 4
  perform pg_temp.as_user(admin::text);
  select count(*) into n from public.approval_recipients();
  if n <> 3 then raise exception 'ASSERT 4 FAILED: admin sees % recipients', n; end if;
  select count(*) into n from public.approval_recipients() where role = 'manager' and team_name = 'U16B ZZ Probe' and notify;
  reset role;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: manager row wrong'; end if;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from public.approval_recipients();
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: a parent sees % rows', n; end if;
  insert into _log(line) values ('4 approval_recipients: admin sees the three with squad names; a parent sees none');
end $fn$;

select pg_temp.assert_notify();
select line from _log order by seq;

rollback;
