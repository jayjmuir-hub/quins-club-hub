-- 19 Aug 2026 — seven MORE policies re-evaluating an `auth.*` call per row.
--
-- The same defect `20260814_rls_initplan_wrap_auth_calls.sql` fixed for 18
-- policies, in seven that were written AFTER it. Read that file first: it
-- carries the full explanation of what an InitPlan is and why the rewrite
-- changes no meaning.
--
-- ══ ⚠️ HOW THIS WAS FOUND, AND WHY THAT MATTERS MORE THAN THE FIX ═════════
--
-- `db/tests/rls-initplan.sql` has existed since 14 Aug and would have caught
-- every one of these the day it was introduced. **It never ran.** The nightly
-- `.github/workflows/db-check.yml` was inert without a `SUPABASE_DB_URL`
-- secret, so it reported "did not run" and PASSED — for five days, while the
-- number of unwrapped policies climbed from zero to seven.
--
-- The secret was added 19 Aug 2026. The first real run found 14 failing
-- harnesses, of which this was the only genuine production defect; the rest
-- were fixtures that had rotted unnoticed for the same reason.
--
-- ⚠️ **AND THE HARNESS REPORTS ONLY THE FIRST POLICY IT FINDS.** It named
-- `feedback create` alone. A sweep of `pg_policy` — counting `auth.uid()` and
-- `auth.jwt()` occurrences minus the already-wrapped `( SELECT auth.uid()`
-- ones — found **seven policies carrying ten bare calls**. Fixing only what
-- the error message named would have left six, and the next run would have
-- reported the next one, one per day, forever.
--
-- ══ WHICH SEVEN, AND WHERE THEY CAME FROM ════════════════════════════════
--
--   feedback create              2 bare   18 Aug, help-and-feedback
--   feedback read                1 bare   18 Aug, help-and-feedback
--   push_subscriptions own       2 bare   18 Aug, push notifications
--   notification_opt_outs mine   2 bare   19 Aug, notice push
--   social idea image read       1 bare   storage, social ideas
--   social idea image remove     1 bare   storage, social ideas
--   social idea image write      2 bare   storage, social ideas
--
-- ⚠️ **THREE OF THEM ARE ON `storage.objects`, WHICH THE 14 Aug FILE NEVER
-- TOUCHED.** That is why they were missed by the obvious follow-up: a sweep of
-- `public` alone does not see them, and Supabase's own lint reports them under
-- a different schema. **Any future sweep must cover `storage` too.**
--
-- ══ WHY `alter policy` RATHER THAN drop + create ══════════════════════════
--
-- `alter policy` changes ONLY the expressions. The name, the table, the
-- command, the roles and — critically — PERMISSIVE vs RESTRICTIVE all carry
-- over untouched, because they are never restated. Dropping and recreating a
-- policy on a live database holding children's data means a window, however
-- short, in which the table's protection is a different shape.
--
-- ══ ✅ HOW EQUIVALENCE WAS PROVED ═════════════════════════════════════════
--
-- Exactly as the 14 Aug file did it, in a rolled-back transaction against
-- production before this was committed:
--
--   1. capture every policy's `qual` and `with_check`;
--   2. apply this migration;
--   3. capture them again;
--   4. assert the NEW text, with `( SELECT auth.uid() AS uid)` replaced by
--      `auth.uid()`, is CHARACTER-IDENTICAL to the old text.
--
-- Measured: 7 policies rewritten, 7 textually identical after normalising,
-- 0 differences. And the bare-call sweep returns 0 rows afterwards, where it
-- returned 7 before — the control that stops "identical" meaning "unchanged".


-- ── public.feedback ────────────────────────────────────────────────────────

alter policy "feedback create" on public.feedback
  with check (((submitted_by = (select auth.uid())) and (exists ( select 1
     from memberships m
    where ((m.profile_id = (select auth.uid())) and (m.club_id = feedback.club_id) and (m.status = 'active'::text))))));

alter policy "feedback read" on public.feedback
  using (((submitted_by = (select auth.uid())) or private.is_admin(club_id)));


-- ── public.push_subscriptions (cmd ALL — both halves) ──────────────────────

alter policy "push subscription own" on public.push_subscriptions
  using ((profile_id = (select auth.uid())))
  with check ((profile_id = (select auth.uid())));


-- ── public.notification_opt_outs (cmd ALL — both halves) ───────────────────

alter policy "opt out is mine" on public.notification_opt_outs
  using ((profile_id = (select auth.uid())))
  with check ((profile_id = (select auth.uid())));


-- ── storage.objects ────────────────────────────────────────────────────────
--
-- ⚠️ A DIFFERENT SCHEMA AND A DIFFERENT OWNER. These three are on
-- `storage.objects`, not a table this repo created. `alter policy` here runs as
-- the policy's owner; if a future run of this file fails with "must be owner of
-- relation objects", that is the reason, and the fix is to run it as the role
-- Supabase assigns to storage — not to drop and recreate the policy.

alter policy "social idea image read" on storage.objects
  using (((bucket_id = 'social-ideas'::text) and ((private.social_idea_owner(name) = (select auth.uid())) or private.is_admin_anywhere())));

alter policy "social idea image remove" on storage.objects
  using (((bucket_id = 'social-ideas'::text) and ((private.social_idea_owner(name) = (select auth.uid())) or private.is_admin_anywhere())));

alter policy "social idea image write" on storage.objects
  with check (((bucket_id = 'social-ideas'::text) and (private.social_idea_owner(name) = (select auth.uid())) and (exists ( select 1
     from memberships m
    where ((m.profile_id = (select auth.uid())) and (m.status = 'active'::text))))));


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--
--   npm run db:check -- rls-initplan
--
-- Expected: no policy in ANY schema calls auth.uid() or auth.jwt() bare.
