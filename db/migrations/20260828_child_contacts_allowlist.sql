-- ══════════════════════════════════════════════════════════════════════════
--  Phase 1 — parent contact + DOB become a real data boundary (Surface S2)
--  28 Aug 2026 · admin-rights redesign, the proof-of-concept
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT (spec §5.2, matrix S2 "DOB / parent contact"):
--   A child's DOB and their parents' registered contact become visible only to
--   the allowlist {clubadmin, youth, media, welfare}. Pitch and Training admins
--   — full admins today by is_admin — are DENIED. welfare is READ-ONLY (note ¹);
--   the edit allowlist is {clubadmin, youth, media}.
--
--   ⚠️ Because of Phase 0a every current admin holds clubadmin, so NOBODY loses
--   access today. This only enables narrower FUTURE grants.
--
-- WHERE (measured on prod 28 Aug — the child-linked contact lives in three
-- tables, all read today via `can_edit_team(team) OR is_own_player`, where
-- can_edit_team = "any admin OR squad staff of that team"):
--   • public.player_contacts  — parent phone/email for a child
--   • public.player_parents   — parent details for a child
--   • public.player_private   — date of birth (+ plays_up, staff_dm_opt_in)
--
-- HOW: replace the "any admin" arm with the allowlist, on these three tables
-- only, keeping the squad-staff arm (a coach keeps their own squad) and the
-- guardian arm (is_own_player) untouched. RLS is the boundary — a direct
-- PostgREST/JWT query is refused, not just the menu (spec §7.2 adversarial).
--
-- ⚠️ SCOPE NOTE — the ADULT LOGIN contact (profiles.email/phone) is a SEPARATE
-- surface, deferred to a follow-up (Phase 1b). This migration narrows the
-- child-linked tables (the safeguarding target) fully via RLS, and tightens the
-- member_contact_card PARENT arm below. It does NOT revoke column SELECT on
-- profiles.email/phone, so a non-allowlisted admin could still read a parent's
-- *login* email/phone by querying profiles directly. Known residual, closed in
-- 1b (needs the 4-path read reroute: members.js:212/1235, audit.js:77,
-- staff.js:57). Recorded, not hidden.
--
-- Proven both directions in db/tests/child-contacts-allowlist.sql
-- (`npm run db:check -- child-contacts`), which must be GREEN before this is
-- applied to production.

begin;

-- ── The allowlist helpers ──────────────────────────────────────────────────
-- Default-deny: false unless the caller is an active admin holding an
-- allowlisted right (or is_super). `&&` is array overlap.
--
-- ⚠️ CHANGE ONE, CHANGE BOTH — the read/write allowlists mirror the spec §5.2
-- matrix and the client (src/lib/scope.js canSeeChildContacts/canEditChildContacts).

create or replace function private.can_see_child_contacts()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media','welfare'])
  );
$$;
revoke all on function private.can_see_child_contacts() from public, anon;
grant execute on function private.can_see_child_contacts() to authenticated;

-- welfare is READ-ONLY (spec §5.2 note ¹), so the WRITE allowlist drops it.
create or replace function private.can_edit_child_contacts()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media'])
  );
$$;
revoke all on function private.can_edit_child_contacts() from public, anon;
grant execute on function private.can_edit_child_contacts() to authenticated;

-- Squad staff (coach/manager/medic) of ONE team — the non-admin arm of
-- can_edit_team (db/migrations/20260810_can_edit_team_status.sql), so a coach
-- keeps their own squad's contacts and DOB when the admin arm narrows.
create or replace function private.is_team_staff(_team uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
       and m.role in ('coach','manager','medic') and m.team_id = _team
  );
$$;
revoke all on function private.is_team_staff(uuid) from public, anon;
grant execute on function private.is_team_staff(uuid) to authenticated;

-- ── player_contacts ────────────────────────────────────────────────────────
-- Old: "contact edit" (ALL, can_edit_team) + "contact edit own" (ALL, is_own_player).
-- New: read narrowed to the allowlist; write kept for the edit allowlist; the
-- squad-staff and guardian arms preserved in both.
drop policy if exists "contact edit" on public.player_contacts;
drop policy if exists "contact edit own" on public.player_contacts;

create policy "contact read" on public.player_contacts for select using (
  private.can_see_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_contacts.player_id))
  or private.is_own_player(player_id)
);
create policy "contact insert" on public.player_contacts for insert with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_contacts.player_id))
  or private.is_own_player(player_id)
);
create policy "contact update" on public.player_contacts for update using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_contacts.player_id))
  or private.is_own_player(player_id)
) with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_contacts.player_id))
  or private.is_own_player(player_id)
);
create policy "contact delete" on public.player_contacts for delete using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_contacts.player_id))
  or private.is_own_player(player_id)
);

-- ── player_parents ─────────────────────────────────────────────────────────
drop policy if exists "parent edit" on public.player_parents;
drop policy if exists "parent edit own" on public.player_parents;

create policy "parent read" on public.player_parents for select using (
  private.can_see_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_parents.player_id))
  or private.is_own_player(player_id)
);
create policy "parent insert" on public.player_parents for insert with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_parents.player_id))
  or private.is_own_player(player_id)
);
create policy "parent update" on public.player_parents for update using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_parents.player_id))
  or private.is_own_player(player_id)
) with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_parents.player_id))
  or private.is_own_player(player_id)
);
create policy "parent delete" on public.player_parents for delete using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_parents.player_id))
  or private.is_own_player(player_id)
);

-- ── player_private (DOB) ───────────────────────────────────────────────────
-- Old: "player private read" (SELECT, can_edit_team OR is_own_player) +
-- "player private edit" (ALL, can_edit_team) + "player private edit own" (ALL).
drop policy if exists "player private read" on public.player_private;
drop policy if exists "player private edit" on public.player_private;
drop policy if exists "player private edit own" on public.player_private;

create policy "player private read" on public.player_private for select using (
  private.can_see_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_private.player_id))
  or private.is_own_player(player_id)
);
create policy "player private insert" on public.player_private for insert with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_private.player_id))
  or private.is_own_player(player_id)
);
create policy "player private update" on public.player_private for update using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_private.player_id))
  or private.is_own_player(player_id)
) with check (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_private.player_id))
  or private.is_own_player(player_id)
);
create policy "player private delete" on public.player_private for delete using (
  private.can_edit_child_contacts()
  or private.is_team_staff((select team_id from players where id = player_private.player_id))
  or private.is_own_player(player_id)
);

-- ── The app contact-card path ──────────────────────────────────────────────
-- member_contact_card nulls phone/email unless the viewer is entitled. Its
-- PARENT arm was `is_admin_anywhere()` (any admin sees any parent's contact);
-- narrow it to the allowlist. The STAFF-target arm (ruling C: staff are
-- contactable) and the squad-manage arm are unchanged — a narrowed admin still
-- sees other STAFF's contacts, just not a PARENT's.
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
      -- …a PARENT's contact only for the S2 allowlist (was is_admin_anywhere)…
      or private.can_see_child_contacts()
      -- …and for the squad staff who manage that parent's squad.
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
revoke all on function public.member_contact_card(uuid) from public, anon;
grant execute on function public.member_contact_card(uuid) to authenticated;

-- ── Guard: the three tables each have exactly one SELECT policy, and it is the
-- narrowed one (not can_edit_team). ────────────────────────────────────────
do $$
declare
  t text;
  n int;
  q text;
begin
  foreach t in array array['player_contacts','player_parents','player_private'] loop
    select count(*) into n from pg_policies
     where schemaname='public' and tablename=t and cmd='SELECT';
    if n <> 1 then
      raise exception 'ABORTING: % has % SELECT polic(ies), expected exactly 1.', t, n;
    end if;
    select pg_get_expr(polqual, polrelid) into q
      from pg_policy p join pg_class c on c.oid=p.polrelid
     where c.relname=t and p.polcmd='r';
    if q not like '%can_see_child_contacts%' then
      raise exception 'ABORTING: % SELECT policy is not keyed on the allowlist (qual=%).', t, q;
    end if;
    if q like '%can_edit_team%' then
      raise exception 'ABORTING: % SELECT policy still admits any admin via can_edit_team.', t;
    end if;
  end loop;
  raise notice 'child-contacts allowlist: read narrowed on all three tables.';
end $$;

commit;
