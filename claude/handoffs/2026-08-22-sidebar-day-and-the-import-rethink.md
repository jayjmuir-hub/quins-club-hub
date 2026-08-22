# 2026-08-22 — the sidebar day, and the import rethink

History, not instruction. One session, thirteen PRs (#305–#317), one live
migration, a schema re-capture, and a cleanup. Jay drove from a desktop
screenshot and a paste that failed whole; each merge was his explicit
"merge it live", each one verified from the deployed bundle.

## What shipped, in the order it was asked for

1. **Every table shows everything** (#305, #306, #307, #312). The desktop
   roster, the schedule, and the Squad Hub's "who said, who showed" all
   had a `max-h-[70vh]`-style inner scroller — a scrollbar inside a
   scrollbar that hid most of the squad. Gone; the page scrolls. The
   tracking grid's pre-trim (`.slice(-30)`) went with it, so attendance
   now counts the WHOLE season: the summary reads "N% across M events
   this season", and the desktop matrix's 15 columns are the only cap
   left, named in the footnote.
2. **Squad Hub on the phone's tab bar** (#307), which retired the
   Dashboard's Squad Hub card, and notices off the hub (they live on
   Home). Later Game time moved off More onto the hub's front doors
   (#313) — More is back to being miscellaneous.
3. **Sidebar sub-menus** (#308, #310, #311): only the ACTIVE section
   expands. Squad Hub → Overview / Build a Match Roster / Training
   Plans; Schedule → Add an event / Pitch calendar / Add to calendar;
   Roster → Add a player / Import players / Game time (staff only). Admin
   wears the waiting count. Every child is a real route or a `?open=`
   deep-link the screen consumes and clears. Phones get the same things
   as hub front-door cards.
4. **Two new screens**: the match-roster picker (#308 — the Lineup
   builder already existed, it was just unreachable) and squad-level
   Training Plans (#309 — one renderer of a plan, `SessionPlan`, now
   reached from a list as well as from an event).
5. **The pitch calendar for coaches** (#314) — the one that needed a
   migration. `event read` RLS is squad-scoped on purpose, so "is D2
   free?" was unanswerable by design. `public.pitch_occupancy` is a
   SECURITY DEFINER read returning only who/where/when; the harness
   `db/tests/pitch-occupancy.sql` proves the coach sees the booking AND
   still cannot read the event from the table. Applied with Jay's
   "apply and merge it live", in that order.
6. **The import rethink** (#316, #317). Jay's real spreadsheet — name,
   age group, gender, no position column — failed all 38 rows with
   ""U16B" is not a position" because the parser demanded a fixed column
   order. Columns are now classified by CONTENT (squads, positions with
   a synonym map, gender tokens are closed vocabularies; the name is
   what's left, First+Last pairs join); a squad picker makes a bare list
   of names valid; and re-pasting skips players already on the roster as
   a third state ("N already there") instead of doubling the squad.
7. **Schema re-capture** (#315): 29 live functions had NO entry in
   `db/schema/functions.sql`. Every capture since 11 Aug was "what my
   migration touched", so the push pipeline, nudges, feedback and photo
   focus accumulated silently. All captured, md5-verified per block.

## The lessons, ranked by what they cost

1. **A selective re-capture is how the capture rots.** Twenty-nine
   functions, invisible, because each session re-captured only its own.
   The file's own 11 Aug header described this exact failure at smaller
   scale. The cheap guard is a NAME-LEVEL audit against `pg_proc` at every
   re-capture, BEFORE capturing any body:

   ```sql
   select n.nspname || '.' || p.proname as fn,
          md5(pg_get_functiondef(p.oid)) as body_md5
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
    order by 1;
   ```

   Every `fn` must have an entry in `db/schema/functions.sql`; an md5
   computed over the file's `CREATE … $function$\n` block must equal
   `body_md5`. Thirty of thirty matched on 22 Aug — after the fix.
2. **A test that passes against the re-injected bug is not a test.** The
   season-attendance fixture of 16 events passed with the old
   `.slice(-30)` restored, because 16 < 30: the fault trimmed at twice
   the column cap, not at the cap. Forty events, mark on the oldest, then
   it failed — then it was a test. Rule 6 means running the fault, not
   reasoning about it.
3. **Fixed column order is a spec the data never read.** The importer
   was liberal about everything except the one thing a real spreadsheet
   varies. When three vocabularies cannot overlap, classify by content
   and let position go. The accepted residue — an unknown word NEXT to a
   name joins it, visibly — is written as a test so it is a decision.
4. **The phone's only entry point is the thing you cannot delete.** Twice
   today a desktop tidy-up (the Squad Hub card, the More→Game time card)
   would have stranded phones; both times the fix was giving the phone
   its own route FIRST (tab bar, hub card), then deleting.
5. **"Merged" by ancestry lies under squash-merging.** Thirty-two local
   branches all read UNMERGED to `git merge-base`; every one had a merged
   PR. Ask GitHub, not the DAG, before deleting — and the one remote branch
   with a CLOSED-unmerged PR (#295, the dark-audit branch) was left for Jay, who
   declared it dead.
6. **Verify a deploy from the served bundle, never from a local hash.**
   A ten-minute poll once waited for a hash CI would never produce. Grep
   the live `index-*.js` for a string unique to the change, anchored to
   something stable.

## Also true today

- `npm run db:check` cannot run from this worktree — no `SUPABASE_DB_URL`
  in its `.env`. The Supabase MCP's `execute_sql` ran the harness inside a
  rolled-back transaction instead, twice: before and after applying.
- A fresh worktree needs `.env`, a `dist/` build, AND its own
  `node_modules` (`pwa-build.test.js` spawns `node_modules/vite/bin/vite.js`
  by absolute path). All three bit once each.
- The worktree's Bash tool mangles backslash escapes inside heredocs and
  `perl -e` strings; the dedicated Edit tool is the route for test files
  with `\t`/`\n` literals.
- Cleanup at close: main clone fast-forwarded (was 13 behind), three stale
  worktrees removed, 33 local branches deleted, the dark-audit branch deleted
  on Jay's word, zero open PRs, zero remote session branches left.

## Not done, not promised

The coach-facing attendance EXPORT (the season question the grid now
answers in-place, but cannot take out of the app) was discussed and not
asked for. A "Your players" Roster sub-item for parents was considered and
dropped: its only honest destination today is More.
