-- The second half of 20260825_positions_staff_only.sql, run AFTER its deploy —
-- the destructive-schema rule: the columns were NULLED in that migration and
-- dropped only once the app version that no longer reads or writes them was
-- live.
--
-- Applied to production 25 Aug 2026. Evidence gathered first, in order:
--   1. Live bundle verified carrying the new code (grep of the served JS).
--   2. Both columns measured all-NULL — nothing (no stale cached client) had
--      written them since the nulling.
--   3. Every players read in the deployed code is select('*') or names other
--      columns — nothing selects position/unit explicitly, so nothing 500s.
--   4. A rolled-back dry-run of this exact DROP raised no dependency errors
--      (no dependent view, function, index or policy).
--
-- The data lives in player_positions / player_units (staff-only) — see the
-- positions_staff_only migration for the full reasoning and the backfill.

alter table public.players drop column position, drop column unit;
