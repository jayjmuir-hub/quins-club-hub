-- 13 Aug 2026 — the two database halves of the player-photo backup.
--
-- ⚠️ NOT APPLIED WHEN THIS FILE WAS WRITTEN. Apply it, then re-capture
-- db/schema/tables.sql, db/schema/functions.sql AND db/schema/grants.sql in the
-- same commit. `scripts/docs-check.mjs` fails the build if a migration grants on
-- a table grants.sql does not name, and db/schema/README.md records what a late
-- re-capture has cost twice.
--
-- Plan: claude/plans/2026-08-13-player-photo-backup.md
-- Runbook (deployment, restore, drill): claude/runbooks/player-photo-backup.md
--
-- ══ WHAT THIS IS FOR ═══════════════════════════════════════════════════════
--
-- The photographs of children are the only unrecoverable thing in the club.
-- The 13 Aug database restore drill proved storage objects are NOT in the
-- Supabase backup at all — only the database's metadata about them — so a
-- restored club has every player row pointing at an image that does not exist.
--
-- The mirror itself is the edge function `backup-player-photos`. This migration
-- gives it the two things it cannot do from outside the database: read the list
-- of objects, and leave a record that it ran.


-- ══ 1. THE SOURCE LISTING ══════════════════════════════════════════════════
--
-- ⚠️ WHY NOT THE STORAGE API. `POST /storage/v1/object/list/{bucket}` lists ONE
-- prefix at a time, and every key here is `<player_id>/<timestamp>.<ext>` — one
-- folder per player. Listing that way is one HTTP call per player, so at the
-- 1500 members Jay expects it is ~1000 round trips inside a single edge-function
-- invocation. This is one call per thousand objects instead, against the same
-- source of truth.
--
-- ⚠️ SECURITY DEFINER because `storage.objects` is not readable by any app role
-- and is not an exposed PostgREST schema. The search_path is pinned per the
-- three-way rule in db/schema/functions.sql: DEFINER always pins.
--
-- ⚠️ KEYSET PAGINATION, NOT OFFSET. `name > _after` rides the existing unique
-- index on (bucket_id, name); OFFSET walks every skipped row, which is the
-- finding already recorded against `.range()` in claude/state-of-play.md.
create or replace function public.photo_backup_list_objects(
  _bucket text,
  _after  text default '',
  _limit  int  default 1000
)
returns table (name text, size bigint, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name,
         (o.metadata->>'size')::bigint,
         o.updated_at
  from storage.objects o
  where o.bucket_id = _bucket
    and o.name > _after
  order by o.name
  limit least(greatest(_limit, 1), 1000)
$$;

-- ⚠️ service_role ONLY, and the revoke is the load-bearing half. Supabase's
-- default privileges hand `anon` and `authenticated` EXECUTE on new functions in
-- `public` — the same default that makes a new table open to anyone with the
-- project URL (claude/state-of-play.md). Without this revoke, any signed-in
-- account could enumerate every object key in every bucket, and a key is the
-- one thing needed to ask for a signed URL.
revoke all on function public.photo_backup_list_objects(text, text, int)
  from public, anon, authenticated;
grant execute on function public.photo_backup_list_objects(text, text, int)
  to service_role;

comment on function public.photo_backup_list_objects(text, text, int) is
  'Object keys in a storage bucket, keyset-paginated. service_role only; used by the backup-player-photos edge function.';


-- ══ 2. THE RUN LOG ═════════════════════════════════════════════════════════
--
-- ⚠️ THIS TABLE IS THE ONLY EVIDENCE THE BACKUP IS RUNNING, AND THAT IS NOT
-- BELT-AND-BRACES. pg_cron calls the function through pg_net, and pg_net NEVER
-- READS THE RESPONSE — the same property RESTORE.md records for the two mail
-- functions, where it is survivable because the in-app queue is the real record
-- and the email is only a prompt to go and look. A backup has no such second
-- record. Without a row here, a mirror that has been failing for six weeks and
-- a mirror that is working look identical from every screen in the app.
create table if not exists public.photo_backup_runs (
  id             uuid        not null default gen_random_uuid(),
  bucket         text        not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  -- Counts, all as measured during the run rather than assumed.
  source_objects int,
  backup_objects int,
  copied         int         not null default 0,
  failed         int         not null default 0,
  -- Keys not in the <player_id>/<timestamp>.<ext> shape. Copied anyway; counted
  -- so an unexpected shape is visible instead of silent.
  unrecognised   int         not null default 0,
  -- ⚠️ TRUE when the per-run cap stopped the run with work still to do. "No
  -- silent caps" — a run that copied its maximum and stopped must not read as a
  -- run that finished the job.
  more_to_do     boolean     not null default false,
  error          text,

  constraint photo_backup_runs_pkey primary key (id)
);

-- Newest first is the only way this table is ever read.
create index if not exists photo_backup_runs_started_idx
  on public.photo_backup_runs (started_at desc);

alter table public.photo_backup_runs enable row level security;

-- ⚠️ READ-ONLY TO EVERY APP ROLE, ON PURPOSE — there is no INSERT, UPDATE or
-- DELETE policy and there must never be one. The edge function writes with the
-- service role, which bypasses RLS entirely. A run log an admin can edit is not
-- a log; if this table can be rewritten from the app, it stops being evidence.
create policy "photo backup run read admin"
  on public.photo_backup_runs
  for select
  to authenticated
  using (private.is_admin_anywhere());

-- ⚠️ THE REVOKE FIRST. A table created in `public` inherits Supabase's default
-- privileges, which give `anon` full table rights. RLS then stands alone as the
-- only protection, and this table is not worth that risk for the sake of a line.
revoke all on public.photo_backup_runs from anon, authenticated;
grant select on public.photo_backup_runs to authenticated;

-- ⚠️ SPELLED OUT RATHER THAN INHERITED. service_role writes these rows, and it
-- does so through PostgREST, which needs the table privilege even though
-- service_role bypasses RLS. Supabase's defaults would probably supply it; a
-- backup whose only evidence trail depends on "probably" is not one.
--
-- ⚠️ AND THIS LINE DOES NOT MAKE THE RUN LOG APPEND-ONLY — MEASURED AFTER
-- APPLYING, 13 Aug 2026. The first draft ended "no DELETE: a run row is a record
-- of what happened", which described the GRANT and not the OUTCOME: Supabase's
-- default privileges had already handed service_role all eight privileges,
-- DELETE and TRUNCATE included, and a GRANT cannot take one away. Naming three
-- privileges here changes nothing about what service_role can do.
-- **A revoke would be the only way to mean it, and this migration does not do
-- one** — the run log is evidence for a human reading it, not a tamper-proof
-- record, and pretending otherwise in a comment is worse than the gap.
grant select, insert, update on public.photo_backup_runs to service_role;


-- ══ WHAT IS NOT DONE HERE ══════════════════════════════════════════════════
--
-- ⚠️ NO SCHEDULE. `pg_cron` is NOT INSTALLED on this project — measured
-- 13 Aug 2026, `installed_version` null — so the cron job cannot be created by
-- this file. Enabling an extension on the production database is Jay's call and
-- his click; the runbook carries the exact steps and the job definition.
--
-- ⚠️ NO SECRETS. The R2 credentials live in Supabase's function secrets and
-- never in this repo, this migration, a commit or a chat. This repo is PUBLIC.
--
-- ⚠️ NOTHING TOUCHES `player-photos` ITSELF. Its bucket settings, its storage
-- policies and src/data/photos.js are all unchanged, deliberately: a backup that
-- needs the thing it is backing up to change first is a backup that can break
-- the live feature on the way in.
