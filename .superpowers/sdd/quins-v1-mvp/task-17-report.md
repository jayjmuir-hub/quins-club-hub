# Task 17 report — Admin overview

## Commits (build/v1-mvp)
- `299a994` feat: add listClubMembers() for the admin overview
- `234b8e9` feat: add admin overview screen, wired at /more

## What was built

### 1. `src/data/members.js` — `listClubMembers()`
New data-access function alongside the existing `loadMyMemberships()`:
selects every row from `memberships`, joined to `profiles(full_name)` and
`teams(name)`. No filtering by caller id — the live `memb read` RLS policy
(`(profile_id = auth.uid()) OR is_admin(club_id)`) already makes this
club-wide for an admin and self-only for anyone else, so the function is
safe to expose generally; `Admin.jsx` only calls it once `isAdmin()` is
true. Deliberately no `email` field: `profiles` has no email column
(`id`, `full_name`, `created_at` only, confirmed against the live schema);
email lives only in `auth.users`, unreachable from the client. Follows the
file's existing throw-on-error / `[]`-not-`null` convention exactly.
TDD: 3 tests added to `tests/scope.test.js` (same file `loadMyMemberships`
is tested in), mirroring its three cases (rows returned, empty→`[]`,
Supabase error→throw) — watched `listClubMembers is not a function` fail,
then implemented.

### 2. `src/screens/Admin.jsx` — the admin overview screen
- Gate: `if (!isAdmin(memberships)) return <NotAuthorised />` — rendered
  *before* the data-fetching effect even runs, so a non-admin never
  triggers `listPlayers()`/`listClubMembers()` at all (asserted in tests,
  not just that their output is hidden). `NotAuthorised` is a `role="alert"`
  card with a plain, non-alarming message — never a blank screen.
- Data: `useMemberships()` supplies `teams` (already every team for an
  admin — no re-fetch, since `MembershipProvider` loads all 15 once per
  session) and `memberships` (for the gate). The screen's own effect fetches
  `listPlayers()` (no `teamIds` argument — omitted, not `[]`, since an empty
  array means "no teams" per `src/data/players.js`) and the new
  `listClubMembers()` in parallel, following the same
  loading/settled/error/reload-token shape as `Dashboard.jsx`/`Roster.jsx`.
- Renders three sections: **Manage** (links), **Age groups** (every team,
  sorted by `sort_order`/name, with a live player count derived from the
  fetched players — not a second query), **Club members** (every membership
  row, sorted by name, showing name/role/team via a role `Badge`, no email).
  Player-adjacent initials tiles use `initials()` from `playerFormat.js` —
  no jersey numbers anywhere, matching the house rule.
- Loading/empty/error states follow the established contract: a first-load
  spinner (`role="status"`, `Spinner`), a `role="alert"` card with a retry
  button on error, `Empty` for a genuinely empty members/teams list.

### 3. Routing decision — wired at `/more`, not a new `/admin` route
The brief left this as my call. I picked `/more`:
- `Nav.jsx`'s four items (Home/Schedule/Roster/More) are asserted *exactly*
  by `tests/nav.test.jsx` ("is exactly Home, Schedule, Roster, More, in that
  order") — adding a fifth nav item to reach a dedicated `/admin` route
  would have broken that test and meant redesigning the bottom tab bar
  (`grid-cols-4`), which is well outside this task's scope.
- `design-system.md` §5.4 already describes "More" as exactly this shape:
  club info (everyone) + a "Manage" block (admin/coach only). This task
  builds only the admin-only half of that — the overview itself already
  gates on `isAdmin()` and shows "not authorised" otherwise, so a non-admin
  hitting `/more` today sees that message (plus the sign-out control
  `AppShell` still renders below any `/more` content, unconditionally of
  role). A later task can fold in the club-info/about content for every
  role without moving this route again.
- A dedicated `/admin` route with no nav entry would have been reachable
  only by typing the URL — worse UX for the one screen an admin needs most.
- Non-admin `/more` UX is a known rough edge (see Concerns below), acceptable
  as an interim state given `/more`'s general content isn't part of this
  task.

`App.jsx`'s old `More()` placeholder stub is gone; `/more` now renders the
real `Admin` component. `tests/app.test.jsx` updated: the old "/more renders
a heading called More" test is replaced with two — an admin sees "Admin
overview", a non-admin sees the "not authorised" alert — and a
`listClubMembers` mock (never-resolving promise) was added alongside the
existing `listEvents`/`listPlayers` mocks so this stays network-free.

### 4. Entry points
- **Manage**: real, functional links to `/roster` and `/schedule` — not
  placeholders. Those screens already own the actual add/edit/delete flows
  for players and events, so pointing an admin at them is a genuine, working
  entry point.
- **Invite**: omitted entirely, not a disabled/dead stub. Task 18 owns the
  invite flow and it does not exist yet; `Roster.jsx`/`Dashboard.jsx`
  already settled this exact question for events/players ("adding a
  disabled or read-only affordance now would promise a control that
  doesn't exist yet") and I followed the same precedent rather than
  re-litigating it.

## Test count
- Before: 474 passed (20 test files existed at HEAD, one — `tests/scope.test.js`
  — grows here; baseline run confirmed 474/19 files before this task's
  changes, matching the brief).
- After: **491 passed**, 20 test files. Breakdown of the +17: 3 new
  `listClubMembers` tests in `tests/scope.test.js`, 13 new tests in
  `tests/admin.test.jsx`, 1 new test in `tests/app.test.jsx` (the
  non-admin-at-`/more` case; the pre-existing "/more" test was rewritten in
  place, not counted as new).
- `npm run build` — clean (vite build, 109 modules, no errors/warnings).

## Environment note
No `.env` existed in the container at the start of this task (only
`.env.example`), so `npm test` failed on every file that imports
`src/lib/supabase.js` (a hard `throw` on missing env vars). Created a local
`.env` (gitignored, not committed) from `.env.example` with a dummy anon-key
value, matching the project's own instruction to never touch the real
Supabase secret. This is purely local test-runner plumbing, not part of the
diff.

## Self-review against binding rulings
- **Data-access throws, never `{data, error}`, `[]` not `null`**:
  `listClubMembers()` follows `loadMyMemberships()`'s exact shape —
  verified in the 3 new `scope.test.js` cases.
- **No native `confirm()`**: none added; Admin.jsx has no destructive
  actions at all (the design-system's "Reset to sample data" was
  deliberately not ported, per the brief).
- **`--muted` on paper is `#5c5854`, not `#77726e`**: `MUTED_ON_PAPER =
  'text-[#5c5854]'` used for the section-head sub-line and `SectionTitle`
  headers, which sit directly on `--paper`, matching `Roster.jsx`/
  `Dashboard.jsx`'s existing constant verbatim. Grep confirms no
  `#77726e` token appears in `Admin.jsx` at all (I used the darker value
  even inside cards, which is over-conservative but not a violation).
- **No jersey numbers**: player-count tiles show counts only; member rows
  use `initials()`, same as `Roster.jsx`'s player rows. A test explicitly
  asserts no "jersey" text appears.
- **Loading/empty/error states, errors in `role="alert"`**: all three legs
  present and tested (spinner with accessible loading name, `Empty` for
  zero members/teams, `role="alert"` with a retry button for a failed
  query) — same contract as every other Phase D/E/F screen.
- **`visibleTeams`/`isAdmin` imported, not reimplemented**: `Admin.jsx`
  imports `isAdmin` and `roleLabel` from `src/lib/scope.js`; team sorting
  (`sort_order` then name) is a local, presentation-only helper matching
  `visibleTeams`'s own sort — not duplicating its *scoping* logic, since an
  admin already gets every team from `useMemberships()` and there is no
  scope decision left to make.

## Concerns
- A non-admin (coach/parent/player) visiting `/more` today sees only the
  "not authorised" alert (plus the sign-out control `AppShell` still
  appends below it) — there is no general club-info content there yet for
  them, unlike the design system's full §5.4 spec. This is expected and
  scoped correctly for Task 17 (which only asked for the admin overview),
  but is worth flagging so a near-future task builds out `/more`'s
  everyone-facing content rather than leaving non-admins with a bare
  "not authorised" as their permanent "More" tab experience.
- `listClubMembers()` has no pagination — fine at the club's current scale
  (a few hundred membership rows across 15 teams), but worth remembering if
  the club ever grows enough for this to matter.

## Fix: Defect D1 (hard-reload Manage links) — post-review

**Commit:** (see below)

`src/screens/Admin.jsx`'s two "Manage" entry points ("Manage roster & players"
→ `/roster`, "Manage schedule & fixtures" → `/schedule`) were plain
`<a href="...">` tags — Admin.jsx never imported `Link` from
`react-router-dom` at all. A real Chromium click (independent visual
verification, not jsdom) proved this caused a full hard page reload
(`window.__navMarker` wiped, i.e. the JS realm was destroyed and recreated),
not a client-side route change, discarding all React app state on every
click.

**Fix:** added `import { Link } from 'react-router-dom'` and swapped both
`<a href="/roster">` / `<a href="/schedule">` for `<Link to="/roster">` /
`<Link to="/schedule">`, keeping the exact same `className`/styling
(like-for-like element swap). Matches the pattern already used correctly in
`src/screens/Dashboard.jsx`'s `QuickActions` (`<Link to="/schedule">`,
`<Link to="/roster">`).

**Tests:** `tests/admin.test.jsx` — since jsdom cannot observe a hard vs
soft navigation directly (a hard reload tears down the JS realm; jsdom has
no such concept), the added tests use the standard RTL pattern for proving
an element is a genuine `<Link>` rather than a plain `<a href>`: a
`MemoryRouter` + `Routes` tree with real `/roster` and `/schedule` routes
rendering marker content, then asserting that clicking each Manage link
renders the target route's marker *within the same render tree* (no fresh
`render()` call) — only possible via the router's history API, i.e. only
via `Link`/`NavLink`. A plain `<a href>` version of this screen would leave
the marker unreachable in this test (jsdom does not follow anchor
navigations to a new document), so this test fails against the pre-fix code
and passes against the fix.

- `Admin — content > navigates to the roster route client-side when "Manage roster & players" is clicked` (new)
- `Admin — content > navigates to the schedule route client-side when "Manage schedule & fixtures" is clicked` (new)
- `Admin — content > offers manage links to the roster and schedule` (existing, kept — still asserts `href="/roster"` / `href="/schedule"`, which a `<Link>` still renders, so it wasn't a discriminating test on its own but remains valid)

All other existing tests in the file were updated only to wrap `render(<Admin />)` in a bare `MemoryRouter` (`setup()`/`RouterOnly`), required because `Admin` now renders `<Link>`, which needs router context to render at all — no behavioural change to those tests.

Note: the true hard-vs-soft-navigation distinction that the browser-based
visual verification pass caught genuinely cannot be asserted in jsdom; the
added tests are the closest meaningful jsdom-level proxy (per RTL's
documented Link-testing pattern), not a replacement for that browser check.

**Verification:**
- `npm test` — 493 passed (up from 491; +2 new tests), 0 failed.
- `npm run build` — clean, no errors/warnings.
