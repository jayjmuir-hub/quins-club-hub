# Club Diary — Phase 2 Implementation Plan (all-day and spans)

**STATUS: NOT SHIPPED.** Written 1 Sep 2026. Implements everything marked
`[PHASE 2]` in `claude/plans/2026-08-31-club-diary.md`. Phase 1 (`info_only`,
the Club Diary chooser kind) shipped 31 Aug and is live.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event say "there is no clock time" — a kit collection that runs
all Thursday, a tournament day, a two-day ball collection — distinctly from "the
time is not decided yet", and export it correctly to subscribed calendars.

**Architecture:** One new column, `events.all_day`, mutually exclusive with
`time_tbd` by check constraint. A multi-day span reuses the existing `ends_at`.
The three-way time state reaches the form as one control, the calendar feed as
one branch, and the push as one wording change.

**Tech Stack:** Vite + React, Tailwind, Supabase (Postgres 17), Deno edge
function for the ICS feed, vitest, `db/tests/` SQL harnesses.

## Global Constraints

- **Never `git add -A`.** Stage explicit paths.
- **Never write a real person's name** into this repo — it is public and its
  members are mostly children. Invent fixture data; keep the shape.
- **`main` is production.** Show the diff and get an explicit yes before merging.
- **Announce before applying a migration.** Single-owner rule; peers coordinate
  by message.
- ⚠️ **Run the FULL `npm run db:check`, never `-- <your own file>`, before
  applying anything.** A new column or function is a new obligation to an
  EXISTING harness. Filtering the run is how `search-path.sql` went red against
  production on 1 Sep, hours after that exact root cause was written up.
- ⚠️ **Ask what WRITING the row does, not only where it is displayed.** Phase 1
  shipped a push saying "New fixture" for a kit collection because its audit
  traced only read paths. The write paths that reach real people here are the
  push triggers on `public.events`, the Resend mail path, and the public
  calendar feed.
- **Every new assertion proven against an injected fault**, with a control
  wherever a bare negative would be ambiguous.
- **Commit before injecting a fault** — `git checkout --` reverts to the last
  commit.

## The three time states

| State | Columns | Means | Feed |
|---|---|---|---|
| Timed | `all_day` false, `time_tbd` false | 19:00 | `DTSTART` with a time |
| Time TBD | `all_day` false, `time_tbd` true | day known, time undecided | `VALUE=DATE` + "Kick-off time to be confirmed" |
| All day | `all_day` true | there is no clock time | `VALUE=DATE`, **no** explanatory line |

⚠️ **Never collapse the last two.** `time_tbd` already renders as an all-day ICS
entry, so the temptation is to reuse it. It carries the sentence "Kick-off time
to be confirmed" into every subscribed calendar, which for a kit collection is a
statement that is simply false.

## What already enforces part of this, for free

- `events_ends_after_starts` — `ends_at IS NULL OR ends_at > starts_at`. A
  ONE-day all-day event must therefore leave `ends_at` null, which is exactly
  what the spec requires. No new constraint needed for that case.
- `events_no_end_when_time_tbd` — `time_tbd = false OR ends_at IS NULL`.
  Unaffected: an all-day event has `time_tbd` false.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `db/migrations/` (new) | `all_day` + mutual-exclusion constraint | 1 |
| `db/tests/club-diary-allday.sql` (new) | the constraint, the default, the span | 1 |
| `db/migrations/` (new) | `calendar_feed` gains `info_only`, `all_day` | 2 |
| `db/migrations/` (new) | push when-line wording for all-day | 3 |
| `src/lib/eventFormat.js` | `isAllDay()`, the time label | 4 |
| `src/screens/EventForm.jsx` | three-way control + "until" date | 5 |
| `supabase/functions/calendar/index.ts` | all-day branch, spanning DTEND | 6 |
| docs + captures | `RESTORE.md`, `schema-history`, `db/schema/` | 7 |

---

### Task 1: `all_day`, and the constraint that keeps the states apart

**Files:**
- Create: `db/migrations/20260901_events_all_day.sql`
- Create: `db/tests/club-diary-allday.sql`
- Modify: `db/schema/tables.sql`

**Interfaces:**
- Produces: `public.events.all_day boolean not null default false`, and
  `events_not_all_day_and_time_tbd CHECK (not (all_day and time_tbd))`.

- [ ] **Step 1: Write the harness first, with a control**

`db/tests/club-diary-allday.sql`, inside `begin`/`rollback`. It must assert:
- **Step 0 control** — the probe can see `events.starts_at`, a column that
  certainly exists, so a "column missing" red is a measurement not an inference.
- the column exists, is boolean, NOT NULL, defaults false;
- an insert omitting it still works and lands false (the chat fixture-thread
  insert path depends on that);
- `all_day = true, time_tbd = true` **raises**;
- **and a control insert of a legal row that SUCCEEDS**, so a failure for the
  wrong reason cannot read as a pass;
- a one-day all-day row with `ends_at = starts_at` raises on
  `events_ends_after_starts` — the existing constraint doing the work;
- a two-day all-day row with `ends_at` a day later is accepted.

- [ ] **Step 2: Run the FULL suite and watch only this file fail**

```bash
npm run db:check
```

Expected: `club-diary-allday.sql` FAIL with `events.all_day is MISSING`, its
step 0 control PASSING, and **every other harness still green**. Running the
whole suite here is the habit this plan exists to keep.

- [ ] **Step 3: Write the migration**

`alter table public.events add column if not exists all_day boolean not null default false;`
plus the check constraint, a column comment, and a `do $$` block asserting the
column landed AND the constraint exists. State in the header why `all_day` is
not `time_tbd`, and that nothing is backfilled.

- [ ] **Step 4: ANNOUNCE to peer sessions, then apply**

- [ ] **Step 5: Run the FULL suite again**

```bash
npm run db:check
```

Expected: every harness green, including `search-path.sql` and `grants.sql`.

- [ ] **Step 6: Capture and commit**

`db/schema/tables.sql` in the same commit as the migration — `docs:check`
enforces the grants half but has nothing to say about a table capture, which is
the hole a stale rule went through on 31 Aug.

```bash
git add db/migrations/20260901_events_all_day.sql db/tests/club-diary-allday.sql db/schema/tables.sql
git commit -m "feat(db): events.all_day — no clock time, distinct from time_tbd"
```

---

### Task 2: `calendar_feed` carries the two flags

**Files:**
- Create: `db/migrations/20260901_calendar_feed_all_day.sql`
- Modify: `db/schema/functions.sql`

**Interfaces:**
- Consumes: `events.all_day`, `events.info_only`.
- Produces: `calendar_feed` whose `RETURNS TABLE` gains
  `info_only boolean, all_day boolean`. Task 6 reads both.

⚠️ **`info_only` is added here even though the feed does not branch on it.**
Phase 1 deliberately changed nothing in the feed, so the column never reached
it; a later session wanting to label diary entries in the ICS would otherwise
have to re-open the function. Adding it now costs one line and is honest about
what the feed can see.

- [ ] **Step 1: Replace the function, ending with the assertion**

Follow `db/migrations/20260814_calendar_feed_competition_type.sql` exactly: the
migration ends with a `pg_get_function_result` check so a silently unreplaced
function fails the migration rather than the feed.

- [ ] **Step 2: Announce, apply, run the FULL `npm run db:check`**

- [ ] **Step 3: Verify the signature on live**

```sql
select pg_get_function_result(oid) from pg_proc where proname = 'calendar_feed';
```

Expected: contains `info_only boolean` and `all_day boolean`.

- [ ] **Step 4: Capture `db/schema/functions.sql` and commit**

---

### Task 3: the push must not say "00:00"

⚠️ **This is the write-path check phase 1 failed to make, made before writing
the feature rather than after shipping it.** `private.send_fixture_push` builds
its when-line as `'Dy DD Mon'` plus either `', time TBC'` when `time_tbd`, or
`', HH24:MI'` otherwise. An all-day event stores club-midnight, so an unmodified
push announces **"Thu 17 Sep, 00:00"** — precisely the invented value the
`time_tbd` branch was written to avoid.

**Files:**
- Create: `db/migrations/20260901_fixture_push_all_day_when.sql`
- Modify: `db/schema/functions.sql`

- [ ] **Step 1: Extend the harness first**

Add to `db/tests/club-diary-push.sql` (or a sibling): a pure helper
`private.fixture_push_when(_event public.events) returns text` must return a
date with **no time and no "time TBC"** for an all-day event, `', time TBC'` for
a `time_tbd` one, and the unchanged `HH24:MI` form otherwise. Assert all three,
plus that `send_fixture_push` calls the helper.

⚠️ **Pure and separate for the same reason as `fixture_push_headline`:**
`send_fixture_push` ends in `net.http_post`, so anything asserting its behaviour
directly would send a REAL push to REAL members, and a rollback does not un-send
a notification.

⚠️ **Pin `search_path` on the new function in the SAME migration.** The last one
shipped unpinned and turned `search-path.sql` red against production.

- [ ] **Step 2: Run the full suite, watch it fail, apply, run it again**

- [ ] **Step 3: Capture and commit**

---

### Task 4: `eventFormat` learns the third state

**Files:**
- Modify: `src/lib/eventFormat.js`
- Test: `tests/event-format.test.js`

**Interfaces:**
- Produces: `isAllDay(event)` — strict `event.all_day === true`; and
  `eventTimeLabel` returning **"All day"** for one, unchanged otherwise.

- [ ] **Step 1: Write the failing tests**

Assert: `isAllDay` is strict about `undefined`/`null`; `eventTimeLabel` says
"All day" for an all-day event, still says the TBD wording for a `time_tbd` one,
and is **byte-identical** for an ordinary timed event (the regression guard).

- [ ] **Step 2: Run, watch fail, implement, run, commit, inject the fault**

The fault: make `isAllDay` truthy-test rather than `=== true`, and confirm the
`undefined` case goes red.

---

### Task 5: the three-way time control

**Files:**
- Modify: `src/screens/EventForm.jsx`
- Test: `tests/event-form-allday.test.jsx` (create)

⚠️ **Three states drawn as two checkboxes is how a row ends up claiming both.**
Replace the lone TBD checkbox with one control offering **Timed · Time TBD · All
day**, and show an optional **"until"** date only in the all-day state.

- [ ] **Step 1: Write the failing tests**

Assert: choosing All day writes `all_day: true, time_tbd: false` and a
club-midnight `starts_at`; leaving "until" blank writes `ends_at: null`; setting
it writes club-midnight on that date; the time fields are not rendered in the
all-day state; and — the control — an ordinary timed event still writes exactly
what it wrote before.

⚠️ **The fixture must include `ends_at`** or validation fails before the code
under test runs. Measured on 31 Aug: social, training and diary all reject an
empty End time.

- [ ] **Step 2: Run, fail, implement, run, commit, inject the fault**

---

### Task 6: the calendar feed

**Files:**
- Modify: `supabase/functions/calendar/index.ts`
- Test: `tests/calendar-all-day.test.js` (create)

⚠️ **The feed is a Deno function with `Deno.serve()` at module scope — the suite
cannot execute it.** The existing calendar tests are rot detectors that read the
source. Write this one the same way, and treat the live fetch after deploy as
the real verification.

- [ ] **Step 1: Write the failing test**

A rot detector asserting the source contains the spanning DTEND computation and
that the "Kick-off time to be confirmed" line is guarded on `time_tbd` alone.
⚠️ **With a control**: the same matcher must find something known to be present,
or an empty result proves nothing.

- [ ] **Step 2: Implement**

- `Event` gains `info_only?: boolean` and `all_day?: boolean`, read `=== true`.
- `const allDay = event.all_day === true || event.time_tbd === true`.
- The explanatory DESCRIPTION line fires **only** on `time_tbd`.
- **DTEND**: for an all-day event with `ends_at`, the day AFTER `ends_at`'s club
  date — ICS DTEND is **exclusive**. 17–18 Sept is `DTSTART:20260917` /
  `DTEND:20260919`. Write the boundary longhand in the test; getting it wrong
  yields a one-day or three-day entry and both look plausible.
- `endFor` and `DURATION_MINUTES` untouched — the all-day branch never reaches
  them.

- [ ] **Step 3: Run, commit, inject the off-by-one fault, restore**

---

### Task 7: docs, full verification, live

- [ ] **Step 1: `npm run build` then the FULL `npm test`**

Three stylesheet tests read `dist/` and fail loudly when it is absent — that is
by design, not a failure.

- [ ] **Step 2: The FULL `npm run db:check`**

- [ ] **Step 3: `RESTORE.md`, `claude/schema-history.md`, and the spec's STATUS**

Update `claude/plans/2026-08-31-club-diary.md` to say phase 2 shipped.

- [ ] **Step 4: `npm run docs:check` AFTER committing**

Expect the documented local-fails/CI-passes divergence on a multi-commit branch.
**Never cite a branch SHA to silence it.** Verify no demanded SHA is an ancestor
of `origin/main`, then trust CI.

- [ ] **Step 5: Record the pre-merge production bundle hash, then merge**

⚠️ "It touches `src/`, therefore it deploys something" is an assumption. Record
the entry hash before merging so the deploy can be proven rather than hoped.

- [ ] **Step 6: Verify live, with a control**

Fetch the deployed entry bundle and confirm the all-day markers are present
where they were **absent** from the pre-merge one. Then fetch `/calendar.ics`
and confirm a real all-day entry renders `DTSTART;VALUE=DATE` — checking the
`content-type` too, because the SPA catch-all answers any path with HTML and a
200 alone proves nothing.

## Self-review notes

**Spec coverage.** Every `[PHASE 2]` item maps to a task: the column and
constraint (1), the feed function signature (2), the three-way control (5), the
feed branch and spanning DTEND (6). Decisions 3, 4 and 5 in the spec are the
reasoning behind tasks 1, 5 and 6.

**Two things this plan adds that the spec did not have**, both from mistakes
made in phase 1 rather than from foresight:
- **Task 3 exists at all.** The spec never mentioned the push, and phase 1
  shipped a bug there for exactly that reason.
- **Every "run the harness" step says the FULL suite.** Phase 1's plan said
  `npm run db:check` without emphasis and the filtered form was used instead,
  turning a production harness red.

**Known gap, stated.** Repeats combined with all-day and a span remains legal,
undesigned and untested — carried forward from the spec as a stated non-goal
rather than silently.
