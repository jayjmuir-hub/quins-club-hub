-- Profile icons (claude/plans/2026-08-31-profile-icons.md). Super admins pin
-- a curated emoji to a SQUAD's staff (dynamic — decorates whoever currently
-- holds an active coach/manager/medic membership on that team) or to an
-- INDIVIDUAL. Grants stack; one primary renders beside the name; the person
-- card lists all with their reason lines. The database stores only the icon
-- KEY — the client library owns emoji and meanings, and an unknown key
-- renders as nothing, so the key is format-checked, not enum-checked (an
-- enum would cost a migration per new icon for zero safety).

create table public.profile_icons (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  -- Exactly one target: a person, or a squad's staff.
  profile_id uuid references public.profiles(id) on delete cascade,
  team_id    uuid references public.teams(id) on delete cascade,
  icon       text not null check (icon ~ '^[a-z0-9_]{1,32}$'),
  -- The custom line a tap shows; null falls back to the library meaning.
  reason     text check (reason is null or length(btrim(reason)) between 1 and 200),
  is_primary boolean not null default false,
  granted_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_icons_one_target check ((profile_id is null) <> (team_id is null))
);

alter table public.profile_icons enable row level security;
grant select, insert, update, delete on public.profile_icons to authenticated;

-- Recognition is public club-wide by definition: any active member reads.
create policy "icons read" on public.profile_icons
  for select using (exists (select 1 from memberships m
    where m.profile_id = (select auth.uid())
      and m.club_id = profile_icons.club_id and m.status = 'active'));

-- Writes are the super admin's alone — a database boundary, not a hidden
-- button. The club check stops a super admin of one club decorating another.
create policy "icons grant" on public.profile_icons
  for insert with check (private.is_super_admin() and exists (
    select 1 from memberships m where m.profile_id = (select auth.uid())
      and m.club_id = profile_icons.club_id and m.status = 'active'));
create policy "icons update" on public.profile_icons
  for update using (private.is_super_admin() and exists (
    select 1 from memberships m where m.profile_id = (select auth.uid())
      and m.club_id = profile_icons.club_id and m.status = 'active'));
create policy "icons revoke" on public.profile_icons
  for delete using (private.is_super_admin() and exists (
    select 1 from memberships m where m.profile_id = (select auth.uid())
      and m.club_id = profile_icons.club_id and m.status = 'active'));

-- ── Read path 1: the whole club's primary icons, one call ─────────────────
-- Chat renders dozens of author names at once; this is the single cached
-- fetch they all share. Primary = newest is_primary grant, else newest.
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
    -- individual grants
    select i.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i join my_club c on c.club_id = i.club_id
     where i.profile_id is not null
    union all
    -- squad grants decorate CURRENT active staff on that team
    select m.profile_id, i.icon, i.is_primary, i.created_at
      from profile_icons i
      join my_club c on c.club_id = i.club_id
      join memberships m on m.team_id = i.team_id and m.status = 'active'
       and m.role in ('coach','manager','medic')
     where i.team_id is not null
  )
  select distinct on (w.profile_id) w.profile_id, w.icon
    from worn w
   order by w.profile_id, w.is_primary desc, w.created_at desc;
$function$;

-- ── Read path 2: one person's full list, for the person card ──────────────
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
   order by is_primary desc, created_at desc;
$function$;

revoke all on function public.club_icon_map() from public, anon;
grant execute on function public.club_icon_map() to authenticated;
revoke all on function public.member_icons(uuid) from public, anon;
grant execute on function public.member_icons(uuid) to authenticated;
