-- 26 Aug 2026 — the person card: tap any name, contact the person.
-- Jay's ruling (option C, claude/plans/2026-08-26-person-card.md): taking a
-- staff or admin role makes you contactable by ANYONE in the club — extends
-- the 13 Aug "staff automatically opts in" ruling from squad-scoped to
-- club-wide. Parents stay chat-only except to the staff who manage them
-- (super admins, or squad staff of a squad the parent belongs to — the same
-- scopes Player Detail's parent block already uses). The card never grants
-- access: this function nulls the contact columns server-side, so a phone
-- number never reaches the browser of somebody not entitled to it.

begin;

create or replace function public.member_contact_card(_profile uuid)
returns table(
  profile_id uuid, full_name text, role text, title text, is_super boolean,
  squads text[], phone text, email text,
  photo_path text, photo_focus_x smallint, photo_focus_y smallint
)
language sql stable security definer
set search_path to 'public'
as $$
  with viewer as (
    select exists (
      select 1 from memberships m
       where m.profile_id = auth.uid() and m.status = 'active'
    ) as is_member
  ),
  -- The target's "best" active membership carries the role line.
  best as (
    select m.role, m.title, m.is_super
      from memberships m
     where m.profile_id = _profile and m.status = 'active'
     order by case when m.is_super then 0
                   when m.role = 'admin' then 1
                   when m.role = 'coach' then 2
                   when m.role = 'manager' then 3
                   when m.role = 'medic' then 4
                   else 5 end
     limit 1
  ),
  entitled as (
    select
      -- Ruling C: any member sees a staff/admin's contacts…
      exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and (m.role in ('coach','manager','medic','admin') or m.is_super)
      )
      -- …and the existing manage scopes see a parent's.
      or private.is_admin_anywhere()
      or exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and m.role = 'parent' and m.team_id is not null
           and private.can_edit_team(m.team_id)
      ) as contacts
  )
  select p.id, p.full_name,
         best.role, best.title, coalesce(best.is_super, false),
         coalesce((select array_agg(t.name order by t.name)
                     from memberships m join teams t on t.id = m.team_id
                    where m.profile_id = _profile and m.status = 'active'
                      and m.team_id is not null), '{}') as squads,
         case when entitled.contacts then p.phone else null end,
         case when entitled.contacts then p.email else null end,
         case when private.can_see_staff_photo(p.id) then p.photo_path else null end,
         p.photo_focus_x, p.photo_focus_y
    from profiles p
   cross join viewer
   cross join entitled
    left join best on true
   where p.id = _profile
     and viewer.is_member;
$$;

revoke all on function public.member_contact_card(uuid) from public;
revoke all on function public.member_contact_card(uuid) from anon;
grant execute on function public.member_contact_card(uuid) to authenticated;

-- The FACE follows the same ruling. can_see_staff_photo mirrored
-- my_squad_staff (squad-scoped) since 13 Aug; without this arm the card
-- names a cross-squad coach but refuses their photograph. The old arms
-- stay: they also cover self and shares_admin_club.
create or replace function private.can_see_staff_photo(_profile uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    _profile = auth.uid()
    or private.shares_admin_club(_profile)
    or exists (
      select 1
      from memberships staff
      join memberships mine
        on mine.team_id = staff.team_id
       and mine.profile_id = auth.uid()
       and mine.status = 'active'
      where staff.profile_id = _profile
        and staff.status = 'active'
        and staff.role in ('coach', 'manager', 'medic')
        and staff.team_id is not null
    )
    -- 26 Aug 2026, ruling C: any active member may see any staff/admin's photo.
    or (
      exists (
        select 1 from memberships mine
         where mine.profile_id = auth.uid() and mine.status = 'active'
      )
      and exists (
        select 1 from memberships staff
         where staff.profile_id = _profile and staff.status = 'active'
           and (staff.role in ('coach','manager','medic','admin') or staff.is_super)
      )
    );
$$;

commit;
