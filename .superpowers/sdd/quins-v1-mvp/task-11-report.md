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

---

# Fix report — Task 11 review round 1

**Commit:** `e2cc1c7` fix: keep the schedule and availability on screen during realtime refreshes

Both Important findings addressed. The two controller rulings (deferred "✓ N
available" count, timezone as a product question for Jay) were not touched, and I
did not act on the deferred Minor findings.

## Finding 1 — every realtime refresh replaced the content with a spinner

Correct, and worse than cosmetic: the flicker fired on *other people's* actions,
not the user's own. Any insert/update/delete on `events` anywhere in scope tore the
list out of the DOM and collapsed the page height for a round trip; `EventDetail`
did the same on every single RSVP, blanking the availability bar the user was
reading.

**`src/screens/Schedule.jsx`** — `loading` still means "a fetch is in flight" (it
is, on a refresh), but the render now keys off a derived
`isFirstLoad = loading && events.length === 0`. The spinner card and the `!loading`
guards around the error card and the three tab bodies all moved to `isFirstLoad`.
A refresh therefore leaves the current rows mounted and swaps them in place when
the new data lands. The retry-after-error path still shows a spinner for free,
because the catch clears `events` — so `events.length === 0` is true again and no
extra state was needed.

**`src/screens/EventDetail.jsx`** — the availability effect re-runs on every RSVP,
and there `rows.length === 0` is a legitimate steady state ("No one has responded
yet"), so the derived form would still have flickered empty → spinner → empty.
Used a `settledForEvent` ref instead: `setLoading(true)` fires only when a first
attempt for *this* event id hasn't settled yet. The ref is set in `.finally`, so it
covers the error path too. (`useRef` added to the React import.)

Neither change puts a callback in an effect dependency array, so the `Sheet`
stale-`onClose` trap is not reintroduced.

## Finding 2 — `src/lib/eventFormat.js` had no direct test file

Correct, and the half-score gap was the real risk. Added
**`tests/event-format.test.js`** — 28 cases, plain fixture objects, no mocks or
rendering, following `tests/scope.test.js`'s shape. Covers every documented
behaviour the reviewer named, plus the rest of the module's surface:

- `hasResult`: both halves present; **only `result_us`**; **only `result_them`**;
  neither; a 0–0 draw (a truthiness check would misfile it as unplayed);
  null/undefined event.
- `resultOutcome`/`resultLabel`/`resultScore`: win/loss/draw, the
  null-without-a-full-score case, and the en-dash format.
- `eventTitle`: match with opponent, training/social titles, title-when-no-opponent,
  and both fallbacks (`'Quins match'`, `'Club event'`).
- `eventDate`: parses; null for missing; null (not `Invalid Date`) for garbage.
- `dateBoxParts`: real date, and the exact `{ month: '—', day: '–', weekday: '' }`
  placeholder for null.
- `formatTime`/`formatLongDate`: real date, and the exact fallback copy for null.
- `sortByStart`: ascending, descending, **undated-sorts-last in both directions**,
  two undated events, and non-mutation of the input.

Locale/timezone note recorded at the top of that file: these helpers format with
the runtime's default locale on purpose, so the suite asserts the fallback strings
exactly (locale-independent) and asserts the formatted paths only on parts that
hold in any locale (`String(getDate())`, the year, "not the fallback"). Fixture
dates are built from local components rather than ISO strings, so nothing depends
on the machine's timezone either.

## Tests covering the amended code

Amended/added: `tests/schedule.test.jsx` (+2 cases, now 29) and
`tests/event-format.test.js` (new, 28).

The two new schedule cases hold the refetch promise open and assert mid-flight,
because the pre-existing realtime test passes either way — both promises have
settled by the time it asserts, which is exactly why it missed this:

- "keeps the current rows on screen while a realtime refresh is in flight" — both
  fixtures still rendered and `queryByRole('status')` null while the refetch is
  pending, then the rows swap when it resolves.
- "keeps the availability bar on screen while an RSVP refresh is in flight" —
  "1 in" still rendered and no spinner inside the dialog mid-flight, then "2 in"
  once the new rows land.

### Mutation checks (proving the new tests bite)
| Mutation | Result |
|---|---|
| `isFirstLoad` reverted to `loading` in Schedule | 1 failure — "keeps the current rows on screen…" |
| `settledForEvent` guard removed from EventDetail | 1 failure — "keeps the availability bar on screen…" |
| `hasResult`'s `&&` changed to `\|\|` | 3 failures — both half-score cases + "has no outcome, label or score without a full score" |
| `sortByStart`'s null-date guards deleted | 1 failure — "puts an undated event last in both directions" |

### Command and output

```
$ npx vitest run tests/event-format.test.js tests/schedule.test.jsx

 RUN  v2.1.9 /root/quins-club-hub

 ✓ tests/schedule.test.jsx (29 tests) 1922ms
 ✓ tests/event-format.test.js (28 tests) 30ms

 Test Files  2 passed (2)
      Tests  57 passed (57)
   Start at  16:45:57
   Duration  4.63s (transform 329ms, setup 121ms, collect 592ms, tests 1.95s, environment 998ms, prepare 151ms)
```

```
$ npm test

 RUN  v2.1.9 /root/quins-club-hub

 ✓ tests/schedule.test.jsx (29 tests) 1949ms
 ✓ tests/components.test.jsx (38 tests) 520ms
 ✓ tests/data.test.js (25 tests) 39ms
 ✓ tests/scope.test.js (35 tests) 16ms
 ✓ tests/login.test.jsx (16 tests) 1195ms
 ✓ tests/app-shell.test.jsx (12 tests) 396ms
 ✓ tests/auth.test.jsx (12 tests) 360ms
 ✓ tests/require-auth.test.jsx (9 tests) 162ms
 ✓ tests/event-format.test.js (28 tests) 31ms
 ✓ tests/memberships.test.jsx (7 tests) 199ms
 ✓ tests/app.test.jsx (6 tests) 229ms
 ✓ tests/nav.test.jsx (6 tests) 340ms
 ✓ tests/supabase.test.js (4 tests) 72ms

 Test Files  13 passed (13)
      Tests  227 passed (227)
   Start at  16:46:42
   Duration  21.11s (transform 697ms, setup 924ms, collect 2.59s, tests 5.51s, environment 7.37s, prepare 1.05s)
```

```
$ npm run build
dist/index.html                   0.83 kB │ gzip:   0.41 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-B35NBhwP.css   23.12 kB │ gzip:   5.41 kB
dist/assets/index-BYz07q7w.js   419.22 kB │ gzip: 119.66 kB
✓ built in 3.61s
```

227 passed / 13 files, up from 197 / 12 at first submission (+2 schedule,
+28 event-format). Nothing regressed; output is clean — no warnings, no `act()`
noise.

## Files changed in this round
- `src/screens/Schedule.jsx` — `isFirstLoad` derived; spinner/error/tab guards use it
- `src/screens/EventDetail.jsx` — `settledForEvent` ref gates the first-load spinner; `useRef` imported
- `tests/schedule.test.jsx` — 2 in-flight realtime assertions
- `tests/event-format.test.js` — new, 28 cases

## Concerns
None new. One note for the re-reviewer: `Schedule` and `EventDetail` now use two
different first-load idioms (a derived `loading && events.length === 0` vs a
`settledForEvent` ref). That is deliberate, not drift — an empty list is a
transient state on the schedule but a legitimate steady state for availability, so
the derived form would still flicker there. Both are commented in place with that
reasoning.

Housekeeping: `.superpowers/sdd/.gitignore` was reset to `*` by tooling twice
during this task (the regression its own comment warns about, which silently
untracks the whole ledger). Restored from HEAD both times; not part of either
commit.

---

# Fix report — Task 11 review round 2 (visual verification)

**Commit:** `bf60a0d` fix: align populated and empty calendar day cells

One Important defect, fixed. The three deferred rulings (Sheet's
`env(safe-area-inset-bottom)`, the "✓ N available" count, the desktop month
grid's 775px height) were not touched.

## The defect — calendar day numbers sat at two different heights

Confirmed and reproduced. A day with events has to be a `<button>` for keyboard
access; a day without one stays a `<div>`. Chromium's UA stylesheet lays a
button's content out centred inside its box, and the shared cell classes only set
`p-[5px]` — nothing that overrode it. So the number dropped in populated cells
while empty ones sat top-left. Worse at desktop, because the defect scales with
cell height: the offset is half the leftover vertical space.

The prototype used a `<div>` for every cell
(`assets/prototype-downloads.html:597`), so this arrived with the interactive-cell
markup rather than being inherited — my change, my regression.

**Fix (`src/screens/Schedule.jsx`).** Both variants now render from a single
module-level `CELL_LAYOUT` string that makes every cell an explicit flex
container with `items-start justify-start`. That replaces the UA's button layout
with one I control, so the number lands in the same place regardless of which
element the cell is. Nothing was removed: the cell is still a real `<button>`
with its `aria-label` and click handler when it has events. Both variants also
carry `data-testid="calendar-day"` so the invariant is assertable.

### Measured in Chromium, after the fix
Re-ran the harness dev server and measured the day number's offset from its own
cell's top-left, plus the dots and keyboard focus:

| Width | Cell size | Populated (`<button>`) | Empty (`<div>`) | Before (reported) |
|---|---|---|---|---|
| 375px | 40px | top 8px, left 6px | top 8px, left 6px | 13px vs 8px |
| 1280px | 147px | top 8px, left 6px | top 8px, left 6px | 66px vs 8px |

8 populated and 23 empty cells measured in the default month at each width — all
identical. The event dots still sit 5px from the cell's bottom-left at both widths
(absolutely positioned children are out of flow, so the flex container doesn't
move them), and `cell.focus()` still lands on the cell at both widths, so the
keyboard semantics survived the fix.

## The test that would have caught it

`tests/schedule.test.jsx` → "aligns populated and empty day cells identically".

jsdom applies no UA stylesheet and computes no layout, so no rendering or
geometry assertion in this suite could ever have caught this — which is exactly
why it reached visual verification. The testable invariant is the one the
codebase already uses for responsive concerns: assert the literal class tokens.
The test renders a month containing at least one event, splits the cells by tag,
and asserts every cell of **both** variants carries `relative`, `flex`,
`items-start`, `justify-start`, `text-left` and `p-[5px]`. It also asserts both
variants are actually present first, so it can't pass vacuously on a month that
happened to render only one kind.

`hasClassToken` was added to this file, matching the helper already in
`tests/app-shell.test.jsx` and `tests/components.test.jsx`.

### Mutation checks (proving the new test bites)
| Mutation | Result |
|---|---|
| `CELL_LAYOUT` reverted to the pre-fix classes (no flex/alignment) | 1 failure — "aligns populated and empty day cells identically" |
| Alignment tokens applied to the `<button>` branch only (i.e. the two variants diverge again, silently) | 1 failure — same test |

The second mutation is the important one: it is the shape a future edit would most
plausibly take, and the test catches the divergence rather than just the absence.

## Tests covering the amended code

`tests/schedule.test.jsx` — 30 cases (was 29; +1 for the alignment invariant). No
other test file's behaviour changed.

### Command and output

```
$ npx vitest run tests/schedule.test.jsx

 RUN  v2.1.9 /root/quins-club-hub

 ✓ tests/schedule.test.jsx (30 tests) 1916ms

 Test Files  1 passed (1)
      Tests  30 passed (30)
   Start at  17:05:27
   Duration  3.60s (transform 273ms, setup 74ms, collect 457ms, tests 1.92s, environment 505ms, prepare 85ms)
```

```
$ npm test

 RUN  v2.1.9 /root/quins-club-hub

 ✓ tests/schedule.test.jsx (30 tests) 2485ms
 ✓ tests/components.test.jsx (38 tests) 584ms
 ✓ tests/data.test.js (25 tests) 27ms
 ✓ tests/scope.test.js (35 tests) 27ms
 ✓ tests/login.test.jsx (16 tests) 1298ms
 ✓ tests/app-shell.test.jsx (12 tests) 402ms
 ✓ tests/auth.test.jsx (12 tests) 316ms
 ✓ tests/require-auth.test.jsx (9 tests) 129ms
 ✓ tests/event-format.test.js (28 tests) 47ms
 ✓ tests/memberships.test.jsx (7 tests) 186ms
 ✓ tests/app.test.jsx (6 tests) 224ms
 ✓ tests/nav.test.jsx (6 tests) 254ms
 ✓ tests/supabase.test.js (4 tests) 66ms

 Test Files  13 passed (13)
      Tests  228 passed (228)
   Start at  17:07:20
   Duration  21.89s (transform 677ms, setup 933ms, collect 2.56s, tests 6.04s, environment 7.34s, prepare 1.11s)
```

```
$ npm run build
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-BNf3XKmG.css   23.17 kB │ gzip:   5.41 kB
dist/assets/index-BKPtMCMi.js   419.32 kB │ gzip: 119.69 kB
✓ built in 3.57s
```

228 passed / 13 files, up from 227. Nothing regressed; output clean, no warnings
and no `act()` noise.

## Housekeeping (same commit)
- `screenshots` added to `.gitignore`; `git rm -r --cached screenshots` removed the
  10 previously-tracked PNGs (~1 MB) from the index. Files remain on disk.
- Harness kept tracked and committed, including the additions that produced this
  finding: `harness/shoot-schedule.mjs`, `harness/stubs/events.js`,
  `harness/stubs/availability.js`, and the `harness/main.jsx` /
  `harness/vite.config.js` modifications. The next task re-runs the same check
  with `npx vite --config harness/vite.config.js` then
  `node harness/shoot-schedule.mjs`.

## Files changed in this round
- `src/screens/Schedule.jsx` — shared `CELL_LAYOUT`; `data-testid` on both cell variants
- `tests/schedule.test.jsx` — alignment invariant test + `hasClassToken` helper
- `.gitignore` — ignore `screenshots`
- `harness/*` — committed as-is (coordinator's visual-check tooling)
- `screenshots/*.png` — untracked (files kept on disk)

## Concerns
None outstanding on the code. Two process notes:

1. **This class is of defect is invisible to the whole test suite.** The fix and its
   test pin one specific instance; the general risk — a `<button>` used as a layout
   box inheriting UA centring — applies anywhere else the app makes a non-text
   element interactive. The fixture rows in this screen are also `<button>`s, but
   they set `flex items-center` explicitly, so they are fine. Worth watching in
   Tasks 12/13, which will follow this screen's patterns.
2. **`.superpowers/sdd/.gitignore` has now been reset to `*` by tooling three times**
   across this task (twice during my work, once during the visual check). Each reset
   silently untracks the entire build ledger. I restored it from HEAD again before
   committing and confirmed the `*` version is not in any of my commits, but
   something is rewriting it repeatedly and it will eventually land in someone's
   commit unnoticed.

---

# Task 11 — Amendment: force all event times to Abu Dhabi time

Jay's ruling on the open product question I flagged in the original report: event
times are no longer rendered in the reader's browser zone. They are always Abu
Dhabi time. One club, one home ground — "20:00" has to mean 20:00 at Zayed Sports
City whether the reader is on the touchline, on tour, or a committee member
checking fixtures from the UK. Under the old behaviour a parent in London read a
20:00 kick-off as 16:00.

This is a **presentation-only** change. `starts_at` is still `timestamptz`, still
stored UTC, and every instant comparison (`sortByStart`, upcoming-vs-past,
`hasResult`) is untouched and was already zone-agnostic. No schema change.

## What I implemented

**One constant, one source of truth** — `CLUB_TIME_ZONE = 'Asia/Dubai'` in
`src/lib/eventFormat.js`, deliberately an IANA **zone identifier** consumed via
`Intl.DateTimeFormat`'s `timeZone` option, not a hardcoded `+04:00`. The UAE has
no DST today so the two agree, but an offset is a derived fact that would rot
silently if that ever changed; the zone stays correct by definition. `formatTime`,
`formatLongDate` and `dateBoxParts` all route through it.

**Two new pure helpers**, same zero-import/no-React pattern as the rest of the module:

- `clubDayParts(date)` → `{ year, month, day }` — the calendar day an instant falls
  on *in club time*, month 0-based to match `Date`'s convention. Built on
  `formatToParts` off a module-level formatter pinned to `en-US` **only** because it
  extracts numbers, never user-visible text (a `ja-JP` numeric day returns `"24日"`).
  The user-facing formatters still use the reader's own locale — only the *zone* is
  forced, not the language.
- `clubToday()` — today in club time, for the "today" ring and the month the
  calendar opens on.

**The calendar grid** was the subtle part. `CalendarMonth` now carries its displayed
month as plain `{ year, month }` numbers rather than a `Date`. That is the actual
fix, not a tidy-up: a `Date` is always an *instant*, and every arithmetic path on
one (`new Date(y, m, d)`, `getDay()`, `getDate()`) silently reads the browser's
zone. Day bucketing and the today-highlight now both compare `clubDayParts`. The
only `Date`s left in the grid are UTC-anchored throwaways used to ask "what weekday
is the 1st?" and "how many days in this month?" — questions about a calendar, not
about an instant.

**One quiet UI note**, on the `EventDetail` date/time line only:
`Tue, Jul 28, 2026 · 7:30 PM · Abu Dhabi time`. Not on every list row — someone
scanning a list doesn't need reminding once per line; someone reading one fixture
from abroad does need to know 20:00 isn't their 20:00. Kept on the same line at the
same `white/[.85]`, set apart by weight rather than colour.

## TDD evidence

RED was produced honestly by stashing **only** the three source files and keeping
the new tests, so the failures are the tests catching the real defect rather than
import errors:

```
$ git stash push src/lib/eventFormat.js src/screens/Schedule.jsx src/screens/EventDetail.jsx
$ npx vitest run tests/event-format.test.js tests/schedule.test.jsx
  Test Files  2 failed (2)
       Tests  16 failed | 61 passed (77)
```

All 16 named failures were the new assertions, including the three screen-level
ones ("buckets a fixture into its Abu Dhabi day, not the browser's", "carries a
fixture into the next month when Abu Dhabi has already rolled over", "says once
that times are Abu Dhabi time"). The important one is behavioural, not a missing
export:

```
$ npx vitest run tests/event-format.test.js -t "renders the Dubai wall-clock time"
AssertionError: expected 3 to be 1
  ❯ tests/event-format.test.js:361  expect(new Set(rendered).size).toBe(1)
```

i.e. the unfixed `formatTime` produced **three different strings** for one instant
under UTC / New York / Auckland. That single line is also the proof that runtime
`process.env.TZ` manipulation genuinely works in this setup — had it not, the
assertion would have passed vacuously.

GREEN after `git stash pop`:

```
$ npx vitest run tests/event-format.test.js tests/schedule.test.jsx
  Test Files  2 passed (2)   Tests  77 passed (77)
```

Full suite: **300 passed across 15 files** (baseline 282, +18 new), pristine output,
no regressions. `npm run build` clean.

### How the tests avoid proving nothing

The trap here is that this runner is UTC, and UTC and Dubai share a calendar day
for 20 hours out of every 24 — a mid-afternoon instant would pass just as happily
against a completely unfixed formatter. So:

- Every pinned instant is chosen so Dubai's answer **differs** from at least one of
  UTC / New York / Auckland: 21:00 UTC → 01:00 the *next* Dubai day; 20:00 UTC →
  exactly midnight Dubai; 19:59 UTC on 31 Jul → last minute of the month; 21:00 UTC
  on 31 Jul → first hour of August; 20:00 UTC on 31 Dec → the club new year.
- The whole set is re-run under all three process zones, asserting the rendered
  output is **byte-identical** across them.
- A `withTimeZone` **guard-the-guard** test asserts the helper really does move the
  process zone (`getDate()` returns 24 in New York, 25 in Auckland for the same
  instant) — without it, every zone assertion below it could pass vacuously.
- The screen-level tests derive their expected month/day from an
  `Intl.DateTimeFormat` computed **independently of `eventFormat.js`**, so they are
  not just the implementation agreeing with itself, and they don't flake during the
  four hours a day when UTC and Dubai disagree.

## Files changed

- `src/lib/eventFormat.js` — `CLUB_TIME_ZONE`, `clubDayParts`, `clubToday`; the
  three formatters routed through the zone
- `src/screens/Schedule.jsx` — month state as `{year, month}`; club-local bucketing
  and today-highlight; UTC-anchored month labels
- `src/screens/EventDetail.jsx` — the "· Abu Dhabi time" suffix
- `tests/event-format.test.js` — new club-timezone suites (+15)
- `tests/schedule.test.jsx` — bucketing, month roll-over, UI-note tests (+3)
- `harness/stubs/events.js` — one boundary fixture at `2026-07-20T21:00:00Z`, so
  the browser check can *see* the cell a naive implementation gets wrong

## Browser check

Ran `harness/shoot-schedule.mjs` at 375px and 1280px with **both the dev server and
Chromium under `TZ=America/New_York`** — a browser check in UTC would have been
nearly as worthless as a test in UTC. Screenshots read with the Read tool, not just
asserted in code.

- **Calendar, 375 & 1280.** The boundary fixture (`2026-07-20T21:00Z`) renders in
  the list as **JUL 21 Tue, 1:00 AM**. Under New York the old code would have shown
  *JUL 20 Mon, 5:00 PM*. Its dot sits in the **21st** cell; the 20th is empty.
- **Today ring.** Container clock was 2026-07-28 01:09 UTC = 28 Jul in Dubai, 27 Jul
  in New York. The ring is on **28** — so the today-highlight fix is demonstrated
  live, not just unit-tested.
- **Row geometry undisturbed.** Calendar cells uniform at 40×40 (mobile) and
  147×147 (desktop) across the button and div variants — the UA content-centring
  trap from the original task has not reopened. Zero horizontal overflow
  (`docWidth === innerWidth` at both widths), zero console errors, zero page errors
  across all 16 shots.
- **EventDetail line** renders correctly at both widths, and the list rows visible
  behind the open sheet carry no "Abu Dhabi time" — it appears exactly once.

## Self-review findings

1. **Fixed: a wrong contrast number in a code comment.** The comment on the new
   EventDetail line claimed `white/85%` on `#C21F32` measures **5.02:1**. I
   recomputed it independently (sRGB→linear, WCAG 4.5:1 for normal text) and it is
   **4.632:1**. The conclusion survives — 4.632 still clears AA, and the rejected
   `white/70%` alternative really is 3.55:1 (the comment's 3.53 was near enough) —
   but a confidently stated wrong number in a comment is worse than no number,
   because the next person trusts it instead of recomputing. Corrected to 4.63:1
   with the AA margin stated explicitly, since 4.63 against a 4.5 threshold is a
   thin margin worth being honest about.
2. **Swept for every other user-facing date/time.** Grepped `src/` for
   `toLocale*String`, `Intl.DateTimeFormat`, `getDate/getMonth/getFullYear/getDay/
   getHours`, `toDateString` and `new Date(`. Every surviving call site is either
   club-zoned or deliberately UTC-anchored. Separately checked for other
   date-bearing fields reaching the UI (`created_at`, `updated_at`, DOB/birth):
   there are none — `starts_at` is the only timestamp the app renders, and "age
   group" is a team name, not a date. Nothing is left rendering in the browser zone.
3. **YAGNI held.** No timezone picker, no per-user preference, no offset display for
   remote readers, no `date-fns-tz` dependency. `clubDayParts` and `clubToday` are
   both consumed by real call sites; neither is speculative.
4. **`--muted` ruling checked and correctly ruled inapplicable.** The `#5c5854`
   decision governs muted text *on paper*. This line sits on the red hero gradient
   at `white/[.85]`, a different context, so it was left alone rather than
   mechanically recoloured.

## Note for Task 14 (flagged only — NOT implemented)

**Task 14's event form must interpret the date and time a coach enters as Abu Dhabi
time when it builds `starts_at`.** This is the exact mirror image of this change. A
naive `new Date(\`${dateInput}T${timeInput}\`)` resolves in the *browser's* zone, so
a coach in the UK entering "20:00" would write `19:00Z` — a 23:00 Abu Dhabi kick-off
— and this screen would then faithfully render that wrong instant. Reading and
writing have to agree: the form needs to convert club wall-clock → UTC using
`CLUB_TIME_ZONE`, and the form's date field should default from `clubToday()` rather
than `new Date()`. Worth a test with the process zone set to something other than
UTC+4, for the same reason as above.
