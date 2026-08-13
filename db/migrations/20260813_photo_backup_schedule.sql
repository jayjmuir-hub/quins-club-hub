-- 13 Aug 2026 — the photo backup gets a schedule, and byte-identity checking.
--
-- ⚠️ APPLIED TO PRODUCTION 13 Aug 2026, in three parts, in this order. Written
-- afterwards as the record; `apply_migration` strips `--` comments, so none of
-- this reasoning is in the database.
--
-- Runbook: claude/runbooks/player-photo-backup.md

-- ══ 1. pg_cron, and the nightly job ════════════════════════════════════════
--
-- ⚠️ pg_cron WAS NOT INSTALLED ON THIS PROJECT until now, which is why
-- `claude/state-of-play.md` said a scheduled edge function was something this
-- project could not do. Installing it is what made the difference between a
-- one-off copy and a backup.
create extension if not exists pg_cron;

-- ⚠️ 22:17 UTC is a little after 02:00 in the UAE — after the club has stopped
-- uploading and before anyone is looking. The minute is odd on purpose: nothing
-- else here runs on the hour, so a coincidence in the logs is not one.
--
-- ⚠️ THE SECRET IS READ FROM THE VAULT, NEVER TYPED. Same pattern as the three
-- notify triggers, and the reason no human — and no assistant — ever handles it.
select cron.schedule(
  'backup-player-photos',
  '17 22 * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'photo_backup_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret',
                 (select decrypted_secret from vault.decrypted_secrets where name = 'approval_notify_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
  $job$
);

-- ⚠️ AND `photo_backup_url` IS A VAULT SECRET DERIVED IN SQL, not typed:
--
--   select vault.create_secret(
--     replace((select decrypted_secret from vault.decrypted_secrets
--              where name = 'approval_notify_url'),
--             'notify-approval', 'backup-player-photos'),
--     'photo_backup_url', '…');
--
-- Same reasoning as pitch_notify_url and access_request_notify_url: the host
-- cannot drift between functions, and nobody reads or pastes the value.
--
-- ⚠️ THE SCHEDULE WAS PROVED TO FIRE, NOT ASSUMED. A temporary
-- 'photo-backup-probe' job at '* * * * *' was created, observed in
-- cron.job_run_details with status 'succeeded', its dry-run summary confirmed in
-- net._http_response, and then unscheduled. **A schedule that has never fired is
-- not a schedule** — the same rule state-of-play states for uptime monitors.


-- ══ 2. The source ETag ═════════════════════════════════════════════════════
--
-- DROP then CREATE, because a return type cannot be changed by CREATE OR
-- REPLACE. Additive from the caller's point of view — the deployed function read
-- only `name` — so this was safe to apply BEFORE redeploying, which is the
-- ordering rule for a non-destructive change.
drop function if exists public.photo_backup_list_objects(text, text, int);

create function public.photo_backup_list_objects(
  _bucket text,
  _after  text default '',
  _limit  int  default 1000
)
returns table (name text, size bigint, updated_at timestamptz, etag text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name,
         (o.metadata->>'size')::bigint,
         o.updated_at,
         o.metadata->>'eTag'
  from storage.objects o
  where o.bucket_id = _bucket
    and o.name > _after
  order by o.name
  limit least(greatest(_limit, 1), 1000)
$$;

-- ⚠️ THE REVOKE MUST BE REPEATED AFTER A DROP. A dropped function takes its ACL
-- with it, and the new one is created with Supabase's DEFAULT privileges — which
-- grant EXECUTE to anon and authenticated. Recreating without this line silently
-- reopens the hole db/tests/photo-backup.sql exists to catch. Verified after
-- applying: anon false, authenticated false, service_role true.
revoke all on function public.photo_backup_list_objects(text, text, int)
  from public, anon, authenticated;
grant execute on function public.photo_backup_list_objects(text, text, int)
  to service_role;

comment on function public.photo_backup_list_objects(text, text, int) is
  'Object keys, sizes and ETags in a storage bucket, keyset-paginated. service_role only; used by the backup-player-photos edge function.';


-- ══ 3. Byte-identity, recorded per run ═════════════════════════════════════
--
-- ⚠️ THE ONLY COLUMN ON THIS TABLE WHOSE NON-ZERO VALUE IS A FAULT.
-- `unrecognised` and `more_to_do` are informational; `only_in_backup` is the
-- feature working. A mismatch means a photograph in R2 is NOT the photograph in
-- Supabase — a truncated transfer, a re-encode, or the wrong object under the
-- right key — and the function counts "could not check" as a mismatch, so that
-- "we did not verify" can never be read as "we verified and it was fine".
--
-- NULL means the run predates this column, not that it passed.
alter table public.photo_backup_runs
  add column if not exists etag_mismatches int;
