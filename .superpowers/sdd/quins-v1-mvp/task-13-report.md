# Task 13 — Dashboard — report

## What I implemented

`src/screens/Dashboard.jsx`, the real screen behind `/`, built from
`docs/design-system.md` §5.1 (with §4.11 hero, §4.12 countdown, §4.6 stat
tiles, §4.13 fixture rows).

Top to bottom: scope note (non-admin only) → next-fixture hero with live
countdown → three stat tiles → the dash-cols block (mobile: one column,
Upcoming / Quick actions / Last result in DOM order; desktop ≥820px:
`1.15fr .85fr` grid, Upcoming left, Quick actions + Last result right).

It introduces **no new data access**. It reads exactly the two scoped calls
Schedule and Roster already use — `listEvents({teamIds})` and
`listPlayers({teamIds})` — issued together in one `Promise.all` so the stat
grid (which mixes counts from both) never renders half-filled, plus
`subscribeEvents` for realtime, same reload-token pattern as Schedule.

### Derived rules

- **Fixtures to play / Upcoming list**: `!hasResult(event)` — the project's
  result rule (score present, not date passed). A match played last week with
  no score entered is still to play and still listed.
- **Next fixture (hero)**: the *soonest future* unscored event, preferring
  `type === 'match'`, falling back to the next event of any type
  (design-system.md §4.11). This is the one place that also requires
  `starts_at > now`: a countdown to an instant that has already passed is
  meaningless, so the stale-unscored fixture above appears in the list but can
  never be the hero. Hero hidden entirely when nothing is upcoming.
- **Last result**: `hasResult` sorted descending, first row. Empty-state card
  when no scores exist yet.
- **Times**: every displayed date/time goes through `eventFormat.js`
  (`formatLongDate` / `formatTime` / the row's `dateBoxParts`), i.e. Abu Dhabi
  time. The countdown itself is a pure `starts_at − Date.now()` subtraction,
  correctly zone-agnostic, left that way. The hero carries one
  "All times are Abu Dhabi time." line so a parent reading from abroad knows
  which clock they are on.
- **Countdown liveness**: recomputed on a 60 s interval (cleaned up on
  unmount). The prototype computed it at render only, which was fine for a
  demo that re-rendered on every click; a PWA left open on a phone would
  otherwise sit showing a stale "3 Min" for an hour.

### Decision: which quick actions, and the routes that don't exist yet

The brief requires the add actions to exist and be gated. Tasks 14 and 15
build the event/player forms, and `src/App.jsx` today resolves only `/`,
`/schedule`, `/roster`, `/more` — anything else hits the catch-all and bounces
back to `/`. So:

| Action | Who sees it | Behaviour now |
|---|---|---|
| **Add fixture or training** | admin + coach | rendered **disabled** |
| **Add a player** | admin + coach | rendered **disabled** |
| **View full schedule** / **View schedule** | everyone | real `<Link to="/schedule">` |
| **View team list** | everyone | real `<Link to="/roster">` |

Disabled rather than omitted or pointed at an invented route: omitting them
would silently change the card's shape the day the forms land, and pointing
them at a non-resolving path would bounce the user back to the dashboard,
which is worse than an honestly-disabled control. A muted line under them says
"Adding fixtures and players arrives in the next update." Parents get neither
add action plus the read-only explanation; admins get a "You can view every
squad in the club." line in place of it. Tasks 14/15 only have to swap
`disabled` for an `onClick`/`Link`.

### Deliberate deviations from design-system.md §5.1 (documented in-file)

1. **Three stat tiles, not four.** The fourth is "Available for the next
   event" — availability data, which Task 16 owns. Same reason the hero's
   fourth countdown box (an RSVP "in" count, not a countdown value) is absent.
   The third tile spans both columns on mobile so the 2-up grid isn't ragged;
   three across on desktop.
2. **Home/Away badge as a translucent white pill**, not `<Chip type="home">`.
   Chip's specified home/away variants are pale fills designed for a white
   card; on the maroon hero gradient they read as a smudge. Reused the same
   `white/.18` fill as the countdown boxes on the same surface.
3. **`<h2 class="sr-only">Dashboard</h2>`.** The prototype's home view has no
   visible title — the hero is the opening statement. The visually-hidden
   heading keeps the document outline intact for screen readers (every other
   screen has a visible `h2`) without changing the approved design.

### Refactor: `src/components/FixtureRow.jsx`

design-system.md §4.13 calls the fixture row "the single most-reused
component — used identically in Home 'Upcoming', Home 'Last result', and all
three Schedule tabs". It lived inside `Schedule.jsx`. Moved verbatim into
`src/components/FixtureRow.jsx` (plus `data-testid` hooks) and imported by
both screens, rather than copying ~50 lines of markup that would then drift.
`Schedule.jsx`'s own 35 tests pass unchanged against the extracted component.
Dashboard rows open the existing `EventDetail` sheet, as the prototype does.

### `src/App.jsx`

Placeholder `function Home()` deleted; `/` now renders `<Dashboard />`.
`tests/app.test.jsx` updated accordingly (it asserted on a "Home" heading).

## Bug found by the browser check

The hero's Home/Away badge was keyed on `event.is_home`. The real `events`
table column (verified against the live Supabase project, not guessed) is
**`home`** (boolean, nullable, default true) — which is also what
`EventDetail.jsx` reads. So the badge silently never rendered. Fixed, and
covered by two new tests (home → "Home", `home: false` → "Away") plus a
mutation check. This is exactly the class of bug jsdom cannot see: nothing
failed, the element simply wasn't there.

## What I tested

`tests/dashboard.test.jsx` — 25 tests, all data modules and `useMemberships`
mocked, no network reachable. Clock pinned with `vi.spyOn(Date, 'now')`
rather than fake timers (RTL's `waitFor` doesn't detect Vitest fake timers and
hangs).

Coverage: first-load spinner; both queries scoped to `visibleTeams`; empty
scope asks for `teamIds: []` rather than everything; error region with a
working retry; realtime refresh keeps content on screen; hero prefers the
match over a sooner training; hero renders Abu-Dhabi date/time; hero rolls the
date over on Abu Dhabi's midnight; Home/Away badge both ways; countdown
values; fallback to any event type; never picks a past unscored fixture;
hero hidden when nothing upcoming; three stat counts; admin vs non-admin tile
labels; upcoming list ordering and 5-row cap; row opens EventDetail; last
result is the most recent scored fixture; empty last-result state; quick
actions for coach / admin / parent; the two navigation links' hrefs.

### Timezone independence

The suite is green under `TZ=UTC` (default), `TZ=America/New_York` and
`TZ=Pacific/Kiritimati` (UTC+14) — 324→326 tests each time. The rollover test
uses `2026-07-24T20:30Z`, which is the 24th in UTC and New York but 00:30 on
the **25th** in Abu Dhabi, so it fails under any browser-local rendering
regardless of the runner's zone.

### Mutation testing (the suite was green on first full run, so this was required)

Ten mutations applied to `Dashboard.jsx`, each reverted after:

| # | Mutation | Result |
|---|---|---|
| 1 | hero formats with `toLocaleDateString()/toLocaleTimeString()` (browser zone) | 2 tests fail |
| 2 | hero drops the match preference | 3 fail |
| 3 | hero drops the `> now` filter | 4 fail |
| 4 | "Fixtures to play" counts all events | 1 fail |
| 5 | last result sorted ascending (oldest) | 1 fail |
| 6 | `QuickActions canEdit` hardcoded true | 1 fail |
| 7 | upcoming list not capped at 5 | 1 fail |
| 8 | `isFirstLoad = loading` (spinner on every refetch) | 1 fail |
| 9 | `listEvents({})/listPlayers({})` — ignore scope | 2 fail |
| 10 | Home/Away badge always says "Home" | 1 fail |

All ten killed. No vacuous assertions.

## TDD evidence

**RED** — `npx vitest run tests/dashboard.test.jsx`, before any implementation:

```
14 |  const __vi_import_3__ = await import('react-router-dom')
15 |  const __vi_import_4__ = await import('../src/screens/Dashboard.jsx')
   |                                       ^
 ❯ TransformPluginContext._formatError …
 Test Files  1 failed (1)
      Tests  no tests
```

Expected: the test file imports `src/screens/Dashboard.jsx`, which did not
exist, so collection itself fails before any test can run.

After creating the screen, the first real run was **13 failed | 8 passed**,
which surfaced four genuine test-side defects (an ambiguous
`findByText('Quins vs Al Ain Amblers')` matching both hero and list; a fixture
set that made the "empty scope" case return data no such user could receive;
a wrong expectation about a past-unscored fixture still being listed; and
Intl's U+202F narrow no-break space before AM/PM). Fixed those; then the
`home`/`is_home` bug came out of the browser check.

**GREEN** — `npx vitest run tests/dashboard.test.jsx`:

```
 ✓ tests/dashboard.test.jsx (25 tests)
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

**Full suite** — `npm test`:

```
 Test Files  16 passed (16)
      Tests  326 passed (326)
```

Baseline was 301 across 15 files; +25 new tests, +1 file, nothing regressed,
no stderr output (`MemoryRouter` is given the same `v7_*` future flags
`App.jsx` sets, or react-router logs two upgrade warnings per render).

**Build** — `npm run build`: clean, no warnings.

## Browser check

`harness/shoot-dashboard.mjs` (new), three personas × 375 px and 1280 px, six
full-page screenshots in `screenshots/task13/`. Read every one of them with
the Read tool. The script also measures, per shot: document vs viewport width,
any element overflowing the viewport, any `data-testid` element laid out to
zero size, the hero's rendered text, the stat-grid and layout boxes, and — the
point of the exercise — every full-width button and anchor's height plus its
text's offset from its own top edge.

Findings:

- **No horizontal overflow** at either width (`docWidth === innerWidth`,
  overflowing-element list empty in all six).
- **No CSS-hidden/collapsed content**. The only zero-size elements are
  AppShell's pre-existing responsive `role-label-mobile`/`-desktop` pair,
  which is correct.
- **Button-as-layout-box**: the quick-action stack mixes disabled `<button>`s
  and `<a>`s. Measured text offset is **12 px on every one of them**, both
  tags, both widths — the explicit `flex items-center justify-center` is doing
  its job. Fixture rows measure 14 px uniformly across rows of 99/100/121/143 px
  height, so the taller (wrapping-venue) rows align with the short ones.
- **Layout**: mobile stat grid `165.5px 165.5px` (2-up, third tile spanning);
  desktop `354.7px ×3`. Mobile dash-cols stacked (upcoming y=678, last result
  y=1527); desktop side by side (upcoming x=96 w=615, last result x=729 w=455)
  — the 1.15/0.85 split.
- **Abu Dhabi time actually renders**: hero reads "Thu, Jul 30, 2026 · 7:00 PM"
  for a `15:00Z` fixture (19:00 Dubai), and the "Late Night Touch" row at
  `2026-07-20T21:00Z` shows as **Jul 21, 1:00 AM** — i.e. the date box rolled
  over into the club's next day, not UTC's. Machine TZ is UTC, so browser-local
  rendering would have printed Jul 20 / 9:00 PM.
- **Contrast**: ghost buttons are `#C21F32` on white = 5.93:1 (recomputed);
  disabled buttons `#5c5854` on `#f0ecf2` = 6.0:1; block titles `#5c5854` on
  paper = 6.42:1; hero text is white on a plum→maroon gradient (≥5.9:1 at the
  lighter end). `quinsGreen` is not used for text anywhere.
- **Console**: zero errors, zero page errors across all six shots. The only
  warnings are the harness's own `MemoryRouter` future-flag notices (the
  harness `Shell` predates this task).

## Files changed

- **New** `src/screens/Dashboard.jsx`
- **New** `src/components/FixtureRow.jsx` (extracted from `Schedule.jsx`)
- **New** `tests/dashboard.test.jsx`
- **New** `harness/shoot-dashboard.mjs`
- `src/App.jsx` — `/` renders `Dashboard`; `Home()` placeholder removed
- `src/screens/Schedule.jsx` — imports the extracted `FixtureRow`; now-unused
  local row/icons/imports removed
- `tests/app.test.jsx` — `/` assertions updated from the "Home" placeholder
- `harness/main.jsx` — `dashboard`, `dashboard-admin`, `dashboard-parent`
  scenarios; the harness `Home` now renders the real Dashboard, mirroring
  `App.jsx`

## Self-review findings (all fixed before reporting)

1. `event.is_home` → `event.home` (see above) — found in the browser, not the
   tests, and then covered by tests.
2. The Home/Away badge originally reused `<Chip type="win">`/`"draw"` as a
   colour hack. Semantically wrong ("win" meaning "home") and visually poor on
   the gradient; replaced with an explicit pill.
3. `BUTTON_PRIMARY` was defined and then never used once the add actions
   became disabled; deleted rather than left as a dead token. A leftover
   `.replace()` string hack on the class list went with it.
4. `StatTile` silently dropped a `className` prop it was being passed;
   plumbed through.
5. `Chip` import left dangling in `Dashboard.jsx` after (2); removed.
6. Test suite stderr had react-router future-flag noise; silenced by matching
   `App.jsx`'s flags.
7. YAGNI check: no availability fetching, no team-filter pills (§5.1 has none,
   so decision 3 in the brief doesn't apply), no form scaffolding, no
   `countdownParts` promoted into `src/lib` — it is used by exactly one screen,
   matching the precedent that `positionGroup` stayed local to `Roster.jsx`.

## Concerns

- The two disabled add-actions are a deliberate placeholder. If Tasks 14/15
  slip, they are visible-but-dead controls on the landing screen for coaches;
  worth a look during committee sign-off if they haven't been wired by then.
- `harness/stubs/events.js` uses `home:` correctly, which is why the badge's
  absence was visible rather than merely wrong — but the stub fixtures are
  pinned to July 2026 and will start showing an empty "Upcoming" once real
  time passes them. That's a pre-existing harness property, not new.

---

# Task 13 — fix round 1 (review response)

All four findings addressed in one round. No pushback on any of them.

## 1. (Important) A `player` was told they were a parent

`QuickActions` hardcoded the noun "parent" for every non-admin, non-coach
user, while the scope note on the same screen read "Player view" from
`roleLabel`. Fixed: the screen now computes

```js
const readOnlyRole = canEdit ? null : roleLabel(memberships).toLowerCase()
```

and interpolates it, so the sentence and the scope note draw the role from
one source. Also removed a dead `admin ?` branch inside that same line —
`admin` implies `canEdit`, so it could never have rendered.

## 2. (Important) Disabled placeholder controls removed

Accepted the ruling: `EventDetail.jsx`'s precedent governs, and my "the card
changes shape later either way" reasoning was wrong — the card gains the
buttons when Tasks 14/15 land regardless of what it renders today, so there
was no shape cost to omitting them. Both disabled buttons and the "arrives in
the next update" line are gone, along with the now-unused `BUTTON_DISABLED`
token. The in-file comment now records the rule rather than the exception, and
cites EventDetail so the next person finds the precedent rather than
re-deciding it. **No disabled placeholders for not-yet-built routes anywhere,
going forward.**

**Layout check:** the design system already specifies this exact shape — §5.1's
parent variant *is* two ghost actions plus a muted line. So admin/coach now
render the parent variant minus the line, which is two full-width ghost links
in a `p-[14px]` card. Verified in the browser at both widths (screenshot
re-read): it does not read as sparse, and the right-hand column still balances
against the five-row Upcoming list. No layout adjustment needed, so none made.

## 3. (Minor) `canEdit` now goes through `canEditTeam`

```js
const canEdit = admin || scopedTeams.some((team) => canEditTeam(memberships, team.id))
```

matching `Schedule.jsx:315`. A coach row with a null `team_id` is now treated
as read-only, which is what `canEditTeam` deliberately decides and what the
brief named.

## 5. (Minor) Countdown timer gated on the hero

The interval moved below `nextFixture` and is now gated on
`hasCountdown = nextFixture != null`. The dependency is that boolean, not the
event object, so a realtime refetch returning the same next fixture doesn't
restart the interval. With no hero there is no timer and no 60-second
whole-dashboard re-render.

## Tests

`tests/dashboard.test.jsx`, 25 → 28 tests. The `Dashboard — quick actions`
block was rewritten: the reviewer was right that `getByRole('button')` passes
for a disabled button, so those assertions proved nothing. It now asserts the
**complete** action list per role via a `quick-actions` test id —
`expect(actionNames()).toEqual([...])` — which fails if a not-yet-built action
is ever added back, disabled or not.

New/changed coverage: coach, admin, parent, **player**, and a **teamless
coach** each get their exact action set; the read-only sentence names parent /
player / coach correctly and never says "parent" for a player; admin gets no
read-only sentence; the 60s tick is started when a hero renders and not
started when none does (spy filtered to the 60000 ms delay so nothing React
schedules internally can make it pass by accident).

### Mutation testing of the amended code

| # | Mutation | Result |
|---|---|---|
| 11 | re-add a disabled "Add fixture or training" for editors | 2 tests fail |
| 12 | hardcode the read-only role noun back to `'parent'` | 2 fail |
| 13 | `canEdit` back to a raw `role === 'coach'` check | 1 fail |
| 14 | ungate the countdown interval | 1 fail |

All four killed.

### Commands and output

`npx vitest run tests/dashboard.test.jsx`:

```
 ✓ tests/dashboard.test.jsx (28 tests)
 Test Files  1 passed (1)
      Tests  28 passed (28)
```

`npm test` (files covering the amended code: `tests/dashboard.test.jsx`,
`tests/app.test.jsx`, `tests/schedule.test.jsx`, `tests/scope.test.js`):

```
 Test Files  16 passed (16)
      Tests  329 passed (329)
```

326 → 329 (+3 net: 6 rewritten quick-action tests replacing 5, plus the timer
test). No stderr output. `npm run build` clean.

### Browser re-check

Re-ran `harness/shoot-dashboard.mjs` (3 personas × 375/1280) and re-read the
screenshots. No horizontal overflow anywhere; the two ghost links measure
40 px high with a 12 px text offset in every shot (`<a>` layout still explicit,
not UA-dependent); the parent card's live text reads
`"View schedule | View team list | You're signed in as a parent, so you can
read fixtures and squads but not change them."`; no console or page errors.

## Files changed this round

- `src/screens/Dashboard.jsx`
- `tests/dashboard.test.jsx`

## Deferred (per the ruling, not acted on)

- The error path replacing the whole screen on a failed realtime refetch
  (pre-existing pattern inherited from `Schedule.jsx`).
- Extracting the fourth copy of the retry-button markup.
