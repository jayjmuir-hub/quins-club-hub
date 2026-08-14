-- ══════════════════════════════════════════════════════════════════════════
--  RLS INITPLAN HARNESS — no policy in `public` may call `auth.uid()` or
--  `auth.jwt()` bare, because a bare call is re-evaluated once per row.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and the only write is the deliberately-injected fault in part 3.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260814_rls_initplan_wrap_auth_calls.sql wrapped 19 bare calls across 18
-- policies. That migration is a one-off; this is what keeps it true, and the
-- regression it guards is unusually easy to cause — the bare form is what
-- everybody writes, every example on the internet uses it, and it is CORRECT.
-- It is only slow. Nothing fails, nothing errors, and no screen misbehaves; the
-- database just does more work per row, forever, and silently.
--
-- ⚠️ SO THERE IS NO SYMPTOM TO NOTICE. That is the entire argument for checking
-- it mechanically rather than trusting review.
--
-- ⚠️ THIS CHECKS THE SHAPE, NOT THE SPEED. It asserts no bare call survives. It
-- does NOT measure query time, and a green run here is not a performance
-- measurement — at this club's size the difference is not observable anyway.
-- The reason to care is 1500 members, not 20.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────

create function pg_temp.check_rls_initplan() returns void language plpgsql as $fn$
declare
  offender  record;
  n_pol     int;
  n_wrapped int;
begin
  -- ── 1a. THE CONTROLS, FIRST ──────────────────────────────────────────────
  --
  -- Every assertion below is "this pattern is ABSENT". A wrong schema name, or
  -- a regex that matches nothing, makes them all vacuously true. Two controls:
  -- the walk must find policies, and the regex must be able to MATCH the
  -- wrapped form it is built to recognise.

  select count(*) into n_pol from pg_policies where schemaname = 'public';
  if n_pol < 40 then
    raise exception
      'RLS INITPLAN: only % policies found in `public`. The walk below is how '
      'every assertion is made; if it finds nothing this file is green while '
      'checking nothing. Expected 60 on 14 Aug 2026.', n_pol;
  end if;

  select count(*) into n_wrapped
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual,'') || ' ' || coalesce(with_check,''))
        ~ '\( SELECT auth\.[a-z]+\(\) AS [a-z]+\)';
  if n_wrapped = 0 then
    raise exception
      'RLS INITPLAN: not one policy matches the WRAPPED pattern. Postgres '
      'prints these expressions from its own parse tree, so if the shape it '
      'prints has changed, the absence-check below matches nothing and passes '
      'vacuously. Expected 24 wrapped policies after the migration.';
  end if;

  -- ── 1b. No bare auth.* call anywhere ─────────────────────────────────────
  --
  -- Method: delete every WRAPPED occurrence from the expression text, then look
  -- for any auth call left over. What remains is bare by construction.
  -- ⚠️ Postgres has no regex lookbehind, which is why this is done by
  -- subtraction rather than by matching "not preceded by ( SELECT".

  for offender in
    select tablename, policyname,
           regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                          '\( SELECT auth\.[a-z]+\(\) AS [a-z]+\)', '', 'g') as leftover
    from pg_policies
    where schemaname = 'public'
      and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                         '\( SELECT auth\.[a-z]+\(\) AS [a-z]+\)', '', 'g')
          ~ 'auth\.(uid|jwt)\(\)'
    order by tablename, policyname
  loop
    raise exception
      'RLS INITPLAN: policy "%" on public.% calls auth.uid() or auth.jwt() '
      'BARE, so Postgres re-evaluates it once per row. Wrap it as '
      '(select auth.uid()). This changes no meaning — see '
      'db/migrations/20260814_rls_initplan_wrap_auth_calls.sql, which proves '
      'equivalence by comparing the re-printed expressions.',
      offender.policyname, offender.tablename;
  end loop;

  raise notice 'RLS INITPLAN: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  RLS INITPLAN: all checks passed.
-- ⚠️ RED UNTIL THE MIGRATION IS APPLIED, and a red run here is a statement
-- about PRODUCTION, not about your branch. See claude/runbooks/db-harnesses.md.

select pg_temp.check_rls_initplan();


-- ── 3. ⚠️ THE SELF-TEST — inject the exact fault and prove it is caught ────
--
-- The fault is the real thing produced the real way: put ONE policy back to the
-- bare form. This is not a simulation — between this line and the rollback,
-- `team read` really is re-evaluating auth.uid() per row on production.
--
-- ⚠️ `team read` is chosen because its predicate is the simplest in the schema,
-- so the injected statement cannot accidentally change meaning as well as
-- shape. Its meaning before and after is identical: "is anybody signed in".
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: RLS INITPLAN: …
-- SELF-TEST FAILED means part 2's green result meant nothing.

alter policy "team read" on public.teams using ((auth.uid() is not null));

do $$
begin
  begin
    perform pg_temp.check_rls_initplan();
    raise exception 'SELF-TEST FAILED: check_rls_initplan() passed while "team read" held a bare auth.uid(). The subtraction regex is matching too much — check that it strips only the wrapped form.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did alter a policy on production. ALTER POLICY
-- is transactional, so this reverts it — but only if it runs. If you ran part 3
-- alone, restore it with:
--   alter policy "team read" on public.teams using (((select auth.uid()) is not null));

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run this on its own afterwards. Expected: ((( SELECT auth.uid() AS uid) IS NOT NULL))
--
--   select qual from pg_policies
--    where schemaname = 'public' and tablename = 'teams' and policyname = 'team read';
