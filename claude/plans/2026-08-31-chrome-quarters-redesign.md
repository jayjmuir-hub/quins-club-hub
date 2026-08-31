# The chrome-quarters redesign — dark premium bars with ghosted harlequin quarters

**Status: SHIPPED (PR pending merge, 31 Aug 2026).** This file is the
design record; the implementation plan follows it. Ship it and this line
changes.

## What Jay asked for, and how the choice was made

"Now let's think about the redesign of those bars so they look better." The
current bars — clear liquid-glass islands from the 23–24 Aug passes — read
as **too plain / not premium** and **not on-brand enough** (his words, from
the two options he picked). Three directions were rendered as CSS overrides
on the real harness page (subtle-enriched glass / premium dark chrome /
full harlequin quarters); Jay chose **dark chrome with a hint of the
quarters**, then picked the **hint intensity (~30%)** over whisper (~15%)
from side-by-side renders in both themes.

## The design

### 1. Material — both bars, both themes

`.glass-island` / `.glass-dock` in `src/index.css` become:

- **Base:** near-black gradient chrome, `#151517 → #0c0c0e` at 94–97%
  opacity, `backdrop-filter` blur retained so a sliver of content still
  ghosts through the remaining transparency.
- **Quarters:** two ghosted diagonal blocks over the base — club red
  (`#e11b22`) sweeping in from the LEFT at ~0.30 alpha, club green
  (`#006a4d`) from the RIGHT at ~0.26 — the quartered-shirt echo.
- **Edges:** a white inner top hairline (inset shadow, ~9% white) so the
  islands hold their outline over dark-mode content, plus the existing
  red→green `brand-rule` kept on the top edge.
- **Fallback:** where `backdrop-filter` is unsupported, solid `#151517`
  (replaces the current `--surface-card-rgb` fallback, which would now be
  wrong — light card under white text).
- **Identical in light and dark mode.** Chrome is the brand's, content
  wells belong to the theme — the standing "identity lives on the chrome"
  ruling from the 2.0 retheme, restored.

**The opacity cap is a rule, not a taste:** quarters stay ≤0.30 so the red
active pill and the unread dots always dominate them. The Chat dot sits on
the green sweep and reads clearly at 0.26 (verified in the renders); raise
the quarters and that stops being true.

### 2. Content on the chrome

- Nav idle icons and captions: theme ink → **white/92** (active pill
  unchanged — white on its own red, always was).
- Masthead ink tokens (wordmark, chevron, theme-toggle icon): light-on-
  chrome equivalents. The role chip and the avatar disc keep their own
  fills and are untouched.
- This **partially reverses the 24 Aug clear-glass ink decision** — and
  the reversal is sound, not drift: ink went theme-aware because the bars
  were transparent and had to read over whatever scrolled beneath. The
  chrome is opaque again, so the premise is gone. (The 28 Aug "full ink,
  not ink/90" fix was about the same transparency and retires with it.)

### 3. What does NOT change

Geometry (insets, the min-[360px] gate, the 300px parent island), the
glider pill and its measurement math, captions, auto-hide, the liquid-lens
SVG filter chain (it keys off the same classes and keeps working over the
darker base), Sidebar (already dark), ViewAsBanner.

## Arguments against, recorded

- **"Clear glass is more modern (iOS-like)."** It is — but it scored
  "too plain, not on-brand" with the person the app is for, and its
  legibility depends on whatever scrolls underneath, which cost two
  correction passes (24 Aug contrast arithmetic, 28 Aug faint-ink fix).
- **Full quarters (option C)** were rendered and rejected: icons fight the
  pattern (the Chat dot sat on a strong green block).
- **A theme-following chrome** (light bars in light mode) was implicitly
  rejected by choosing B — and would re-open every contrast question the
  dark chrome closes.

## Proof plan

1. `scripts/contrast-check.mjs` measures white/92 against the chrome
   gradient (expected far past AA, but measured, not asserted).
2. Class-pinning tests in `tests/nav.test.jsx` and
   `tests/app-shell.test.jsx` update to the new tokens; each new assertion
   proven against an injected fault (revert the token, watch exactly that
   test fail).
3. Harness PNGs at 375px, both themes, before merge — Jay signs off on the
   real render, not the mock.
4. Live-bundle verification after deploy with escape-aware `grep -F`
   patterns and a control sharing the target's special characters
   (memory: grep-controls-must-share-the-failure-mode).

## Files

`src/index.css` (the two glass recipes + fallback), `src/components/Nav.jsx`
(idle link colour), `src/components/AppShell.jsx` (masthead ink tokens),
`tests/nav.test.jsx`, `tests/app-shell.test.jsx`,
`claude/specs/design-system.md` (a §−1 addendum recording that clear glass
retired and why).
