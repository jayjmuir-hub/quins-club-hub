-- 20260909_role_group_icons — an icon for a whole role (4 Sep 2026)
--
-- Jay, on /admin/icons: "i need to be able to give groups like managers or
-- coaches, etc icons as a whole". profile_icons had two targets — a person,
-- or a squad's staff. This adds a third: a ROLE across the club. Like the
-- squad grant it is dynamic — it decorates whoever holds the role today and
-- stops the moment they do not — so "every manager wears the clipboard" is
-- one row, not one per manager kept in step by hand.
--
-- Roles: coach, headcoach (a coach with is_head_coach), manager, medic, admin.
-- The "exactly one target" check widens to three columns. Both read paths
-- gain a third arm; member_icons names the group in team_name ("Every
-- manager") so the person card's " · <where>" line needs no new column.
-- Reasoning and proof: claude/schema-history.md, "20260909_role_group_icons".
-- Harness: db/tests/role-group-icons.sql (rolled back against production).
--
-- Nothing here grants: the column rides the table's grants and policies.
begin;

alter table public.profile_icons
  add column if not exists role text
    check (role is null or role in ('coach','headcoach','manager','medic','admin'));

comment on column public.profile_icons.role is
  'A grant to everyone holding this role in the club (dynamic, like a squad grant). headcoach = a coach with is_head_coach.';

alter table public.profile_icons drop constraint if exists profile_icons_one_target;
alter table public.profile_icons add constraint profile_icons_one_target
  check ((profile_id is not null)::int + (team_id is not null)::int + (role is not null)::int = 1);

-- Which memberships a role grant decorates. One place for the rule so the
-- two read paths cannot drift from each other.
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

-- Captured live 4 Sep 2026 (md5 9a3677338356928455f24b0e0e873158, identical
-- to the creating migration); the only change is the third arm.
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
    -- role grants decorate everyone holding that role in the club TODAY
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

-- Captured live 4 Sep 2026 (md5 0f5fc868c54bcb4452570c3894bead04); the only
-- change is the third arm, whose team_name is the group's label.
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

commit;
