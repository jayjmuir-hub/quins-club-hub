-- 27 Aug 2026 — pitch drawings on opened drill cards.
-- Spec: claude/specs/2026-08-27-drill-diagrams.md
-- Tombstone: claude/decisions/2026-08-21-drill-body-is-just-a-text-field.md
--   (body stays prose; this is a new column, not markdown images in body.)
--
-- Additive. Nullable. Existing inserts keep working. Does not touch
-- player-photos, staff-photos, events, memberships, or chat.
--
-- ⚠️ apply_migration strips `--` comments; COMMENT ON is what reaches the DB.
-- IDEMPOTENT so db/tests/drill-diagrams.sql can inline it inside a
-- transaction that rolls back.

begin;

alter table public.drills
  add column if not exists diagram_url text;
comment on column public.drills.diagram_url is
  'Public URL of a schematic pitch drawing (cones, letters, arrows). NULL means no diagram. Never a photograph of a person. Not stored in drills.body.';

-- ── Bucket ────────────────────────────────────────────────────────────────
-- PUBLIC. Diagrams are cones and letters, never children, so a public URL on
-- an <img> is the point. ⚠️ A SEPARATE BUCKET FROM player-photos AND
-- staff-photos: those hold faces, and nothing written here may widen them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-diagrams',
  'training-diagrams',
  true,
  2097152,
  array['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

-- First path segment IS the drill id. A storage policy sees only a filename.
-- NULL on a malformed key, never an error: a policy comparing NULL yields
-- NULL, which is not true, so a bad key fails closed.
create or replace function private.training_diagram_drill(_key text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  select case
    when split_part(_key, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
    else null
  end;
$function$;

revoke execute on function private.training_diagram_drill(text) from public;
revoke execute on function private.training_diagram_drill(text) from anon;
grant execute on function private.training_diagram_drill(text) to authenticated;

-- Write matches drill manage: an admin of the club, or squad staff of a
-- squad-owned drill. The training right is a message on the screen, not a
-- boundary here — same as public.drills.
create or replace function private.can_write_training_diagram(_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.drills d
    where d.id = private.training_diagram_drill(_key)
      and (
        private.is_admin(d.club_id)
        or (d.team_id is not null and private.can_edit_team(d.team_id))
      )
  );
$function$;

revoke execute on function private.can_write_training_diagram(text) from public;
revoke execute on function private.can_write_training_diagram(text) from anon;
grant execute on function private.can_write_training_diagram(text) to authenticated;

drop policy if exists "training diagram read" on storage.objects;
create policy "training diagram read" on storage.objects
  for select
  using (bucket_id = 'training-diagrams');

-- ⚠️ FOR ALL WITH BOTH using AND with check. INSERT consults with check
-- alone; using without it would let any signed-in account create an object.
drop policy if exists "training diagram write" on storage.objects;
create policy "training diagram write" on storage.objects
  for all
  using (
    bucket_id = 'training-diagrams'
    and private.can_write_training_diagram(name)
  )
  with check (
    bucket_id = 'training-diagrams'
    and private.can_write_training_diagram(name)
  );

commit;
