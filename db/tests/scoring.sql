-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — the scoring set, and the trigger that must not eat a result
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: everything runs
--  inside a transaction that ROLLS BACK. Nothing it writes survives, and it
--  can be re-run as often as you like.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Plan: claude/plans/2026-08-12-scoring-model.md.
-- Migration: db/migrations/20260812_scoring_components.sql.
--
-- WHAT IT PINS, and why each half needs pinning:
--
--   1. private.scoring_kinds_for_team agrees with src/lib/scoring.js, band by
--      band, against the REAL squad list. The three thresholds are written
--      twice on purpose — once in SQL so the stored total is right, once in JS
--      so the form shows the same number — and the only thing standing between
--      that and two plausible disagreeing scores is this file plus
--      tests/scoring.test.js.
--
--   2. The trigger's guard is PER SIDE and fires only on a side that has at
--      least one component. This is the half with live data behind it: a
--      fixture whose result was typed by hand before components existed has a
--      real score and no components, and an unconditional recompute turns it
--      into 0-0 with no error anywhere.
--
-- ⚠️ THE BAND IS THE DIGITS; THE TRAILING LETTER IS GENDER. `U14B` is U14 BOYS.
-- This repo has already been bitten by a letter following the digits — see the
-- note in src/lib/ageGroup.js about `U12G` parsing to null and falling through
-- to the least safe answer. Part 1's expectations are written per squad so that
-- a regression there shows up as a named row rather than as a silent default.
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED. That is FINE here and is not an
-- oversight: nothing in this file is about who may write, only about what the
-- database COMPUTES. RLS on events is pinned by db/tests/rls-can-edit-team-status.sql.

begin;

-- ── Part 1: the scoring set, against every live squad ──────────────────────
-- Reads public.teams rather than a literal list, so a squad renamed or added in
-- the database shows up here rather than being quietly missed. `expected` is
-- transcribed from src/lib/scoring.js — three thresholds, ≤11 / 12-13 / ≥14.
select t.name,
       t.scoring_kinds as override,
       private.scoring_kinds_for_team(t.id) as actual,
       case t.name
         when 'U6 Tag'            then array['tries']
         when 'U7 Tag'            then array['tries']
         when 'U8 Tag'            then array['tries']
         when 'U9 Mixed Contact'  then array['tries']
         when 'U10 Mixed Contact' then array['tries']
         when 'U11 Mixed Contact' then array['tries']
         when 'U12 Mixed Contact' then array['tries','conversions']
         when 'U12G QR'           then array['tries','conversions']
         when 'U13 Mixed Contact' then array['tries','conversions']
         when 'U14B Contact'      then array['tries','conversions','penalties','drops']
         when 'U14G QR'           then array['tries','conversions','penalties','drops']
         when 'U16B Contact'      then array['tries','conversions','penalties','drops']
         when 'U16G Contact'      then array['tries','conversions','penalties','drops']
         when 'U18B Contact'      then array['tries','conversions','penalties','drops']
         when 'U18G Contact'      then array['tries','conversions','penalties','drops']
         else null  -- a squad this file has never heard of: NULL, not a pass
       end as expected,
       -- ⚠️ NULL WHEN THE SQUAD IS UNKNOWN TO THIS FILE, never true. A new squad
       -- must read as "nobody has said what this should be", not as a pass.
       case
         when t.scoring_kinds is not null then null  -- overridden: Part 2 covers it
         else private.scoring_kinds_for_team(t.id) = case t.name
           when 'U6 Tag'            then array['tries']
           when 'U7 Tag'            then array['tries']
           when 'U8 Tag'            then array['tries']
           when 'U9 Mixed Contact'  then array['tries']
           when 'U10 Mixed Contact' then array['tries']
           when 'U11 Mixed Contact' then array['tries']
           when 'U12 Mixed Contact' then array['tries','conversions']
           when 'U12G QR'           then array['tries','conversions']
           when 'U13 Mixed Contact' then array['tries','conversions']
           when 'U14B Contact'      then array['tries','conversions','penalties','drops']
           when 'U14G QR'           then array['tries','conversions','penalties','drops']
           when 'U16B Contact'      then array['tries','conversions','penalties','drops']
           when 'U16G Contact'      then array['tries','conversions','penalties','drops']
           when 'U18B Contact'      then array['tries','conversions','penalties','drops']
           when 'U18G Contact'      then array['tries','conversions','penalties','drops']
           else null
         end
       end as pass
from public.teams t
order by t.sort_order;

-- ── Part 2: the override, and the unknown band ─────────────────────────────
create temp table probe (case_name text, expected text, result text);

do $$
declare
  tid uuid;
  got text[];
begin
  select id into tid from public.teams where name = 'U10 Mixed Contact';

  -- The override wins over the band. This is the whole reason it is a COLUMN:
  -- the club can enter a side in a competition that scores differently without
  -- a deploy, and without renaming the squad.
  update public.teams set scoring_kinds = array['tries','conversions'] where id = tid;
  got := private.scoring_kinds_for_team(tid);
  insert into probe values ('U10 with an override', '{tries,conversions}', got::text);

  -- ⚠️ AN EMPTY OVERRIDE IS A MISTAKE OR A HALF-FINISHED EDIT, NOT A SQUAD THAT
  -- CANNOT SCORE. Falling back keeps a score enterable — the same fail-open
  -- reasoning as the unknown band below, and the same as cleanScoringKinds in
  -- src/lib/scoring.js.
  update public.teams set scoring_kinds = array[]::text[] where id = tid;
  got := private.scoring_kinds_for_team(tid);
  insert into probe values ('U10 with an EMPTY override', 'the band: {tries}', got::text);

  update public.teams set scoring_kinds = null where id = tid;

  -- ⚠️ AN UNKNOWN BAND GETS THE FULL SET, and this is DELIBERATELY the opposite
  -- of allowsOwnContact, which fails CLOSED. Do not "correct" one to match the
  -- other. The harm is asymmetric in opposite directions: there it is a
  -- twelve-year-old's own phone number, here it is a coach on a pitch who
  -- cannot record a drop goal that was genuinely kicked.
  update public.teams set name = 'Development Squad' where id = tid;
  got := private.scoring_kinds_for_team(tid);
  insert into probe values ('a squad with no age in its name', 'all four', got::text);

  -- ⚠️ `U123` MUST NOT READ AS U12. The regex mirrors ageGroup.js's refusal.
  update public.teams set name = 'U123 Nonsense' where id = tid;
  got := private.scoring_kinds_for_team(tid);
  insert into probe values ('U123 (three digits)', 'all four, not U12''s two', got::text);
end $$;

select * from probe;

-- ── Part 3: the trigger, which must not eat an existing result ─────────────
create temp table trig (case_name text, expected text, result text);

do $$
declare
  tid uuid;
  eid uuid;
  cid uuid;
  r_us int;
  r_them int;
begin
  select id, club_id into tid, cid from public.teams where name = 'U16B Contact';

  -- ⚠️ A ROW THIS FILE CREATED, NEVER ONE IT FOUND. On 12 Aug 2026 a migration
  -- test picked a "seeded" event by group_id, wrote components to it and nulled
  -- its result on the way out — destroying a real 22-12 that had been measured
  -- minutes earlier. The seeded September is no longer purely synthetic: a
  -- human has filed a match sheet against one of its fixtures. Insert your own.
  insert into public.events (club_id, team_id, type, opponent, starts_at, ends_at)
  values (cid, tid, 'match', 'Harness Opposition',
          now() - interval '1 day', now() - interval '1 day' + interval '90 minutes')
  returning id into eid;

  -- A hand-typed result, exactly like the live data this guard exists for.
  update public.events set result_us = 22, result_them = 12 where id = eid;
  select result_us, result_them into r_us, r_them from public.events where id = eid;
  insert into trig values ('hand-typed result, no components', '22 / 12',
                           r_us || ' / ' || r_them);

  -- ⚠️ TOUCHING AN UNRELATED COLUMN MUST NOT RECOMPUTE ANYTHING. This is the
  -- case that would destroy live data: an ordinary edit to a fixture with a
  -- typed score and no components.
  update public.events set venue = 'Zayed Sports City' where id = eid;
  select result_us, result_them into r_us, r_them from public.events where id = eid;
  insert into trig values ('unrelated edit to that fixture', 'still 22 / 12',
                           r_us || ' / ' || r_them);

  -- OUR side recorded, theirs not. The normal case at half-time, and the reason
  -- the guard is per SIDE rather than per row.
  update public.events set tries_us = 4, conversions_us = 3, penalties_us = 1
   where id = eid;
  select result_us, result_them into r_us, r_them from public.events where id = eid;
  insert into trig values ('our components only (4t 3c 1p)', '29 / still 12',
                           r_us || ' / ' || r_them);

  -- ⚠️ A KIND THE SQUAD MAY NOT SCORE CONTRIBUTES NOTHING. U16 scores all four,
  -- so drop to a squad that does not: an old penalty count on a U10 row is data
  -- from before a rule changed, and silently adding 3 points to a U10 result is
  -- worse than ignoring it.
  update public.teams set scoring_kinds = array['tries'] where id = tid;
  update public.events set tries_us = 4, conversions_us = 3, penalties_us = 1
   where id = eid;
  select result_us into r_us from public.events where id = eid;
  insert into trig values ('same components, tries-only squad', '20, not 29', r_us::text);
  update public.teams set scoring_kinds = null where id = tid;

  -- ⚠️ CLEARING EVERY COMPONENT ON A SIDE DOES NOT ZERO THAT SIDE. It leaves
  -- the last stored result alone — "I should not have recorded that" is not
  -- "they scored nothing", and the match sheet relies on this.
  update public.events set tries_us = null, conversions_us = null, penalties_us = null
   where id = eid;
  select result_us into r_us from public.events where id = eid;
  insert into trig values ('components cleared', 'result untouched', r_us::text);

  -- A recorded ZERO is a component. This side genuinely scored nothing.
  update public.events set tries_them = 0 where id = eid;
  select result_them into r_them from public.events where id = eid;
  insert into trig values ('opposition tries = 0', '0, computed not inherited',
                           r_them::text);
end $$;

select * from trig;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED
--
--  Part 1 — every row `pass = true`, or `pass = null` for a squad this file
--           has not been taught about. A `false` anywhere means the SQL and
--           src/lib/scoring.js have drifted, and the form is now showing a
--           different total from the one being stored.
--
--  Part 2 — U10 with an override            {tries,conversions}
--           U10 with an EMPTY override      {tries}
--           a squad with no age in its name {tries,conversions,penalties,drops}
--           U123 (three digits)             {tries,conversions,penalties,drops}
--
--  Part 3 — hand-typed result, no components   22 / 12
--           unrelated edit to that fixture     22 / 12   <- the live-data guard
--           our components only (4t 3c 1p)     29 / 12
--           same components, tries-only squad  20
--           components cleared                 20        <- NOT 0
--           opposition tries = 0               0
-- ══════════════════════════════════════════════════════════════════════════
--
--  FAULT INJECTION — run these too. A green test that cannot go red is
--  decoration, and this repo has already accepted an injection that failed to
--  go red as a clean bill of health. DDL is transactional, so the broken
--  function lives only inside the transaction and production is never exposed.
--
--  (a) Break the guard — the failure with live data behind it:
--
--    begin;
--    create or replace function private.events_result_from_components()
--    returns trigger language plpgsql as $f$
--    begin
--      new.result_us := coalesce(new.tries_us,0) * 5;
--      new.result_them := coalesce(new.tries_them,0) * 5;
--      return new;
--    end $f$;
--    -- ...then Part 3 above...
--    -- EXPECTED: "hand-typed result, no components" becomes 0 / 0. If it still
--    -- says 22 / 12, the harness is not exercising the trigger at all.
--    rollback;
--
--  (b) Break the band mapping — the failure that makes two plausible scores:
--
--    begin;
--    create or replace function private.scoring_kinds_for_team(p_team_id uuid)
--    returns text[] language sql stable
--    as $f$ select array['tries','conversions','penalties','drops'] $f$;
--    -- ...then Part 1 above...
--    -- EXPECTED: every U6-U13 row goes `pass = false`. If they stay true, the
--    -- expectations are being compared against the function's own output
--    -- rather than against src/lib/scoring.js.
--    rollback;
-- ══════════════════════════════════════════════════════════════════════════
