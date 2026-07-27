# Task 9: Shared UI components — report

## What was implemented

Eight components in `src/components/`, each a named export matching the filename plus a
default export, per the brief's decision 1:

- `Card.jsx` — base card container (§4.5): white bg, 16px radius, `--shadow`, hairline
  border. No default padding (matches the prototype: padding is added per-context).
  Accepts `as` and `className` passthrough.
- `Chip.jsx` — event-type pill (§4.7): `type` of `'match' | 'training' | 'social'`, plus a
  neutral fallback for any other/missing type.
- `Badge.jsx` — small role/status label (§4.15 `.p-cap`, §4.20 `.role-tag`). See the
  Badge-vs-Chip ruling below.
- `Sheet.jsx` — the bottom-sheet/dialog modal (§4.16).
- `TeamPills.jsx` — team filter pill row (§4.8), exports `ALL_TEAMS_ID` sentinel.
- `ScopeNote.jsx` — the "you're scoped to X" callout (§4.25), presentational only.
- `Empty.jsx` — empty state (§4.10), message + optional action button.
- `Spinner.jsx` — shared loading indicator, `role="status"`.

None of these are wired into `AppShell.jsx`, `Nav.jsx`, or any screen, per the brief.

## Badge vs Chip ruling

Built both — they are not redundant. The design system documents them as visually and
semantically distinct:

| | Chip (§4.7) | Badge (§4.15/§4.20) |
|---|---|---|
| Shape | fully-rounded pill, 20px radius | near-square, 6px radius |
| Size | 11.5px text, 3px/9px padding | 10px uppercase text, 2px/7px padding |
| Meaning | *what an event is* (match/training/social) | *who someone is* (role tag) or a short status flag (captain marker) |
| Prototype source | `.chip.match/.training/.social` | `.role-tag`, `.p-cap` |

Overloading Chip to also cover role tags and the captain marker would mean approximating
the design system's two genuinely different pill styles as one — the brief's "not a
licence to duplicate" caveat is about not building two components with the *same* job, and
these don't have the same job. `Badge` tones: `admin` (maroon/white, reuses `.role-admin`),
`coach` (`#eaf4fb`/sky-deep, reuses `.role-coach`), `parent`/`captain` (warn bg, darkened
warn text — see contrast section below; the design system itself notes captain and parent
share the `--warn` tokens even though they're semantically unrelated).

## Contrast finding and fix (not just the flagged quinsGreen case)

I did not use `quinsGreen` for text anywhere (Chip's training variant uses the prototype's
own `--green-bg`/`--sky-deep` pairing, which is a light background with dark text — already
compliant, not a re-interpretation).

While computing contrast ratios to verify AA compliance (not just trusting the source
values), I found a second, more severe failure baked into the design system itself:

| Pairing | Ratio | AA text (4.5:1) | AA non-text (3:1) |
|---|---|---|---|
| `--warn` `#c9861a` text on `--warn-bg` `#fbf1dd` | **2.71:1** | FAIL | FAIL |

This pairing is used for the social event chip, the parent/captain role tags, and the
`ScopeNote` parent-tone lock icon. I kept the background at the literal `#fbf1dd` and
darkened the foreground (same hue, `#8a5a12`, measured ~5.3:1) for every text/icon use of
that pairing — Chip's `social` variant, Badge's `parent`/`captain` tones, and `ScopeNote`'s
parent-tone icon. `ScopeNote`'s decorative left border keeps the literal `--warn` value
(a border isn't "text or an icon conveying information" under WCAG 1.4.11).

I also found a narrower, unresolved near-miss I did **not** change: `--muted` (`#77726e`)
on the default/neutral chip background `#f0ecf2` measures **4.07:1** (needs 4.5:1) — a
~10% shortfall. `--muted` is used pervasively across the whole app (already in
`AppShell.jsx`/`Nav.jsx` for meta text, mostly on white/paper where it clears 4.5–4.75:1)
for the exact literal value the design system specifies. Unlike the warn pairing, this
wasn't flagged in the brief, and darkening a token used everywhere outside my remit would
be scope creep and could visually diverge `--muted`'s appearance for existing Task 8 code.
**Flagging this for Jay/design review rather than silently changing it**: the neutral chip
(used for age-group labels like "Senior Men 1st XV") is a small, narrow miss that may
warrant a slightly darker muted-on-chip value if a strict audit is wanted.

## TDD evidence

RED — before any component existed:
```
$ npm test -- tests/components.test.jsx
 FAIL  tests/components.test.jsx [ tests/components.test.jsx ]
Error: Failed to resolve import "../src/components/Card.jsx" from "tests/components.test.jsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
Expected and correct: the test file imports all eight components, none of which existed
yet, so Vite's import resolution fails before any test can run.

Also genuinely RED once components existed but before the a11y-name fix:
```
FAIL  tests/components.test.jsx > Spinner > exposes an accessible name via role=status
Unable to find an accessible element with the role "status" and name "Loading…"
```
`role="status"` does not compute its accessible name from content per the ARIA spec — a
visually-hidden child span alone isn't announced as the name. Fixed by adding
`aria-label={label}` directly to the status element (and dropping the now-redundant
sr-only span).

GREEN:
```
$ npm test -- tests/components.test.jsx
 ✓ tests/components.test.jsx (33 tests) 354ms
 Test Files  1 passed (1)
      Tests  33 passed (33)
```

Full suite (unchanged existing tests + new ones):
```
$ npm test
 Test Files  10 passed (10)
      Tests  140 passed (140)
```

Build:
```
$ npm run build
✓ 86 modules transformed.
dist/assets/index-*.css   19.09 kB
dist/assets/index-*.js   396.63 kB
✓ built in 3.33s
```
No `act()` warnings in any run (checked with `--reporter=verbose` and manual scan of
output — only two "warn"-matching lines were test *names* about the warn colour, not
React warnings). I also confirmed the new `animate-sheet-slide-up` / `sheetSlideUp` /
`scrim-fade-in` keyframes/utilities actually appear in the compiled `dist` CSS (Tailwind's
content globs scan `src/**/*.jsx` regardless of import graph, so this was worth checking
explicitly given nothing imports these components yet).

## Test coverage (tests/components.test.jsx, 33 tests)

- **Chip**: match/training/social variant classes; unknown type and missing type both fall
  back to the neutral variant instead of crashing or rendering nothing.
- **Badge**: admin tone, captain tone (darkened warn colours + distinct 6px radius vs
  Chip's 20px), unrecognised tone falls back safely.
- **Sheet**: renders nothing when `open={false}`; renders as `role="dialog"` labelled by
  title when open; closes on backdrop click but not on a click inside the panel; closes on
  Escape; Tab from the last focusable wraps to the first and Shift+Tab from the first wraps
  to the last (real focus trap, asserted via `document.activeElement`, not simulated);
  restores focus to the original trigger button on close (full open→close round trip via a
  harness component with a real trigger button).
- **TeamPills**: selected pill has `aria-pressed="true"`, others `"false"`; the `All` pill
  is pressed when `selected === ALL_TEAMS_ID`; clicking a pill calls `onChange` with the
  right id (including the sentinel for `All`); an empty array and a missing `teams` prop
  both render an empty container, not a broken control.
- **Empty**: renders the message; renders no button when no action given; renders a named
  button and calls its handler on click when an action is given.
- **Spinner**: default and custom accessible names via `getByRole('status', { name })`.
- **Card**: renders children with the design system's radius/shadow class tokens; accepts
  `className` without dropping the base classes.
- **ScopeNote**: renders children (parent-supplied message) under both an explicit tone and
  the default tone.

Used `userEvent` for all interaction and `getByRole`/`getByLabelText`-style accessible
queries throughout, per the brief.

## Design-system values used, and their source

All literal values are copied from `docs/design-system.md`, not approximated:
- Card: `--radius` (16px), `--shadow` (`0 6px 24px rgba(20,20,20,.10)`), `--line` (`#e6e3e1`) — §3, §4.5.
- Chip: `padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:700` (§4.7); match
  = `--maroon`/white; training = `--green-bg`/`--sky-deep` (`#eef7e6`/`#2F7D3D`); social =
  `--warn-bg`/darkened-`--warn` (`#fbf1dd`/`#8a5a12`, see contrast section); neutral =
  `#f0ecf2`/`--muted`.
- Badge: `.role-tag` metrics (`10px/800, .5px letter-spacing, padding:2px 7px, border-
  radius:6px`, §4.20) applied to both role tags and the captain badge (§4.15 gives the
  captain badge's font-size/weight but not its exact padding/radius, so I reused
  `.role-tag`'s for internal consistency — noted here since it's an inference, not a
  literal quote).
- Sheet: mobile `border-radius:22px 22px 0 0`, `max-height:92vh`; desktop `border-
  radius:20px`, `width:min(520px,94vw)`, `max-height:88vh`; scrim `rgba(24,10,20,.5)` +
  `backdrop-filter:blur(2px)`; close button `32×32px`, `#f2edf4` bg; title `18px/800`;
  timing `.28s cubic-bezier(.32,.72,0,1)` for the slide, `.2s` for the scrim fade — all §4.16.
- TeamPills: `.pill{padding:7px 14px;border-radius:20px;font-size:13px;font-weight:700}`,
  active = `--ink` bg/white text, inactive = white bg + `inset 0 0 0 1.5px var(--line)` —
  §4.8, §3.
- ScopeNote: two-tone left-border banner, coach = green-tinted/eye icon, parent =
  warn-tinted/lock icon, explicit read-only wording pattern — §4.25.
- Empty: `padding:44px 20px`, icon 42×42 at 40% opacity, 14px muted text — §4.10.

Deviations from the literal source, both documented inline in the component files and
above: the darkened warn foreground (`#8a5a12` in place of `#c9861a` for text/icon use),
and Sheet's `animation` (not `transition`) implementation for the entrance.

## `aria-pressed` vs `aria-current` for TeamPills

Chose `aria-pressed`. These pills are a single-select toggle-button group (like a
segmented control), not a sequence of pages/steps a user moves through — `aria-current` is
intended for "the current item in a set" navigational sense (breadcrumbs, pagination,
steps). `aria-pressed="true"` on a `<button>` is the correct ARIA state for "this toggle is
in its active/pressed state," which is exactly what a selected filter pill communicates.

## What tests cannot prove (needs browser verification)

jsdom doesn't apply Tailwind's generated CSS or run real animations/media queries, so the
following are asserted only via literal class-token presence, per the brief's guidance —
not proven to render or animate correctly:

1. **Sheet's actual visual layout**: bottom-anchored full-width sheet below 820px vs.
   centered `min(520px,94vw)` dialog at/above it. Tests check that `rounded-t-[22px]`,
   `desktop:rounded-[20px]`, and `desktop:w-[min(520px,94vw)]` are present in the class
   list, not that the breakpoint actually applies at the right viewport width.
2. **Sheet's entrance animation** (slide-up on mobile, scale+fade on desktop) and the scrim
   fade — tests confirm the `animate-sheet-slide-up`, `desktop:animate-sheet-scale-in`, and
   `animate-scrim-fade-in` classes are present and that `motion-reduce:animate-none` is
   paired with each, but cannot observe the animation actually playing, its timing, or that
   `prefers-reduced-motion: reduce` genuinely suppresses it in a real browser.
3. **Backdrop blur** (`backdrop-blur-[2px]`) — token presence only, not the visual blur.
4. **Actual colour contrast as rendered** — the contrast numbers in this report were
   computed programmatically from the literal hex values, not measured against rendered
   pixels; that's an accurate proxy here since the CSS is a straight background/text-colour
   pair, but it's worth spot-checking in a browser's accessibility inspector.
5. **Chip/Badge visual distinction at a glance** (pill vs near-square shape) — both tested
   only via class-token presence (`rounded-[20px]` vs `rounded-[6px]`).
6. **Focus-visible ring styling** (`focus-visible:ring-2 ring-quinsRed`) on TeamPills, Empty's
   action button, and Sheet's close button — tests don't and can't assert the ring is
   visually distinct in jsdom.
7. **TeamPills horizontal scroll behaviour** (`overflow-x-auto`, hidden scrollbar) with many
   teams — not exercised at all; only 2-team fixtures are used in tests.

## Self-review findings (fixed before reporting)

1. **Spinner had no accessible name** — `role="status"` doesn't compute its name from
   content per ARIA; fixed with `aria-label`, removed the now-dead `sr-only` span. Caught
   by the RED test run, not by inspection — documented above under TDD evidence.
2. **Contrast**: found and fixed the `--warn`-on-`--warn-bg` 2.71:1 failure (see above) by
   computing actual ratios rather than assuming the source design system values were
   AA-compliant just because they're the specified port target. Also identified (but did
   not fix) the smaller `--muted`-on-neutral-chip 4.07:1 near-miss, flagged for design
   review rather than silently altered.
3. **Sheet animation approach**: my first draft used Tailwind `transition-*` classes with no
   state to transition from/to, which — because Sheet mounts already "open" (renders null
   before, full markup after) — would never actually animate; it would just appear
   instantly despite the transition classes being present. Caught this before writing any
   test assertions about it, and also ruled out the alternative fix (an `entered` state
   flipped via `requestAnimationFrame`) because jsdom doesn't implement
   `requestAnimationFrame` at all (verified directly) — that approach would have either
   thrown in every Sheet test or silently done nothing, and risked `act()` warnings from an
   unguarded async state update. Switched to a CSS `animation` (auto-plays on mount, no
   extra state, mirrors a technique the prototype itself already uses for its view fade-in)
   instead.
4. **Sheet's `useEffect` re-run risk**: the effect depends on `[open, onClose]`. If a caller
   passes an inline (unmemoized) `onClose`, the effect re-runs on every re-render while the
   sheet stays open, re-capturing `document.activeElement` (which, if focus is now inside
   the sheet, would wrongly overwrite the saved trigger-to-restore-to) and re-establishing
   the keydown listener. None of the current tests exercise this because they don't
   re-render the Sheet's parent while open with a changing `onClose` identity. This is a
   real but narrow edge case — flagged under Issues below rather than fixed, since fixing
   it (e.g. holding `onClose` in a ref) adds indirection with no failing test motivating it
   yet, and no real screen consumes Sheet in this task.

## Files changed

- `src/components/Card.jsx` (new)
- `src/components/Chip.jsx` (new)
- `src/components/Badge.jsx` (new)
- `src/components/Sheet.jsx` (new)
- `src/components/TeamPills.jsx` (new)
- `src/components/ScopeNote.jsx` (new)
- `src/components/Empty.jsx` (new)
- `src/components/Spinner.jsx` (new)
- `tests/components.test.jsx` (new, 33 tests)
- `tailwind.config.js` (extended `theme.extend` with `keyframes`/`animation` for Sheet's
  entrance — not a new token module, the same extension mechanism already used for
  `colors`/`screens`)

## Issues / concerns for the reviewer

- **Overlap with AppShell** (per the brief's "note it, don't refactor" instruction):
  `AppShell.jsx`'s inline `LoadingState` (`role="status"`, plain text "Loading…") duplicates
  what `Spinner.jsx` now provides as a shared primitive, and its `ErrorState`/
  `NoMembershipState` cards duplicate `Card`'s radius/shadow/border values inline. Left
  untouched per the brief; worth a small follow-up refactor once screens start consuming
  `Card`/`Spinner` directly, so AppShell doesn't drift from the shared primitives it
  predates.
- **Muted-on-neutral-chip contrast** (4.07:1, ~10% short of AA 4.5:1) — flagged above,
  intentionally left as the literal design-system value rather than unilaterally changed;
  needs a design-review decision.
- **Sheet `onClose` identity sensitivity** — flagged above; recommend documenting (in a
  future task, when Sheet actually gets wired up) that callers should memoize `onClose`
  with `useCallback`, or accept the current behaviour as fine given real usage will likely
  hold `onClose` stable across re-renders anyway.
- Badge's captain-badge padding/radius were inferred from `.role-tag`'s metrics since
  design-system.md doesn't give `.p-cap`'s exact padding/radius, only its font-size/weight
  and colour-token reuse — flagged in case the actual prototype source has different exact
  numbers worth confirming against a live screenshot.

---

## Fix report (post-review)

The review came back **Needs fixes**. Design-system fidelity, the Badge/Chip ruling, the
focus-trap wrap logic, and the two contrast computations I'd already done were confirmed
correct by independent recomputation. Four things were wrong or incomplete and are fixed
below.

### 1. Critical — Sheet's stale-callback bug (`src/components/Sheet.jsx`)

**The bug**: the internal `useEffect` had `[open, onClose]` as its dependency array. Any
parent using the ordinary `onClose={() => setOpen(false)}` inline-arrow pattern gives
`onClose` a new identity on every render of that parent. A controlled form field inside the
sheet re-renders its parent on every keystroke, so the effect re-ran on every keystroke —
its cleanup fired `triggerRef.current?.focus?.()`, yanking focus out of the field after
every character. I had flagged this as a "narrow edge case awaiting a consumer" in the
original report; the reviewer showed it's the *default* outcome for the exact pattern
Sheet's own header comment names as the primary use case (event/player add-edit forms,
Tasks 14/15), not a hypothetical.

**The fix**: latest-ref pattern. Added `const onCloseRef = useRef(onClose)` with
`onCloseRef.current = onClose` assigned on every render (no effect needed for this
assignment — it's cheap and always correct). The Escape handler inside the effect now calls
`onCloseRef.current()` instead of closing over `onClose` directly. `onClose` was removed
from the effect's dependency array, which now reads `[open]` — the effect runs exactly once
per open/close transition, never on an unrelated re-render.

I audited the rest of the file (and the other seven Task 9 components) for the same class
of problem: Sheet.jsx has exactly one `useEffect`, now fixed. The backdrop's and close
button's `onClick={onClose}` handlers were left as direct prop references — they aren't a
problem, since a JSX `onClick` prop always closes over the current render's value with no
staleness window; the bug was specifically about a value trapped in a dependency array
across renders. The other seven components (`Card`, `Chip`, `Badge`, `TeamPills`,
`ScopeNote`, `Empty`, `Spinner`) contain no `useEffect` at all — they're stateless/
presentational — so there was nothing else to audit.

**Covering test — reproduces the exact bug, verified RED against the pre-fix code**:
Added `Sheet > does not lose focus or drop keystrokes when the parent passes an inline
onClose and the field it controls re-renders on every keystroke` to
`tests/components.test.jsx`. A `ControlledFieldHarness` renders an open `Sheet` with
`onClose={() => setOpen(false)}` (inline, fresh identity every render) wrapping a
controlled `<input>`. `userEvent.keyboard('Tom')` types three characters; the test asserts
`input` has value `'Tom'` and `document.activeElement` is still the input.

To prove this test is a genuine regression test and not just theater, I stashed the fixed
`Sheet.jsx`, ran only this test against the pre-fix code, confirmed it failed with exactly
the reported symptom, then restored the fix:

```
$ git stash push -- src/components/Sheet.jsx
$ npm test -- tests/components.test.jsx -t "does not lose focus"
 × Sheet > does not lose focus or drop keystrokes ... 165ms
   → expect(element).toHaveValue(Tom)
   Expected the element to have value:
     Tom
   Received:
     T
 Test Files  1 failed (1)
      Tests  1 failed | 34 skipped (35)

$ git stash pop
```

This is entirely testable in jsdom (no CSS/animation involved), exactly as the reviewer
said — it's a `document.activeElement` + input-value assertion, structurally the same shape
as the existing focus-trap tests. My original "what tests cannot prove" list should have
included this and didn't; it's added to that list below going forward as a note that
callback-identity-driven effect bugs are exactly the kind of thing jsdom *can* catch and
must be tested for on any component with an effect depending on a caller-supplied callback.

### 2. Important — neutral chip/badge contrast (`Chip.jsx`, `Badge.jsx`)

Computed the same way as the warn-pair fix in the original report: `#77726e` (`--muted`) on
`#f0ecf2` (the neutral chip background) is **4.07:1**, under the 4.5:1 AA text threshold —
this chip/badge text is 11.5px/10px bold, neither qualifies as "large text" (needs ≥14px
bold), so the 3:1 large-text allowance doesn't apply.

Fixed with the same pattern already used for the warn pair: a component-scoped literal
foreground override, not a `--muted` token change. Landed on **`#5c5854`**, same hue family,
darkened just enough:

```
#5c5854 on #f0ecf2 → 6.037:1   (was #77726e → 4.07:1)
```

Applied to `NEUTRAL_VARIANT` in `Chip.jsx` and `NEUTRAL_TONE` in `Badge.jsx`. This is the
same override scope as the warn fix — `--muted` itself, and its use elsewhere in the app
(e.g. `AppShell.jsx`, where it's on white/paper and already clears 4.5:1), is untouched.
This chip is also, per design-system.md §4.7, the one used for every age-group label
throughout the roster/schedule screens, so it's high-traffic — worth having gotten it right
rather than left as a known gap.

Updated the two existing tests that asserted the old `text-[#77726e]` token (Chip's unknown-
type fallback, Badge's unrecognised-tone fallback) to assert `text-[#5c5854]` instead, and
strengthened Badge's fallback test to check the actual colour classes rather than only
`toBeInTheDocument()`.

### 3. Minor — sheet-grip (`Sheet.jsx`)

design-system.md §4.16 documents a `.sheet-grip` drag-handle bar (38×4px, `#dcd4e0`), mobile
only, decorative — no swipe-to-dismiss is wired up in the prototype either. This was missing
from the port; added as a `desktop:hidden`, `aria-hidden="true"` bar above the sticky
sheet-head, matching those exact dimensions and colour. Added a test asserting its presence,
width, and the `desktop:hidden` token (it's `aria-hidden`, so not reachable via an
accessible-role query — asserted structurally instead).

### 4. Minor — desktop entrance vertical settle (`tailwind.config.js`)

design-system.md §4.16 specifies the desktop entrance as `translate(-50%,-46%) scale(.98)
opacity:0` → `translate(-50%,-50%) scale(1) opacity:1` — a fade + scale + slight vertical
settle. My original `sheetScaleIn` keyframe dropped the settle (scale + opacity only).

Sheet uses flex centering (`items-center justify-center`) rather than the prototype's
absolute-position `translate(-50%,-50%)` trick, so there's no `-50%` term to reproduce
directly. CSS `transform: translate()` percentages are relative to the *element's own box*,
so the meaningful part of `-46%` → `-50%` is the 4-percentage-point delta between them —
that's the actual "settle" distance regardless of how the element is otherwise centered.
Updated the keyframe to `scale(.98) translateY(-4%)` → `scale(1) translateY(0)`, which
reproduces that same relative vertical travel. Verified the literal string `translateY(-4%)`
appears in the built CSS (`dist/assets/index-*.css`) after `npm run build`.

### 5. Minor — Empty's button hover colour (`Empty.jsx`)

design-system.md §1 specifies the primary button hover as `--magenta` (`#D62A3D`), not
`--maroon-dark`/`quinsRedDark` (`#8E1526`, which the design system uses for the gradient
start colour, not a button hover state). Was using the Tailwind `quinsRedDark` token by
habit rather than checking the source; replaced with the literal `hover:bg-[#D62A3D]`,
following the same "bracket literal for non-tokenised colours" convention used elsewhere in
these components (e.g. Chip/Badge's warn-derived colours).

### Left alone, as instructed

`aria-hidden`/`inert` on background content while the sheet is open, and consolidating the
various inline icon SVGs into a shared `<Icon>` component — both real, both explicitly
deferred to a later hardening pass per the coordinator's message, not touched here.

### Verification

```
$ npm test -- tests/components.test.jsx
 ✓ tests/components.test.jsx (35 tests) 455ms
 Test Files  1 passed (1)
      Tests  35 passed (35)

$ npm test
 ✓ tests/components.test.jsx (35 tests)
 ✓ tests/scope.test.js (35 tests)
 ✓ tests/login.test.jsx (16 tests)
 ✓ tests/app-shell.test.jsx (12 tests)
 ✓ tests/auth.test.jsx (12 tests)
 ✓ tests/require-auth.test.jsx (9 tests)
 ✓ tests/memberships.test.jsx (7 tests)
 ✓ tests/app.test.jsx (6 tests)
 ✓ tests/nav.test.jsx (6 tests)
 ✓ tests/supabase.test.js (4 tests)
 Test Files  10 passed (10)
      Tests  142 passed (142)

$ npm run build
✓ 86 modules transformed.
dist/assets/index-*.css   19.54 kB
dist/assets/index-*.js   396.63 kB
✓ built in 3.51s
```

No `act()` warnings in any run. `git status --short` shows only the six files actually
touched by these fixes (`Badge.jsx`, `Chip.jsx`, `Empty.jsx`, `Sheet.jsx`,
`tailwind.config.js`, `tests/components.test.jsx`) — no stray scratch test files.

### Updated "what tests cannot prove" list

Everything in the original report's list still stands, plus: tests still cannot prove the
*visual* result of the sheet-grip, the desktop vertical settle, or the corrected hover
colour (all class-token assertions only, real rendering needs a browser check) — but the
callback-identity bug this round is explicitly no longer on the "can't prove" list: it's now
covered by a real, verified-RED-then-GREEN test.
