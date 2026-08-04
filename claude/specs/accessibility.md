# Quins Club Hub — Accessibility

This is a consolidated, human-readable index into the accessibility work already done across
the codebase (mostly by earlier tasks, without a dedicated "accessibility task" ever existing
before Task 22), plus the two things Task 22 itself found and fixed: the header gradient's
contrast risk and the missing skip-to-content link. It exists alongside — not instead of — the
scattered inline comments cited throughout: this doc points at the real file:line where each
ratio was computed, rather than duplicating that reasoning somewhere it can drift out of sync.

File split rationale: this is its own file, `claude/specs/accessibility.md`, rather than a section of
`claude/runbooks/e2e-roles.md`. The two documents serve different audiences and different moments —
`e2e-roles.md` is a checklist Jay runs once real accounts exist, to prove role/scoping
behaviour; this document is a standing reference for anyone (Jay, a future contributor, a future
Claude session) who needs to know "is this colour pairing safe to use for text" or "has the
keyboard/motion/skip-link story been checked" without re-deriving it from scratch. Folding them
together would make the checklist longer to scan and this reference harder to find later.

---

## 1. Brand-palette contrast pairs used for text

All ratios below are WCAG 2.1 relative-luminance contrast ratios (sRGB), against the stated
background, for either **normal text** (4.5:1 AA) or **large text / UI components** (3:1 AA) —
each entry states which threshold applies and whether it's already-existing documentation
(cited by file:line) or new for this task.

| Foreground | Background | Ratio | Threshold | Verdict | Source |
|---|---|---|---|---|---|
| `--muted` `#5c5854` | `--paper`/white | 6.417:1 | 4.5:1 (normal) | **Pass** | `src/screens/Schedule.jsx:50`, `src/screens/Dashboard.jsx:46`, `src/screens/Roster.jsx:43` |
| `#77726e` | white/`--paper` | 4.329:1 | 4.5:1 (normal) | **Fail** | `src/screens/Schedule.jsx:49`, `src/screens/Dashboard.jsx:45`, `src/screens/Roster.jsx:41` |
| `#77726e` | tinted card bg (not white/paper) | 4.755:1 | 4.5:1 (normal) | **Pass** | `src/screens/Schedule.jsx:47`, `src/screens/Dashboard.jsx:44`, `src/screens/Roster.jsx:39` |
| `quinsRed` `#C21F32` | white | 5.93–5.94:1 | 4.5:1 (normal) | **Pass** | `src/screens/PlayerDetail.jsx:58`, `src/screens/Dashboard.jsx:58` |
| white/85% | header/hero gradient's `quinsRed` end | 4.63:1 | 4.5:1 (normal) | **Pass** | `src/screens/EventDetail.jsx:286-287` |
| white/70% | header/hero gradient's `quinsRed` end | 3.55:1 | 4.5:1 (normal) | **Fail** (not shipped — comment records why it was rejected in favour of 85%) | `src/screens/EventDetail.jsx:288-289` |
| `quinsGreen` `#7DC351` as **text** | white | ~1.9:1 | any text threshold | **Fail outright** — never used as text/foreground anywhere in the codebase, only as a gradient/block-fill background colour | `src/components/Chip.jsx:8-9` |
| `#c9861a` (warn/amber) | `#fbf1dd` | ~2.71:1 | 3:1 (non-text minimum) | **Fail** | `src/components/Chip.jsx:22-23`, `src/components/Badge.jsx:25`, `src/components/ScopeNote.jsx:33` |
| `#8a5a12` (darkened warn) | `#fbf1dd` | ~5.3:1 | 4.5:1 (normal) | **Pass** — the actual shipped foreground wherever the warn/amber background is used with text | `src/components/Chip.jsx:24`, `src/components/Badge.jsx:26`, `src/components/ScopeNote.jsx:37` |
| `--good` `#2F9E4F` | `--good-bg` `#e7f6ea` | 3.06:1 | 4.5:1 (normal) | **Fail** | `src/components/Chip.jsx:43` |
| `--sky-deep` (win chip's actual foreground) | `--good-bg` | ~4.6:1 | 4.5:1 (normal) | **Pass** — the shipped pairing | `src/components/Chip.jsx:44-45` |
| `--bad` `#d1483b` | `--bad-bg` `#fbeae8` | 3.84:1 | 4.5:1 (normal) | **Fail** | `src/components/Chip.jsx:46` |
| `--plum`/`quinsRedDark` `#8E1526` | `--bad-bg` | ~7.9:1 | 4.5:1 (normal) | **Pass** — the shipped pairing | `src/components/Chip.jsx:47` |
| `#5a6470` (draw) | `#eef0f2` | ~5.3:1 | 4.5:1 (normal) | **Pass** (used verbatim, no darkening needed) | `src/components/Chip.jsx:48` |
| `#77726e` | light fill (form helper text) | fails AA at that size | 4.5:1 (normal) | **Fail — do not use here** | `src/screens/PlayerForm.jsx:55` |

**`--muted` vs `#77726e` — do not conflate these, they are both real and both correct, for
different backgrounds:**

- `#5c5854` is the app-wide default for de-emphasised text **on white/`--paper` backgrounds**
  (6.417:1, comfortably passes).
- `#77726e` is a **different, deliberately lighter** value used only on tinted/card backgrounds
  that are not plain white or `--paper` (4.755:1 there — passes), and it **fails AA (4.329:1)**
  if it's ever used on white/`--paper` instead.
- Per this project's own binding ruling (carried in every task brief since it was first found),
  this exact mistake — shipping `#77726e` where `#5c5854` was needed — has happened **3+ times**
  live in this build already. `Schedule.jsx`, `Dashboard.jsx`, and `Roster.jsx` all now contain an
  explicit comment recomputing both ratios for their specific layout, precisely because of that
  history. Any future screen introducing muted text needs the same care: check what it's sitting
  on before picking which of the two values applies.

### The header-gradient contrast investigation (Task 22 — this task's main finding)

`AppShell.jsx`'s `<header>` uses a `100deg` gradient across the **full viewport width**:
`quinsRedDark 0% → quinsRed 42% → #B23A38 62% → quinsGreen`. Its content (crest, title, role
badge, `Nav`) sits inside a `mx-auto max-w-[1120px]` inner div. Below the `desktop:` (820px)
breakpoint, `Nav` detaches to a fixed white bottom tab bar and is nowhere near the gradient — no
contrast issue there, confirmed by reading `Nav.jsx`'s own breakpoint logic. At/above 820px,
though, this task found and confirmed **two separate, real, previously-undocumented AA
failures**, verified empirically (not by hand-calculation) using a real headless Chromium
instance (`/opt/pw-browsers/chromium-1194`, driven via Playwright) rendering the actual header
markup with the app's real compiled Tailwind CSS, at eight real viewport widths (820, 900, 1024,
1280, 1440, 1920, 2560, 3440px), sampling actual rendered pixel colours behind the role badge and
each nav pill (not assuming ideal/theoretical positions):

1. **Green-end failure (the hypothesis in the Task 22 brief, confirmed true).** At narrower
   desktop widths (820-1024px), the `mx-auto max-w-[1120px]` content div is edge-to-edge with the
   viewport (its max-width cap hasn't kicked in yet), so the rightmost nav pill ("More") and the
   header's own right edge land on or very near pure `quinsGreen`. Measured **before** any fix:
   white text on that background measured **2.32-2.36:1** at 820-1024px (accounting for the "More"
   link's real `desktop:opacity-[.82]` — i.e. the actual composited glyph colour, not assumed
   pure white) — a clear failure of even the 3:1 non-text minimum, let alone 4.5:1. This
   contradicts the brief's own ~1.9:1 hand-estimate only in magnitude (the real content column
   doesn't reach literal 100% green at every failing width — the true worst case sits between the
   `#B23A38` and `quinsGreen` stops), not in substance: it is a real failure either way.
   - **Widths above 1120px are NOT simply safe** — the content column doesn't just get "further
     from the edge", its position as a fraction of the viewport asymptotically approaches ~50%
     (roughly the `quinsRed`/`#B23A38` midpoint) as the viewport grows, which is why 1920-3440px
     widths tested closer to passing than 1024-1280px did, but were still marginal before the fix.
   - **Fix:** moved the gradient's final `quinsGreen` stop from `100%` to `300%` (see
     `src/components/AppShell.jsx`'s header comment). This keeps the interpolation from
     `#B23A38` (62%) toward `quinsGreen` at only ~16% progress by the time it reaches the real
     100%-width edge, so every on-screen pixel stays within the red family regardless of viewport
     width. The gradient's look at the red/crest end (left side) is completely unchanged — only
     the position of the final stop moved, not any of the four colour values or the earlier three
     stops.
   - **Re-measured after the fix**, same real-browser method, same 8 widths: the rightmost nav
     pill's true composited text colour (accounting for its 82% opacity where inactive) measures
     **4.74-5.04:1** across 820-3440px — clears AA everywhere, with the active ("Home") pill and
     hovered/full-opacity state measuring higher still (6.2-8.4:1).

2. **Role badge / active-nav-pill failure (NOT the brief's hypothesis — a separate defect this
   task found independently).** The role badge (`data-testid="role-label-desktop"`) sits at a
   roughly constant ~52-63% position along the gradient regardless of viewport width (it's pushed
   right by the header's `flex-1` spacer, not by viewport growth), landing consistently in the
   `quinsRed`→`#B23A38` transition band — never anywhere near green. Measured **before any fix**:
   white text on the badge's own `bg-white/[.16]` pill fill measured **4.06-4.46:1 at every one
   of the 8 widths tested** — under the 4.5:1 threshold everywhere, a real (if marginal) failure
   independent of the green-stop issue above, and one the gradient-stop fix does nothing for
   (this band is entirely within the *unmoved* 0-62% portion of the gradient). Root cause: the
   badge's `bg-white/[.16]` overlay **lightens** whatever red-family colour sits underneath it —
   which actively hurts contrast against white text, the opposite of what a badge fill is meant
   to do here.
   - **Fix:** changed the fill from `bg-white/[.16]` to `bg-black/[.22]` (`AppShell.jsx`'s role
     badge, and `Nav.jsx`'s identical active-pill fill, which shares the exact same defect and
     fix — verified the "Home" pill independently). A black overlay darkens the underlying red
     instead of lightening it, which increases contrast regardless of which shade of red-family
     colour is underneath at a given width. **Re-measured after the fix:** 8.33-8.49:1 for the
     badge, 8.22-8.41:1 for the active nav pill, across all 8 widths — a large, robust margin, not
     a bare pass.
   - **A third, smaller fix found by the same investigation:** the *inactive* nav pills (Schedule/
     Roster/More when not the current route) had **no background fill at all** — bare
     `desktop:opacity-[.82]` white text directly on the gradient. Even after the green-stop fix
     above, the true composited glyph colour (82% white blended over the background, not pure
     white) measured only 4.19-4.28:1 at 820-1440px — still under 4.5:1. Fixed by giving inactive
     pills their own light `bg-black/[.1]` fill (mutually exclusive with the active pill's
     `bg-black/[.22]`, never both classes on one element at once, to avoid any Tailwind
     utility-ordering ambiguity). Re-measured: 4.74-5.04:1 (accounting for the true 82%-opacity
     glyph), 6.18-6.70:1 at full opacity (hover / after the fix moves to full white on hover).

All six measurements above (2 failures × before/after) were taken with the exact same
methodology: a throwaway Playwright script driving real Chromium against the app's actual
compiled Tailwind output (via `vite`'s dev server, with the real `AppShell.jsx`/`Nav.jsx` markup
reproduced verbatim in a disposable harness page so it could render without a live Supabase
session), reading real rendered pixel colours (via a 1x1 screenshot decoded through an in-page
canvas — not CSS introspection, which can't tell you the actual composited pixel a semi-transparent
fill produces over a gradient) and computing WCAG contrast from those actual RGB values. The
harness files (`dev-harness.html`/`dev-harness.jsx`) were deleted before this work was committed
— they are not part of the shipped app.

---

## 2. Keyboard

- **Focus-visible ring convention**: `focus-visible:ring-2 focus-visible:ring-quinsRed` (plus
  `-offset-2` or `-offset-1` depending on the control) is applied to essentially every interactive
  element. Verified two ways:
  - **Real browser**: tabbed through the header/nav in the same Playwright harness described
    above, confirming Home/Schedule/Roster/More each show the ring (`box-shadow:
    rgb(255,255,255) 0 0 0 2px, rgb(194,31,50) 0 0 0 4px` — the white-offset-then-red-ring
    pattern) once the CSS `transition` on those elements settles (a naive check immediately after
    the keypress, with no wait, misleadingly reads a mid-transition value close to transparent —
    caught and corrected during this task's own verification).
  - **One real gap found and fixed**: `src/screens/Availability.jsx`'s three In/Maybe/Out toggle
    buttons (`StatusButtons`) had **no `focus-visible:ring` class at all** — a genuine exception
    to the "already everywhere" claim, caught by grepping every `<button>` in `src/screens` and
    `src/components` for a nearby ring class rather than trusting the brief's summary. Fixed by
    adding the same convention used elsewhere (`focus-visible:ring-2 focus-visible:ring-quinsRed
    focus-visible:ring-offset-1`).
  - Every other flagged file (`PlayerDetail.jsx`, `TeamPills.jsx`) turned out to already have the
    ring via a shared class constant one or more lines above the button JSX (`FOOTER_BUTTON`,
    `PillButton`'s `classes` array) — a naive nearby-line grep missed them; reading the full
    component confirmed both are already correct.
- **Sheet's focus trap / Escape / restore-on-close**: already implemented (`Sheet.jsx`'s file
  header comment cites this exact design-system.md §8 gap list and marks each item closed) and
  already covered by `tests/components.test.jsx`'s `describe('Sheet', ...)` block — dialog role/
  label, Escape-to-close, backdrop-click-to-close (but not click-inside), Tab-wraps-to-first,
  Shift+Tab-wraps-to-last, and focus-restored-to-trigger-on-close all have dedicated tests. This
  is the one screen family (event detail/add-edit, player detail/add-edit, invite form,
  availability) that shares a single `Sheet` component, so these tests cover every screen that
  opens one. Verified by reading the tests, not re-run live in a browser for this task — Task 9's
  own build+review already did that when Sheet was first built.
- **Skip-to-content link (new this task — the one confirmed-open gap from design-system.md §8)**:
  added as the very first child of `AppShell.jsx`, `sr-only` until focused, then popped into a
  fixed top-left position with the app's quinsRed/white focus styling. Points at `<main
  id="main-content" tabIndex={-1}>`. Verified with real keyboard presses in the same Playwright
  harness: before any Tab, the link is present in the DOM but genuinely visually hidden
  (`clip: rect(0px, 0px, 0px, 0px)`, 1x1px box); the very first `Tab` from a fresh page load
  focuses it (confirmed `document.activeElement` is the `<a href="#main-content">`); pressing
  `Enter` moves real keyboard focus to `<main>` itself (confirmed `document.activeElement` is the
  `<main>` element, not just a scrolled viewport); a subsequent `Tab` from there reaches the first
  real focusable element inside the routed screen, not back into the header — the whole flow
  works end to end.

---

## 3. Motion

- `src/index.css` has one global `@media (prefers-reduced-motion: reduce)` block forcing every
  animation/transition app-wide to a near-zero duration — confirmed still present and unchanged
  (`src/index.css:11-24`).
- Every place that uses a real CSS `animation` (as opposed to a `transition`, which the global
  rule above already handles) pairs it with `motion-reduce:animate-none`, and there are only
  three such usages in the whole codebase, all paired: `Sheet.jsx`'s scrim fade-in and
  slide-up/scale-in entrance animations (`src/components/Sheet.jsx:124,134`), and `Spinner.jsx`'s
  spin animation (`src/components/Spinner.jsx:20`). Confirmed via `grep -rn "animate-"
  src --include=*.jsx` that no other component introduces an unpaired one.

---

## 4. Known, accepted gaps remaining after this task

- **The warn/amber family's raw, undarkened value** (`#c9861a` on `#fbf1dd`, ~2.71:1) genuinely
  fails AA and is never fixed to pass on its own — it's used only for a border/icon-adjacent
  decorative accent, never as the sole conveyor of meaning, with the actual foreground text
  always swapped to the darkened `#8a5a12` (~5.3:1) wherever text renders on that background.
  Confirmed by reading `Badge.jsx`'s and `ScopeNote.jsx`'s own comments — this is a pre-existing,
  already-adjudicated tradeoff, restated here rather than re-litigated.
- **Colour-as-sole-differentiator** (chip colours for match/training/social, win/loss/draw) is
  always paired with the label text itself, so this is the same "minor/acceptable, not a hard
  failure" case design-system.md §8 already noted for the prototype — unchanged by this task.
  and correctly not fixed, since fixing it would mean adding icons project-wide, out of scope.
- **`theme_color` duplication** between `index.html`'s `<meta>` tag and `vite.config.js`'s PWA
  manifest config (flagged as a Task 20 follow-up, not an accessibility issue but a maintenance
  one) — still unresolved, not in this task's scope.
- **This task did not re-verify Sheet's focus trap/Escape/restore live in a browser** — it relied
  on the existing, passing unit test suite (`tests/components.test.jsx`) rather than re-running
  that check by hand, since nothing in this task touched `Sheet.jsx` and the tests already cover
  every behaviour design-system.md §8 asked for. If `Sheet.jsx` is ever modified, a fresh
  real-browser pass would still be worthwhile before shipping.
