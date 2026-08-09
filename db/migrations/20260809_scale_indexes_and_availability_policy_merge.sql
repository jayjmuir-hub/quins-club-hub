-- ⚠️ APPLIED to production 9 Aug 2026 as `scale_indexes_and_availability_policy_merge`.
--
-- ══ WHY, AND WHY NOW ════════════════════════════════════════════════════
--
-- Jay, 9 Aug 2026: the club is heading for **600-700 players, possibly double
-- that in parent accounts**. Everything below is free at the 6 test players
-- this database currently holds and is not free at 700. None of it is a bug
-- today; all of it is a default that stops being correct somewhere between
-- 100 and 700, and indexes are cheapest to add while the tables are empty.
--
-- Supabase's performance advisor reported 135 lints. **Four of them matter**;
-- the rest are a single-club column with cardinality 1 (`club_id` — the
-- planner would never choose that index), a 15-row `teams` table, audit
-- columns nothing queries (`created_by`/`updated_by`/`decided_by`), and a
-- 5x role expansion of the same underlying finding. Do not "fix" those.
--
-- ══ 1. THE FOUR INDEXES ═════════════════════════════════════════════════
--
-- `availability (player_id)` IS THE ONE REAL DEFECT. One row per player per
-- event is ~70,000 rows for a season at 700 players, and every "this player's
-- availability" query sequentially scans all of them.
--
-- ⚠️ THE EXISTING UNIQUE INDEX ON (event_id, player_id) DOES NOT HELP.
-- Postgres cannot use a composite index when the LEADING column is absent
-- from the predicate. That index covers `event_id` alone and the pair; it
-- does nothing for a `player_id` lookup. This is the trap that makes the
-- advisor's finding look like a false positive when you glance at the
-- constraint list and think "player_id is already indexed".
--
-- `memberships (team_id)` and `(player_id)`: only ~2,000 rows at full size,
-- and indexed anyway because **nearly every RLS policy in this schema joins
-- against `memberships`**. A 2,000-row seq scan is cheap once and expensive
-- when it runs INSIDE a per-row policy check on a 70,000-row table. High
-- leverage precisely because the table is small and hot.
--
-- `players (team_id)`: the roster screen's default query, scanning 700 rows
-- on every load of the most-used page in the app.
--
-- ⚠️ NOT `CONCURRENTLY`, deliberately. A concurrent build cannot run inside a
-- transaction, and these tables have single-digit row counts right now — the
-- lock is measured in milliseconds. **If you add an index to `availability`
-- after the real roster lands, use CONCURRENTLY and run it outside a
-- migration.**
--
-- ══ 2. THE availability POLICY MERGE ════════════════════════════════════
--
-- Four permissive policies covered three commands:
--
--     avail coach manage   FOR ALL     can_edit_team(<event's team>)
--     avail read           SELECT      can_see_team(...) OR is_own_player
--     avail own insert     INSERT      is_own_player
--     avail own update     UPDATE      is_own_player
--
-- Permissive policies are OR'd and Postgres evaluates EVERY one per candidate
-- row, so SELECT, INSERT and UPDATE each ran two policy expressions — each
-- containing a subquery — where one would do. On the largest table in the
-- schema that is a straight doubling of per-row policy work.
--
-- Now one policy per command, each carrying the full OR'd rule.
--
-- ⚠️ A POLICY MERGE IS AN AUTHORISATION CHANGE WEARING A PERFORMANCE HAT,
-- and "obviously equivalent" is how access quietly widens. So it was MEASURED,
-- not argued: `db/tests/rls-availability-equivalence.sql` records what seven
-- kinds of caller can do before the merge, applies it, and re-records. All
-- seven read `same` — active coach, pending coach, active parent, pending
-- parent, unrelated active parent, admin, anon; across SELECT, INSERT, UPDATE
-- and DELETE.
--
-- ⚠️ NOTE THE THREE-ARM SELECT. `can_see_team OR can_edit_team OR
-- is_own_player` looks redundant — for an ACTIVE staff member can_edit_team
-- does imply can_see_team. It is there because **can_edit_team does NOT check
-- `status` and can_see_team DOES**, so dropping that arm would have silently
-- removed a PENDING coach's read. The first version of this merge did exactly
-- that and the harness caught it: `2_coach_pending` went `1 -> 0` on SELECT
-- and ALLOWED -> NO ROWS on UPDATE and DELETE. **Keeping the arm is what makes
-- this a refactor rather than a behaviour change.**
--
-- ══ ⚠️ 3. A GAP THIS MIGRATION DELIBERATELY DOES NOT FIX ════════════════
--
-- `private.can_edit_team` has no `status` check, while `private.can_see_team`
-- gained one on 8 Aug. **So a PENDING coach, manager or medic can write their
-- squad's availability, events, players, contacts and parent rows.**
--
-- **It is latent, not live.** No path in the app creates a pending staff
-- membership: `register_my_player` hard-codes the role to 'parent' or
-- 'player', and `memb manage` is admin-only. Measured 9 Aug: every membership
-- in the database is `admin/active` or `parent/active`.
--
-- It is the same class of gap as the known one on `private.is_admin()`, and it
-- belongs in a change of its own with its own harness — fixing a function that
-- five tables' policies call is not something to smuggle into an index
-- migration. **Recorded in claude/state-of-play.md.**

-- ── Guard ────────────────────────────────────────────────────────────────
-- ⚠️ ABORT rather than merge a set of policies that is not the set this was
-- reasoned about. If someone has already changed these, the equivalence proof
-- above does not describe the database and this migration must not run.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'availability'
     and policyname in ('avail coach manage','avail read','avail own insert','avail own update');
  if n <> 4 then
    raise exception
      'ABORT: expected the 4 pre-merge availability policies, found %. The equivalence harness (db/tests/rls-availability-equivalence.sql) was run against a different schema than this one.', n;
  end if;
end $$;

-- ── Indexes ──────────────────────────────────────────────────────────────
create index if not exists availability_player_id_idx on public.availability (player_id);
create index if not exists memberships_team_id_idx    on public.memberships (team_id);
create index if not exists memberships_player_id_idx  on public.memberships (player_id);
create index if not exists players_team_id_idx        on public.players (team_id);

-- ── The merge ────────────────────────────────────────────────────────────
drop policy "avail coach manage" on public.availability;
drop policy "avail own insert"   on public.availability;
drop policy "avail own update"   on public.availability;
drop policy "avail read"         on public.availability;

-- Three arms, and the middle one is load-bearing — see the header.
create policy "avail read" on public.availability for select using (
  private.can_see_team((select e.team_id from public.events e where e.id = event_id))
  or private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id)
);

create policy "avail write insert" on public.availability for insert with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id)
);

create policy "avail write update" on public.availability for update using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id)
) with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or private.is_own_player(player_id)
);

-- DELETE stays staff-only. It was never granted to a parent and is not being
-- granted to one here: a parent changes their answer, they do not remove the
-- row. The harness records `3_parent_active` as NO ROWS on delete both before
-- and after, which is the check that this stayed true.
create policy "avail write delete" on public.availability for delete using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
);

-- ── Verify ───────────────────────────────────────────────────────────────
-- ⚠️ A migration that reports success having changed nothing is a thing this
-- project has already shipped once (a Postgres self-assignment `set x = x`
-- does not fire a `distinct from` check). Read it back.
do $$
declare n_pol int; n_idx int;
begin
  select count(*) into n_pol from pg_policies
   where schemaname = 'public' and tablename = 'availability';
  if n_pol <> 4 then
    raise exception 'VERIFY: expected 4 policies on availability after the merge, found %', n_pol;
  end if;

  select count(*) into n_idx from pg_indexes
   where schemaname = 'public'
     and indexname in ('availability_player_id_idx','memberships_team_id_idx',
                       'memberships_player_id_idx','players_team_id_idx');
  if n_idx <> 4 then
    raise exception 'VERIFY: expected 4 new indexes, found %', n_idx;
  end if;
end $$;
