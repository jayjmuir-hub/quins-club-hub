# Task 17 — Independent Browser Verification (Admin overview, `/more`)

Repo: `/home/claude/quins-club-hub`, branch `build/v1-mvp`, HEAD `234b8e9`.
Tool: Playwright (via `PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs`),
harness dev server on `http://localhost:5199` (`harness/vite.config.js`).

New harness artifacts added for this pass (not part of the app build):
- `harness/shoot-admin.mjs` — the scripted run (13 logged cases, report at
  `screenshots/task17-admin/report.json`).
- `harness/stubs/members.js` — new stub for `listClubMembers()`, following
  `harness/stubs/players.js`'s conventions: `?membersDelay=<ms>` and
  `?membersThrow=1` knobs, 8 fixture rows covering every role (admin/coach/
  parent/player), a member with `teams: null` (the admin row), and one with a
  null `full_name` (renders "Unnamed member").
- `harness/vite.config.js` — added the `../data/members.js` alias to the
  stub, alongside the existing `players.js`/`events.js`/etc. aliases.
- `harness/main.jsx` — added an `admin` scenario mounting `src/screens/
  Admin.jsx` directly (parameterised by `?who=admin|coach|parent|player`,
  using the real 15-team fixture `TEAMS_15`), and a separate `admin-nav`
  scenario using a real `BrowserRouter` + `<Routes>` for `/more`, `/schedule`,
  `/roster` (mirroring `App.jsx`'s own routing) specifically to test whether
  the "Manage" links are genuinely client-routed.

## Verdict: 1 DEFECT found (High severity). All other checks are CLEAN.

---

## Defect

### D1 — "Manage roster & players" / "Manage schedule & fixtures" links cause a full hard page reload, not SPA navigation

- **File/line:** `src/screens/Admin.jsx:200-215` — both are plain `<a href="/roster">` / `<a href="/schedule">` tags. `Admin.jsx` does not import `Link` from `react-router-dom` at all, unlike `src/screens/Dashboard.jsx:2,218,221` which uses real `<Link to="/schedule">` / `<Link to="/roster">` for its equivalent "quick action" buttons.
- **Severity:** High (correctness / UX regression, real-browser-only — jsdom's Testing Library click on an anchor never triggers actual browser navigation, so a unit test asserting `href` alone cannot see this).
- **Repro (confirmed twice, Playwright, real Chromium, real click — not a synthetic event):**
  1. Scenario `admin-nav` (a real `BrowserRouter` with `Routes` for `/more`, `/schedule`, `/roster`, matching `App.jsx`'s shape), loaded at `http://localhost:5199/more?scenario=admin-nav` as an admin.
  2. Set `window.__navMarker = 'harness-loaded'` after the page settles.
  3. Click the link named "Manage roster & players" (a real Playwright `.click()`).
  4. `page.url()` becomes `http://localhost:5199/roster` — looks like it worked — but `window.__navMarker` is `undefined`: the JS context was destroyed and recreated, i.e. a full page reload occurred, not a client-side route change.
  5. Repeated independently for "Manage schedule & fixtures" → `/schedule`: same result, `window.__navMarker` wiped.
  6. Both are logged verbatim in `screenshots/task17-admin/report.json`, case `8-manage-links-navigation`:
     `"rosterNavWasHardReload": true`, `"scheduleNavWasHardReload": true`.
- **Root cause:** a plain `<a href>` is not intercepted by React Router regardless of which router wraps it (`MemoryRouter`/`BrowserRouter`) — only `<Link>`/`<NavLink>` hook into the router's client-side history API. `Admin.jsx` used the wrong element for what is otherwise a correct, real, functional entry point.
- **Failure scenario:** an admin taps "Manage roster & players" from `/more`. In the real deployed app this forces the browser to throw away the whole React app and its state and re-download/re-execute the entire SPA bundle from scratch just to land on `/roster` — a full-page flash, lost scroll position, and (per `MembershipProvider`'s real implementation, not the harness stub) a fresh membership fetch that didn't need to happen. This is the exact "full page reload breaking the SPA" failure this verification pass was asked to check for, and it reproduces on both links.
- **Not a defect in:** the links' layout (see check 1 below — both render as properly centered flex boxes, not a "button as layout box" issue) or their destination (both go to the correct, existing routes).
- **Suggested fix direction (not applied — verification-only pass):** replace both `<a href="...">` with `<Link to="...">` (already imported nowhere in this file; `Dashboard.jsx` shows the exact pattern to copy), keeping the same classNames.

---

## Everything else checked: CLEAN

### 1. Button-as-layout-box trap
- The two "Manage" `<a>` links (the only interactive elements repurposed as layout containers in this screen): measured `getBoundingClientRect()` + `getComputedStyle` at both 375px and 1280px. Both render `display: flex; justify-content: center; align-items: center`, with their text content's bounding rect centered within ~0px of the link box's own center (`textCenteredV`/`textCenteredH`: true in every case, all 4 measured instances — 2 viewports × 2 links). No layout-box defect.
- `TeamRow`/`MemberRow` are plain, non-interactive `<div>`s (no `href`/`onClick`), so this defect class doesn't apply to them; confirmed no `<button>`/`<a>` exists inside either row.

### 2. Contrast (`--muted`-style text)
`getComputedStyle(...).color` for every leaf `<h3>`/`<p>`/`<span>` on the page (both viewports): the only muted-ish colors present were `rgb(92, 88, 84)` (`#5c5854`, the passing value — used by `SectionTitle`, the team-row player counts, and the member-row team-name sublines) and, separately, `rgb(119, 114, 110)` (`#77726e`, the failing value) — but tracing that one down, it comes **only** from the bottom-nav's inactive labels ("Home", "Schedule", "Roster" — `Nav.jsx`, an existing component untouched by this task, not from anything Admin.jsx itself renders). Every muted text element that Admin.jsx actually owns computes to the passing `#5c5854`. No contrast defect in the new code.

### 3. `isAdmin` gate is real in the browser
- Admin (`?who=admin`): full overview renders — heading "Admin overview", "Admin · 15 age groups · 26 players · 8 members", Manage section, 15 team rows, 8 member rows.
- Coach / Parent / Player (`?who=coach|parent|player`, both viewports, 6 renders total): every single one shows **only** "Not authorised" text and nothing else app-specific. Checked via `document.body.innerText` and `querySelectorAll`, not visually:
  - `notAuthorised: true` in all 6 cases.
  - `memberRowCount: 0` (zero `[data-testid="member-row"]` elements) in all 6.
  - `hasAgeGroupsHeading: false`, `hasClubMembersHeading: false` in all 6 — no team names, no player counts, no member list text present anywhere in the DOM for a non-admin.

### 4. No jersey numbers
`/jersey|shirt number|squad number/i` against `document.body.innerText` returned `false` for the full admin overview. Member tiles render `initials()` output only (`UM`, `AM`, `BS`, `JM`, `PN`, `RO`, `SC`, `ZK` — including the "Unnamed member" stub row still deriving `?`→ wait, `full_name: null` correctly fell back through `initials()` to a real 2-letter tile, not a crash or "undefined"), never a numeric badge.

### 5. No horizontal overflow at 375px / bottom tab bar clipping
- `document.documentElement.scrollWidth === window.innerWidth` (375 === 375) at mobile; `overflow: []` (no element's right edge exceeds the viewport).
- Scrolled the page to `document.body.scrollHeight` and re-measured the last Club-members row: `lastRowBottomAfterScroll: 620`, nav bar top at `752` → `lastRowFullyAboveNav: true`. The bottom tab bar does not obscure the last row.
- `document.body.scrollHeight === document.documentElement.scrollHeight` (1797 === 1797) — single scrollable context, no double-scrollbar; this screen scrolls the normal page-level `AppShell` content area exactly like Dashboard/Schedule/Roster, not a `Sheet` overlay. `AppShell`'s layout assumptions hold with this screen's much taller real content (previously a one-line `<h1>` stub at `/more`).

### 6. Loading/empty/error states are real
- **Loading:** `?playersDelay=1800&membersDelay=1800` — checked immediately after load (well inside the delay window): a real `role="status"` spinner (`aria-label="Loading the admin overview…"`) is present, and the Manage/Age-groups/Club-members sections are entirely absent (only the header stats line, showing `0 players · 0 members`, is visible — consistent with `players`/`members` state still being their initial empty arrays, not a stale/wrong flash). ~1.8s later: spinner gone, all 15 team rows and 8 member rows present, `settledStatusRoles: []`.
- **Error + retry:** `?membersThrow=1&membersDelay=500` — a genuine `role="alert"` region appears with the exact thrown message ("permission denied for table memberships") and a "Try again" button. Clicking it (`retryButtonPresent: true`): a spinner reappeared 150ms later (`sawSpinnerOnRetry: true`), then the fetch failed again with the identical error message after the same 500ms delay — proving retry performs a genuine new fetch (visible loading state mid-flight), not a no-op re-render of stale state.

### 7. Nav integrity
`navItemCount: 4`, `navLabels: ["Home", "Schedule", "Roster", "More"]` — confirmed unchanged on the `/more` route for an admin, at both viewports. Task 17 reused the existing "More" slot as intended; no 5th nav item was added.

### 8. Console/page errors
Zero `error`-level console messages and zero `pageerror` events across all 13 logged cases. The only console output anywhere was the two benign React Router v7 future-flag warnings that appear on every screen in this app (pre-existing, not introduced by this task).

### 9. Manage links navigation
See **Defect D1** above — the links do navigate to the correct routes (URL bar/`page.url()` ends at `/roster` and `/schedule` respectively), but via a hard full-page reload rather than client-side SPA routing.

---

## Screenshots
`screenshots/task17-admin/*.png` (gitignored) — 375px and 1280px admin overview, 375px not-authorised (coach/parent/player), mid-loading and settled states, and the error/retry states. Full machine-readable measurements: `screenshots/task17-admin/report.json`.
