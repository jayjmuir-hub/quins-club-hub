# Club Overview Dashboard — build ledger

Spec: docs/superpowers/specs/2026-08-03-club-overview-dashboard-design.md
Plan: docs/superpowers/plans/2026-08-03-club-overview-dashboard.md

All 5 tasks complete. Subagent-driven (the `superpowers:subagent-driven-development`
skill failed to load this session with "Unknown skill" — a transient sync issue, not a
decision to skip it — so the same implementer→verify→commit pattern was followed manually,
one fresh subagent per task, with the controller independently re-running the full test
suite and build after each task rather than trusting the subagent's own report alone).

Every task's subagent was explicitly instructed to verify the plan's assumptions against
the real codebase before writing code, because Task 1 immediately proved the plan
contained real errors, not just implementation-detail gaps.

**Task 1 (`listAvailabilityForEvents`)**: plan error found — assumed
`tests/availability.test.jsx` was a data-layer test file mocking `supabase` directly; it's
actually a *screen* test for `src/screens/Availability.jsx` that mocks the whole
`src/data/availability.js` module wholesale. The real data-layer tests for
`events`/`players`/`availability` live in `tests/data.test.js`, using a
`createQueryBuilder()` chainable+thenable mock specifically built to avoid a naive mock
passing for the wrong reasons (its own header comment says so). Redirected there before
writing anything. Commit `300af3e`, 606/606 tests, build clean.

**Task 2 (`listContactsForPlayers`)**: same error pattern pre-empted — the plan proposed a
new `tests/players-data.test.js` file; `tests/data.test.js` already covers
`src/data/players.js`, so the new tests went there instead, no new file created. Commit
`42d9a2c`, 610/610 tests, build clean.

**Task 3 (Overview screen)**: real discrepancy found in the plan's own draft code — it
called `clubToday().toISOString()`/`.getTime()`, but `clubToday()` (`src/lib/eventFormat.js`)
returns a plain `{year, month, day}` object, not a `Date` — that code would have thrown at
runtime. Fixed with a local `upcomingWindow()` helper using `new Date()` directly for "now",
matching how `Dashboard.jsx`'s own "to play" filter already treats "now" as a plain instant
rather than going through club-time parts (this screen only needs a rolling window, not a
precise club-midnight boundary). Also implemented the `EventDetail`/`EventForm` sheet wiring
the plan explicitly flagged as omitted from its own draft code (copied verbatim in shape
from `Dashboard.jsx`), plus a jsdom test for it, beyond what the plan's Step 1 example
covered. Commit `1f85a47`, 618/618 tests (8 new), build clean.

**Task 4 (Nav/AppShell/routing)**: no plan errors this time — every cited line number,
helper shape, and existing mock pattern the plan assumed matched the real files exactly
(the verification pass came back clean, which is itself useful signal, not just the fix
rounds). `tests/nav.test.jsx`'s `renderNav` helper was extended with an optional `props`
param rather than adding a second render call, keeping every existing call site unchanged.
Commit `6eabb64`, 622/622 tests, build clean.

**Task 5 (browser verification)**: two real discrepancies found, one of them a
pre-existing bug unrelated to this plan. (1) Task 2's `listContactsForPlayers` was added to
the real `src/data/players.js` but never mirrored into `harness/stubs/players.js` — fixed.
(2) **Pre-existing bug, not introduced by this plan**: `harness/stubs/players.js` was
missing an `insertPlayers` export that `src/screens/PlayerImport.jsx` needs — since
`main.jsx` statically imports `Roster.jsx` which imports `PlayerImport.jsx`, this broke
*every* harness scenario (confirmed even `?scenario=roster` threw before the fix), not just
the new Overview ones. Fixed as part of this task since it blocked verifying Overview at
all. Worth knowing for any future harness work: the harness stubs can silently drift behind
real `src/data/*` modules when a data function is added without a corresponding stub
update, and nothing catches that until the harness is actually run.
Ran `harness/shoot-overview.mjs` for real against both `overview-admin`/`overview-coach`
scenarios at 1280×900 (desktop-only, no mobile viewport — by design): both scenarios show
`hasOverviewNavLink: true`, non-zero fixture/roster-gap row counts, zero console/page
errors. Commit `8d86aaf`, 622/622 tests, build clean.

**Independent controller review** (not a subagent): read the full diff across all 5
commits, specifically `Overview.jsx` end-to-end and the `Nav`/`AppShell`/`App.jsx` wiring
diff. Confirmed the `clubToday()` adaptation is sound (matches `Dashboard.jsx`'s existing
"now" convention), confirmed the `hidden desktop:flex` nav-item approach genuinely keeps
the mobile tab bar's `grid-cols-4` layout unaffected (a `display:none` element doesn't
participate in CSS grid flow), confirmed the `EventDetail`/`EventForm` wiring matches
`Dashboard.jsx`'s existing shape. No further fix round needed — clean on first review.

**Not yet done, deliberately**: pushing to GitHub (this sandbox has no push credentials —
next step is the usual PC-relay bundle transfer), and Phase 2 (the activity feed, gated on
a not-yet-built audit-log table, out of scope for this plan per the spec's Non-goals).
