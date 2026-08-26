-- 26 Aug 2026, later the same day — the card said "U10 MIXED · U10 MIXED".
-- Found by Jay's live check minutes after the person card shipped: a person
-- holding two membership rows on the same squad (legitimate data — the
-- memberships table has no unique constraint, and the Accounts screen
-- already groups such rows into one block) had the squad named once per ROW,
-- because member_contact_card aggregated team names without `distinct`.
--
-- One word. The rest of the function is byte-identical to
-- 20260826_member_contact_card.sql, restated whole because `create or
-- replace` replaces whole. Harness assert 6 (db/tests/person-card.sql) now
-- carries the duplicate-row fixture and failed against the old body before
-- this was written.

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
         coalesce((select array_agg(distinct t.name order by t.name)
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

commit;
