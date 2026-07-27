# Task 11 report — Schedule screen

**Commit:** `b8a3c96` feat: add the Schedule screen with fixtures, results, calendar and event detail
**Branch:** `build/v1-mvp` (from `ad0ca54`)

## What I implemented

### `src/screens/Schedule.jsx`
Ports design-system.md §5.2 top to bottom: scope note (non-admins only) → section
head ("Schedule & fixtures" + squad subtitle) → Upcoming/Results/Calendar sub-tab
pills → team-filter pills → body.

- **Query scoping.** `visibleTeams(memberships, teams)` gives the pill list and the
  `teamIds` passed to `listEvents({ teamIds })`. RLS is still the enforcement layer;
  this only narrows, never widens. Events are fetched **once for the whole visible
  scope** and filtered in memory — the scope is at most 15 teams' fixtures, so
  refetching on every pill tap would add latency and flicker for nothing.
- **Upcoming vs Results.** A fixture is a result when it has a score
  (`result_us` **and** `result_them` non-null), not when its date has passed. A
  past-dated match with no score entered stays in Upcoming, which is the point —
  it stays visible until someone records the score. Upcoming sorts ascending,
  Results descending.
- **Team filter.** Hidden entirely when the user sees fewer than two teams, and on
  the Calendar tab (the calendar always shows the whole visible scope, §5.2).
- **Calendar.** Month grid (7 columns, leading blanks only, today ringed in
  `quinsRed`, up to 4 type-coloured dots per day), prev/next month buttons with
  `aria-label`s, a legend, and that month's fixtures listed below. Day cells with
  events are real `<button>`s with a descriptive accessible name — design-system.md
  §8 flags the prototype's non-focusable `div` cells as a gap to fix.
- **Realtime.** `subscribeEvents` bumps a reload token; the fetch effect refetches.
  The callback closes over nothing but a stable state setter, so it subscribes
  exactly once for the life of the screen and its cleanup only unsubscribes — it
  never touches focus (the `Sheet` stale-`onClose` trap).
- **Open sheet is derived, not stored.** State holds `selectedEventId`; the event
  object is looked up from the live list each render. A realtime update therefore
  keeps the sheet's contents fresh, and a deleted fixture closes it instead of
  stranding a stale copy on screen.
- **Loading / empty / error.** Spinner in a card; `Empty` with per-tab copy;
  `role="alert"` card in `quinsRedDark` with a working "Try again".

### `src/screens/EventDetail.jsx`
Design-system.md §5.5 / §4.21: gradient detail-hero (type icon tile, title,
long date · time), key/value rows (Type + Home/Away for matches, Age group,
Venue, Competition when set), then **either** the result (outcome chip + score)
**or** a live availability summary — segmented bar + three labelled dots
("2 in", "1 maybe", "1 out"), with its own loading / "No one has responded yet."
/ `role="alert"` error legs, and `subscribeAvailability` keeping it live.
`listAvailability` is not called at all for a fixture that already has a score.

Edit/Delete are deliberately absent — Task 14 owns event writes, and a
disabled affordance would promise a control that doesn't exist.

### Supporting changes
- **`src/lib/eventFormat.js` (new).** Pure, import-free helpers: `hasResult`,
  `resultOutcome`/`resultLabel`/`resultScore`, `eventTitle`, `eventDate`,
  `dateBoxParts`, `formatTime`, `formatLongDate`, `sortByStart`. They live in
  `lib/` because both screens need them *and* `Schedule` imports `EventDetail`, so
  putting them in either screen means an import cycle or a wrong-way dependency.
  Task 13's dashboard needs the same vocabulary.
- **`src/components/Chip.jsx`.** Added the `win`/`loss`/`draw` variants. These are
  on the *same* design-system.md §4.7 variant list as match/training/social, so
  they belong on `Chip`, not in a near-identical screen-local component. Same
  contrast treatment as the existing variants — keep the specified background,
  darken the foreground to the nearest existing palette value that clears AA at
  11.5px bold:
  | variant | spec pair | measured | shipped foreground | measured |
  |---|---|---|---|---|
  | win | `#2F9E4F` on `#e7f6ea` | 3.06:1 ✗ | `#2F7D3D` (`--sky-deep`, already the training chip's text) | ~4.6:1 ✓ |
  | loss | `#d1483b` on `#fbeae8` | 3.84:1 ✗ | `#8E1526` (`quinsRedDark`/`--plum`) | ~7.9:1 ✓ |
  | draw | `#5a6470` on `#eef0f2` | 5.27:1 ✓ | unchanged | ✓ |
- **`src/components/TeamPills.jsx`.** Exported `PillButton` so the sub-tab row
  reuses the pill styling rather than duplicating it — §4.8 is explicit that the
  same `.pill` serves both rows. It stays an `aria-pressed` toggle button, not an
  ARIA tablist: a tablist owes the user roving tabindex and arrow-key navigation,
  and a half-built tablist is worse for screen-reader users than an honest toggle.
- **`src/App.jsx`.** Placeholder `function Schedule()` replaced with the real
  import. Home/Roster/More left alone.
- **`tests/app.test.jsx`.** Mocks `src/data/events.js` now that the real Schedule
  renders at `/schedule` — see "Self-review findings" below.

## What I tested and the results

`tests/schedule.test.jsx` — 27 tests, all data modules and `useMemberships` mocked,
no network reachable:

| Area | Covered |
|---|---|
| Loading/empty/error | spinner while in flight; empty state; `role="alert"` with the real message + working retry |
| Query scoping | coach → only their team id; admin → every visible team id, in display order |
| Upcoming vs Results | unscored fixtures under Upcoming; **past-dated-with-no-score stays Upcoming**; Results shows only scored fixtures, with outcome and score; per-tab empty states |
| Team filter | filters the list; hidden when only one team is visible |
| Scope note | coach wording; parent read-only wording; absent for admin ("All squads" subtitle instead) |
| Calendar | current-month grid + weekday headers; prev/next month; team filter hidden; only this month's fixtures listed below |
| Detail sheet | opens with venue/competition/age group; availability counts; "no one has responded yet"; score shown *instead of* availability (and `listAvailability` not called); availability error in an alert; sheet closes when the fixture disappears from a realtime refresh |
| Realtime | change event triggers exactly one refetch and re-renders; unsubscribes on unmount; subscribes once, not per re-render |
| Responsive | no rendered node carries a bare `hidden` class token, **on any tab** |

Plus 3 new `Chip` variant tests in `tests/components.test.jsx`.

**Full suite:** 197 passed / 12 files (baseline 167 / 11 — +27 schedule, +3 chip;
nothing regressed). Output is clean: no warnings, no `act()` noise.
**Build:** `npm run build` clean, 98 modules, 3.2s.

### Mutation checks (do the tests verify behaviour, or the mocks?)
I deliberately broke the implementation three ways and confirmed the suite caught it:

1. `hasResult` rewritten to `new Date(event.starts_at) < new Date()` (i.e. the
   rejected date-based definition) → **1 failure**: "keeps a past-dated fixture
   with no score in Upcoming, not Results".
2. `listEvents({ teamIds })` → `listEvents({})` (drop scoping) → **2 failures** in
   "Schedule — scoping the query".
3. Result column given `hidden … desktop:block` → **caught only after I
   strengthened the guard** (see self-review).

## TDD evidence

### RED
```
$ npx vitest run tests/schedule.test.jsx

 ❯ tests/schedule.test.jsx (0 test)

 FAIL  tests/schedule.test.jsx [ tests/schedule.test.jsx ]
Error: Failed to resolve import "../src/screens/Schedule.jsx" from
"tests/schedule.test.jsx". Does the file exist?
  15 |  const __vi_import_3__ = await import('../src/screens/Schedule.jsx')
     |                                       ^

 Test Files  1 failed (1)
      Tests  no tests
```
Expected: the full test file (27 cases covering the tab split, scoping, filtering,
calendar, detail sheet, realtime and the three states) was written before any
implementation existed, so collection fails at the import. Nothing could pass yet.

### GREEN
```
$ npx vitest run tests/schedule.test.jsx
 ✓ tests/schedule.test.jsx (27 tests) 1714ms
 Test Files  1 passed (1)
      Tests  27 passed (27)

$ npm test
 ✓ tests/schedule.test.jsx (27 tests)   ✓ tests/components.test.jsx (38 tests)
 ✓ tests/data.test.js (25 tests)        ✓ tests/scope.test.js (35 tests)
 ✓ tests/login.test.jsx (16 tests)      ✓ tests/app-shell.test.jsx (12 tests)
 ✓ tests/auth.test.jsx (12 tests)       ✓ tests/require-auth.test.jsx (9 tests)
 ✓ tests/memberships.test.jsx (7 tests) ✓ tests/app.test.jsx (6 tests)
 ✓ tests/nav.test.jsx (6 tests)         ✓ tests/supabase.test.js (4 tests)

 Test Files  12 passed (12)
      Tests  197 passed (197)
```

## Files changed
- `src/screens/Schedule.jsx` — new
- `src/screens/EventDetail.jsx` — new
- `src/lib/eventFormat.js` — new
- `tests/schedule.test.jsx` — new
- `src/components/Chip.jsx` — added win/loss/draw variants
- `src/components/TeamPills.jsx` — exported `PillButton`
- `src/App.jsx` — real Schedule import replaces the placeholder
- `tests/app.test.jsx` — mocks `src/data/events.js`
- `tests/components.test.jsx` — 3 Chip variant tests

## Self-review findings (all fixed before committing)

1. **The responsive guard didn't bite.** My "no bare `hidden` class" test only ran
   on the Upcoming tab, where no fixture has a result — so the entire result
   column (chip + score) was never in the DOM when the guard looked. I proved this
   by adding `hidden … desktop:block` to that column: **the suite stayed green.**
   The test now walks Upcoming → Results → Calendar and re-checks after each,
   asserting the score is actually present on the Results pass. Re-running the same
   mutation now fails. This is exactly the Task 8 role-label bug's shape, and my
   first attempt at guarding against it would not have caught it.
2. **`tests/app.test.jsx` became network-reachable and act()-noisy.** Once the real
   Schedule rendered at `/schedule`, that file mounted a screen that queries the
   *unmocked* Supabase client and opens a realtime channel — violating the plan's
   "no network at test time" constraint — and its resolved promise landed a
   `setState` after the synchronous test body, printing act() warnings. Fixed by
   mocking `src/data/events.js` there with a `listEvents` that never settles (those
   tests assert synchronously and don't care about loaded state; Schedule's own
   loading/loaded behaviour is covered in `tests/schedule.test.jsx`).
3. **Fake timers had to go.** My first calendar draft used `vi.setSystemTime`. RTL's
   `waitFor` doesn't detect Vitest's fake timers (its `jestFakeTimersAreEnabled()`
   looks for a global `jest`), so every `findBy*` hangs. Fixtures are now computed
   relative to the real `now`, and the calendar assertions derive their expected
   month label the same way the screen does. Documented at the top of the test file
   so nobody re-introduces it.
4. **Weekday-name ambiguity in calendar tests.** A fixture row's date box also
   renders "Sun"/"Sat", so `getByText('Sun')` was ambiguous depending on which day
   of the week the suite ran. The two weekday-header tests now use an empty event
   list; a separate test covers the month list with events.
5. **`.superpowers/sdd/.gitignore` had been reset to `*` by tooling** during this
   session — the exact regression that file's own comment warns about, which would
   have silently stopped tracking the build ledger (including this report). Restored
   from HEAD; not committed as part of my change.
6. **Stale `App.jsx` comment** ("Tasks 12 and 13 replace them") was wrong about
   which task owns More. Corrected.

## Concerns

1. **No availability count on Upcoming rows.** design-system.md §4.13 shows a green
   "✓ N" available count on the right of upcoming fixture rows. I omitted it
   deliberately: Task 10 only exposes `listAvailability(eventId)`, so rendering it
   would mean one query per visible row (N+1). Availability lives in the detail
   sheet for now. If the club wants it in the list, the right fix is a counts view
   or an RPC returning per-event aggregates — worth a line in a later task rather
   than N round-trips here.
2. **Explicit re-sorting.** `listEvents` already orders by `starts_at` ascending, so
   `sortByStart` is technically redundant for Upcoming. I kept it because
   "Results are newest first" is a screen-level requirement that shouldn't silently
   depend on a query's `ORDER BY`; the cost is ~15 lines in `eventFormat.js`.
3. **Defensive null-date handling.** `starts_at` is `NOT NULL`, so `eventDate` can
   only return null for an unparseable value that Postgres cannot produce. I kept
   the guards (and the "Date to be confirmed" fallback copy) because the failure
   mode otherwise is a literal "Invalid Date" on screen — but it is copy for a state
   that shouldn't occur, and I'd accept a reviewer cutting it.
4. **Timezone.** All formatting uses the browser's locale and zone. UAE is UTC+4
   with no DST, so for club users this is correct; a member travelling would see
   fixture times in their current zone. If the club wants times always in Gulf
   Standard Time, that's a one-line `timeZone: 'Asia/Dubai'` in `eventFormat.js` —
   flagging rather than deciding, since it's a product call.
5. **Verbose row accessible names.** A fixture row is one button, so a screen reader
   announces the whole row ("Jul 30 Thu Match U10 Quins vs Dubai Exiles 5:00 PM
   Zayed Sports City"). Complete but wordy. An `aria-label` would shorten it at the
   cost of diverging from the visible text; I left it faithful.
6. **`teamFilter` isn't reconciled against a shrinking team list.** If a user's
   memberships changed mid-session such that the selected team is no longer visible,
   the list would show nothing until they tap another pill. Not reachable today
   (memberships load once per session) and not worth pre-solving.
7. **Nothing on this screen is verified in a real browser.** jsdom applies no CSS, so
   the class-token guard is the strongest automated statement I can make about
   layout. The calendar grid and the detail hero's negative-margin bleed in
   particular are worth one look on a phone before sign-off.
