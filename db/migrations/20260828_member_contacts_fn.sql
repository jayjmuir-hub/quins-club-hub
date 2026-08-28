-- ══════════════════════════════════════════════════════════════════════════
--  Phase 1b, step A (additive) — the single entitlement for a person's contact,
--  and a bulk read path, so the direct column read of profiles.email/phone can
--  be closed in step B without breaking any screen.
--  28 Aug 2026 · admin-rights redesign
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY. Phase 1 closed the CHILD-LINKED contact tables. The adult LOGIN contact
-- (profiles.email/phone) is still directly column-readable by `authenticated`,
-- so a narrowed admin could read a parent's login email/phone with a raw
-- PostgREST query (the Phase 1 residual). Closing that means a column REVOKE
-- (step B), which is blunt: it breaks EVERY direct reader. So first (here) we
-- give every legitimate reader a function that returns the columns with the
-- right entitlement, then repoint the screens, then revoke.
--
-- ⚠️ DEPLOY-FIRST. Step B (the revoke) is destructive to the read path. The
-- rerouted FRONTEND must be live before B is applied, or the Accounts list,
-- profile-edit, Rights-log and Staff directory error. Order: this migration →
-- deploy the reroute → step B.
--
-- ⚠️ THE ENTITLEMENT, IN ONE PLACE. member_contact_card had this inline and its
-- squad arm used can_edit_team — which is TRUE for any admin, so it leaked a
-- parent's profile contact to a narrowed admin (the same residual). Fixed here:
-- the squad arm is is_team_staff (a coach of the parent's squad), NOT any admin.

begin;

-- Self, OR a staff/admin target (ruling C — staff are contactable club-wide),
-- OR an allowlisted admin (S2), OR a coach/manager/medic of a squad the target
-- parents. Default-deny otherwise.
create or replace function private.can_see_member_contact(_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    (select auth.uid()) = _id
    or exists (select 1 from memberships m
        where m.profile_id = _id and m.status = 'active'
          and (m.role in ('coach','manager','medic','admin') or m.is_super))
    or private.can_see_child_contacts()
    or exists (select 1 from memberships m
        where m.profile_id = _id and m.status = 'active'
          and m.role = 'parent' and m.team_id is not null
          and private.is_team_staff(m.team_id));
$$;
revoke all on function private.can_see_member_contact(uuid) from public, anon;
grant execute on function private.can_see_member_contact(uuid) to authenticated;

-- Bulk contact read: for each requested profile, phone/email if entitled else
-- null. SECURITY DEFINER so it can read the columns step B revokes from
-- `authenticated`. Only members may call it at all.
create or replace function public.member_contacts(_ids uuid[])
returns table(id uuid, phone text, email text)
language sql stable security definer set search_path to 'public' as $$
  select p.id,
         case when private.can_see_member_contact(p.id) then p.phone else null end,
         case when private.can_see_member_contact(p.id) then p.email else null end
    from profiles p
   where p.id = any(_ids)
     and exists (select 1 from memberships m where m.profile_id = auth.uid() and m.status = 'active');
$$;
revoke all on function public.member_contacts(uuid[]) from public, anon;
grant execute on function public.member_contacts(uuid[]) to authenticated;

-- Repoint member_contact_card at the shared entitlement (fixes its can_edit_team
-- squad-arm leak; behaviour is otherwise identical).
create or replace function public.member_contact_card(_profile uuid)
returns table(profile_id uuid, full_name text, role text, title text, is_super boolean,
  squads text[], phone text, email text, photo_path text, photo_focus_x smallint, photo_focus_y smallint)
language sql stable security definer set search_path to 'public' as $$
  with viewer as (select exists (select 1 from memberships m where m.profile_id=auth.uid() and m.status='active') as is_member),
  best as (select m.role, m.title, m.is_super from memberships m where m.profile_id=_profile and m.status='active'
    order by case when m.is_super then 0 when m.role='admin' then 1 when m.role='coach' then 2 when m.role='manager' then 3 when m.role='medic' then 4 else 5 end limit 1)
  select p.id, p.full_name, best.role, best.title, coalesce(best.is_super,false),
    coalesce((select array_agg(t.name order by t.name) from memberships m join teams t on t.id=m.team_id where m.profile_id=_profile and m.status='active' and m.team_id is not null),'{}') as squads,
    case when private.can_see_member_contact(p.id) then p.phone else null end,
    case when private.can_see_member_contact(p.id) then p.email else null end,
    case when private.can_see_staff_photo(p.id) then p.photo_path else null end,
    p.photo_focus_x, p.photo_focus_y
  from profiles p cross join viewer left join best on true
  where p.id=_profile and viewer.is_member; $$;
revoke all on function public.member_contact_card(uuid) from public, anon;
grant execute on function public.member_contact_card(uuid) to authenticated;

commit;
