-- 3 Sep 2026 — drop publish_training: nothing calls it any more
--
-- WHY. 20260902_training_suggestions.sql left publish_training in place on
-- purpose so that it and the app deploy could land in either order. The app
-- switched to suggest_training in d98b593 (#647) on 2 Sep; the last bundle
-- that called publish_training is gone from the CDN and the PWA cache window
-- has passed. A SECURITY DEFINER function that writes a coach's plan over
-- their head is exactly the thing that should not sit around callable — the
-- whole of the 2 Sep change was that it must never do that again.
--
-- What it did, for the record: wrote a template's blocks straight into
-- training_sessions / training_session_blocks for every training event in
-- range, skipping only a session with coach_edited_at set. That behaviour is
-- described in claude/schema-history.md under 20260821_training_plans and
-- 20260821_publish_training_fit_check; its harness steps 3–8 in
-- db/tests/training-plans.sql are replaced by a rot anchor that asserts the
-- function is GONE (with suggest_training present as the control), and their
-- coverage lives in db/tests/training-suggestions.sql.
--
-- Nothing else changes: the tables, the coach_edited_at column and its
-- meaning (accept and every coach save stamp it), and suggest_training's
-- contact check are all untouched.
--
-- ⚠️ apply_migration strips `--` comments, so nothing above reaches the
-- database.

begin;

drop function if exists public.publish_training(uuid, uuid[], date, date, boolean);

commit;
