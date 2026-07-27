# Task 7: Memberships + scope helpers — Report

## What I implemented

- `src/lib/scope.js` — five pure functions, no imports from `supabase`, `react`, or `auth`:
  - `isAdmin(memberships)` — true if any row has `role === 'admin'`.
  - `visibleTeams(memberships, allTeams)` — admin gets every team in `allTeams`
    (an admin's own membership row has `team_id = null`, so it cannot be used
    to look up teams — visibility is club-wide by role, not derived from
    `team_id`); everyone else gets the subset of `allTeams` whose `id`
    appears as a `team_id` on any membership row. Result sorted by
    `sort_order` then `name`; `allTeams` is never mutated (uses spread before
    sort/filter).
  - `canEditTeam(memberships, teamId)` — true if admin, or if any row has
    `role === 'coach'` and `team_id === teamId`. Parents/players always false.
  - `roleLabel(memberships)` — highest role by precedence
    `admin > coach > parent > player`, exact strings `'Admin' | 'Coach' |
    'Parent' | 'Player'`; `'No access yet'` for no memberships.
  - `childPlayerIds(memberships)` — deduplicated `player_id`s from rows with
    role `parent` or `player`, nulls ignored.
  - Every function guards `null`/`undefined`/`[]` input up front and returns
    a safe empty (`[]`, `false`, or `'No access yet'`) without throwing.

- `src/data/members.js` — `loadMyMemberships()`:
  - `supabase.from('memberships').select('*, teams(*)')`, throws on
    `error`, returns `data ?? []` (never null). No user id argument — RLS
    scopes rows to the caller.

## What I tested and results

`tests/scope.test.js`, 29 tests, covering every scenario in the brief plus
the edge cases the brief calls out explicitly:
- Admin (`team_id: null`) sees all 15-style fixture teams, sorted, and can
  edit any team including one it holds no row for.
- Coach of two squads sees and can edit exactly those two, not a third.
- Parent sees only their child's team, cannot edit it, `childPlayerIds`
  returns the child's `player_id`.
- Coach+parent holder: `visibleTeams` unions both teams, `roleLabel` is
  `'Coach'` (coach outranks parent), edit rights only on the coached team.
- Player-only holder: `roleLabel` is `'Player'`, `childPlayerIds` returns
  their own `player_id`.
- Empty `[]`, `null`, `undefined` memberships (and `null`/`undefined`
  `allTeams` for `visibleTeams`) all return safe empties / `'No access
  yet'` without throwing.
- `visibleTeams` proven to sort by `sort_order` (fixture `ALL_TEAMS` is
  deliberately unsorted) and proven not to mutate its `allTeams` input
  (assert array unchanged after the call).
- `loadMyMemberships()` against a mocked `supabase` client (`vi.mock` on
  `src/lib/supabase.js`, same pattern as `tests/auth.test.jsx`): returns
  rows on success, returns `[]` (not `null`) when `data` is `null`, and
  **throws** rather than swallowing when Supabase returns an `error`.

## TDD evidence

**RED** — before `src/lib/scope.js`/`src/data/members.js` existed:
```
$ npm test -- tests/scope.test.js
 FAIL  tests/scope.test.js [ tests/scope.test.js ]
Error: Failed to resolve import "../src/lib/scope.js" from "tests/scope.test.js". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
Expected: the test file imports helpers that don't exist yet — module
resolution fails before any test body runs.

**GREEN** — after implementing both modules:
```
$ npm test -- tests/scope.test.js
 ✓ tests/scope.test.js (29 tests) 11ms
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

Full suite (no regressions in Tasks 3–6 auth/login/app tests):
```
$ npm test
 ✓ tests/scope.test.js (29 tests) 12ms
 ✓ tests/login.test.jsx (15 tests) 800ms
 ✓ tests/auth.test.jsx (12 tests) 272ms
 ✓ tests/require-auth.test.jsx (7 tests) 88ms
 ✓ tests/app.test.jsx (6 tests) 130ms
 ✓ tests/supabase.test.js (4 tests) 68ms
 Test Files  6 passed (6)
      Tests  73 passed (73)
```

Build:
```
$ npm run build
✓ 81 modules transformed.
dist/index.html                   0.81 kB │ gzip:   0.40 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-B_CpDZH6.css    9.28 kB │ gzip:   2.70 kB
dist/assets/index-BtMPHvO2.js   384.68 kB │ gzip: 110.61 kB
✓ built in 2.32s
```
No warnings from either command.

## Files changed

- `/home/claude/quins-club-hub/src/lib/scope.js` (new)
- `/home/claude/quins-club-hub/src/data/members.js` (new)
- `/home/claude/quins-club-hub/tests/scope.test.js` (new)

## Self-review findings

- Naming, signatures, and exact return strings verified against the brief
  verbatim (`'Admin'`, `'Coach'`, `'Parent'`, `'Player'`, `'No access
  yet'`).
- Code style matches the existing codebase (`src/lib/auth.jsx`,
  `src/lib/supabase.js`): no semicolons, single quotes.
- Confirmed `scope.js` has zero imports (checked by inspection — only
  module-level constants and function declarations).
- Confirmed no scope creep: no React hooks/context, no caching, no
  membership provider, no screen-specific permission checks, no invite
  logic.
- Re-ran `npm test` and `npm run build` after the self-review pass to
  confirm nothing regressed — both still pristine (output above).
- No lint script exists in this repo (`package.json` has no `lint`
  target, no `.eslintrc`/`eslint.config.*` files), so no separate lint
  step was run.

## Issues or concerns

None. The task was fully pure-logic as expected, which made it
straightforward to get complete test coverage per the brief's explicit
list of scenarios.
