# Task 12 report — Roster screen

## What I implemented

**`src/screens/Roster.jsx`** — Roster & members (design-system.md §5.3):
scope note → section head → search bar → team filter pills → grouped player
list, plus the loading / empty / error contract.

- Loads once for the whole visible scope (`listPlayers({ teamIds })` where
  `teamIds` comes from `visibleTeams(memberships, teams)`), then filters and
  groups in memory. Same reasoning as Task 11's Schedule: the scope is at most
  15 squads' worth of players, so refetching on every keystroke or pill tap
  would buy latency and flicker for nothing.
- **Grouping rule.** One team in view — because a pill is selected, or because
  the user only sees one — groups by position (Forwards / Backs / Other, fixed
  order, sorted by jersey number with numberless last). Several teams group by
  age group, in `visibleTeams`' display order, omitting any group with no
  players after filtering.
- **Search** filters on name, position, age group and jersey number
  (case-insensitive substring), *before* grouping.
- Team pills carry a live count (`U10 · 9`), and the count follows the search,
  so the row doubles as a "where did my matches land" readout.
- No realtime subscription: `src/data/players.js` exposes none, and inventing
  one is Task 15's business. No Add/Edit affordances either — Task 15 owns
  player writes, and a disabled button would promise a control that doesn't
  exist.

**`src/screens/PlayerDetail.jsx`** — the player sheet (§5.7): branded hero with
the jersey tile, key/value rows (Position, Age group, Jersey number, Role),
then a contact block loaded via `getPlayerContact`.

**`src/App.jsx`** — replaced the inline `function Roster()` placeholder with an
import of the real screen. Home and More placeholders untouched.

**`tests/app.test.jsx`** — mocked `src/data/players.js` (the /roster route now
renders a screen that queries Supabase) and renamed the roster case from
"placeholder" to "screen". Same treatment Task 11 gave `events.js`.

**Harness** (`harness/stubs/players.js`, `harness/shoot-roster.mjs`, plus a
scenario and alias in `harness/main.jsx` / `harness/vite.config.js`) — for the
browser check described below.

### The grouping rule's zero-team edge case — decided deliberately

The brief's rule ("age group when multiple teams are visible, by position when
one") says nothing about **zero** visible teams. I made it fall to the
age-group branch, which then produces no groups at all and renders the empty
state.

Rationale: with no squad there are no positions to organise and nothing to
organise them from, so either branch renders identically — but the age-group
branch does it without a special case. The load-bearing half of this decision
is the query, not the grouping: `listPlayers({ teamIds: [] })` means "no
teams, show nothing" (it returns `[]` without querying), never "no filter,
show everything". `tests/roster.test.jsx` asserts the screen asks for `[]` and
renders nothing, so a future refactor can't quietly turn a user with no
resolvable squad into someone who sees the whole club. (`AppShell` already
intercepts the zero-*membership* case, so in practice this is only reachable
when a membership points at a team that doesn't resolve.)

### Safeguarding: the null contact row

`getPlayerContact` resolving `null` is the **normal** outcome for a parent —
RLS withholds `player_contacts`, including for minors. `ContactBlock` renders
`null` in that case: no error, and deliberately **no** "contact details are
hidden" note, because such a note confirms to someone who may not see the data
that there is data to see. This is the one place the implementation knowingly
departs from the prototype, which showed a parent a lock message (§5.7). Both
the unit test and the browser check assert it.

## What I tested, and the results

`tests/roster.test.jsx` — 31 tests, all passing:

| Area | Cases |
|---|---|
| Loading / empty / error | spinner while in flight; empty state; failed query in `role="alert"` with a working retry |
| Scoping | coach → one team id; admin → every visible team in display order; unresolvable team → `{teamIds: []}` + empty state |
| Grouping | age groups in display order; empty group omitted; position groups for a single-team user; pill click switches to position grouping; jersey sort with numberless last; per-group counts; filter hidden below two teams |
| Search | name (case-insensitive), position, age group, jersey number; group dropped when nothing in it matches; no-match message distinct from the empty-roster message |
| Rows | jersey / position / age group rendered; captain marked; explicit layout class tokens |
| Scope note | coach, parent (read-only), admin (none) |
| PlayerDetail | opens with details and calls `getPlayerContact(id)`; closes; contact links when a row returns; **nothing at all** when it returns null; partial rows render only what they have; contact error in an alert |

Full suite: **259 passed across 14 files** (baseline 228 across 13, plus this
file's 31 — nothing regressed). `npm run build` clean. Test output pristine: no
act() warnings, no stderr, no unhandled rejections.

### TDD evidence

**RED** — `npx vitest run tests/roster.test.jsx`, with the test file written
and neither screen existing:

```
 FAIL  tests/roster.test.jsx [ tests/roster.test.jsx ]
Error: Failed to resolve import "../src/screens/Roster.jsx" from "tests/roster.test.jsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

Expected: the test imports the screen under test, which had not been written
yet, so collection fails before any assertion runs.

**GREEN** — after implementing both screens, same command:

```
 ✓ tests/roster.test.jsx (31 tests) 1836ms
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

**Mutation check.** All 31 passed on the very first implementation run, which
is exactly when tests deserve suspicion, so I mutated the implementation to
confirm they bite:

| Mutation | Result |
|---|---|
| `groupByPosition` forced to `false` | 4 failures ✓ |
| null contact renders "Contact details are hidden." | 1 failure ✓ |
| `matchesQuery` returns `true` always | 6 failures ✓ |
| numberless jersey sorts *first* (`Infinity` → `-1`) | **survived** ✗ |
| name tie-break dropped (`localeCompare` → `0`) | (added after fix) 1 failure ✓ |

The survivor was a real hole: the only numberless fixture sat alone in the
"Other" group, so "numberless sorts last" was vacuous — the assertion could
not have failed however the comparator behaved. Fixed by adding two numberless
*forwards* (so the claim is tested inside a group that also holds numbered
players, and the two-numberless tie-break is exercised too). Both mutations
now fail. All post-fix mutations reverted; suite re-verified green.

### Browser check

jsdom applies no CSS and no UA stylesheet, and this screen makes a `<button>`
a layout box — the exact shape of the bug that shipped in Task 11's calendar
cells. So I extended the Playwright harness (8 scenarios × 375px and 1280px)
and measured rather than eyeballed:

- **Jersey tile offset from row top: 13px on every row, in every scenario, at
  both widths** (row heights 65–66px). If the row's explicit
  `flex items-center` were dropped, the UA's content-centring would make those
  numbers drift between rows of differing height. They don't.
- **No horizontal overflow**: `document.scrollWidth === innerWidth` (375 and
  1280) in all 16 shots; zero elements extending past the viewport.
- **Console clean** apart from two pre-existing React Router v7 future-flag
  warnings, which come from the harness's `MemoryRouter` (the real `App.jsx`
  sets those flags) — not from this task's code.
- The no-contact sheet's full text ends at `… | Role | Captain` — confirming in
  a real browser that nothing about contact details is rendered.

**One defect the browser check caught that no unit test could:** `type="search"`
makes Chromium paint its own clear glyph, measured at `#365A99` — a blue with
no business on a red/green brand page, and unrecolourable through `-webkit-`
pseudo-elements. The design system's `.search` (§4.9) has no clear control at
all, so I suppressed the glyph
(`[&::-webkit-search-cancel-button]:appearance-none`) rather than restyling it,
keeping `type="search"` for the `searchbox` role. Re-shot and verified the
pixel is now white.

## Files changed

- `src/screens/Roster.jsx` (new)
- `src/screens/PlayerDetail.jsx` (new)
- `tests/roster.test.jsx` (new)
- `src/App.jsx` (modified — placeholder replaced with the real import)
- `tests/app.test.jsx` (modified — players data module mocked; one test renamed)
- `harness/stubs/players.js`, `harness/shoot-roster.mjs` (new — visual
  verification only, not part of the app build)
- `harness/main.jsx`, `harness/vite.config.js` (modified — roster scenarios + alias)

## Self-review findings (all fixed before committing)

1. **A `useMemo` that could never hit its cache.** `groups` was memoised on
   `visible`, which is rebuilt on every render because it depends on the search
   box. The memo was correct but advertised a saving it never made. Removed;
   the grouping is now a plain computation with a comment saying why.
2. **A ternary whose branches were identical.** `scopeSummary` special-cased
   admin and then produced the same string either way. Collapsed to
   `scopedTeams.length === 1 ? teamNames : '<n> age groups'`, which also reads
   better for a single-squad admin.
3. **A `//` comment sitting between JSX attributes.** Legal, but nothing else
   in this codebase does it. Moved above the element as a `{/* */}` block.
4. **The vacuous jersey-sort test** described above.
5. **Contact link contrast** — checked, not changed: `#2F7D3D` on white is
   ~4.6:1, clearing AA. `quinsGreen #7DC351` appears nowhere as text; the only
   green surfaces are the coach scope-note fill and the header gradient. Error
   text is `quinsRedDark #8E1526` throughout.

Also considered and deliberately *not* done:

- **Extracting a `rosterFormat.js` pure module.** `positionGroup`, `byJersey`
  and `matchesQuery` are used by exactly one screen (PlayerDetail takes
  everything as props), and `eventFormat.js` was extracted only because two
  screens genuinely shared it. They stay module-local, and they're covered
  through the screen — which tests real behaviour rather than a helper's
  signature. Revisit if Task 13's dashboard wants them.
- **Extracting `KeyValue`.** Now duplicated between `EventDetail.jsx` and
  `PlayerDetail.jsx` (11 lines). Task 9 deliberately did not include it in the
  shared primitives; two copies is not yet a pattern. Flagged in a code comment
  to extract if Tasks 14/15's forms need a third.

## Concerns

1. **A team filter can outlive its team.** If memberships reload and shrink a
   user's scope while a specific team pill is selected, `teamFilter` still
   holds the vanished team id: the list filters to nothing and no pill appears
   selected (clicking "All" recovers). I did **not** fix this, because
   `Schedule.jsx` has the identical issue and shipped through review — fixing
   it in Roster alone would leave two sibling screens behaving differently for
   no stated reason. It wants one decision applied to both. Raising it rather
   than silently diverging.
2. **`ContactBlock` shows no retry on error**, matching `EventDetail`'s
   availability block. Closing and reopening the sheet retries. Consistent, but
   worth a deliberate ruling if the app later standardises inline retries.
3. **The section-head count describes the scope, not the filter** ("20 players ·
   2 age groups" stays put while a search narrows the list). The per-group and
   per-pill counts are the live ones. I think this is right — the sub-line
   answers "what am I looking at", not "what did my search find" — but it is a
   judgement call a reviewer may read differently.

---

# Task 12 fix report — review round 1

Three items: one Important review finding and two controller rulings. All
three are fixed, each covered by a test, and each mutation-checked to confirm
the test actually bites.

## 1. Important — pill counts were computed from the already-filtered list

`Roster.jsx` derived the pill counts from `visible`, which had the team filter
applied before the count was taken. Selecting any pill therefore made every
*other* pill read "· 0" and shrank "All" to the size of the current selection —
so with U10 selected, an admin's other 14 age groups all claimed to be empty
and the "All" pill misstated what clicking it would do. That inverted the whole
point of the counts.

**Fix.** Split the derivation in two: `matchingSearch` applies the search only
and feeds the counts; `visible` applies the team filter on top of it and feeds
the list. The counts now answer "how many matches are in each squad", which is
a question about the search, not about whichever pill happens to be selected.

**Also done, as directed:** the count is no longer smuggled through
`team.name`. `TeamPills` takes a `counts` prop (a `Map` from team id, plus
`ALL_TEAMS_ID` for the All pill, to a number) and builds the label itself.
Callers with nothing to count — the Schedule's filter — pass nothing and are
unaffected. A team absent from the map renders a bare name; a team mapped to
`0` renders "· 0", which is the distinction the old code could not express.

Confirmed in the browser: with U14 Boys selected the row now reads
`All · 20 / U12 Boys · 12 / U14 Boys · 8` (screenshot
`screenshots/task12/team-selected-desktop.png`).

## 2. Ruling A — the stale team pill, fixed in both screens

Applied `const activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID`
to **both** `Roster.jsx` and `Schedule.jsx`, and routed the list filter, the
grouping rule and `TeamPills`' `selected` through it in each.

The controller is right that my original mitigation note was wrong in the worst
sub-case, and this is worth recording: I claimed the user could click "All" to
recover. They cannot. Both screens hide the entire pill row below two visible
teams, so a scope that shrinks *to a single team* leaves no "All" pill to click
— the list stays empty until the user navigates away and back. The guard is
what makes that unreachable, not a convenience.

## 3. Ruling B — Playwright resolved portably

`harness/shoot-roster.mjs` and `harness/shoot-schedule.mjs` both imported
Playwright from the absolute path `/opt/node-tools/node_modules/playwright/index.mjs`
— one machine's layout, committed to a repo that gets cloned onto other PCs and
into fresh sandboxes.

Both now import a shared `harness/playwright.mjs`, which resolves at runtime:
`$PLAYWRIGHT_MODULE` if set, then the bare specifier `playwright` (local
devDependency, global install, or `NODE_PATH`). Playwright stays out of
`package.json` deliberately — it is a ~300MB browser download that the app
build, the unit tests and Netlify have no use for, and only the by-hand shoot
scripts need it. Failure to resolve raises a named, actionable error rather
than a stack trace about a missing file.

Both paths verified:

```
$ node harness/shoot-roster.mjs
Error: Could not load Playwright (tried: playwright).
Either install it in this repo:
  npm i -D playwright && npx playwright install chromium
or point PLAYWRIGHT_MODULE at an existing installation:
  PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node harness/shoot-roster.mjs

$ PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node harness/shoot-roster.mjs
exit=0   # 16 screenshots, layout metrics unchanged: tileOffsetTop 13px on
         # every row in every scenario at both widths, zero overflow
```

## Covering tests

| File | Tests added | Covers |
|---|---|---|
| `tests/roster.test.jsx` | `counts every squad, not just the selected one`; `narrows the counts to the search` | Finding 1 — counts survive a pill selection, and still follow the search |
| `tests/roster.test.jsx` | `falls back to all squads when the selected team leaves the scope` | Ruling A (Roster), incl. the shrink-to-one-team sub-case |
| `tests/schedule.test.jsx` | `falls back to all teams when the selected team leaves the scope` | Ruling A (Schedule) |
| `tests/components.test.jsx` | `suffixes each label with its count…`; `shows a zero count rather than treating it as absent`; `leaves every label bare when no counts are given` | the new `counts` prop, including 0-vs-absent |

## Command and output

Files amended in this round: `src/screens/Roster.jsx`, `src/screens/Schedule.jsx`,
`src/components/TeamPills.jsx`, `tests/roster.test.jsx`,
`tests/schedule.test.jsx`, `tests/components.test.jsx`,
`harness/playwright.mjs` (new), `harness/shoot-roster.mjs`,
`harness/shoot-schedule.mjs`.

```
$ npx vitest run tests/roster.test.jsx tests/schedule.test.jsx tests/components.test.jsx
 ✓ tests/schedule.test.jsx (31 tests) 2025ms
 ✓ tests/roster.test.jsx (34 tests) 1912ms
 ✓ tests/components.test.jsx (41 tests) 521ms
 Test Files  3 passed (3)
      Tests  106 passed (106)
```

Full suite and build:

```
$ npm test
 Test Files  14 passed (14)
      Tests  266 passed (266)

$ npm run build
✓ built in 3.42s
```

266 = 259 before this round + 7 new (3 Roster, 1 Schedule, 3 TeamPills).
Nothing regressed; output stayed pristine (no act() warnings, no stderr).

## Mutation checks on the new tests

Same discipline as the first round — a new test that has never failed has not
been shown to work:

| Mutation | Result |
|---|---|
| counts derived from `visible` again (restores the exact reported bug) | `counts every squad…` fails ✓ |
| `activeFilter = teamFilter` in `Roster.jsx` | Roster fallback test fails ✓ |
| `activeFilter = teamFilter` in `Schedule.jsx` | Schedule fallback test fails ✓ |

All mutations reverted; suite re-verified green afterwards.

Worth noting: under mutation 1 only *one* of the two count tests failed. The
`narrows the counts to the search` test passes either way, because it selects
no pill — with no team filter applied, `visible` and `matchingSearch` are the
same set. That's expected: it is the search-tracking test, and the
selected-pill test is the one that pins the bug.

## Not acted on (ruled deferred)

The jersey number's `aria-hidden` (Task 22 accessibility pass), the
section-head denominator, the "No players match" copy when a pill rather than
the search caused the zero, and the missing test for the
removed-player-closes-the-sheet guarantee.

---

# Task 12 fix report — review round 2

Four ruled items plus the one-file-over housekeeping catch. All fixed, each
covered by a test, each mutation-checked, and the two that were found in a
browser re-verified in a browser.

## 1. Important — the contact block announced itself while loading

`PlayerDetail.jsx` rendered a `Spinner` in a ~68px block while
`getPlayerContact` was in flight, then collapsed to nothing on a null row.
`Spinner` is `role="status"` with `aria-label="Loading contact details…"` in an
aria-live region, so a screen-reader user heard that string followed by
silence. The harness stub resolved on a microtask, which is why my own browser
pass missed it.

**Fix.** `if (loading) return null` — the block appears late rather than
announcing itself and collapsing. I accept the adjudication that this was not
a leak (the spinner rendered *before* the outcome was known, so it looked
identical for a player with details and one without), but it contradicted the
"renders nothing" contract stated in that file's own header comment, which is
exactly the kind of drift between comment and code worth removing.

The harness now carries a latency knob so this state stays reproducible:
`?contactDelay=3000` makes the stub take 3s. That is what let me verify the
fix where the defect was found rather than only in jsdom. (The controller's
verification pass had added the same knob independently; I had written a
duplicate constant applying the delay twice, and collapsed the two onto the
controller's `CONTACT_DELAY`.)

**Browser confirmation** — the in-flight sheet is now byte-identical to the
no-contact sheet:

| Shot | height | live regions | text |
|---|---|---|---|
| `detail-contact-inflight` (3s delay) | 481px | `[]` | `… Role \| Player` |
| `detail-no-contact` | 481px | `[]` | `… Role \| Captain` |
| `detail-contact` (settled) | 658px | `[]` | `… CONTACT \| Phone \| …` |

No `role="status"` or `role="alert"` node exists in the dialog at any point in
the happy path, and the block simply grows the sheet when the row lands.

## 2. Ruling — muted text on the page background

I recomputed both ratios rather than trusting the reported figures, and they
check out:

| Pair | Ratio | Verdict |
|---|---|---|
| `#77726e` on `--paper #f5f4f3` | **4.329:1** | fails AA (4.5:1) |
| `#77726e` on card white | 4.755:1 | passes |
| `#5c5854` on `--paper` | **6.417:1** | passes |

Darkened to `#5c5854` at the three on-paper sites: `Roster.jsx` group headers
and section-head sub-line, `Schedule.jsx` section-head sub-line — via a named
`MUTED_ON_PAPER` constant in each file so the on-paper-vs-on-card distinction
is stated at the point of use, which is the actual hazard.

`#5c5854` is not a new colour: it is already this project's answer wherever
`--muted` lands on a light fill (Chip's and Badge's neutral variants). Picking
it over a minimal darkening keeps the palette at one darkened-muted value
instead of three near-identical greys.

I audited every other `#77726e` in the touched files to confirm the ruling's
three sites were the complete set — the rest (player row meta, fixture rows,
calendar weekday headers, `Empty`, `KeyValue`, the search placeholder) all sit
on white and measure 4.755:1. Left untouched.

## 3. Ruling — `Sheet` bottom safe-area inset

`px-[18px] py-4` → `px-[18px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4`
on the sheet body, matching what `AppShell`'s `<main>` and `Nav`'s tab bar
already do.

Verified it compiles to valid CSS rather than assuming — CSS `calc()` requires
whitespace around `+`, and Tailwind's operator normalisation supplies it:

```
$ grep -o "padding-bottom:calc([^)]*)[^;}]*" dist/assets/*.css
padding-bottom:calc(100px + env(safe-area-inset-bottom))
padding-bottom:calc(16px + env(safe-area-inset-bottom))
```

## 4. Ruling — the Call/Email action row (§5.7)

Added under the contact KV rows: `tel:` and `mailto:` anchors styled as
design-system.md §3 buttons (`padding:10px 15px`, `radius:11px`, 14px/700),
Call filled `--maroon`, Email ghost with `--maroon` text — `#C21F32` on white
measures 5.94:1, clearing AA. Each renders only if its value is present.

It lives **inside** the contact block, above the `!contact` early return, so it
cannot outlive the row it describes — an action row offering to phone a player
whose contact RLS withheld would be precisely the leak this screen exists to
prevent. The test asserts that directly, and mutation M2 below proves the
placement is load-bearing rather than incidental.

## 5. Housekeeping — `harness/shoot.mjs`

Now imports `harness/playwright.mjs` like the other two scripts. No hardcoded
install path remains anywhere in `harness/` outside one illustrative
`PLAYWRIGHT_MODULE=…` line in the loader's own usage comment.

## Covering tests

| File | Tests | Covers |
|---|---|---|
| `tests/roster.test.jsx` | `renders nothing at all while the contact query is in flight` | item 1 — no `role="status"`, no "contact"/"loading" text while pending |
| `tests/roster.test.jsx` | `offers Call and Email actions for the values that exist`; `omits the Call action when there is no phone number` | item 4 |
| `tests/roster.test.jsx` | extended `renders no contact block…when RLS returns no row` | item 4 — the action row goes with the block |
| `tests/roster.test.jsx` | `darkens muted text that sits on the page background, not on a card` | item 2 |
| `tests/components.test.jsx` | `pads its body clear of the mobile home-indicator zone` | item 3 |

## Command and output

Files amended: `src/screens/PlayerDetail.jsx`, `src/screens/Roster.jsx`,
`src/screens/Schedule.jsx`, `src/components/Sheet.jsx`,
`tests/roster.test.jsx`, `tests/components.test.jsx`, `harness/shoot.mjs`,
`harness/shoot-roster.mjs`, `harness/stubs/players.js`.

```
$ npx vitest run tests/roster.test.jsx tests/schedule.test.jsx tests/components.test.jsx
 ✓ tests/schedule.test.jsx (31 tests) 2210ms
 ✓ tests/roster.test.jsx (38 tests) 2223ms
 ✓ tests/components.test.jsx (42 tests) 520ms
 Test Files  3 passed (3)
      Tests  111 passed (111)
```

`tests/schedule.test.jsx` is in scope for the `MUTED_ON_PAPER` change and is
unchanged at 31 passing — Task 11's pinned tests are undisturbed.

```
$ npm test
 Test Files  14 passed (14)
      Tests  271 passed (271)

$ npm run build
✓ built in 3.32s
```

271 = 266 + 5 new. Nothing regressed; output pristine (no act() warnings, no
stderr).

## Mutation checks

| Mutation | Result |
|---|---|
| restore the in-flight spinner | `renders nothing…in flight` fails ✓ |
| let the action row survive a null contact row (`if (false) return null`) | 3 tests fail, incl. the RLS-withheld one ✓ |
| drop the `Sheet` safe-area inset | `pads its body clear…` fails ✓ |
| revert `MUTED_ON_PAPER` to `#77726e` | contrast test fails ✓ |

All reverted; suite re-verified green.

## Not acted on (ruled deferred)

The age-group branch keeping name order rather than jersey order (faithful to
§5.3; raised as a product question for Jay), and the roster row's `aria-hidden`
jersey number (Task 22's accessibility pass).
