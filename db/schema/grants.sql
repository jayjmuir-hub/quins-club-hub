-- ══════════════════════════════════════════════════════════════════════════
--  GRANTS — table-level, column-level and default privileges in `public`
--  Captured from Supabase project lusmshimxdcxpnrktlgz (Postgres 17)
--  on 2026-08-10.
--
--  ⚠️ READ, DO NOT RUN. Like the rest of `db/schema/`, this is a snapshot
--  written to be diffed. It is not a migration.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- `db/schema/README.md` carried this warning from 9 Aug 2026:
--
--     ⚠️ `db/schema/` DOES NOT CAPTURE GRANTS ON TABLES OR COLUMNS. The larger
--     half of `20260808191310 profile_phone_and_column_grants` is a
--     column-level REVOKE/GRANT on `profiles` — the thing standing between a
--     member and rewriting someone's login email — and nothing in this
--     directory would diff it.
--
-- It was right, and `claude/state-of-play.md` called it "the one real gap …
-- and nothing currently checks it". This file is that gap closed. A clean
-- reconciliation of the other four files still says nothing about grants; a
-- clean reconciliation *including this one* does.
--
-- ⚠️ POSTGRES KEEPS NO TIMESTAMP FOR A GRANT. That is why this had to become a
-- captured file rather than a periodic audit: once an unintended grant exists,
-- nothing in the catalogue can say when it appeared or who made it. The 9 Aug
-- capture already hit this with five `proacl` lines in `functions.sql` that
-- could not be attributed to any migration. A diff against a committed
-- snapshot is the only mechanism that answers "did this change".
--
-- HOW TO RE-CAPTURE. Three queries, in the Supabase SQL editor. Re-run them
-- with the migration, not three days later — the diff is only useful while it
-- is small enough to read.
--
--   -- 1. table-level
--   select c.relname,
--          case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
--          string_agg(a.privilege_type, ', ' order by a.privilege_type)
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   cross join lateral aclexplode(c.relacl) a
--   where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
--   group by 1,2 order by 1,2;
--
--   -- 2. column-level
--   select c.relname, att.attname,
--          case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
--          string_agg(a.privilege_type, ', ' order by a.privilege_type)
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   join pg_attribute att on att.attrelid = c.oid and att.attnum > 0
--                        and not att.attisdropped
--   cross join lateral aclexplode(att.attacl) a
--   where n.nspname = 'public'
--   group by 1,2,3 order by 1,2,3;
--
--   -- 3. default privileges (what a NEW object will be born with)
--   select coalesce(n.nspname,'(all)'), d.defaclrole::regrole::text, d.defaclobjtype,
--          case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
--          string_agg(a.privilege_type, ', ' order by a.privilege_type)
--   from pg_default_acl d
--   left join pg_namespace n on n.oid = d.defaclnamespace
--   cross join lateral aclexplode(d.defaclacl) a
--   group by 1,2,3,4 order by 1,2,3,4;
--
-- ⚠️ FUNCTION `EXECUTE` GRANTS ARE **NOT** HERE. They are captured as `proacl`
-- lines in `functions.sql` and have been since 7 Aug. Do not duplicate them —
-- a second copy of a fact is a copy that drifts.


-- ── 1. DEFAULT PRIVILEGES ──────────────────────────────────────────────────
--
-- ⚠️ THE MOST IMPORTANT BLOCK IN THIS FILE, AND THE LEAST OBVIOUS. Supabase
-- ships `public` with default privileges that hand `anon` and `authenticated`
-- FULL table rights on every table created there, from BOTH `postgres` and
-- `supabase_admin` as granting role:
--
--     DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- So a new table in `public` is born reachable by an anonymous visitor, and
-- **RLS is the only thing between it and the internet.** Creating a table and
-- forgetting `enable row level security` is not a hardening oversight, it is a
-- public table. Every table in `public` does currently have RLS enabled —
-- `tables.sql` records that, and it is worth re-reading it as a load-bearing
-- fact rather than a tidy one.
--
-- This is stock Supabase and is NOT something to "fix" here: the whole PostgREST
-- model depends on those grants existing and RLS doing the filtering. It is
-- written down because the consequence is invisible from the DDL.
--
--   schema  granting role     object      grantee         privileges
--   public  postgres          tables      anon            ALL 8
--   public  postgres          tables      authenticated   ALL 8
--   public  postgres          tables      postgres        ALL 8
--   public  postgres          tables      service_role    ALL 8
--   public  supabase_admin    tables      anon            ALL 8
--   public  supabase_admin    tables      authenticated   ALL 8
--   public  supabase_admin    tables      postgres        ALL 8
--   public  supabase_admin    tables      service_role    ALL 8
--   public  (both)            sequences   anon/auth/pg/sr SELECT, UPDATE, USAGE
--   public  (both)            functions   anon/auth/pg/sr EXECUTE
--
-- ⚠️ `functions … EXECUTE` to `anon` is why every new `SECURITY DEFINER`
-- function is anon-callable the moment it is created. `state-of-play.md`
-- records that the anon-executable ones all fail safe, by three different
-- routes. That is a property of each function body, not of the grants — and
-- this default is why it has to be checked for every new one.
--
-- ── ⚠️ AMENDMENTS SINCE THAT CAPTURE. The table above is what was FOUND on
--    10 Aug 2026 and is left as found; these are the deliberate departures
--    from it. Two rows in it are no longer true.
--
--   `postgres tables anon ALL 8`           -> NONE, 14 Aug 2026
--       20260814_revoke_anon_table_privileges.sql
--   `postgres tables authenticated ALL 8`  -> ALL 8 MINUS TRUNCATE, 19 Aug 2026
--       20260819_revoke_truncate_from_authenticated.sql
--
-- ⚠️ THE TWO `supabase_admin` ROWS ARE UNCHANGED AND CANNOT BE CHANGED BY US.
-- We are not that role. Postgres only removes grants the revoking role itself
-- made, and — this is the trap — **a revoke by anyone else SUCCEEDS SILENTLY
-- AND DOES NOTHING.** Measured 19 Aug 2026 against `storage.objects`, whose
-- grantor is `supabase_storage_admin`: the revoke ran clean and
-- `has_table_privilege` still returned true.
--
-- ⚠️ CONSEQUENCE: a table created by OUR migrations (which run as `postgres`)
-- now arrives with neither an anon grant nor TRUNCATE. A table created by
-- Supabase's own machinery as `supabase_admin` still arrives with both, and
-- nothing in this file would say so. That is why `db/tests/anon-table-grants.sql`
-- and `db/tests/truncate-grants.sql` walk every table individually instead of
-- trusting the defaults.


-- ── 2. TABLE-LEVEL GRANTS ──────────────────────────────────────────────────
--
-- Almost every table in `public` grants all eight privileges to all four of
-- `anon`, `authenticated`, `postgres` and `service_role` — which is exactly what
-- the default privileges above produce — with the exceptions listed below, and
-- the exceptions are the whole point of the file.
--
-- ⚠️ THE COUNT THAT USED TO OPEN THIS PARAGRAPH SAID "FOURTEEN" AND WAS WRONG BY
-- 12 Aug 2026, when league_teams and the three match-sheet tables landed. Removed
-- rather than corrected: it is a number in a capture, and this repo has watched
-- every one of those rot. The list below is the record; count it if you need one.
--
-- ⚠️ `attendance` (10 Aug) IS SECTION 1 PROVING ITSELF. Its migration writes no
-- GRANT at all, and it arrived with all eight privileges for `anon` anyway. The
-- only thing between that table and anyone holding the project URL is the
-- `enable row level security` line in the same migration.
--
-- ── ⚠️ RE-CAPTURED 28 Aug 2026 — READ THE ROLE COLUMNS BELOW AS THE 10 Aug
--    SHAPE, NOT TODAY'S. Two of the four roles in every "ALL 8" line below have
--    moved since this list was captured, and the list is LEFT AS FOUND (this
--    file captures and amends; it does not rewrite history). Measured today with
--    `has_table_privilege` over every base table in `public`:
--
--      `anon`          — ZERO table privileges on all 66 base tables. Not
--                        SELECT, INSERT, UPDATE, DELETE or TRUNCATE, anywhere.
--                        So EVERY `anon` token in the list below is overtaken:
--                        the 14 Aug schema-wide revoke did land and still holds
--                        (20260814_revoke_anon_table_privileges.sql; fuller
--                        record in the ✅ OVERTAKEN block further down, the
--                        lineups capture). ⚠️ THIS LIST IS THE LINE THAT READ AS
--                        "anon still holds grants" AND SENT A READER CHASING A
--                        REGRESSION THAT DID NOT EXIST ON 28 Aug 2026 — which is
--                        why this banner now sits above it. anon was never the
--                        gate; RLS is. The revoke removed a ceiling that sat
--                        uselessly above RLS, not a working permission.
--      `authenticated` — "ALL 8" below is really SEVEN. TRUNCATE is gone
--                        everywhere (19 Aug; measured today: TRUNCATE on 0 of
--                        66). SELECT holds on 63 of 66 — the three it cannot
--                        read are availability_nudges, signup_nudges and
--                        photo_orphan_scans, each documented in its own block.
--
--    `postgres` and `service_role` are unchanged (service_role SELECT on all
--    66). The per-table role columns below are the 10 Aug capture and are kept
--    as the historical record; the live shape is the four bullets above.
--
--   access_requests   anon, authenticated, postgres, service_role   ALL 8
--   attendance        anon, authenticated, postgres, service_role   ALL 8
--   availability      anon, authenticated, postgres, service_role   ALL 8
--   calendar_tokens   anon, authenticated, postgres, service_role   ALL 8
--   clubs             anon, authenticated, postgres, service_role   ALL 8
--   events            anon, authenticated, postgres, service_role   ALL 8
--   invite_targets    anon, authenticated, postgres, service_role   ALL 8
--   invites           anon, authenticated, postgres, service_role   ALL 8
--   memberships       anon, postgres, service_role                  ALL 8
--   memberships       authenticated    ← NO table-level UPDATE, as of 10 Aug
--                                        2026. DELETE, INSERT, MAINTAIN,
--                                        REFERENCES, SELECT, TRIGGER, TRUNCATE
--   league_teams      anon, authenticated, postgres, service_role   ALL 8
--                     ⚠️ ADDED 12 Aug 2026, and the `anon` row is Supabase's
--                     DEFAULT PRIVILEGES rather than intent — the migration
--                     grants nothing. RLS is the only thing keeping anon out,
--                     and it does: `league team read` requires a non-null
--                     auth.uid(), verified live by db/tests/rls-league-teams.sql
--                     (anon reads zero rows). This is the same shape the note
--                     at the top of this file describes for every new table.
--   match_sheets      anon, authenticated, postgres, service_role   ALL 8
--   match_sheet_slots anon, authenticated, postgres, service_role   ALL 8
--   match_sheet_cards anon, authenticated, postgres, service_role   ALL 8
--                     ⚠️ ADDED 12 Aug 2026. As with league_teams, the `anon`
--                     row is Supabase's DEFAULT PRIVILEGES and not intent —
--                     the migration grants nothing on these tables. RLS is
--                     what keeps anon out: all three policies resolve through
--                     private.can_edit_team, which tests auth.uid() against
--                     memberships and cannot match a null uid.
--   drills            anon, authenticated, postgres, service_role   ALL 8
--   session_templates anon, authenticated, postgres, service_role   ALL 8
--   session_template_blocks  anon, authenticated, postgres, service_role   ALL 8
--   training_focus    anon, authenticated, postgres, service_role   ALL 8
--   training_sessions anon, authenticated, postgres, service_role   ALL 8
--   training_session_blocks  anon, authenticated, postgres, service_role   ALL 8
--                     ⚠️ ADDED 21 Aug 2026. As with league_teams, the `anon`
--                     row is Supabase's DEFAULT PRIVILEGES and not intent —
--                     the migration grants nothing on these tables. RLS keeps
--                     anon out: every read policy requires a non-null
--                     auth.uid() or resolves through is_attached_to_team.
--   drill_likes       authenticated    ← SELECT, INSERT, DELETE
--   template_likes    authenticated    ← SELECT, INSERT, DELETE
--   drill_favorites   authenticated    ← SELECT, INSERT, DELETE
--   template_favorites authenticated   ← SELECT, INSERT, DELETE
--                     ⚠️ ADDED 27 Aug 2026 (training shelf). Birth defaults
--                     trimmed the same way message_reactions was: REVOKE ALL
--                     then GRANT the three verbs. RLS: signed-in read;
--                     insert/delete only profile_id = auth.uid(). No UPDATE.
--                     Cascading off the drill does not relax ON DELETE
--                     RESTRICT on session_template_blocks.drill_id.
--   photo_backup_runs postgres, service_role                        ALL 8
--   photo_backup_runs authenticated    ← SELECT ONLY
--   photo_backup_runs anon             ← NOTHING AT ALL
--                     ⚠️ ADDED 13 Aug 2026, and it is THE FIRST TABLE IN THIS
--                     SCHEMA WHERE `anon` HOLDS NO PRIVILEGE. Every note above
--                     says the `anon` row is Supabase's default rather than
--                     intent, and leans on RLS to keep anon out. Here the
--                     default was revoked as well, so RLS is not standing alone.
--                     ⚠️ IF A RE-CAPTURE EVER SHOWS anon BACK ON THIS TABLE,
--                     that is drift, not a version difference — the revoke is in
--                     db/migrations/20260813_photo_backup.sql.
--                     ⚠️ AND service_role STILL HAS ALL 8 INCLUDING DELETE. The
--                     migration asks for SELECT, INSERT, UPDATE and comments
--                     "no DELETE: a run row is a record of what happened" —
--                     ⚠️ THAT COMMENT DESCRIBES THE GRANT, NOT THE OUTCOME.
--                     Supabase's default privileges had already given
--                     service_role everything, and a GRANT cannot take a
--                     privilege away. Measured after applying, not assumed.
--   photo_orphan_scans postgres, service_role                       ALL 8
--   photo_orphan_scans authenticated   ← NOTHING AT ALL
--   photo_orphan_scans anon            ← NOTHING AT ALL
--                     ⚠️ ADDED 16 Aug 2026, and the SECOND table where `anon`
--                     holds nothing — but the FIRST where `authenticated` holds
--                     nothing either. Measured after applying: the table came
--                     out of `create table` with the full set granted to
--                     `authenticated` by Supabase's DEFAULT PRIVILEGES, and it
--                     was revoked in the same migration.
--                     ⚠️ RLS ALREADY DENIED EVERYTHING (the table has NO
--                     policies), so that grant was inert — and that is exactly
--                     why it was worth taking back rather than shrugging at.
--                     The day somebody adds a policy for an admin screen the
--                     ceiling would already be wide open, and the policy would
--                     be the only thing deciding. Grants are the ceiling, RLS
--                     is the gate.
--                     ⚠️ A RE-CAPTURE SHOWING EITHER ROLE BACK IS DRIFT, not a
--                     version difference — the revokes are in
--                     db/migrations/20260816_photo_orphan_scan.sql.
--   pitch_requests    anon, authenticated, postgres, service_role   ALL 8
--   pitch_share_approvals authenticated  SELECT INSERT UPDATE DELETE REFERENCES TRIGGER (6)
--   pitch_share_approvals postgres, service_role  the same six + TRUNCATE (7)
--   pitch_share_approvals anon                                      ← NOTHING AT ALL
--                     ⚠️ ADDED 30 Aug 2026 with the sharing override
--                     (20260830_pitch_share_approvals.sql). MEASURED after
--                     applying, not guessed: the migration REVOKEs anon
--                     (Supabase's create-table default had handed it everything,
--                     and only a REVOKE takes that back — it now has nothing)
--                     and GRANTs select/insert/delete to authenticated, inert on
--                     top of the six the default already gave it. ⚠️ NOT "ALL 8"
--                     like the rows above — on this Postgres 17 project nobody
--                     holds MAINTAIN, and authenticated lacks TRUNCATE, so the
--                     honest counts are 6 and 7. RLS does the real gating
--                     (read = staff, write = is_admin).
--   pitches           anon, authenticated, postgres, service_role   ALL 8
--   player_contacts   anon, authenticated, postgres, service_role   ALL 8
--   player_parents    anon, authenticated, postgres, service_role   ALL 8
--   players           anon, authenticated, postgres, service_role   ALL 8
--   push_subscriptions authenticated, postgres, service_role        ALL 8
--   push_subscriptions anon                                         ← NOTHING AT ALL
--                     ⚠️ ADDED 18 Aug 2026 — `anon` NOTHING, same shape as
--                     photo_backup_runs and photo_orphan_scans before it.
--                     ⚠️ AND THE SAME LESSON photo_backup_runs's note already
--                     teaches, repeated because it bit again: the migration
--                     asks for `select, insert, update, delete` on
--                     `authenticated` and `select, delete` on `service_role`,
--                     commented as the intended shape. Measured after
--                     applying: BOTH roles came back with ALL 8, including
--                     MAINTAIN, REFERENCES, TRIGGER and TRUNCATE never asked
--                     for. Supabase's default privileges had already handed
--                     both roles everything at `create table`, and a GRANT
--                     cannot take a privilege away — only a REVOKE can, and
--                     none was written for these two. RLS (`push subscription
--                     own`, owner-only) is what actually scopes `authenticated`
--                     here; the grant is a ceiling far above it, not the
--                     boundary the migration's own comment implied.
--                     ⚠️ TRUNCATE ON `authenticated` IS NOT RLS-FILTERED AT
--                     ALL — Postgres never applies row security to TRUNCATE,
--                     so any signed-in member holds the ability to empty this
--                     table. Not unique to this table (`player_parents` and
--                     `memberships` carry the identical shape, measured the
--                     same day) — recorded here rather than fixed, since
--                     closing it project-wide is a separate piece of work
--                     this table did not create.
--   teams             anon, authenticated, postgres, service_role   ALL 8
--
--   profiles          anon, postgres, service_role                  ALL 8
--   profiles          authenticated    ← NO UPDATE. DELETE, INSERT, MAINTAIN,
--                                        REFERENCES, SELECT, TRIGGER, TRUNCATE
--
-- "ALL 8" throughout means:
--   DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- (`MAINTAIN` is new in Postgres 17. A capture taken against an older server
-- will show seven and that is a version difference, not drift.)
--
-- ⚠️ THE ASYMMETRY IS DELIBERATE BUT ONE-SIDED, AND WAS NOT WRITTEN DOWN
-- ANYWHERE UNTIL NOW. `20260808_profile_phone_and_column_grants.sql` revoked
-- table-level UPDATE on `profiles` from `authenticated` and granted it back on
-- five named columns. It did NOT revoke it from `anon`, which still holds
-- table-level UPDATE on `profiles`.
--
-- Measured, not assumed: `anon` is stopped by RLS alone. Both UPDATE policies
-- on `profiles` are role `PUBLIC` — so they do apply to `anon` — and both fail
-- for a null uid:
--     profile update own          USING (id = auth.uid())
--     profile update club admin   USING private.shares_admin_club(id)
-- `id = null` is null, not true, and an anonymous caller shares no admin club.
-- So there is no live hole. But the defence-in-depth that `authenticated` has
-- is absent for `anon`, and the belt is doing the work the braces were added
-- for. Recorded rather than changed: revoking it is a one-line migration with
-- a real chance of breaking a signup path nobody has re-tested.


-- ── 3. COLUMN-LEVEL GRANTS ─────────────────────────────────────────────────
--
-- The only column-level grants in the entire `public` schema. They exist
-- because table-level UPDATE was taken away above.
--
-- ⚠️ THE SENTENCE ABOVE SAID "Five columns of one table" UNTIL 13 Aug 2026, by
-- which point it named neither the right number nor the right number of tables
-- — `memberships` joined on 10 Aug. A count in a heading is a thing that rots;
-- the list below is the inventory.
--
--   profiles.first_name         authenticated   UPDATE
--   profiles.full_name          authenticated   UPDATE
--   profiles.last_name          authenticated   UPDATE
--   profiles.name_confirmed_at  authenticated   UPDATE
--   profiles.phone              authenticated   UPDATE
--   profiles.no_player_confirmed_at  authenticated  SELECT, UPDATE  ← 16 Aug 2026
--   profiles.no_role_confirmed_at    authenticated  SELECT, UPDATE  ← 16 Aug 2026
--   profiles.last_seen_at            authenticated  SELECT only     ← 26 Aug 2026
--     (20260826_last_seen.sql — readable so the admin Accounts screen can show
--     "Last active"; NEVER granted UPDATE: public.touch_last_seen() is the
--     only write path, SECURITY DEFINER, own-row, 12h-throttled.)
--
--   memberships.profile_id      authenticated   UPDATE
--   memberships.club_id         authenticated   UPDATE
--   memberships.team_id         authenticated   UPDATE
--   memberships.player_id       authenticated   UPDATE
--   memberships.role            authenticated   UPDATE
--   memberships.status          authenticated   UPDATE
--   memberships.title           authenticated   UPDATE   ← 13 Aug 2026
--   memberships.is_head_coach   authenticated   UPDATE   ← 18 Aug 2026
--   memberships.notify_approvals authenticated  UPDATE   ← 23 Aug 2026 (who is emailed about approvals)
--
-- ⚠️ SELECT ON `profiles` IS NOW COLUMN-LEVEL TOO (Phase 1b, 28 Aug 2026 —
-- 20260828_profiles_contact_revoke.sql). Table-level SELECT was REVOKED from
-- `authenticated` and granted back on every column EXCEPT `email` and `phone`,
-- so a narrowed admin cannot read a parent's login contact with a raw PostgREST
-- query. The ONLY read path for those two columns is now
-- public.member_contacts(uuid[]) (SECURITY DEFINER), which nulls them unless the
-- caller is entitled (self / a staff-or-admin target / an allowlisted admin / a
-- coach of the target's squad — private.can_see_member_contact).
--   profiles  authenticated  SELECT on ALL columns EXCEPT email, phone:
--     id, full_name, created_at, first_name, last_name, name_confirmed_at,
--     photo_path, photo_focus_x, photo_focus_y, no_player_confirmed_at,
--     no_role_confirmed_at, email_confirmed_at, signup_intent,
--     signup_intent_applied_at, welcomed_at, last_seen_at
-- ⚠️ THE COLUMN-LIST TRAP IS NOW LIVE ON SELECT: a NEW `profiles` column is
-- UNREADABLE by `authenticated` until it is added to that grant (and here).
-- Fail-closed and safe, but it reads app-wide as a null/absent column. The
-- "future revoke" the belt-and-braces SELECT grants below guarded against IS
-- THIS ONE — so those grants are now load-bearing, not belt-and-braces.
--
-- ⚠️ `profiles.no_player_confirmed_at` IS THE SECOND TIME THIS TRAP WAS MET AND
-- THE FIRST TIME IT WAS SEEN COMING. Added 16 Aug 2026 for the sign-in gate,
-- with its grant in the same migration — because `memberships.title` below had
-- already shown what happens without one. It also needs SELECT, unlike the five
-- above it. ⚠️ THAT SELECT USED TO BE COVERED BY TABLE-LEVEL SELECT — no longer:
-- Phase 1b (above) revoked it, so this explicit SELECT grant is now the reason
-- the column is readable at all. The "belt-and-braces against a future revoke"
-- became the whole belt on 28 Aug 2026.
--
-- ⚠️ `profiles.no_role_confirmed_at` IS THE MIRROR OF IT, added hours later the
-- same day (20260816_profile_no_role_confirmed.sql) for the fourth step of the
-- same gate — "do you do anything else at the club?". Identical shape, identical
-- trap: without the UPDATE grant the answer is refused, nothing surfaces, and
-- the person is asked again at every sign-in forever. ⚠️ **A REOPENED GATE LOOKS
-- EXACTLY LIKE A GATE THAT WAS NEVER ANSWERED**, which is what makes this
-- particular missing grant invisible rather than merely broken.
--
-- ⚠️ `memberships.title` IS WHY THIS SECTION IS NOT BOOKKEEPING. It is the first
-- column added to `memberships` since the table-level UPDATE was revoked, and
-- without its own grant (20260813_membership_title.sql) the save fails with
-- something that reads exactly like an RLS refusal on a policy that is working
-- correctly. **The fix for that failure is a COLUMN grant. Never
-- `grant update on public.memberships to authenticated`** — that would restore
-- write access to `is_super` and make the super-admin tier theatre again, with
-- no test failing and nothing visible in the app.
--
-- ⚠️ `memberships` JOINED THIS LIST ON 10 Aug 2026, and for exactly the reason
-- `profiles.email` is on it. `is_super` and `admin_rights` are NOT granted.
--
-- `memb manage` is FOR ALL and admin-only, so ANY ADMIN CAN ALREADY WRITE
-- MEMBERSHIP ROWS — including their own. Without the revoke, any admin could
-- set `is_super = true` on themselves and the super-admin tier would be
-- theatre. **RLS cannot close that**: the policy authorises the ROW, and "an
-- admin may write membership rows in their club" is true both before and after
-- the row gains the flag. Only a column privilege limits WHICH FIELDS.
--
-- The one write path is `public.set_admin_rights`, SECURITY DEFINER, which
-- checks `private.is_super_admin()` first and raises rather than returning
-- quietly — a silent no-op would look exactly like success on screen.
-- Harness: `db/tests/rls-super-admin.sql`, which proves an ordinary admin is
-- refused on the UPDATE path, the RPC path AND the INSERT path, that an
-- ordinary admin can still write the columns it should, and that a real super
-- admin can do all of it. That last part matters: a build that refuses
-- EVERYONE looks identical from the ordinary admin's side alone.
--
-- ⚠️ INSERT IS NOT COLUMN-RESTRICTED, deliberately — a column grant on INSERT
-- would block the DEFAULTS too, so an ordinary `insert into memberships (...)`
-- would fail. The insert path is guarded by the RESTRICTIVE policy
-- `memb no self promotion` instead, which refuses a new row that arrives
-- already carrying the flag or any rights.
--
-- ⚠️ WHAT IS NOT ON THAT LIST IS THE POINT. `profiles` has eight columns; the
-- three excluded are:
--
--   id          — the auth user id. The join to `auth.users` and to every
--                 membership row.
--   created_at  — audit.
--   email       — ⚠️ THE ONE THAT MATTERS. This is the login identity. Without
--                 the revoke, `profile update own` (USING id = auth.uid())
--                 would let any signed-in member rewrite their own row's email
--                 — and `profile update club admin` would let a club admin
--                 rewrite ANY member's. The RLS policy authorises the ROW; only
--                 the column grant limits WHICH FIELDS. Nothing else in the
--                 database stops it.
--
-- ⚠️ SO THE POLICY LIST AND THE POLICY BODIES CANNOT TELL YOU THIS. Reading
-- `policies.sql` alone, `profile update own` looks like "a member may edit
-- their own profile", full stop. The five-column ceiling on that sentence lives
-- only here and in the migration. That gap is why this file had to exist.
--
-- Adding a column to `profiles` therefore has a decision attached: a new column
-- is NOT updatable by a member until it is granted, and it SHOULD only be
-- granted if a member editing it is intended. The failure mode is silent in
-- both directions — an ungranted column makes a save fail with a permission
-- error that looks like RLS, and an over-granted one hands out a field nobody
-- meant to expose.
--
-- Checked by `db/tests/grants.sql`, which asserts this list exactly and fails
-- loudly on either kind of drift.


-- ── 4. ⚠️ THE ONE-CLICK WAY TO DESTROY ALL OF THIS ─────────────────────────
--
-- Found in the Supabase dashboard on 10 Aug 2026, and it is the most dangerous
-- thing in this file.
--
-- **Integrations → Data API → Settings → Exposed tables** lists the tables in
-- `public`. All but one carry a green tick. `public.profiles` does not: it
-- is rendered in AMBER with a warning icon, and its tooltip reads
--
--     "This table has custom grants. Select it to override with standard Data
--      API grants for anon, authenticated, and service_role."
--
-- ⚠️ THE "PROBLEM" IT OFFERS TO FIX IS THE PROTECTION ITSELF. `profiles` is
-- flagged precisely BECAUSE table-level UPDATE was revoked from `authenticated`
-- and re-granted on five named columns — the thing standing between a club admin
-- and rewriting any member's login email. Clicking that row to make the amber
-- warning go away would "override with standard grants", hand table-level UPDATE
-- straight back, and silently undo section 3 of this file.
--
-- ⚠️ AND IT WOULD LOOK LIKE TIDYING UP. The dashboard presents it as an
-- inconsistency; the row is the only one not matching its neighbours; the fix is
-- one click, with no confirmation describing what is lost. Nothing in the app
-- would change, no test would fail, and no error would appear anywhere — this app
-- never attempts that write, so the extra privilege stays invisible until
-- somebody uses it.
--
-- **DO NOT CLICK IT. The amber row is correct, and must stay amber.**
--
-- What would catch it: `db/tests/grants.sql` fails immediately (`authenticated`
-- can UPDATE profiles.email), and a re-capture would diff section 2 back to a
-- uniform thirteen. ⚠️ **Both are manual.** Nothing automatic can see a dashboard.


-- ---------------------------------------------------------------------
-- public.social_ideas — COLUMN grants  (captured 12 Aug 2026)
--
-- ⚠️ POLICIES AUTHORISE THE ROW; GRANTS AUTHORISE THE COLUMN. "social idea
-- decide" is FOR UPDATE over the whole row, so without this an admin marking
-- an idea used is also authorised to rewrite the submitter's words and swap
-- their photo. Same protection as profiles.email, and §4 above records how
-- readily the Supabase dashboard offers to undo exactly this.
--
-- Verified after applying: table-level UPDATE to `authenticated` is NONE, and
-- the column list is exactly these four.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.social_ideas FROM authenticated;
GRANT UPDATE (status, decision_note, decided_by, decided_at)
  ON public.social_ideas TO authenticated;


-- ---------------------------------------------------------------------
-- public.feedback — COLUMN grants  (captured 18 Aug 2026)
--
-- Read from information_schema.table_privileges and .column_privileges after
-- applying 20260818_feedback.sql — NOT pasted from the migration.
--
-- ⚠️ POLICIES AUTHORISE THE ROW; GRANTS AUTHORISE THE COLUMN. "feedback
-- triage" is FOR UPDATE over the whole row, so without this an admin marking a
-- report done is also authorised to rewrite what the reporter said — turning
-- the record into what the admin remembers rather than what was reported.
--
-- Verified after applying: table-level UPDATE to `authenticated` is NONE, and
-- the column list is exactly these four.
--
-- ⚠️ `authenticated` DOES HOLD A TABLE-LEVEL **DELETE** GRANT HERE, AND THAT IS
-- NOT A MISTAKE — IT IS THE SUPABASE DEFAULT, AND IT MEANS THE THING STOPPING A
-- REPORT BEING DELETED IS THE ABSENCE OF A POLICY, NOT THE ABSENCE OF A GRANT.
-- 20260818_feedback.sql deliberately creates no DELETE policy: `wontfix` is the
-- answer to a report nobody will act on, and a deletable report is a findings
-- list that can be tidied into agreement with itself. **So adding any
-- permissive delete policy later opens it immediately** — the grant is already
-- there waiting. Measured, not assumed: authenticated holds DELETE, INSERT,
-- REFERENCES, SELECT, TRIGGER and TRUNCATE, and no UPDATE.
-- ---------------------------------------------------------------------
REVOKE UPDATE ON public.feedback FROM authenticated;
GRANT UPDATE (status, admin_note, handled_by, handled_at)
  ON public.feedback TO authenticated;


-- ---------------------------------------------------------------------
-- public.announcements — TABLE and COLUMN grants  (captured 14 Aug 2026)
--
-- Captured from information_schema.column_privileges and
-- .table_privileges after applying 20260814_announcements.sql — NOT pasted
-- from the migration.
--
-- ⚠️ `team_id` IS THE ONE THAT MATTERS, AND IT IS ABSENT FROM THE UPDATE LIST
-- ON PURPOSE. A notice's audience is fixed when it is posted. "announcement
-- edit" is FOR UPDATE over the whole row, so without this revoke an author
-- could re-scope a squad notice to the WHOLE CLUB after thirty families had
-- already read it — and the read receipts would then be counted against an
-- audience that never saw it, with nothing on the row to show it had happened.
-- The policy does not stop this; only the missing grant does.
--
-- ⚠️ `author_id`, `club_id` and `created_at` are absent for the same class of
-- reason: they are stamped by `announcements_provenance` and an admin editing a
-- typo must not be able to reassign authorship.
--
-- ⚠️ `updated_at` IS ALSO ABSENT, AND IT IS NOT AN OVERSIGHT. It is written by
-- the `announcements_touch` trigger, so an edit cannot claim not to have
-- happened — which is the only thing that column is for.
--
-- VERIFIED IN THE CAPTURE: table-level UPDATE to `authenticated` is NONE, and
-- the column-level UPDATE list for `authenticated` is exactly these four.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON public.announcements TO authenticated;
REVOKE UPDATE ON public.announcements FROM authenticated;
GRANT UPDATE (title, body, pinned, expires_at)
  ON public.announcements TO authenticated;


-- ---------------------------------------------------------------------
-- public.announcement_reads — TABLE grants  (captured 14 Aug 2026)
--
-- ⚠️ NO UPDATE, AND NO UPDATE OR DELETE POLICY EITHER, so a read cannot be
-- un-read or back-dated. `read_at` therefore means FIRST read, which is what
-- the word means. The client upserts with `ignoreDuplicates`.
--
-- ⚠️ THE CAPTURE SHOWS `authenticated` HOLDING TABLE-LEVEL **DELETE** HERE,
-- WHICH THIS MIGRATION NEVER GRANTED. It comes from Supabase's own
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`. It is inert — RLS is enabled and there is no
-- DELETE policy, so no row is deletable — but it is inert BY THE POLICY rather
-- than by the grant. Recorded as found; see the note below.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
REVOKE UPDATE ON public.announcement_reads FROM authenticated;


-- ---------------------------------------------------------------------
-- ✅ THE BLOCK BELOW IS OVERTAKEN AND KEPT AS THE 14 Aug RECORD — measured
-- again 25 Aug 2026 (57 base tables) and re-measured 28 Aug 2026 (66 base
-- tables): `anon` holds ZERO table privileges on every base table in `public`
-- (the 14 Aug schema-wide revoke migration did land; this block was simply
-- never re-annotated, and §2's list carried the stale `anon` columns until the
-- 28 Aug banner at its head). TRUNCATE is likewise gone from `authenticated`
-- everywhere (19 Aug; measured today on 0 of 66), and the default privileges
-- now hand new tables the 7 verbs without TRUNCATE and with no anon entry —
-- see §1's amendments.
--
-- ⚠️ `anon` HOLDS FULL TABLE PRIVILEGES ON EVERY TABLE IN `public`, INCLUDING
-- THESE TWO. MEASURED 14 Aug 2026, NOT REASONED ABOUT.
--
--   announcements, announcement_reads, social_ideas, events, players,
--   memberships, match_sheets
--     -> anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- Every one of the seven probed came back identical, so this is the schema's
-- pre-existing shape and NOT something the notices migration introduced. The
-- source is the same Supabase default-privileges line quoted above.
--
-- ⚠️ IT IS THE TABLE-LEVEL SIBLING OF THE FUNCTION-LEVEL FINDING RECORDED IN
-- `db/migrations/20260813_my_squad_staff.sql`, where six RPCs turned out to be
-- callable by `anon` for exactly this reason. The conclusion is the same one
-- that migration reached: these are safe today by their POLICIES, which all
-- test `auth.uid()` (null for `anon`), rather than by their grants — and this
-- repo's own rule says not to rely on that.
--
-- ⚠️ DELIBERATELY NOT FIXED HERE. Tightening only the two newest tables would
-- leave the schema inconsistent while fixing nothing an attacker could reach;
-- it is one migration across all of `public` or it is not worth doing. Logged
-- in `claude/state-of-play.md` §Open.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- public.announcement_stats() / public.announcement_audience(uuid)
--   (captured 14 Aug 2026)
--
-- ⚠️ THE EXPLICIT `FROM anon` IS LOAD-BEARING, not belt-and-braces — see the
-- header of db/migrations/20260813_my_squad_staff.sql. `REVOKE … FROM PUBLIC`
-- does NOT remove Supabase's by-name grant to `anon`.
--
-- Both are SECURITY DEFINER, so RLS is bypassed inside them and their own
-- WHERE clause (`author_id = auth.uid() OR private.is_admin(club_id)`) is the
-- only gate on the club's entire notice history.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.announcement_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.announcement_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.announcement_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.announcement_audience(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.announcement_audience(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.announcement_audience(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- public.lineups / public.lineup_players — TABLE grants  (captured 14 Aug 2026)
--
-- Captured from information_schema.table_privileges after applying
-- 20260814_match_lineups.sql — NOT pasted from the migration, which is the whole
-- point of this file. The two disagree, and the disagreement is the useful part.
--
-- ⚠️ THE MIGRATION GRANTED `SELECT, INSERT, UPDATE, DELETE`. THE CAPTURE SHOWS
-- `authenticated` ALSO HOLDING `TRUNCATE`, `REFERENCES` AND `TRIGGER`, which it
-- never granted. Same cause as the note on `announcement_reads` above: Supabase's
-- own `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`. Recorded as FOUND.
--
-- ⚠️ `TRUNCATE` IS THE ONE WORTH KNOWING ABOUT, BECAUSE TRUNCATE BYPASSES RLS.
-- It is inert through the API — PostgREST exposes SELECT/INSERT/UPDATE/DELETE and
-- has no TRUNCATE route — so nothing a client can send reaches it. It is NOT new
-- and NOT specific to these tables: the same default has applied to every table
-- in `public`. Left alone deliberately rather than revoked on two tables while
-- twenty-four others keep it, which would make the schema less consistent, not
-- more. **If it is ever tidied, tidy it schema-wide in its own migration.**
--
-- ✅ **THAT MIGRATION EXISTS AS OF 19 Aug 2026 AND THIS NOTE IS WHAT ASKED FOR
-- IT.** `20260819_revoke_truncate_from_authenticated.sql` took TRUNCATE from
-- `authenticated` on all 31 tables that held it and altered the `postgres`
-- default so the next one does not. So the TRUNCATE half of the paragraph above
-- is now history; REFERENCES and TRIGGER remain, and remain deliberate.
-- `db/tests/truncate-grants.sql` is what keeps it true.
--
-- ✅ `anon` DOES NOT APPEAR FOR EITHER TABLE, AND THAT IS THE LOAD-BEARING LINE.
-- The 14 Aug grants sweep revoked anon across `public`, but it revoked EXISTING
-- tables — it did not change the DEFAULT PRIVILEGES that decide what a NEW one
-- gets, and `pg_default_acl` still holds a supabase_admin entry that includes
-- anon. The migration's explicit `revoke all ... from anon` is why anon is absent
-- here. Fault-injected against live the same day: `set local role anon; select
-- from lineups` raises 42501 — refused by the GRANT, not merely returned empty.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lineups        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lineup_players TO authenticated;
REVOKE ALL ON public.lineups        FROM anon;
REVOKE ALL ON public.lineup_players FROM anon;


-- ---------------------------------------------------------------------
-- public.player_grades / public.player_positions — TABLE grants
-- (captured 14 Aug 2026 from information_schema.table_privileges)
--
-- ⚠️ TWO TABLES, DELIBERATELY DIFFERENT VISIBILITY, AND THE GRANTS LOOK
-- IDENTICAL BECAUSE THE DIFFERENCE IS IN THE POLICIES, NOT HERE. Both give
-- `authenticated` the four verbs; what separates them is that
-- `player grade manage` is can_edit_team on BOTH read and write with NO wider
-- read arm — so a PARENT CANNOT READ THEIR OWN CHILD'S GRADE — while
-- `player position read` is deliberately squad-wide. Anyone reading only this
-- file would conclude the two are the same; they are not.
--
-- ⚠️ `authenticated` ALSO HOLDS TRUNCATE / REFERENCES / TRIGGER, which neither
-- migration granted. Supabase's own `alter default privileges ... grant all on
-- tables` again — same note as lineups above, same conclusion: inert through
-- PostgREST, not new, and if it is ever tidied it should be tidied schema-wide.
--
-- ✅ **TRUNCATE WAS TIDIED SCHEMA-WIDE ON 19 Aug 2026**, exactly as this note
-- and the lineups note both asked — `20260819_revoke_truncate_from_authenticated.sql`.
-- ⚠️ It matters more here than almost anywhere else in this file: `player_grades`
-- holds a judgement about a child's ability, and TRUNCATE was the one privilege
-- on it that the policies could not have filtered. REFERENCES and TRIGGER stay.
--
-- ✅ `anon` APPEARS FOR NEITHER TABLE. That is the explicit revoke in each
-- migration, and for player_grades it is the line that matters most in this
-- file: it holds a judgement about a child's ability. Fault-injected the same
-- day — anon gets 42501, and an authenticated caller with no membership reads
-- zero rows and is refused 42501 on a write.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_grades    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_positions TO authenticated;
REVOKE ALL ON public.player_grades    FROM anon;
REVOKE ALL ON public.player_positions FROM anon;

-- ⚠️ THE VISIBILITY NOTE ABOVE IS OVERTAKEN, 25 Aug 2026: Jay made positions
-- staff-only, so `player position manage` now IS the player_grades shape and
-- the deliberate difference the note describes no longer exists — see
-- db/migrations/20260825_positions_staff_only.sql, which also adds
-- player_units (same shape, same grants). The note is left in place because
-- this file records what each capture found, and it was true when captured.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_units TO authenticated;
REVOKE ALL ON public.player_units FROM anon;

-- ---------------------------------------------------------------------
-- membership_audit  (17 Aug 2026) — the one table in this file that a client
-- may READ and may not WRITE, and the only one where that asymmetry is the
-- entire point.
--
-- ⚠️ THE PRIVILEGES ARE A SECOND, INDEPENDENT REFUSAL BENEATH RLS. The table has
-- ONE policy, `for select` scoped to `private.is_super_admin()`, and no write
-- policy at all — so RLS already denies every write by default. These revokes
-- mean a policy added later by mistake still cannot make the log editable
-- without somebody also changing this line.
--
-- ⚠️ TRUNCATE IS REVOKED, AND IT IS THE ONE THAT IS EASY TO MISS. Supabase
-- grants it to `authenticated` by default on every new table. PostgREST exposes
-- no truncate verb so it is not reachable today — but "not reachable through the
-- API we happen to use" is not a property to rest an audit log on. The first
-- probe of this table tested INSERT, UPDATE and DELETE and left TRUNCATE in
-- place; measured afterwards and removed.
--
-- ✅ `anon` APPEARS NOWHERE for this table, and REFERENCES/TRIGGER remain for
-- `authenticated` — Supabase defaults, inert through PostgREST, and the same
-- judgement this file already records for lineups and player_grades.
--
-- Measured 17 Aug 2026: authenticated holds SELECT (plus REFERENCES, TRIGGER)
-- and nothing that can change or remove a row.
-- ---------------------------------------------------------------------
GRANT SELECT ON public.membership_audit TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.membership_audit FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- membership_vouches  (17 Aug 2026) — "do you know this person?", answered by
-- the people already being asked to approve them.
--
-- No explicit GRANT or REVOKE: the table takes Supabase's defaults for
-- `authenticated` and is narrowed entirely by its two policies, both keyed on
-- `private.can_approve_team` — admins plus the coaches and managers of that
-- squad. ⚠️ A MEDIC IS OUTSIDE THAT SET, matching invite_parent: a medic cannot
-- approve, so a medic's opinion must not sit in the queue looking like one that
-- counts. Proved live 17 Aug with a CREATED medic fixture (the club has none),
-- printing can_approve = false beside the 0 so the zero is evidence.
--
-- ⚠️ THE WRITE POLICY'S `with check` PINS voucher_id TO auth.uid(). Without it a
-- coach could attribute an opinion to a colleague — which, for a signal whose
-- entire purpose is "who recognised them", is worse than no signal. Proved:
-- writing as another coach is REFUSED.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- notification_opt_outs  (19 Aug 2026) — which kinds of push a person does
-- NOT want. A row means OFF; no row means ON.
--
-- ⚠️ NO UPDATE GRANT, AND THAT IS THE INTERESTING LINE. The row carries no
-- editable state — it exists or it does not — so UPDATE could only ever be a
-- way to move somebody else's opt-out onto your own id, or your own onto
-- theirs. SELECT/INSERT/DELETE is the complete vocabulary.
--
-- ⚠️ `anon` IS REVOKED EXPLICITLY AT CREATION rather than left to the default,
-- the same as push_subscriptions and request_staff_role — because Supabase's
-- default privileges hand a new object to anon, authenticated and service_role
-- alike, and only an explicit revoke removes the named grant.
--
-- ⚠️ TRUNCATE IS ABSENT WITHOUT ANYBODY WRITING A REVOKE, AND THAT IS NEW.
-- Every table created before 19 Aug 2026 arrived with TRUNCATE for
-- `authenticated`; 20260819_revoke_truncate_from_authenticated.sql altered the
-- `postgres` default privilege so new ones do not. **This is the first table
-- created since, so its ACL is the proof that change works on a real new
-- table** — measured false on creation, and db/tests/truncate-grants.sql walks
-- every table so it stays that way.
--
-- ⚠️ service_role KEEPS the Supabase default, unrevoked: nothing reads this
-- table as service_role today, but public.notice_push_subscriptions is
-- SECURITY DEFINER and runs as its owner, so a future edge function that needs
-- to read preferences directly should not have to add a grant back.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON public.notification_opt_outs TO authenticated;
-- ✅ TRIMMED 26 Aug 2026 (20260826_trim_grant_ceilings.sql): the 25 Aug
-- measurement found live authenticated ALSO holding UPDATE plus the
-- MAINTAIN/REFERENCES/TRIGGER birth defaults — untrimmed since CREATE.
-- Revoked ALL and re-granted exactly the line above; db/tests/grants.sql
-- §5 asserts the ceiling.
REVOKE ALL ON public.notification_opt_outs FROM anon;

-- ---------------------------------------------------------------------
-- availability_nudges  (19 Aug 2026) — which people have already been asked
-- about which match. Written by the scheduled job, read by the edge function.
--
-- ⚠️ THE ONLY TABLE IN `public` THAT `authenticated` CANNOT TOUCH AT ALL, and
-- that is the point rather than an oversight. Every other table here grants a
-- member something. This one records who has NOT answered — which is nobody
-- else's business — and no screen reads it, so there is no grant to justify.
-- RLS is enabled with NO POLICY AT ALL, which is the tightest statement
-- available: enabled-and-unpoliced denies everyone who is not bypassing it.
--
-- ⚠️ MEASURED AFTER CREATION, NOT ASSUMED — `aclexplode` on the live table
-- returns exactly two grantees, `postgres` (the owner) and `service_role`.
-- Neither `anon` nor `authenticated` appears, so both the explicit REVOKEs in
-- the migration and the altered default privilege did what they claim.
--
-- ⚠️ TRUNCATE IS ABSENT FOR `authenticated` WITHOUT A REVOKE, for the same
-- reason notification_opt_outs records above: the `postgres` default privilege
-- was altered on 19 Aug 2026. This is the second table created since, so it is
-- the second piece of evidence that the change holds — and
-- db/tests/truncate-grants.sql walks every table so it stays true.
--
-- ⚠️ service_role KEEPS the Supabase default, unrevoked. It is not decoration
-- here: public.availability_push_subscriptions is SECURITY DEFINER, but the
-- edge function reaches this table through PostgREST as service_role when the
-- ledger ever needs inspecting, and removing the grant would make that a
-- silent 401 rather than an obvious error.
-- ---------------------------------------------------------------------
-- (no GRANT lines — anon and authenticated hold nothing on this table)
REVOKE ALL ON public.availability_nudges FROM anon;
REVOKE ALL ON public.availability_nudges FROM authenticated;


-- ---------------------------------------------------------------------
-- signup_nudges  (20 Aug 2026) — who has already been chased about an
-- unfinished sign-up, and which of the two reminders they were sent.
--
-- ⚠️ THE SECOND TABLE IN `public` THAT `authenticated` CANNOT TOUCH AT ALL,
-- for the same reason as availability_nudges above: it is a list of people the
-- club has had to chase, which is nobody else's business, and no screen reads
-- it. RLS is enabled with NO POLICY, the tightest statement available.
--
-- ⚠️ MEASURED AFTER CREATION, NOT ASSUMED — has_table_privilege on the live
-- table returns false for authenticated, and pg_policy returns zero rows.
-- Checked with a control (public.teams, which authenticated CAN read), because
-- "cannot read it" would also be true of a table that did not exist.
-- ---------------------------------------------------------------------
-- (no GRANT lines — anon and authenticated hold nothing on this table)
REVOKE ALL ON public.signup_nudges FROM anon;
REVOKE ALL ON public.signup_nudges FROM authenticated;


-- ---------------------------------------------------------------------
-- public.messages / public.channel_settings / public.message_reads
--   — TABLE and COLUMN grants  (captured 23 Aug 2026, rolled-back apply)
--
-- Captured from information_schema.table_privileges / column_privileges —
-- NOT pasted from the migration.
--
-- ⚠️ THE MIGRATION REVOKES FROM authenticated FIRST, AND THE CAPTURE IS WHY
-- THAT LINE EXISTS. Supabase's default privileges hand authenticated ALL on
-- every new table; without the revoke, the column-level UPDATE below would
-- have sat on top of a table-level one, and "message edit"'s WITH CHECK only
-- pins channel. Measured after the revoke: authenticated = INSERT, SELECT
-- at table level on messages, and UPDATE on exactly (body, deleted_at,
-- pinned). anon holds NOTHING on any of the three — unlike the 14 Aug
-- tables, which recorded anon's default full privileges as found.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT UPDATE (body, pinned, deleted_at) ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.channel_settings TO authenticated;
GRANT SELECT, INSERT ON public.message_reads TO authenticated;
REVOKE ALL ON public.messages, public.channel_settings, public.message_reads FROM anon;


-- ---------------------------------------------------------------------
-- public.conversations / public.dm_blocks / public.message_reports /
-- public.welfare_access_log, and a column on player_private
--   — TABLE and COLUMN grants  (23 Aug 2026 — squad chat phase 3)
--
-- Revoked from authenticated FIRST, then granted back narrowly — the phase-1
-- lesson (Supabase's defaults hand authenticated ALL on a new table).
-- conversations: SELECT only (open_conversation() inserts). welfare_access_log:
-- SELECT only (log_welfare_access() inserts). message_reports: UPDATE is
-- column-level on (resolved_at, resolved_by). player_private: UPDATE on
-- staff_dm_opt_in is granted on top of the existing column grants; the
-- trigger decides who may flip it. anon holds nothing on any of them.
-- VERIFIED from information_schema after the apply (23 Aug 2026): exactly the
-- lines below, anon absent. ⚠️ player_private ALREADY carried table-level
-- UPDATE for authenticated from before, so staff_dm_opt_in_by / _at are
-- writable too — harmless: player_private_staff_dm_opt_in overwrites both on
-- every update (stamps on a flip, restores old otherwise).
-- ---------------------------------------------------------------------
GRANT SELECT ON public.conversations TO authenticated;
-- 24 Aug 2026 (delete for good): DELETE on both, gated by the delete policies.
GRANT DELETE ON public.conversations TO authenticated;
GRANT DELETE ON public.messages TO authenticated;
-- conversation_clears (24 Aug 2026): SELECT only; clear_conversation() writes.
REVOKE ALL ON public.conversation_clears FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversation_clears TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.dm_blocks TO authenticated;
GRANT SELECT, INSERT ON public.message_reports TO authenticated;
GRANT UPDATE (resolved_at, resolved_by) ON public.message_reports TO authenticated;
GRANT SELECT ON public.welfare_access_log TO authenticated;
GRANT UPDATE (staff_dm_opt_in) ON public.player_private TO authenticated;
REVOKE ALL ON public.conversations, public.dm_blocks, public.message_reports, public.welfare_access_log FROM anon;

-- 23 Aug 2026 — db/migrations/20260823_notify_approvals.sql
GRANT UPDATE (notify_approvals) ON public.memberships TO authenticated;

-- 24 Aug 2026 — db/migrations/20260824_group_chats.sql (group chats)
-- conversation_members: SELECT only; create_group()/add_group_members()/
-- leave_group()/remove_group_member() do every write. conversations gains
-- column-level UPDATE on title, gated by the owner-only "group rename" policy.
GRANT SELECT ON public.conversation_members TO authenticated;
-- ✅ TRIMMED 26 Aug 2026 (20260826_trim_grant_ceilings.sql): live had held
-- the full default 7 verbs, untrimmed birth defaults. Now SELECT only, as
-- above — the RPC-only write path is backed by the grant as well as RLS.
-- db/tests/grants.sql §5 asserts the ceiling.
GRANT UPDATE (title) ON public.conversations TO authenticated;
REVOKE ALL ON public.conversation_members FROM PUBLIC, anon;

-- 24 Aug 2026 — db/migrations/20260824_message_reactions.sql (emoji reactions)
-- Own-row INSERT/DELETE gated by the policies; read defers to the message's
-- own read policy.
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
-- ✅ TRIMMED 26 Aug 2026 (20260826_trim_grant_ceilings.sql): the stray
-- UPDATE + defaults are revoked; the line above is now also the ceiling.
REVOKE ALL ON public.message_reactions FROM PUBLIC, anon;

-- 27 Aug 2026 — db/migrations/20260827_chat_polls.sql (chat polls). polls and
-- poll_options are written ONLY by create_poll(); poll_votes is own-row
-- INSERT/DELETE (a BEFORE INSERT trigger stamps identity and enforces
-- single-choice). All three reads defer to the message's own read policy.
GRANT SELECT ON public.polls        TO authenticated;
GRANT SELECT ON public.poll_options TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.poll_votes TO authenticated;
REVOKE ALL ON public.polls        FROM PUBLIC, anon;
REVOKE ALL ON public.poll_options FROM PUBLIC, anon;
REVOKE ALL ON public.poll_votes   FROM PUBLIC, anon;

-- 24 Aug 2026 — db/migrations/20260824_nicknames.sql (private nicknames,
-- chat round 3). Every policy is owner_id = auth.uid(), so the table is
-- invisible across accounts by construction; the grant is the full CRUD
-- set because all four verbs are the owner's.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nicknames TO authenticated;
REVOKE ALL ON public.nicknames FROM PUBLIC, anon;

-- 24 Aug 2026 — db/migrations/20260824_chat_round_4.sql (pins and stars).
-- Stars are the nicknames pattern: owner-only policies, owner-only verbs.
-- Pinning deliberately has NO new table grant: it goes through the
-- set_message_pinned RPC because widening the messages UPDATE policy would
-- hand participants the whole (body, pinned, deleted_at) column set — §4's
-- exact warning.
GRANT SELECT, INSERT, DELETE ON public.message_stars TO authenticated;
-- ✅ TRIMMED 26 Aug 2026 (20260826_trim_grant_ceilings.sql): the stray
-- UPDATE + defaults are revoked; the line above is now also the ceiling.
REVOKE ALL ON public.message_stars FROM PUBLIC, anon;

-- 24 Aug 2026 — db/migrations/20260824_chat_prefs.sql (pinned chats and
-- archive, round 6). The nicknames pattern again: owner-only policies,
-- full CRUD because every verb is the owner's.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_prefs TO authenticated;
REVOKE ALL ON public.chat_prefs FROM PUBLIC, anon;


-- ---------------------------------------------------------------------
-- message_deliveries  (26 Aug 2026 — the ticks' second state)
-- Recorded with the migration (20260826_chat_delivery_receipts) and
-- MEASURED APPLIED 26 Aug 2026: author sees receipt rows, outsider sees
-- zero, in a rolled-back fixture — the a5c5efd lesson, closed same day.
-- SELECT + INSERT only: a delivery receipt is never updated or revoked.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.message_deliveries TO authenticated;
REVOKE ALL ON public.message_deliveries FROM anon;


-- ---------------------------------------------------------------------
-- club_officers  (26 Aug 2026 — titles without rights)
-- Recorded with the migration (20260826_club_officers): honours only,
-- NO permission keys off this table. SELECT/INSERT/DELETE for
-- authenticated (RLS gates writes to super admins; titles are never
-- edited in place — retag is delete + insert, so no UPDATE).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON public.club_officers TO authenticated;
REVOKE ALL ON public.club_officers FROM PUBLIC, anon;
