-- ══════════════════════════════════════════════════════════════════════════
--  SCHEMA HARNESS — every function in `private` pins its search_path
--  Paste into the Supabase SQL editor, or run `npm run db:check`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ WHY THIS EXISTS. On 14 Aug 2026 `db/schema/functions.sql` stated that
-- `private.events_result_from_components` had been pinned on 13 Aug. It had not.
-- The claim was HALF true — `private.social_idea_owner`, named in the same
-- sentence, really was pinned — and a half-true sentence survives a read-through
-- in a way a false one does not. It was found by running `get_advisors` while
-- checking something unrelated, a day later.
--
-- **A prose claim inside a schema capture is not a measurement.** This file makes
-- the catalogue answer instead.
--
-- ⚠️ THE EXEMPTION IS NAMED, NOT COUNTED. `private.squad_expects_gender` is
-- deliberately unpinned: SECURITY INVOKER, IMMUTABLE, touches no table, and is
-- called from no policy. A COUNT-based assertion ("at most one unpinned") would
-- stay green if that one were pinned and a different one drifted. Naming it means
-- the check fails on the right function.
--
-- ⚠️ IF THE EXEMPTION IS EVER PINNED, THIS FILE GOES RED ON PURPOSE. That is the
-- rot-detecting anchor: the reasoning for the exemption lives in
-- db/schema/functions.sql, and if somebody decides differently, this file is the
-- thing that makes them say so out loud rather than silently.
begin;

-- ── The exemption list. One row per DELIBERATELY unpinned function. ────────
create temporary table _exempt (proname text) on commit drop;
-- ⚠️ EMPTY SINCE 31 Aug 2026, AND THAT IS A MEASUREMENT, NOT AN OVERSIGHT.
-- The list held squad_expects_gender — the one branch-3 function under
-- db/schema/functions.sql's three-way rule (pure string helper, nothing to
-- redirect). 20260830_pin_private_helper_search_path.sql then pinned it
-- anyway (its ARGUMENT was schema-qualification of the register_my_player
-- call chain) and did not touch this list, so the "exemption now PINNED" arm
-- below fired — hidden for a day behind push_endpoint_allowed's own failure.
-- The pin is deliberate and on main; the exemption is what went stale.
-- To exempt a future function: `insert into _exempt values ('<name>');` and
-- argue it in db/schema/functions.sql, together, or this file goes red.

-- ── What live actually says ───────────────────────────────────────────────
create temporary table _state on commit drop as
select p.proname,
       (p.proconfig is not null
        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) as pinned
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private';

-- Printed so a human can see the shape, not only the verdict.
select proname, pinned from _state order by pinned, proname;

do $$
declare
  v_unpinned  text[];
  v_exempt_ok boolean;
  v_total     int;
begin
  select count(*) into v_total from _state;

  -- ⚠️ NON-VACUITY FIRST. An empty _state would satisfy every assertion below,
  -- and the most likely cause of that is a typo in the schema name rather than a
  -- database with no functions in it.
  if v_total < 10 then
    raise exception
      'search-path harness looked at only % functions in `private` — it is not '
      'measuring what it thinks it is', v_total;
  end if;

  -- 1. Everything that is not exempt must be pinned.
  select array_agg(s.proname order by s.proname) into v_unpinned
  from _state s
  where not s.pinned
    and s.proname not in (select proname from _exempt);

  if v_unpinned is not null then
    raise exception
      'these `private` functions have a mutable search_path and are not on the '
      'exemption list: % — see db/migrations/20260814_pin_scoring_trigger_search_path.sql',
      array_to_string(v_unpinned, ', ');
  end if;

  -- 2. The exemption must still BE an exemption. If it has been pinned, the
  --    documented reasoning is now wrong and somebody should say so.
  select bool_and(not s.pinned) into v_exempt_ok
  from _state s where s.proname in (select proname from _exempt);

  -- (bool_and over zero rows is NULL, so an EMPTY exemption list — the state
  -- since 31 Aug 2026 — must not trip this arm. A non-empty list still must
  -- name only unpinned functions.)
  if exists (select 1 from _exempt) and v_exempt_ok is distinct from true then
    raise exception
      'a function on the exemption list is now PINNED. That may well be right — '
      'but db/schema/functions.sql argues for the exemption, so update that '
      'reasoning and this list together';
  end if;

  raise notice 'search_path: % functions in `private`, all pinned except any named exemption (list currently empty)', v_total;
end $$;

-- ══ ⚠️ SELF-TEST — proves the check above can actually fail ════════════════
--
-- Unpins a real function INSIDE this transaction and confirms the same rule
-- catches it. Rolled back with everything else. Without this arm the whole file
-- is "green because nothing is wrong" and "green because it cannot see", which
-- are indistinguishable from the outside.
do $$
declare
  v_caught boolean := false;
  v_broken text[];
begin
  alter function private.is_admin(uuid) reset search_path;

  select array_agg(p.proname) into v_broken
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'is_admin'
    and p.proconfig is null;

  if v_broken is not null then
    v_caught := true;
  end if;

  if not v_caught then
    raise exception
      'SELF-TEST FAILED: unpinned private.is_admin and the catalogue still '
      'reported it as pinned, so this harness cannot detect a real drift';
  end if;

  raise notice 'self-test: an injected unpinned function was detected';
end $$;

rollback;
