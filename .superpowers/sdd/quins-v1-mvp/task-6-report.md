# Task 6: Auth gate + routing — Report

## What I implemented

1. **`src/components/RequireAuth.jsx`** (new) — default-exports `RequireAuth`.
   Consumes `useAuth()` from `src/lib/auth.jsx` (does not rebuild any auth
   logic):
   - `loading === true` → renders a centred `role="status"` loading message
     on the brand gradient background.
   - `loading === false && !session` → renders `<Login />` in place (no
     redirect to a `/login` route, per the brief).
   - `session` present → renders `children`.
   - One-time fragment cleanup: a `useEffect` keyed on `session` that, once a
     session exists, checks `window.location.hash` for `access_token` or
     `error_description` and — if found — strips it with
     `window.history.replaceState(null, '', pathname + search)`, preserving
     path and query and adding no history entry. Runs only after a session is
     established, per the explicit decision in the task context; does not
     parse or exchange any token (that's supabase-js's job via
     `detectSessionInUrl: true`).

2. **`src/App.jsx`** (rewritten) — replaces the Task 1 static placeholder.
   Now:
   - `BrowserRouter` with the `v7_startTransition` and `v7_relativeSplatPath`
     future flags set (the only two flags React Router v6.26 warns about for
     plain `<BrowserRouter>` usage — confirmed by reading
     `node_modules/react-router/dist/react-router.development.js`; the other
     v7 flags only apply to `RouterProvider`/data routers, which this app
     doesn't use).
   - `RequireAuth` wraps `Routes` (all routes gated together, one Login
     render, not per-route guards).
   - Routes: `/`, `/schedule`, `/roster`, `/more`, each a tiny named
     placeholder component (`Home`, `Schedule`, `Roster`, `More` — a single
     `<h1>`), plus a catch-all `*` that `<Navigate to="/" replace />`.
   - Placeholders live in `App.jsx` itself, not `src/screens/`, so Tasks 11+
     can create the real screen files without colliding with stubs.

3. **`src/main.jsx`** (adjusted) — now renders
   `<AuthProvider><App /></AuthProvider>` inside `StrictMode`. `main.jsx`
   stays thin: it only wires the provider and mounts `App`; all routing and
   gating logic lives in `App.jsx` / `RequireAuth.jsx`.

## What I tested and results

New test file **`tests/require-auth.test.jsx`** (7 tests), mocking
`../src/lib/auth.jsx` and `../src/screens/Login.jsx` so it exercises only
`RequireAuth`'s own gating/loading/cleanup logic, no network reachable:
- loading indicator shown while `loading: true` (and neither Login nor
  children render)
- `Login` renders when `loading: false` and `session: null`
- children render when a session is present
- `#access_token=...` fragment stripped once session is present, path+query
  preserved
- `#error_description=...` fragment stripped once session is present
- an unrelated hash (`#section-2`) is left alone
- the hash is **not** touched while there is no session yet (cleanup is
  scoped to "after a session is established", per the brief, even though
  `error_description` in practice often arrives without ever getting a
  session — that's the documented behaviour of the decision as written, not
  an oversight; noted below under Concerns)

**`tests/app.test.jsx`** — rewritten (see next section) to 6 tests covering
signed-out → Login, and signed-in routing for `/`, `/schedule`, `/roster`,
`/more`, and an unknown path redirecting to `/`.

Full suite: `npm test` → **5 files, 39 tests, all passing**, zero warnings
printed (checked explicitly by grepping test output for `warn|act(|error` —
no matches). `npm run build` → clean, exit 0, no warnings.

## TDD evidence

**RED** — `npm test` after writing `tests/require-auth.test.jsx` and the
rewritten `tests/app.test.jsx`, before creating `RequireAuth.jsx` or touching
`App.jsx`/`main.jsx`:

```
FAIL tests/app.test.jsx > App > renders the more placeholder at /more when signed in
TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name `/more/i`
...
Test Files  2 failed | 3 passed (5)
     Tests  6 failed | 26 passed (32)
```
(`tests/require-auth.test.jsx` failed too, with "Failed to resolve import
'../src/components/RequireAuth.jsx'" — expected, since the file didn't exist
yet; `tests/app.test.jsx` failed because `App` still rendered the old static
placeholder instead of routes.)

**GREEN** — after implementing `RequireAuth.jsx`, rewriting `App.jsx`, and
wiring `AuthProvider` into `main.jsx`:

```
✓ tests/auth.test.jsx (12 tests) 253ms
✓ tests/login.test.jsx (10 tests) 633ms
✓ tests/require-auth.test.jsx (7 tests) 114ms
✓ tests/app.test.jsx (6 tests) 117ms
✓ tests/supabase.test.js (4 tests) 66ms

Test Files  5 passed (5)
     Tests  39 passed (39)
```

## Files changed

- `src/components/RequireAuth.jsx` — new
- `src/App.jsx` — rewritten (routing + gate; placeholder screens moved here)
- `src/main.jsx` — adjusted to wrap `App` with `AuthProvider`
- `tests/require-auth.test.jsx` — new
- `tests/app.test.jsx` — rewritten

### What I did with `tests/app.test.jsx` and why

The original test rendered `<App />` with no mocks and asserted the Task 1
static placeholder text ("Abu Dhabi Harlequins" / "Quins Club Hub" centred on
the gradient). That placeholder no longer exists in `App.jsx` — `App` now
renders routes behind `RequireAuth`, and rendering the real `App` un-mocked
would instantiate the real `AuthProvider`, which calls
`supabase.auth.getSession()` and would reach the network, which unit tests
must not do.

I rewrote the file (same path, same describe block) to mock `useAuth` (same
pattern as `tests/login.test.jsx`) and assert the new behaviour: signed-out
renders `Login` (which still carries the brand name/tagline/invite-only copy,
so that assertion is preserved in spirit), and signed-in renders the correct
placeholder heading per route, including the catch-all redirect. This is a
deliberate update, not a patch to keep old assertions passing artificially.

## Self-review findings

- Checked `RequireAuth` doesn't redirect to `/login` — confirmed, it renders
  `Login` in place, satisfying the deep-link requirement.
- Checked no role/membership checks, per-route guards, lazy loading, error
  boundaries, or 404 screen were added — confirmed absent, matching the
  brief's explicit "do not add" list.
- Checked `main.jsx` stayed thin — it only adds the `AuthProvider` wrapper,
  no other logic.
- Verified the two React Router future flags are the only ones that fire
  deprecation warnings for `<BrowserRouter>` (not `RouterProvider`) usage, by
  reading the source in `node_modules/react-router/dist/react-router.development.js`
  — the other four v7 flags are gated behind a data-router-only code path, so
  they're correctly omitted rather than cargo-culted in.
- Verified `useEffect`'s `[session]` dependency doesn't cause a cleanup loop:
  once the hash is stripped, subsequent effect runs (session ref changes on
  further auth events) find no matching substring and no-op.
- Confirmed `npm test` and `npm run build` both exit 0 with no warnings in
  their output.

## Issues or concerns

- The `error_description` cleanup only fires once a session exists (per the
  brief's literal wording, "after a session is established, if
  `window.location.hash` contains `access_token` or `error_description`,
  clear it"). In practice, an OAuth `error_description` in the fragment
  usually means sign-in *failed* and no session was ever established, so
  that specific fragment could persist in the address bar in that failure
  case. I followed the brief exactly rather than deviating to handle that
  case too, since the decisions section says "do not deviate" — flagging
  this now in case it's actually meant to be handled unconditionally in a
  follow-up task.
- No other concerns; scope was kept to exactly what the brief and decisions
  asked for.

---

## Fix report: expired/failed magic-link error surfaced to the user

Addresses the review finding on `src/components/RequireAuth.jsx` (the gap
flagged in "Issues or concerns" above, confirmed real by review): the
cleanup effect returned early with no session, so a failed magic-link or
OAuth attempt (`#error_description=...`, no session ever established) left
that fragment in the address bar forever and the user saw a plain login
screen with no explanation.

### What I changed

**`src/components/RequireAuth.jsx`** — split the single fragment-cleanup
effect into two, since one case needs a session and the other needs the
absence of one:

- New effect (runs once on mount, independent of `session`): reads
  `window.location.hash` with `new URLSearchParams(hash.slice(1))` — chosen
  specifically over manual `decodeURIComponent` because `URLSearchParams`
  correctly turns both `+` and `%20` into spaces, matching how Supabase
  form-encodes the message. If `error_description` is present, it's captured
  into new `authError` state and the fragment is stripped immediately via
  `replaceState` (pathname + search preserved, no history entry added) in
  the same pass.
- Existing effect (unchanged in behaviour, still keyed on `session`): strips
  a leftover `#access_token=...` fragment once a session exists. No longer
  also checks for `error_description` — that's now the first effect's job.
- `authError` is passed to `<Login authError={authError} />` in the
  no-session render branch.

**`src/screens/Login.jsx`** — added an optional `authError` prop:

- New `staleAuthError` state, initialised from `authError` and re-synced via
  a `useEffect` on `authError` changes (needed because `RequireAuth`'s error
  capture happens in an effect after Login's first mount, not before it).
- `displayedError = error ?? (staleAuthError ? "That sign-in link didn't
  work: ${staleAuthError}" : null)` — reuses the screen's single existing
  `role="alert"` region; no second error UI was added.
- `setStaleAuthError(null)` added at the top of both `handleEmailSubmit` and
  `handleGoogleClick`, before any other state change, so a passed-in error
  can never survive into (or reappear during/after) a fresh attempt,
  matching how the screen already resets its own `error` state before each
  attempt.

### Tests added/updated

**`tests/require-auth.test.jsx`**:
- Login mock extended to accept `authError` and render it into a
  `data-testid="passed-auth-error"` node so tests can assert on what's
  actually passed down, not just on side effects.
- Added: no-session render now also asserts `passed-auth-error` is absent
  when there's nothing to show.
- Replaced the `RequireAuth fragment cleanup` describe block with two:
  - `RequireAuth access_token cleanup (success path, needs a session)` —
    keeps the two tests whose behaviour is unchanged (`access_token` cleared
    with a session; unrelated hash left alone).
  - `RequireAuth auth error capture (failure path, no session ever exists)` —
    new test asserting an `error=access_denied&error_code=otp_expired&
    error_description=Email+link+is+invalid%20or+has+expired` fragment (with
    no session) is decoded to `"Email link is invalid or has expired"`
    (mixing `+` and `%20` deliberately, per the review's ask), passed to
    Login, and stripped from the URL with path/query preserved.
  - **Deliberately rewritten**, per the review's explicit call-out: the old
    "does not touch the hash while there is no session yet" test used an
    `#access_token=abc123` fragment and asserted it survived, with the
    justification (at the time) being "nothing is cleared without a
    session" — that justification is now false. I kept a test with the same
    fixture (`access_token`-only, no `error_description`, no session) because
    that *specific* outcome still holds (for a different, now-correct
    reason: the error-capture effect has nothing to act on, and the
    access_token effect requires a session it doesn't have), and added a
    comment explaining the old vs. new reasoning so it doesn't read as an
    oversight later.

**`tests/login.test.jsx`** — new `Login screen authError prop` describe
block:
- renders a passed-in `authError`, prefixed `"That sign-in link didn't
  work: ..."`, in the `role="alert"` region.
- no alert renders when there's neither `authError` nor a local error.
- the passed-in error clears once the user successfully requests a new link
  by email (alert gone, "Check your email" shown instead).
- the passed-in error clears once the user retries via Google.
- a **failed** retry shows only the fresh error, not the old one stacked
  alongside it (asserts the alert has the new message and explicitly does
  not contain `"didn't work"`).

### Commands run and output

Targeted run (the three files touched by this fix):

```
$ npx vitest run tests/require-auth.test.jsx tests/login.test.jsx tests/app.test.jsx

 ✓ tests/login.test.jsx (15 tests) 795ms
 ✓ tests/require-auth.test.jsx (7 tests) 83ms
 ✓ tests/app.test.jsx (6 tests) 140ms

 Test Files  3 passed (3)
      Tests  28 passed (28)
```

Full suite:

```
$ npm test

 ✓ tests/login.test.jsx (15 tests) 854ms
 ✓ tests/auth.test.jsx (12 tests) 247ms
 ✓ tests/require-auth.test.jsx (7 tests) 89ms
 ✓ tests/app.test.jsx (6 tests) 125ms
 ✓ tests/supabase.test.js (4 tests) 65ms

 Test Files  5 passed (5)
      Tests  44 passed (44)
```

Explicitly checked for warnings (none found):

```
$ npm test 2>&1 | grep -i -E "warn|act\(|error|fail"
(no output)
```

Build:

```
$ npm run build

vite v5.4.21 building for production...
✓ 81 modules transformed.
dist/index.html                   0.81 kB │ gzip:   0.40 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-D1girQw_.css    9.08 kB │ gzip:   2.65 kB
dist/assets/index-Cq9nPZE9.js   384.68 kB │ gzip: 110.61 kB
✓ built in 2.41s
EXIT:0
```

### Regression check against the amended requirement's point 5

- Unrelated hash (`#roster`/`#section-2`) still left alone — covered by the
  retained test in the access_token describe block.
- Session-present `access_token` cleanup still works — covered by the
  retained test in the same block.
- No login-screen flash while loading — unaffected; `RequireAuth` still
  returns the loading branch first, before either effect's captured state
  can influence what's rendered.

Went from 39 to 44 passing tests. `tests/require-auth.test.jsx` stayed at 7
(the fragment-cleanup block was restructured from 4 tests to 2+2, same net
count, different coverage). All 5 new tests are in `tests/login.test.jsx`
(10 → 15: the `authError` prop describe block). No regressions in either
file or in `tests/app.test.jsx`/`tests/auth.test.jsx`/`tests/supabase.test.js`,
which were untouched by this fix.
