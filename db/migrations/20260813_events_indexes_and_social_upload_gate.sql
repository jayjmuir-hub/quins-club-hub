-- 13 Aug 2026 — two unrelated fixes that share one property: both were found by
-- MEASURING LIVE rather than by reading the repo, and neither is visible at the
-- club's current size.
--
-- ⚠️ NOT YET APPLIED WHEN THIS FILE WAS WRITTEN. Apply it, then re-capture
-- db/schema/ in the same commit. See db/schema/README.md — pasting this file
-- into tables.sql is NOT capturing the database, and produces a file that looks
-- complete.
--
-- ❌ **THIS HEADER SAID "RUN IT ON A SUPABASE BRANCH FIRST" AND THAT ADVICE IS
-- DEAD.** Tried 13 Aug 2026: the branch came back `MIGRATIONS_FAILED` with zero
-- tables, because a branch replays the parent's migration HISTORY and this
-- project's history is polluted — 89 rows, 12 of them the stale
-- `accept_invite_multi_target` that reverts a security guard on re-run. See
-- claude/state-of-play.md, 13 Aug.
--
-- ✅ **WHAT WAS DONE INSTEAD, AND IT IS STRONGER EVIDENCE THAN THE BRANCH WOULD
-- HAVE BEEN.** Section 2 below was proved on PRODUCTION inside a transaction that
-- rolled back — against the real schema and the real data, where a branch carries
-- `with_data: false`. The rollback mechanism itself was probed with a throwaway
-- table BEFORE anything was relied on it, and the live policy and row counts were
-- re-read afterwards to confirm nothing persisted.
--
-- ⚠️ **THE RUN INJECTED THE FAULT FIRST, WHICH IS THE HALF THAT MATTERS.** Against
-- the live policy as it stands, a signed-in account with ZERO memberships was
-- ALLOWED to upload — the bug demonstrated by EXECUTING it, not by reading the
-- policy text. Then, with the new policy in the same transaction: stranger
-- REFUSED, active member under their own prefix ALLOWED, active member under
-- somebody else's prefix REFUSED. All four as intended.
--
-- =====================================================================
-- 1. events — the two indexes every read path needs and none of which exist
-- =====================================================================
--
-- MEASURED 13 Aug 2026 against live: public.events carries exactly three
-- indexes — events_pkey, events_series_id_idx, events_group_id_idx. There is
-- nothing on team_id, nothing on starts_at, nothing on club_id.
--
-- ⚠️ THIS PARTLY OVERTURNS A RECORDED RULING, AND THE RULING'S OWN LAST LINE IS
-- WHAT ASKED FOR IT. claude/state-of-play.md, under "Checked and genuinely fine
-- — do not fix these":
--
--     The unindexed foreign keys. An index on an empty table is pointless.
--     ⚠️ Re-measure before citing this once real data lands.
--
-- That is still correct FOR FOREIGN KEYS. It does not cover starts_at, which is
-- not a foreign key, is the column every schedule read SORTS on, and was never
-- what that ruling was about. This is the re-measurement it asked for.
--
-- WHAT ACTUALLY RUNS AGAINST THIS TABLE:
--   * src/data/events.js listEvents — team_id in (...) AND starts_at between
--     the 12-back/6-forward window (src/lib/eventWindow.js), ordered
--     starts_at, id.
--   * src/data/limits.js fetchAllPages — pages that same query with .range(),
--     which is OFFSET/LIMIT, so page N re-scans and discards N × 900 rows.
--   * public.calendar_events_for_token — joins events and runs a correlated
--     EXISTS per row.
--   * the allocation grid, the dashboard, the match-sheet list.
-- and then the RLS policy "event read" calls private.is_attached_to_team() for
-- every row the scan produces.
--
-- ⚠️ WHY THIS IS URGENT-ISH DESPITE 9 ROWS TODAY. src/data/limits.js sizes the
-- club's own realistic worst case at ~1,690 events over the 18-month window,
-- and `authenticated` carries statement_timeout = 8s (measured 10 Aug). The far
-- end of an unindexed sort here is a hard 8-second FAILURE on the Schedule
-- screen, not a slow one — and it arrives without warning, because the same
-- query is instant at every size anyone has tested.
--
-- ⚠️ DO NOT SIZE THIS FROM `EXPLAIN ANALYZE` WALL TIME ON THIS SCHEMA — it is
-- inflated roughly 4x (state-of-play). Read the plan SHAPE: the win is
-- Seq Scan + Sort becoming an Index Scan, and that is visible regardless.

-- The main one. Leading column is the equality filter, trailing column is both
-- the range filter AND the sort, which is what lets one index serve all three.
create index if not exists events_team_starts_idx
  on public.events (team_id, starts_at);

-- The admin / all-squads path. listEvents with no team filter, and the
-- allocation grid, both scope by club and window rather than by squad.
-- ⚠️ NOT redundant with the index above: a composite index cannot be used for a
-- club-wide scan when its leading column (team_id) is unconstrained.
create index if not exists events_club_starts_idx
  on public.events (club_id, starts_at);

-- Named in the live advisor as an unindexed foreign key, and unlike the ~24
-- others it sits on the hot table and is joined on every calendar read
-- (calendar_events_for_token LEFT JOINs league_teams).
create index if not exists events_league_team_id_idx
  on public.events (league_team_id);

-- ⚠️ DELIBERATELY NOT DONE HERE: the other ~24 unindexed foreign keys the
-- advisor lists. Almost all are *_by audit columns (created_by, updated_by,
-- recorded_by, decided_by) that nothing queries BY. Indexing them all would be
-- cargo cult — an index costs write throughput and disk to buy nothing. The
-- ruling in state-of-play stands for those.


-- =====================================================================
-- 2. social-ideas storage — the membership check the ROW has and the IMAGE does not
-- =====================================================================
--
-- ⚠️ VERIFIED AGAINST LIVE 13 Aug 2026, not read off the migration. The WITH
-- CHECK on "social idea image write" is, in full:
--
--     bucket_id = 'social-ideas' AND private.social_idea_owner(name) = auth.uid()
--
-- That is the entire condition. social_idea_owner is
-- split_part(name, '/', 1)::uuid, so it proves only that you are writing under
-- a folder named after your own user id.
--
-- ⚠️ THE ROW POLICY ON THE SAME FEATURE GETS THIS RIGHT AND THE IMAGE POLICY
-- DOES NOT — that asymmetry is the whole bug. "social idea create" requires:
--
--     EXISTS (SELECT 1 FROM memberships m
--             WHERE m.profile_id = auth.uid()
--               AND m.club_id = social_ideas.club_id
--               AND m.status = 'active')
--
-- So a stranger cannot submit an IDEA and can upload an IMAGE. The upload is
-- the half that consumes storage and holds the content.
--
-- WHAT THAT ALLOWS TODAY: any account with a confirmed email and no memberships
-- at all can loop storage.from('social-ideas').upload(), 5 MB an object, with
-- no count limit, no quota and no moderation before the bytes land. Nothing
-- sweeps them; an object with no row appears on NO screen, including the Social
-- Media Management inbox that exists to review exactly this.
--
-- ⚠️ AND THE SEVERITY CHANGED WITH THE PRO UPGRADE RATHER THAN GOING AWAY.
-- On Free the ceiling was 1 GB, so the damage was "the bucket fills and
-- legitimate player photos silently stop saving". On Pro it is 100 GB, so the
-- damage is a BILL — and an open-ended one the moment the spend cap is turned
-- off. Fix this before touching that setting.
--
-- ⚠️ player-photos IS NOT AFFECTED AND MUST NOT BE "FIXED" TO MATCH. Its write
-- policy is can_edit_team(photo_team(name)) OR is_own_player(photo_player(name)),
-- and both of those already require a membership. This gap is specific to the
-- newest bucket.
--
-- ⚠️ CLUB-BLIND, DELIBERATELY, AND UNCHANGED BY THIS MIGRATION. An object key
-- carries no club id, so this cannot check club_id the way the row policy does
-- — the same documented single-club assumption as private.is_admin_anywhere()
-- and can_admin_see_pending(). All three are revisited together if a second
-- club ever appears. What is added is "is a member of SOMETHING, actively",
-- which is the part that can be checked from a key.

drop policy if exists "social idea image write" on storage.objects;

create policy "social idea image write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'social-ideas'
    and private.social_idea_owner(name) = auth.uid()
    and exists (
      select 1 from public.memberships m
      where m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );


-- =====================================================================
-- 3. private.social_idea_owner — pin the search_path
-- =====================================================================
--
-- Named by the live security advisor (function_search_path_mutable).
--
-- ⚠️ THIS IS NOT THE SAME CASE AS private.squad_expects_gender, which
-- state-of-play records as "recorded, not fixed" on the grounds that it is
-- SECURITY INVOKER, IMMUTABLE and touches no table. Both of those are true of
-- this function too — but squad_expects_gender is called from application
-- code, and THIS ONE IS CALLED FROM THREE storage.objects RLS POLICIES. A
-- helper that decides an access-control outcome is a higher-stakes place for an
-- unpinned search_path than one that maps a squad name to a gender, whatever
-- the volatility markers say. Pin it.

alter function private.social_idea_owner(text) set search_path = '';
