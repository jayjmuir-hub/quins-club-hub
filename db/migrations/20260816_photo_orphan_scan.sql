-- 16 Aug 2026 — a nightly count of photos nothing points at.
--
-- ⚠️ IT REPORTS. IT DOES NOT DELETE. Jay's call, 16 Aug 2026, choosing this over
-- an auto-sweeping version, and the reason is in the asymmetry: `staff-photos`
-- is mirrored NOWHERE (`backup-player-photos` pins
-- `SOURCE_BUCKET = 'player-photos'`), so a scheduled job deleting from it has no
-- safety net at all. A bug that wrongly cleared `photo_path` would become
-- permanent loss of a photograph, on a timer, with nobody watching. Counting is
-- reversible; deleting is not. **Do not "finish" this by adding a delete.**
--
-- ══ WHY THIS EXISTS AT ALL ═════════════════════════════════════════════════
--
-- Five orphans were found by hand on 15 Aug — four of them the same head shot
-- re-uploaded five times while the photo positioner silently did nothing. The
-- replace path is fixed (#169: upload → record → delete old) and the two DELETE
-- paths are fixed alongside this migration, so orphans should now be rare. This
-- is the thing that notices when "should be" turns out to be wrong, because the
-- cleanup deletes are BEST-EFFORT by design and swallow their own failures.
--
-- ⚠️ AN ORPHAN IS A PHOTOGRAPH OF A PERSON, NOT A WASTED BYTE. The five found on
-- 15 Aug came to 203 KB. Nobody is watching this to save storage.
--
-- ══ ⚠️ WHY THIS CANNOT DELETE EVEN IF SOMEBODY LATER WANTS IT TO ═══════════
--
-- `storage.objects` carries a `protect_delete` trigger that raises 42501 on any
-- direct SQL DELETE — *"Direct deletion from storage tables is not allowed."*
-- There is a `storage.allow_delete_query` escape hatch and it is a TRAP: it
-- drops the ROW and leaves the file in the backing store, so the photograph
-- still exists with nothing pointing at it. That is not a delete. Any real
-- deletion has to go through the Storage API, which means a client or an edge
-- function, never this. RESTORE.md carries the same warning.

-- ══ 1. Where a scan is recorded ════════════════════════════════════════════
--
-- One row per bucket per run. Shaped after `photo_backup_runs`, which is the
-- house pattern for "a scheduled job left a record of what it saw".
create table if not exists public.photo_orphan_scans (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz not null default now(),
  bucket text not null,
  objects integer not null,
  referenced integer not null,
  orphaned integer not null,
  -- ⚠️ THE MIRROR OF `orphaned`, AND IT IS THE MORE SERIOUS OF THE TWO. An
  -- orphan is a file nobody points at — untidy, and a photograph that outlived
  -- its purpose. THIS is a row pointing at a file that is GONE, which renders as
  -- a broken face on somebody's screen. It should always be zero; if it is not,
  -- something deleted an object it should not have.
  missing_files integer not null,
  -- Up to fifty keys, so a human can act without re-deriving the set. Keys are
  -- `<uuid>/<timestamp>.<ext>` — no names, nothing identifying beyond an id the
  -- database already holds.
  orphan_keys text[] not null default '{}'
);

comment on table public.photo_orphan_scans is
  'Nightly count of storage objects nothing references. Reports only - never deletes. See db/migrations/20260816_photo_orphan_scan.sql.';

alter table public.photo_orphan_scans enable row level security;

-- ⚠️ NO POLICY, DELIBERATELY, WHICH MEANS NO ROLE READS IT THROUGH PostgREST.
-- RLS with zero policies denies everything, and `service_role` bypasses RLS
-- entirely — so the scan is readable from SQL and by nothing the browser can
-- reach. There is no screen for this yet; when there is one, it gets a policy
-- written for it rather than inheriting a wide one now.

-- ⚠️ AND THE DEFAULT GRANTS HAD TO BE TAKEN BACK, WHICH THE `enable row level
-- security` ABOVE DOES NOT DO. Measured after applying: a new table in `public`
-- inherits Supabase's default privileges, and `authenticated` came out holding
-- the full SELECT/INSERT/UPDATE/DELETE set. Nothing is readable today because
-- RLS has no policies — which is exactly what makes it a trap rather than a
-- harmless leftover: **the day somebody adds a policy for an admin screen, the
-- ceiling is already wide open and the policy is the only thing deciding.**
-- Grants are the ceiling, RLS is the gate, and this repo has been bitten by the
-- two being confused before.
--
-- `anon` was already granted nothing — checked with `has_table_privilege`, not
-- assumed, because `20260814_revoke_anon_table_privileges.sql` only ever touched
-- the tables that existed then. `service_role` keeps everything: it bypasses RLS
-- and it is what runs the scheduled scan.
revoke all on public.photo_orphan_scans from authenticated;
revoke all on public.photo_orphan_scans from anon;

-- ══ 2. The scan ════════════════════════════════════════════════════════════
--
-- ⚠️ SECURITY DEFINER BECAUSE `storage.objects` IS NOT READABLE OTHERWISE, and
-- the search_path is pinned for the reason every definer function here is: it
-- decides what gets counted, and an unpinned path is how that becomes somebody
-- else's table.
--
-- ⚠️ THE GRACE PERIOD IS LOAD-BEARING, AND IT IS THE ONE THING THAT WOULD MAKE
-- THIS LIE. An upload and the row write that records it are NOT atomic —
-- `MyPhotoField` uploads first and calls `set_my_photo` after — so an object
-- created seconds ago with nothing pointing at it is almost certainly a photo
-- mid-save, not an orphan. Anything younger than the interval is excluded, so a
-- busy evening does not read as a fault. It matters even for a counting job:
-- the whole value here is that a non-zero number means something.
create or replace function public.scan_photo_orphans(_grace interval default interval '24 hours')
returns setof public.photo_orphan_scans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  scanned public.photo_orphan_scans;
begin
  -- `player-photos` → public.players.photo_path
  insert into public.photo_orphan_scans (bucket, objects, referenced, orphaned, missing_files, orphan_keys)
  select 'player-photos',
         count(*),
         count(*) filter (where referenced),
         count(*) filter (where not referenced),
         (select count(*) from public.players p
           where p.photo_path is not null
             and not exists (select 1 from storage.objects o
                              where o.bucket_id = 'player-photos' and o.name = p.photo_path)),
         coalesce((array_agg(name order by created_at) filter (where not referenced))[1:50], '{}')
    from (
      select o.name, o.created_at,
             exists (select 1 from public.players p where p.photo_path = o.name) as referenced
        from storage.objects o
       where o.bucket_id = 'player-photos'
         and o.created_at < now() - _grace
    ) s
  returning * into scanned;
  return next scanned;

  -- `staff-photos` → public.profiles.photo_path
  insert into public.photo_orphan_scans (bucket, objects, referenced, orphaned, missing_files, orphan_keys)
  select 'staff-photos',
         count(*),
         count(*) filter (where referenced),
         count(*) filter (where not referenced),
         (select count(*) from public.profiles pr
           where pr.photo_path is not null
             and not exists (select 1 from storage.objects o
                              where o.bucket_id = 'staff-photos' and o.name = pr.photo_path)),
         coalesce((array_agg(name order by created_at) filter (where not referenced))[1:50], '{}')
    from (
      select o.name, o.created_at,
             exists (select 1 from public.profiles pr where pr.photo_path = o.name) as referenced
        from storage.objects o
       where o.bucket_id = 'staff-photos'
         and o.created_at < now() - _grace
    ) s
  returning * into scanned;
  return next scanned;
end;
$function$;

-- ⚠️ NOT EXECUTABLE BY ANY BROWSER ROLE. This reads `storage.objects` as its
-- definer, so a grant to `authenticated` would hand every signed-in account a
-- census of every photograph in the club. `revoke from anon` is restated
-- explicitly because Supabase's default privileges grant EXECUTE to `anon` BY
-- NAME and a bare `revoke from public` does NOT remove it — the finding of
-- 20260813_revoke_anon_execute.sql, reproduced twice since.
revoke all on function public.scan_photo_orphans(interval) from public;
revoke all on function public.scan_photo_orphans(interval) from anon;
revoke all on function public.scan_photo_orphans(interval) from authenticated;
grant execute on function public.scan_photo_orphans(interval) to service_role;

-- ══ 3. The schedule ════════════════════════════════════════════════════════
--
-- ⚠️ 22:41 UTC — a little after 02:40 in the UAE, and NOT the same minute as
-- `backup-player-photos` at 22:17. Two jobs on the same minute would interleave
-- their storage reads for no reason, and the odd minute keeps a coincidence in
-- the logs from looking like a pattern. Same reasoning as the backup job's own
-- note; the number is different on purpose.
--
-- ⚠️ NO net.http_post AND NO VAULT SECRET HERE, unlike the backup job. That one
-- has to reach an edge function because it talks to R2 over the network. This
-- one is pure SQL, so it runs in the database with nothing to authenticate and
-- no secret to leak.
select cron.schedule(
  'scan-photo-orphans',
  '41 22 * * *',
  $job$ select public.scan_photo_orphans(); $job$
);
