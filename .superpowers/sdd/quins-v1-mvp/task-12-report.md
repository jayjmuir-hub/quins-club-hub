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
