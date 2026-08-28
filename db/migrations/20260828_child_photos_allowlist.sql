-- ══════════════════════════════════════════════════════════════════════════
--  Phase 2 — player photos become a real data boundary (Surface S3)
--  28 Aug 2026 · admin-rights redesign
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT (spec §5.2, matrix S3 "Photos"): a child's photograph is visible only to
-- the allowlist {clubadmin, youth, media, welfare} (welfare read-only; edit is
-- {clubadmin, youth, media}). Pitch and Training admins are DENIED. The
-- squad-attached (a coach/parent/player of that squad) and the guardian keep
-- their access — this narrows ADMIN rights, not squad membership.
--
--   ⚠️ Because of Phase 0a every current admin holds clubadmin, so NOBODY loses
--   access today. This only enables narrower FUTURE grants.
--
-- WHERE. Two storage policies on the `player-photos` bucket
-- (db/migrations/20260803_player_photos_private_bucket_and_policies.sql):
--   • "player photo read"  (SELECT): was can_see_team(photo_team) — admin OR
--     anyone attached to the squad.
--   • "player photo write" (ALL):   was can_edit_team OR is_own_player.
-- Replace the "any admin" arm with the allowlist; keep the squad-attached and
-- guardian arms. The client needs no change: signPhotoUrls degrades a denied
-- signing to a monogram (src/data/photos.js).
--
-- ⚠️ THE EDGE FUNCTION IS NOT A SIDE DOOR (plan's check). backup-player-photos
-- runs as service_role via pg_cron/pg_net (no user JWT), gated by a shared
-- secret nobody else holds, and mirrors APPEND-ONLY into a private R2 bucket —
-- it never returns a photo to a caller. photo_backup_list_objects is
-- service_role-only. So narrowing these policies is the whole boundary; no
-- worker hands a narrowed right the image RLS just refused it.
--
-- ⚠️ SEPARATE HELPERS FROM S2 ON PURPOSE. The allowlist equals the contacts
-- allowlist TODAY, but photos and contacts are surfaces Jay ruled independently
-- (S2 vs S3) and could diverge; can_see_child_photos / can_edit_child_photos
-- keep S3 free to move without touching S2. They mirror src/lib/scope.js only in
-- value, and are the "change one, change both" the codebase already runs for
-- allowlists.
--
-- Proven both directions in db/tests/child-photos-allowlist.sql.

begin;

-- Read allowlist (super OR {clubadmin,youth,media,welfare}) and write allowlist
-- (super OR {clubadmin,youth,media} — welfare is read-only, spec §5.2 note ¹).
create or replace function private.can_see_child_photos()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media','welfare']));
$$;
revoke all on function private.can_see_child_photos() from public, anon;
grant execute on function private.can_see_child_photos() to authenticated;

create or replace function private.can_edit_child_photos()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media']));
$$;
revoke all on function private.can_edit_child_photos() from public, anon;
grant execute on function private.can_edit_child_photos() to authenticated;

-- The squad-attached arm of can_see_team, minus the admin arm: any active
-- membership (coach/parent/player/medic/manager) on that team.
create or replace function private.is_on_team(_team uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from memberships m
     where m.profile_id = auth.uid() and m.status = 'active' and m.team_id = _team);
$$;
revoke all on function private.is_on_team(uuid) from public, anon;
grant execute on function private.is_on_team(uuid) to authenticated;

-- ── The narrowed storage policies ──────────────────────────────────────────
drop policy if exists "player photo read" on storage.objects;
create policy "player photo read" on storage.objects for select to authenticated
using (
  bucket_id = 'player-photos'
  and (private.can_see_child_photos() or private.is_on_team(private.photo_team(name)))
);

drop policy if exists "player photo write" on storage.objects;
create policy "player photo write" on storage.objects for all to authenticated
using (
  bucket_id = 'player-photos'
  and (private.can_edit_child_photos()
       or private.is_team_staff(private.photo_team(name))
       or private.is_own_player(private.photo_player(name)))
)
with check (
  bucket_id = 'player-photos'
  and (private.can_edit_child_photos()
       or private.is_team_staff(private.photo_team(name))
       or private.is_own_player(private.photo_player(name)))
);

-- ── Guard: the read policy is keyed on the allowlist, not can_see_team. ─────
do $g$
declare q text;
begin
  select pg_get_expr(polqual, polrelid) into q
    from pg_policy p join pg_class c on c.oid=p.polrelid
   where c.relname='objects' and p.polname='player photo read';
  if q is null or q not like '%can_see_child_photos%' then
    raise exception 'ABORTING: player photo read is not keyed on the allowlist (qual=%).', q;
  end if;
  if q like '%can_see_team%' then
    raise exception 'ABORTING: player photo read still admits any admin via can_see_team.';
  end if;
  raise notice 'player photos: read/write narrowed to the allowlist.';
end $g$;

commit;
