-- ══════════════════════════════════════════════════════════════════════════
--  Pin search_path on private.fixture_push_headline
-- ══════════════════════════════════════════════════════════════════════════
--
-- Corrects an omission in 20260901_fixture_push_diary_wording.sql, applied an
-- hour earlier the same day.
--
-- ⚠️ THE HELPER SHIPPED WITH proconfig NULL and was the ONLY unpinned function
-- in the `private` schema. Measured on production before fixing, with the
-- control stated because a probe returning exactly one row is as suspect as one
-- returning none:
--
--     private functions total ...... 109
--     pinned ....................... 108   <- the control: the probe distinguishes
--     unpinned ..................... 1     <- fixture_push_headline, and only it
--
-- And this was not a prediction about a future nightly: `npm run db:check --
-- search-path` was RED against live at the time of writing —
-- "these `private` functions have a mutable search_path and are not on the
-- exemption list: fixture_push_headline".
--
-- ⚠️ PINNED RATHER THAN EXEMPTED, DELIBERATELY. db/tests/search-path.sql offers
-- both routes and db/schema/functions.sql's three-way rule would permit an
-- exemption here — the function is a CASE over two scalars, IMMUTABLE and
-- INVOKER, calling nothing and resolving nothing outside pg_catalog. But
-- `set search_path = ''` is correct for exactly that reason and costs nothing,
-- and it keeps the exemption list EMPTY, which is the stronger state.
-- 20260830_pin_private_helper_search_path.sql pinned the only inhabitant of
-- that branch this same week, leaving it "real, merely unoccupied";
-- re-occupying it would reopen an argument already closed.
--
-- ⚠️ THE LESSON, AND IT IS THE SECOND OF ITS FAMILY IN ONE DAY: A NEW FUNCTION
-- IS A NEW OBLIGATION TO AN EXISTING HARNESS. The parent migration asserted its
-- own new behaviour thoroughly — six wording combinations, a step 0 control,
-- and a check that the triggers actually call the helper — and never asked
-- which EXISTING harnesses the change made false. That is precisely the root
-- cause #587 identified the same morning for its sixteen red harnesses:
-- migrations shipped without updating the harnesses they invalidate.
-- ⚠️ THE CHEAP DEFENCE IS ONE COMMAND: run the FULL `npm run db:check`, not
-- `npm run db:check -- <your own file>`. Only the new file was run, and only
-- the new file passed.

alter function private.fixture_push_headline(text, boolean) set search_path = '';

do $$
declare cfg text[];
begin
  select proconfig into cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'fixture_push_headline';

  if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
    raise exception 'fixture_push_headline is still unpinned: proconfig = %', cfg;
  end if;

  -- ⚠️ AND NOTHING ELSE MAY HAVE BECOME UNPINNED IN THE MEANTIME. Asserting
  -- only about this one function would let a concurrent migration's unpinned
  -- helper through while this file reported success.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proconfig is null
  ) then
    raise exception 'other unpinned functions remain in the private schema';
  end if;
end $$;
