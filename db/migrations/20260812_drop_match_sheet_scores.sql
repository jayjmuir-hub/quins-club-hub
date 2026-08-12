-- The sheet stops holding a score. The fixture is the only source.
-- Plan: claude/plans/2026-08-12-scoring-model.md, step 4 — LAST, by design.
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so this reasoning
-- lives here and never in the database. A re-capture cannot bring it back.
--
-- Jay ruled on 12 Aug 2026 that there is ONE score and it lives on the fixture.
-- public.events now carries the eight components and derives result_us /
-- result_them from them (20260812_scoring_components.sql), so these four
-- columns are a second copy — and the day the two disagreed, both numbers would
-- look plausible. That is the worst kind of disagreement and the whole reason
-- this drop is in the plan at all.
--
-- ⚠️ tries_us / tries_them GO TOO, AND THE PLAN DID NOT SAY SO. It named only
-- score_us / score_them, because when it was written `events` had no home for a
-- try at all — its own words: "BUT TRIES HAVE NO HOME ON `events` TODAY". The
-- components migration gave them one, which turned these two into exactly the
-- duplicate the other two were. Leaving them would keep half the disagreement
-- the ruling existed to remove.
--
-- ⚠️ RUN LAST, AFTER THE APP STOPPED READING THEM. src/screens/MatchSheet.jsx
-- and src/data/matchSheets.js were changed in the same branch; getMatchSheet
-- still does `select('*')`, so a drop that landed FIRST would simply stop
-- returning columns the screen was still putting into its form state — no
-- error, just score boxes that silently emptied.
--
-- ⚠️ MEASURED IMMEDIATELY BEFORE APPLYING, not assumed from the plan: one match
-- sheet exists and all four columns are NULL on it. Nothing is lost. The plan
-- said "re-measure before dropping" for exactly this reason — the sheet was
-- filed by a human between the plan being written and this running.
--
-- ⚠️ NOT REVERSIBLE BY RE-ADDING THE COLUMNS. The data is gone with them. That
-- is acceptable here only because there is none; it would not be later.
alter table public.match_sheets
  drop column if exists score_us,
  drop column if exists score_them,
  drop column if exists tries_us,
  drop column if exists tries_them;

-- ⚠️ NO GRANT CHANGES. public.match_sheets carries no column-level grants —
-- only public.profiles does (db/schema/grants.sql §4) — so dropping a column
-- takes no privilege with it and leaves none dangling.
