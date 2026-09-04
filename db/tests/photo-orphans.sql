-- ══════════════════════════════════════════════════════════════════════════
--  PHOTO ORPHANS HARNESS — no photograph is left with nothing pointing at it,
--  and no row is left pointing at a photograph that is gone.
--  Run via `npm run db:check` (claude/runbooks/db-harnesses.md), or paste into
--  the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing runs inside a
--  transaction that ROLLS BACK, and the only writes are the deliberate faults
--  in part 3, undone with it. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS. Five orphaned staff photos were found BY HAND on
-- 15 Aug 2026 — four of them one head shot re-uploaded five times while the
-- photo positioner silently did nothing with the result. Nothing was watching,
-- and nothing would have been. The write paths are fixed now (replace on #169;
-- `deletePlayer` and account deletion alongside this file), but every one of
-- those cleanups is BEST-EFFORT and swallows its own failure by design — a
-- failed tidy-up must never turn a successful save or deletion into an error.
-- That design choice is correct and it is exactly why something has to count.
--
-- ⚠️ IT COUNTS. IT DOES NOT DELETE — and neither does the nightly job it shares
-- its query with (`public.scan_photo_orphans`). `staff-photos` is mirrored
-- NOWHERE, so an automatic delete there is unrecoverable. Jay's call, 16 Aug
-- 2026. **Do not "finish" either one by adding a delete.**
--
-- ⚠️ AND SQL COULD NOT DELETE EVEN IF IT WANTED TO. `storage.objects` carries a
-- `protect_delete` trigger that raises 42501 on any direct DELETE. The
-- `storage.allow_delete_query` escape hatch drops the ROW and leaves the FILE,
-- which is not a delete — it is losing track of a photograph. See RESTORE.md.
--
-- ⚠️ THE GRACE PERIOD IS WHAT STOPS THIS CRYING WOLF. An upload and the row
-- write that records it are not atomic — `MyPhotoField` uploads, then calls
-- `set_my_photo` — so an object thirty seconds old with nothing pointing at it
-- is a photo mid-save. Anything younger than 24 hours is excluded, here and in
-- the scheduled scan, and the two must keep using the same rule.

begin;

create temp table _res (part int, what text, got text) on commit drop;


-- ── 1. The live picture ────────────────────────────────────────────────────
--
-- ⚠️ `missing_files` IS THE SERIOUS HALF. An orphan is a file nobody points at:
-- untidy, and a photograph outliving its purpose. A MISSING FILE is a row
-- pointing at an object that is gone, which renders as a broken face on a
-- parent's screen — and it is what an over-eager cleanup produces. It must be
-- zero, always.
insert into _res
select 1, 'player-photos orphaned (expect 0)', count(*)::text
  from storage.objects o
 where o.bucket_id = 'player-photos'
   and o.created_at < now() - interval '24 hours'
   and not exists (select 1 from public.players p where p.photo_path = o.name);

insert into _res
select 1, 'staff-photos orphaned (expect 0)', count(*)::text
  from storage.objects o
 where o.bucket_id = 'staff-photos'
   and o.created_at < now() - interval '24 hours'
   and not exists (select 1 from public.profiles pr where pr.photo_path = o.name);

insert into _res
select 1, 'players pointing at a missing file (expect 0)', count(*)::text
  from public.players p
 where p.photo_path is not null
   and not exists (select 1 from storage.objects o
                    where o.bucket_id = 'player-photos' and o.name = p.photo_path);

insert into _res
select 1, 'profiles pointing at a missing file (expect 0)', count(*)::text
  from public.profiles pr
 where pr.photo_path is not null
   and not exists (select 1 from storage.objects o
                    where o.bucket_id = 'staff-photos' and o.name = pr.photo_path);

-- ⚠️ DIAGNOSTIC, NOT AN ASSERTION. A real stranded object was found in
-- staff-photos on 4 Sep 2026 (~4 days old at the time) — the "staff-photos
-- orphaned (expect 0)" row above is correctly reporting it, not vacuous.
-- Storage cannot be deleted from SQL (`protect_delete`, see the header), so
-- this harness cannot clear its own drift; it prints what the next person
-- needs to act on it instead of a bare count.
do $diag$
declare
  cnt int;
  oldest timestamptz;
begin
  select count(*), min(o.created_at) into cnt, oldest
    from storage.objects o
   where o.bucket_id = 'staff-photos'
     and o.created_at < now() - interval '24 hours'
     and not exists (select 1 from public.profiles pr where pr.photo_path = o.name);
  if cnt > 0 then
    raise notice 'DIAGNOSTIC: % real staff-photos orphan(s) on production; oldest was created % (% old) — needs a human deletion decision, SQL cannot delete it (protect_delete)', cnt, oldest, age(now(), oldest);
  end if;
end
$diag$;

-- A snapshot of what is ALREADY orphaned, taken before part 3 injects
-- anything. Part 3's fault-injection checks compare against this baseline
-- instead of assuming it is zero — a real stranded object sitting on
-- production (see the diagnostic above) must not make the fault-injection
-- assertions pass or fail for the wrong reason.
create temp table _baseline(staff_orphans int) on commit drop;
insert into _baseline
select count(*)
  from storage.objects o
 where o.bucket_id = 'staff-photos'
   and o.created_at < now() - interval '24 hours'
   and not exists (select 1 from public.profiles pr where pr.photo_path = o.name);


-- ── 2. The scheduled scan exists and cannot be reached from a browser ──────
--
-- ⚠️ THE GRANT IS THE POINT, NOT A FORMALITY. `scan_photo_orphans` is SECURITY
-- DEFINER over `storage.objects`, so EXECUTE for `authenticated` would hand
-- every signed-in parent a census of every photograph in the club. `anon` is
-- checked BY NAME because Supabase's default privileges grant to it explicitly
-- and a bare `revoke from public` does not remove it.
insert into _res
select 2, 'nightly scan job is scheduled (expect t)',
       exists (select 1 from cron.job where jobname = 'scan-photo-orphans' and active)::text;

insert into _res
select 2, 'anon may execute the scan (expect f)',
       has_function_privilege('anon', 'public.scan_photo_orphans(interval)', 'EXECUTE')::text;

insert into _res
select 2, 'authenticated may execute the scan (expect f)',
       has_function_privilege('authenticated', 'public.scan_photo_orphans(interval)', 'EXECUTE')::text;

-- RLS with no policy denies everything; service_role bypasses RLS. So the scan
-- table is reachable from SQL and from nothing the browser can call.
insert into _res
select 2, 'scan table has RLS on (expect t)',
       relrowsecurity::text from pg_class where oid = 'public.photo_orphan_scans'::regclass;

insert into _res
select 2, 'scan table policy count (expect 0)',
       count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'photo_orphan_scans';


-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ 3. THE FAULT INJECTION. Without it, every zero above is equally well
--  explained by "the query matches nothing, ever" — which is precisely how
--  five real orphans sat unnoticed. Strand a photo on purpose and the same
--  query must find it.
-- ══════════════════════════════════════════════════════════════════════════

-- A stranded object: old enough to be past the grace period, pointed at by
-- nobody. Inserted directly because that is the only way to fabricate one —
-- there is no upload API in here.
insert into storage.objects (bucket_id, name, owner, created_at, updated_at, metadata)
values ('staff-photos',
        '00000000-0000-4000-8000-0000000000ff/1700000000000.jpg',
        null,
        now() - interval '7 days',
        now() - interval '7 days',
        '{"size": 1}'::jsonb);

-- ⚠️ RELATIVE TO _baseline, NOT TO ZERO. A real stranded object already on
-- production (see the diagnostic above part 2) would otherwise land at 2 here
-- and make this check fail for the wrong reason — production drift, not a
-- broken assertion. Subtracting the baseline keeps it discriminating whatever
-- else is sitting in the bucket.
insert into _res
select 3, 'INJECTED orphan increases the count by 1 (expect 1)',
       (count(*) - (select staff_orphans from _baseline))::text
  from storage.objects o
 where o.bucket_id = 'staff-photos'
   and o.created_at < now() - interval '24 hours'
   and not exists (select 1 from public.profiles pr where pr.photo_path = o.name);

-- ⚠️ AND THE GRACE PERIOD MUST ACTUALLY BITE. A brand-new stranded object is
-- the normal shape of a photo mid-save, and counting it would make this harness
-- fail every time somebody uploads while it runs — which is the fastest way to
-- get a check ignored.
insert into storage.objects (bucket_id, name, owner, created_at, updated_at, metadata)
values ('staff-photos',
        '00000000-0000-4000-8000-0000000000fe/1700000000001.jpg',
        null,
        now(),
        now(),
        '{"size": 1}'::jsonb);

insert into _res
select 3, 'a JUST-UPLOADED stranded object adds nothing more (expect still +1, not +2)',
       (count(*) - (select staff_orphans from _baseline))::text
  from storage.objects o
 where o.bucket_id = 'staff-photos'
   and o.created_at < now() - interval '24 hours'
   and not exists (select 1 from public.profiles pr where pr.photo_path = o.name);

-- And the mirror: a row pointing at a file that does not exist must be caught.
update public.profiles
   set photo_path = '00000000-0000-4000-8000-0000000000fd/nope.jpg'
 where id = (select id from public.profiles order by id limit 1);

insert into _res
select 3, 'INJECTED missing file is detected (expect >= 1)', count(*)::text
  from public.profiles pr
 where pr.photo_path is not null
   and not exists (select 1 from storage.objects o
                    where o.bucket_id = 'staff-photos' and o.name = pr.photo_path);


-- ── 4. Verdict ─────────────────────────────────────────────────────────────
select part, what, got from _res order by part, what;

do $$
declare
  bad text;
begin
  select string_agg(what || ' -> ' || got, '; ') into bad
    from _res
   where (part = 1 and got <> '0')
      or (part = 2 and what like '%scheduled%' and got <> 'true')
      or (part = 2 and what like '%may execute%' and got <> 'false')
      or (part = 2 and what like '%RLS on%' and got <> 'true')
      or (part = 2 and what like '%policy count%' and got <> '0')
      or (part = 3 and what like '%INJECTED orphan%' and got <> '1')
      or (part = 3 and what like '%JUST-UPLOADED%' and got <> '1')
      -- ⚠️ the two rows above are already matched by these LIKE patterns
      -- after the label rename (still contain "INJECTED orphan" and
      -- "JUST-UPLOADED" respectively) — kept unrenamed here on purpose so
      -- this block does not silently stop matching them
      or (part = 3 and what like '%INJECTED missing%' and got = '0');

  if bad is not null then
    raise exception 'PHOTO ORPHAN HARNESS FAILED: %', bad;
  end if;
  raise notice 'photo-orphans: all checks passed';
end
$$;


-- ── 5. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did insert two rows into storage.objects and
-- really did repoint a live profile at a file that does not exist.
-- ⚠️ `protect_delete` would refuse a DELETE on those injected rows — which is
-- exactly why this harness never tries to delete one. The ROLLBACK undoes the
-- INSERTs without ever issuing a DELETE, which is the only reason this file can
-- inject a storage row at all.
rollback;
