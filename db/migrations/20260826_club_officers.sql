-- Club officers — titles WITHOUT rights (Jay, 26 Aug 2026: "no special
-- rights with those, just titles"). claude/plans/2026-08-26-club-officers.md.
--
-- ⚠️ DELIBERATELY NOT ON memberships: a membership row IS a grant (role,
-- rights, squad access), and a Treasurer is not thereby an admin. This
-- table is pure honours — a row here changes what renders, never what a
-- policy answers. If a future change keys ANY permission off it, that
-- change re-opens the exact confusion this table exists to prevent.

begin;

create table public.club_officers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Jay's eight, verbatim. The CHECK is the vocabulary: a ninth title is a
  -- migration, on purpose — titles are club constitution, not free text.
  title text not null check (title in (
    'Club President', 'Vice Chairman', 'Rugby Junior Manager',
    'Club Secretary', 'Treasurer', 'Membership Secretary',
    'Director of Rugby', 'Rugby Performance Director'
  )),
  created_at timestamptz not null default now(),
  unique (club_id, profile_id, title)
);

comment on table public.club_officers is
  'Club officer titles — honours only, NO permissions ride on this table. '
  'Read by any active member of the club; written only by a super admin. '
  'claude/plans/2026-08-26-club-officers.md.';

alter table public.club_officers enable row level security;

-- Any active member of the club may see who its officers are — the same
-- visibility ruling as member_identity (identity is club-public).
create policy "officers read member" on public.club_officers
  for select to authenticated
  using (exists (
    select 1 from memberships me
     where me.profile_id = auth.uid()
       and me.status = 'active'
       and me.club_id = club_officers.club_id
  ));

-- Only a super admin tags or untags — an ordinary admin does not.
create policy "officers write super" on public.club_officers
  for insert to authenticated
  with check (private.is_super_admin());

create policy "officers delete super" on public.club_officers
  for delete to authenticated
  using (private.is_super_admin());

revoke all on table public.club_officers from public, anon;
grant select, insert, delete on table public.club_officers to authenticated;
grant all on table public.club_officers to service_role;

-- member_identity grows the officer rows — 'officer' role, the title, no
-- squad — so every IdentityBadges surface shows them with no new client
-- fetch. Same same-club door as the membership rows.
create or replace function public.member_identity(_profile uuid)
returns table(role text, title text, is_super boolean, squad text, squad_sort integer)
language sql stable security definer
set search_path to 'public'
as $$
  select m.role, m.title, coalesce(m.is_super, false), t.name, t.sort_order
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = _profile
     and m.status = 'active'
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = m.club_id
     )
  union all
  select 'officer', o.title, false, null::text, null::integer
    from club_officers o
   where o.profile_id = _profile
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = o.club_id
     )
$$;

commit;
