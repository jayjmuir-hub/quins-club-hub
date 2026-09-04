-- 4 Sep 2026 — wrap the six bare auth.uid() calls 20260905_competitions_and_standings.sql
-- shipped, so Postgres evaluates each once per query (an InitPlan), not once per row.
--
-- The sibling of 20260906_rls_initplan_club_settings.sql, found the same way:
-- db/tests/rls-initplan.sql names the FIRST offender only, so applying the
-- club_settings wrap made it name `competition fixture read` next. This file
-- came from asking pg_policies for every remaining bare call at once
-- (measured 4 Sep 2026): five SELECT policies of the form
-- `auth.uid() is not null`, and one INSERT policy's WITH CHECK that compares
-- confirmed_by and created_by to auth.uid(). Nothing else in `public` was bare.
--
-- `alter policy` changes only the expressions; name, table, command and roles
-- carry over untouched — 20260814_rls_initplan_wrap_auth_calls.sql explains
-- why that matters and how equivalence is proved (Postgres re-prints the
-- expression from its parse tree; the new text with `( SELECT auth.uid() AS
-- uid)` replaced by `auth.uid()` must be character-identical to the old).

alter policy "competition read" on public.competitions
  using (((select auth.uid()) is not null));

alter policy "competition side read" on public.competition_sides
  using (((select auth.uid()) is not null));

alter policy "competition fixture read" on public.competition_fixtures
  using (((select auth.uid()) is not null));

alter policy "competition result read" on public.competition_results
  using (((select auth.uid()) is not null));

alter policy "competition keeper read" on public.competition_keepers
  using (((select auth.uid()) is not null));

-- INSERT policies carry only WITH CHECK; `alter policy ... with check` keeps
-- every other property. The expression is restated in full, verbatim from
-- pg_policies, with only the two auth.uid() calls wrapped.
alter policy "competition result confirm" on public.competition_results
  with check (
    private.is_keeper(competition_id)
    and confirmed_by = (select auth.uid())
    and created_by = (select auth.uid())
    and confirmed_at is not null
    and source = any (array['typed'::text, 'read'::text, 'fetched'::text])
  );

-- Verify after applying:  npm run db:check -- rls-initplan
-- Expected: `RLS INITPLAN: all checks passed.`
