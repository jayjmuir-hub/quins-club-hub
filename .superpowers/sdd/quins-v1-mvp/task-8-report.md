# Task 8 report: App shell + navigation

## What I implemented

1. **`src/lib/memberships.jsx`** — `MembershipProvider` + `useMemberships()`. Loads
   `loadMyMemberships()` and `supabase.from('teams').select('*')` in parallel once a
   session exists (both RLS-scoped server-side). Returns exactly
   `{ memberships, teams, loading, error, reload }`. `loading` starts `true`, resolves
   to `false` on success or failure. With no session it returns
   `{ memberships: [], teams: [], loading: false }` without querying at all. Guards
   against setting state after unmount, same pattern as `auth.jsx`.

2. **`src/components/Nav.jsx`** — one `NAV_ITEMS` array (`Home /`, `Schedule /schedule`,
   `Roster /roster`, `More /more`) and one `<nav>` tree, styled by CSS alone to be the
   fixed bottom tab bar below 820px and the in-header top nav at/above it — no
   duplicated trees, no JS width check. Uses `NavLink` (which sets `aria-current="page"`
   automatically); `Home` uses `end` so it isn't active on every route. Icons are
   `currentColor` inline SVG, hidden at the desktop breakpoint (desktop nav is
   text-only pills, matching design-system.md §4.1).

3. **`src/components/AppShell.jsx`** — header (crest, "Abu Dhabi Harlequins" / "Quins
   Club Hub" on the red→green gradient, role label via `roleLabel(memberships)`, `Nav`)
   plus the membership-loading gate: loading indicator, error state with retry, or —
   for a signed-in user with zero membership rows — a reassuring "ask your admin for an
   invite" panel showing the signed-in email and a sign-out control, instead of a blank
   app. Once memberships have loaded, routed `children` render, and on the `/more`
   route a sign-out control also appears alongside them (read via `useLocation()`, no
   change needed to the `More` placeholder itself).

4. **`src/App.jsx`** — composes `RequireAuth` → `MembershipProvider` → `AppShell` →
   `Routes`. The four placeholder screens (`Home`/`Schedule`/`Roster`/`More`) are
   untouched, as instructed.

5. **`src/components/RequireAuth.jsx`** — fixed the carried defect: a captured
   magic-link/OAuth `authError` now clears on a genuine session-goes-away transition
   (tracked via a `useRef`), not on first mount, so a stale "that sign-in link didn't
   work" message can't resurface on Login after an unrelated later sign-out.

6. Supporting changes: `tailwind.config.js` gained a `desktop: '820px'` screen (the
   prototype's single named breakpoint, reusable by later tasks); `index.html` gained
   `viewport-fit=cover` so `env(safe-area-inset-bottom)` actually resolves on iOS
   (needed for the mobile tab bar padding requirement); `src/index.css` gained a global
   `prefers-reduced-motion: reduce` rule (binding accessibility constraint, no existing
   handling in the codebase).

## What I tested and results

New/updated test files: `tests/memberships.test.jsx` (7 tests), `tests/nav.test.jsx`
(6 tests), `tests/app-shell.test.jsx` (9 tests), plus additions to
`tests/require-auth.test.jsx` (+2 tests) and `tests/app.test.jsx` (updated to mock the
new membership layer). Full suite: **103 tests passing across 9 files**, 0 failures.

Coverage against the brief's required list:
- shell renders all four nav items + brand name/tagline — `app-shell.test.jsx`, `nav.test.jsx`
- clicking a nav item changes the route and sets `aria-current` — `nav.test.jsx`
- role label renders from mocked memberships — `app-shell.test.jsx` ("Coach" from a
  coach-role fixture)
- zero-membership state renders instead of routed screens, shows the signed-in email —
  `app-shell.test.jsx`
- membership-load error renders an error state, not a blank screen — `app-shell.test.jsx`
- loading state renders while memberships load — `app-shell.test.jsx`
- sign-out calls `signOut` and surfaces a failure — `app-shell.test.jsx` (2 tests: success
  call, and failure message rendered instead of thrown)
- carried defect (decision 3) — `require-auth.test.jsx` (clears-on-transition test +
  does-not-clear-on-first-mount regression guard)

## TDD evidence

**RED** — `npm test` before implementation (new test files import non-existent
modules; the decision-3 regression test fails against the unfixed `RequireAuth`):

```
❯ tests/require-auth.test.jsx (9 tests | 1 failed)
   × ... clears a previously captured auth error once the session goes away ...
     → expect(element).not.toBeInTheDocument()
     expected document not to contain element, found <div data-testid="passed-auth-error">
❯ tests/memberships.test.jsx (0 test)
   Error: Failed to resolve import "../src/lib/memberships.jsx"
❯ tests/app-shell.test.jsx (0 test)
   Error: Failed to resolve import "../src/components/AppShell.jsx"
❯ tests/nav.test.jsx (0 test)
   Error: Failed to resolve import "../src/components/Nav.jsx"

Test Files  4 failed | 5 passed (9)
Tests  1 failed | 80 passed (81)
```
This is the expected RED: the three new source files don't exist yet, and the
`RequireAuth` fix hasn't landed.

**GREEN** — after implementing `memberships.jsx`, `Nav.jsx`, `AppShell.jsx`,
`App.jsx`, and the `RequireAuth.jsx` fix:

```
✓ tests/scope.test.js (35 tests)
✓ tests/login.test.jsx (15 tests)
✓ tests/auth.test.jsx (12 tests)
✓ tests/require-auth.test.jsx (9 tests)
✓ tests/memberships.test.jsx (7 tests)
✓ tests/app-shell.test.jsx (9 tests)
✓ tests/app.test.jsx (6 tests)
✓ tests/nav.test.jsx (6 tests)
✓ tests/supabase.test.js (4 tests)

Test Files  9 passed (9)
Tests  103 passed (103)
```
First GREEN run surfaced React Router future-flag warnings in the two new test files
(`MemoryRouter` without the `future` flags `App.jsx`'s `BrowserRouter` already sets).
Fixed by passing the same `{ v7_startTransition: true, v7_relativeSplatPath: true }`
flags to `MemoryRouter` in `nav.test.jsx`/`app-shell.test.jsx`. Final run: 103/103
passing, **no warnings of any kind** in stdout/stderr.

`npm run build` passes cleanly (86 modules, no errors), both before and after that
router-flag fix, confirmed again as the final verification step.

## Files changed

- `src/lib/memberships.jsx` (new)
- `src/components/Nav.jsx` (new)
- `src/components/AppShell.jsx` (new)
- `src/App.jsx` (modified — composition)
- `src/components/RequireAuth.jsx` (modified — carried-defect fix)
- `tailwind.config.js` (modified — `desktop: 820px` screen)
- `index.html` (modified — `viewport-fit=cover`)
- `src/index.css` (modified — global `prefers-reduced-motion` rule)
- `tests/memberships.test.jsx` (new)
- `tests/nav.test.jsx` (new)
- `tests/app-shell.test.jsx` (new)
- `tests/require-auth.test.jsx` (modified — decision-3 regression tests)
- `tests/app.test.jsx` (modified — mocks the new membership layer so it still tests
  only App's routing/composition wiring)

## Design-system values used and their source

All from `docs/design-system.md`:
- Header gradient: `linear-gradient(100deg,#8E1526 0%,#C21F32 42%,#B23A38 62%,#7DC351 100%)`
  (§1, "Header gradient") — reused verbatim from the existing `RequireAuth`/`Login`
  loading-screen gradient string for consistency.
- Crest badge: 46×46px, `drop-shadow(0 1px 3px rgba(0,0,0,.35))` (§4.1).
- Brand type: h1 16px/800/.2px tracking; tagline 11.5px/600/1.3px tracking, uppercase,
  white at 82% opacity (§2 table, "App name"/"Tagline" rows).
- Desktop nav pill: `padding:8px 14px;border-radius:10px;font-weight:600;opacity:.82`,
  active → `background:rgba(255,255,255,.16);opacity:1` (§4.1).
- Mobile tab bar: `rgba(255,255,255,.94)` translucent + `backdrop-filter:blur(12px)`,
  top hairline, active icon colour `--maroon` (#C21F32), inactive `--muted` (#77726e),
  10.5px/700 label (§4.3).
- Single breakpoint `@media (min-width:820px)` (§5) → Tailwind `desktop: '820px'` screen.
- Safe-area handling: tab bar bottom offset adds `env(safe-area-inset-bottom)` (§3).
- Card/panel styling for the loading/error/zero-membership states: `border-radius:16px`,
  `box-shadow:0 6px 24px rgba(20,20,20,.10)`, `border:1px solid #e6e3e1` (§3 `.card`).
- Error text/background: `text-quinsRedDark` (#8E1526) on `#fbeae8` (§1 `--bad-bg`
  family), matching the pattern already established in `Login.jsx`.
- Colours: `quinsRed`/`quinsGreen`/`quinsGreenSoft`/`quinsRedDark`/`quinsBlack` Tailwind
  tokens as specified in the task interfaces; `quinsGreen` used only as a gradient stop,
  never as text (per the binding constraint — verified no `text-quinsGreen` usage
  anywhere in the new code).

## Self-review findings (fixed before reporting)

- Two new test files (`nav.test.jsx`, `app-shell.test.jsx`) used `MemoryRouter` without
  the router's `future` flags, producing React Router deprecation warnings on every run
  — fixed by passing the same flags `App.jsx` uses to `BrowserRouter`.
- `Nav.jsx` had a redundant `desktop:pb-0` class alongside `desktop:p-0` (the latter
  already zeroes all padding) — removed the dead class.
- Verified the arbitrary-value Tailwind opacity utilities I used
  (`bg-white/[.16]`, `text-white/[.82]`, `opacity-[.82]`) actually compile to real CSS
  rules rather than silently no-op'ing (ran the Tailwind CLI standalone against the
  config and grepped the output) — all three generated correctly.
- Confirmed no `text-quinsGreen` usage anywhere in the new code (the AA-contrast-failure
  constraint on `quinsGreen` text).
- Confirmed `aria-current="page"` comes from React Router's `NavLink` default behaviour
  rather than something I need to wire manually, and that it's genuinely exercised
  end-to-end via click interaction in `nav.test.jsx`, not just asserted on initial
  render.
- Confirmed the `RequireAuth` fix doesn't clear a freshly captured error on first mount
  (added an explicit regression test for that direction, not just the clearing
  direction) — a ref-based one-line mistake here (e.g. defaulting `hadSessionRef` to
  `true`) would have silently broken every existing "captures the error" test path had
  I not both fixed and read the effect ordering carefully.
- Confirmed `prefers-reduced-motion` had zero existing handling anywhere in the
  codebase before this task, despite being a binding global constraint — added a global
  rule in `index.css` rather than scattering per-component media queries, since this is
  the first task to introduce any CSS transitions (nav link colour, sign-out button,
  retry button) and it benefits every later task's animations too (e.g. Task 9's sheet).

## Issues or concerns

None blocking. Two things worth flagging for later tasks, not regressions:

- `Nav` is nested inside `<header>` in the DOM (mobile detaches it visually via
  `position: fixed`, desktop keeps it inline in the header's flex row) rather than
  being a header sibling as the prototype's raw markup has it. This was a deliberate
  choice to satisfy decision 5's "one component, CSS-responsive, not two trees" — a
  landmark `<nav>` nested inside a `<header>`/banner landmark is valid ARIA, not an
  error, but it's worth knowing this is why the DOM shape differs slightly from
  design-system.md §4.1/§4.3's literal sibling structure.
- The role label in the header shows "No access yet" during the zero-membership state
  (it isn't hidden in that branch) — this is intentional, not a bug: the header stays
  honest about status while the main panel explains what to do about it.

---

## Fix report: Task 8 review findings

Coordinator review returned two Important findings and one Minor, all in
`src/components/AppShell.jsx`. Both Important findings were real deviations from
binding requirements that the original test suite didn't catch because it only
asserted text presence, never the responsive class tokens that actually govern
visibility in jsdom (which never applies real CSS).

### 1. Role label invisible on mobile (Important)

**Root cause:** the only role-label element was `hidden ... desktop:inline-block` —
correct for a desktop-only badge, but with no mobile equivalent the role never
rendered visibly below 820px, contradicting decision 6 ("`roleLabel(memberships)`
shown in the header", no breakpoint qualifier) on the primary case (phone, pitch-side).

**Fix:** added a second, mobile-visible role element next to the tagline —
`Quins Club Hub · <role>` — marked `desktop:hidden` so it disappears only once the
desktop badge takes over. Both elements now carry `data-testid`
(`role-label-mobile` / `role-label-desktop`) for precise testing. The existing desktop
badge is unchanged.

**Test-gap fix:** added `hasClassToken(element, token)` in `tests/app-shell.test.jsx` —
splits `className` on whitespace and checks for an exact token match, so
`desktop:hidden` (a distinct string) can never false-match a check for the bare
`hidden` token. New test `'the role label is not CSS-hidden on mobile ...'` asserts
`hasClassToken(mobileRole, 'hidden') === false` and
`hasClassToken(desktopRole, 'hidden') === true`, alongside both elements' text content.
This is the exact class of assertion the review asked for: it would have failed
against the pre-fix markup (mobile role had no element at all, so the testid query
itself would have thrown) and fails again if the `desktop:hidden` variant were ever
swapped back to a bare `hidden`.

### 2. Error text wrong colour (Important)

**Root cause:** `ErrorState`'s message paragraph used `text-[#77726e]` (muted grey)
instead of `text-quinsRedDark`, violating the binding "error text uses quinsRedDark"
constraint. `SignOutControl` in the same file already had the correct pairing
(`bg-[#fbeae8]` + `text-quinsRedDark`) to copy from.

**Fix:** changed the class to `text-quinsRedDark`, matching `SignOutControl`'s
existing pattern. Added `data-testid="error-message"` to the paragraph for stable
targeting.

**Test-gap fix:** new assertion in the existing error-state test —
`hasClassToken(screen.getByTestId('error-message'), 'text-quinsRedDark') === true` —
using the same token-matching helper as finding 1, so it can't be satisfied by a
substring/contains match against some other `text-*` class.

### Minor: tagline not stepping up to 12px at desktop

**Fix:** added `desktop:text-[12px]` to the tagline `<p>`, matching
design-system.md §2 ("11.5px, 12px ≥820px"). Verified with the Tailwind CLI run
standalone against the project config that `.desktop\:text-\[12px\]` actually
compiles to a real rule (same verification method as the original report's
self-review, re-run for this class specifically).

**Test:** new test `'the tagline steps up to 12px at the desktop breakpoint'`
asserts the token is present on the tagline's parent element.

### Left alone, per coordinator's instruction

Skip-to-content link and focus-order gap — pre-existing, documented, tracked under
Task 22 (accessibility). Not touched.

### Verification

Targeted run on the amended files:
```
$ npx vitest run tests/app-shell.test.jsx tests/app.test.jsx
 ✓ tests/app-shell.test.jsx (11 tests) 327ms
 ✓ tests/app.test.jsx (6 tests) 226ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```

Full suite:
```
$ npm test
 ✓ tests/scope.test.js (35 tests)
 ✓ tests/login.test.jsx (15 tests)
 ✓ tests/auth.test.jsx (12 tests)
 ✓ tests/app-shell.test.jsx (11 tests)
 ✓ tests/require-auth.test.jsx (9 tests)
 ✓ tests/memberships.test.jsx (7 tests)
 ✓ tests/app.test.jsx (6 tests)
 ✓ tests/nav.test.jsx (6 tests)
 ✓ tests/supabase.test.js (4 tests)

 Test Files  9 passed (9)
      Tests  105 passed (105)
```
(105 vs. the original 103 — +2 net from the two new regression tests; the
"role label" test that previously used a single `getByText('Coach')` assertion was
split/extended rather than duplicated.)

Build:
```
$ npm run build
✓ 86 modules transformed.
dist/index.html                   0.83 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-CCEylsjf.css   13.98 kB
dist/assets/index-kyty9uRO.js   396.60 kB
✓ built in 3.38s
```
No warnings anywhere in either run.

### Files changed in this fix

- `src/components/AppShell.jsx` (mobile role element, error-text colour, tagline
  breakpoint, two new `data-testid`s)
- `tests/app-shell.test.jsx` (`hasClassToken` helper, two new regression tests, one
  extended assertion)

### What I'm taking from this

Both misses shared a pattern: jsdom-rendered text presence is not evidence of real
visual correctness once Tailwind's responsive/utility classes are involved — the
"pristine and passing" bar I reported against wasn't actually checking the thing the
binding requirements cared about (visible at what width, which colour token). Going
forward, for CSS-responsive claims in this codebase, class-token assertions of this
appearance are what I'll use as the default check, not text-presence alone.

---

## Fix report: Task 8 rendered-review finding (crest cropping)

Coordinator's re-review of the two prior fixes came back clean (both Important
findings and the Minor confirmed addressed, and the class-token test approach
validated as the right kind of assertion). They then rendered the real components in
Chromium at 375px and 1280px — a check jsdom tests structurally cannot perform — and
confirmed the responsive layout, gradient, contrast, and role-label visibility are all
correct at both widths. One defect only visible in a real render surfaced:

### The club crest was visually flattened/clipped in every badge

**Root cause:** `crest.png` is 369×400 — portrait, taller than wide. Both places it's
rendered (`AppShell.jsx`'s 46×46px header badge, `Login.jsx`'s 80×80px badge) set equal
`h-*`/`w-*` classes — a square box — on the `<img>` with no `object-fit` override. The
CSS default for `object-fit` is `fill`, which stretches the image non-uniformly to
exactly fill the box rather than cropping it outright. For this asset that meant
squashing the image horizontally, which visually reads as the tapered/pointed bottom of
the shield being flattened — matching the coordinator's screenshot description ("the
shield's lower tip is sheared flat") even though no pixels were literally cropped off.
The design system's own prototype badge never hits this: it uses a CSS
`background:contain` treatment, which preserves aspect ratio by construction; the React
port's `<img>` equivalent needed the same `object-contain` explicitly, since `contain`
is not the browser's default for `object-fit`.

**Fix:** added `object-contain` to both `<img>` elements, keeping the existing square
badge sizing (46×46 / 80×80, matching design-system.md's 46px header badge spec). Kept
the box square rather than resizing it to the crest's own aspect ratio: `object-contain`
in a square box for this asset (width:height ≈ 0.92:1, close to square) only produces a
~2px empty margin on the left/right at 46px — imperceptible, and it's exactly what the
prototype's own `background:contain` treatment already produces, so this stays faithful
to the design system rather than deviating from it. Applied to both call sites (`AppShell`
header badge and `Login`'s badge — same asset, same latent bug, both fixed).

**Test-gap fix:** added a regression test in each of `tests/app-shell.test.jsx` and
`tests/login.test.jsx` asserting: (1) the crest `<img>`'s class list contains
`object-contain` and never `object-cover`, using the same literal-token check pattern
introduced in the previous fix round (a `.toContain`/`.not.toContain` pair on the split
class list, immune to substring false-matches), and (2) the image's `alt` attribute is
non-empty (`expect(...).not.toStringMatching(/^$/)`), since the crest is the club's
identity and must not be treated as decorative. Both images already had a meaningful alt
(`"Abu Dhabi Harlequins crest"`) from the original build — this test just makes that a
locked-in guarantee rather than an unverified assumption, and it would have caught the
underlying bug too, since a plain `object-cover` "fix" attempt (cropping instead of
squashing) would fail the `not.toContain('object-cover')` half of the assertion.

### Verification

Targeted run on the amended files:
```
$ npx vitest run tests/login.test.jsx tests/app-shell.test.jsx
 ✓ tests/login.test.jsx (16 tests) 978ms
 ✓ tests/app-shell.test.jsx (12 tests) 350ms

 Test Files  2 passed (2)
      Tests  28 passed (28)
```

Full suite:
```
$ npm test
 ✓ tests/scope.test.js (35 tests)
 ✓ tests/login.test.jsx (16 tests)
 ✓ tests/app-shell.test.jsx (12 tests)
 ✓ tests/auth.test.jsx (12 tests)
 ✓ tests/require-auth.test.jsx (9 tests)
 ✓ tests/memberships.test.jsx (7 tests)
 ✓ tests/app.test.jsx (6 tests)
 ✓ tests/nav.test.jsx (6 tests)
 ✓ tests/supabase.test.js (4 tests)

 Test Files  9 passed (9)
      Tests  107 passed (107)
```
(107 vs. the prior round's 105 — +2 from the two new crest regression tests.)

Build:
```
$ npm run build
✓ 86 modules transformed.
dist/index.html                   0.83 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-CblByN9O.css   14.04 kB
dist/assets/index-Bf2rxNLd.js   396.63 kB
✓ built in 3.50s
```
No warnings anywhere in either run.

### Files changed in this fix

- `src/components/AppShell.jsx` (`object-contain` on the header crest badge)
- `src/screens/Login.jsx` (`object-contain` on the login crest badge)
- `tests/app-shell.test.jsx` (crest object-fit/alt regression test)
- `tests/login.test.jsx` (same, for the login screen)

Note: the working tree also has untracked `harness/` and `screenshots/` directories —
these are the coordinator's own Chromium-rendering tooling and output from the visual
review, not part of this fix. Left untouched and out of this commit.

### What I'm taking from this

The pattern across all three review rounds has been the same: jsdom-based tests can
prove a class token is present or absent, but they cannot prove what that token does
once real CSS and a real image decoder are involved — the object-fit default behaviour
here (stretch, not crop) produced a visual defect no unit test could have caught on its
own, only a rendered screenshot could. The class-token regression test I added is the
right *lock-in* once the fix is known, but it would not have been the *discovery*
mechanism — for anything involving actual image/layout rendering, a rendered check
(even a manual one) needs to happen at least once before I report a UI task done, not
just a passing jsdom suite.
