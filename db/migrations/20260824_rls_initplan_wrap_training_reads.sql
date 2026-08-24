-- 24 Aug 2026 — the four training-plans read policies re-evaluate auth.uid()
-- once per row. Same defect, same fix, same equivalence argument as
-- db/migrations/20260814_rls_initplan_wrap_auth_calls.sql, which is the
-- precedent this follows; read that file for the whole reasoning.
--
-- These four shipped with db/migrations/20260821_training_plans.sql — one
-- week AFTER the 14 Aug sweep, which is exactly the recurrence that
-- db/tests/rls-initplan.sql exists to catch. It did: red on the nightly, once
-- the nightly could run again (the pitch-occupancy refusal had been masking
-- it since 22 Aug).
--
-- ⚠️ THE MEANING DOES NOT CHANGE. Every one of the four is the same
-- one-token predicate — `auth.uid() is not null`, "any signed-in person may
-- read" — wrapped to `(select auth.uid()) is not null` so Postgres evaluates
-- it once as an InitPlan instead of once per row. Measured live before
-- writing this: all four print exactly `(auth.uid() IS NOT NULL)`, nothing
-- else, so there is no expression subtlety to preserve beyond that line.
--
-- drop-if-exists rather than bare drop, so this file replays cleanly — the
-- lesson db/migrations/20260824_chat_list.sql taught the same day.

drop policy if exists "drill read" on public.drills;
create policy "drill read" on public.drills
  for select using ((select auth.uid()) is not null);

drop policy if exists "template read" on public.session_templates;
create policy "template read" on public.session_templates
  for select using ((select auth.uid()) is not null);

drop policy if exists "template block read" on public.session_template_blocks;
create policy "template block read" on public.session_template_blocks
  for select using ((select auth.uid()) is not null);

drop policy if exists "focus read" on public.training_focus;
create policy "focus read" on public.training_focus
  for select using ((select auth.uid()) is not null);
