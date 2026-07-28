# Task 22 report — End-to-end role + a11y verification, release docs (FINAL TASK)

## Summary

This was primarily an audit task (the brief was explicit that most of design-system.md §8's
accessibility gaps were already closed by earlier tasks without a dedicated a11y task ever
existing) plus three new documents and one genuinely new piece of UI (the skip-to-content link).
The audit found and fixed real, previously-undocumented bugs in two places the brief flagged as
uncertain: the header gradient's contrast at desktop widths (confirmed a real AA failure, in two
separate ways, both fixed) and a missing focus ring on `Availability.jsx`'s status toggle buttons
(found by direct inspection, not assumed away). Everything else the brief asked me to "verify,
don't just trust" (Sheet's dialog/focus-trap, icon `aria-label`s, `role="alert"`, calendar day
cells as real buttons, `prefers-reduced-motion`) checked out as already correct.

## Files touched

- `src/components/AppShell.jsx` — gradient's final colour stop moved from `100%` to `300%`; role
  badge's fill changed from `bg-white/[.16]` to `bg-black/[.22]`; new skip-to-content link as the
  very first child; `<main>` given `id="main-content"` + `tabIndex={-1}` + `focus:outline-none`.
- `src/components/Nav.jsx` — active pill's fill changed from `bg-white/[.16]` to
  `bg-black/[.22]`; inactive pills now get their own `bg-black/[.1]` fill (previously no fill at
  all — bare text on the gradient).
- `src/screens/Availability.jsx` — added the missing `focus-visible:ring-2
  focus-visible:ring-quinsRed focus-visible:ring-offset-1` to the three In/Maybe/Out toggle
  buttons.
- `tests/app-shell.test.jsx` — 2 new tests for the skip link (first-focusable-element ordering,
  href/target correctness, `<main>`'s programmatic focusability; `sr-only`/`focus:not-sr-only`
  class tokens present).
- `docs/accessibility.md` — new. Consolidated accessibility reference (see below for the file-split
  reasoning).
- `docs/e2e-roles.md` — new. End-to-end role/scoping checklist.
- `docs/deploy.md` — new. Netlify/host env vars, `adhjrt.com` trial steps, Supabase redirect-URL
  config.

Not touched: `docs/design-system.md` §8 was deliberately left as-is (see "Design-system.md §8 —
deliberately not edited" below).

## The header-gradient contrast investigation — real measured numbers, real widths

This was the brief's central open question, and I did not trust the hand-calculation in the
brief (which itself said not to). Method: a throwaway Node script
(`/tmp/gradient-check.js`, deleted, never committed) drove real headless Chromium
(`/opt/pw-browsers/chromium-1194`, via `/home/claude/.npm-global/lib/node_modules/playwright`,
since neither an npm-local `playwright` package nor claude-in-chrome — which drives the user's
own desktop browser, unreachable from a sandbox localhost server — were viable here, matching
Task 20's precedent exactly) against a real `vite` dev server serving a throwaway harness page
(`dev-harness.html`/`dev-harness.jsx`, deleted before commit, never part of the shipped app) that
reproduced `AppShell.jsx`'s real header markup and imported the real `Nav.jsx` and the real
compiled `src/index.css`, at 8 real viewport widths: **820, 900, 1024, 1280, 1440, 1920, 2560,
3440px**. Pixel colours were read via a genuine rendered-pixel method (a 1x1 `page.screenshot()`
clip, decoded through an in-page `<canvas>`/`<img>`, not CSS introspection — CSS introspection
can't tell you what colour a semi-transparent fill actually composites to over a moving
gradient).

**Two separate, real AA failures were found, both fixed, both re-measured after the fix:**

1. **Green-end failure** (the brief's own hypothesis, confirmed true, though the real magnitude
   and width-range differed slightly from the brief's hand-estimate). At 820-1024px, the header's
   `mx-auto max-w-[1120px]` content column is edge-to-edge with the viewport (below its max-width
   cap), so the rightmost nav pill ("More") lands very close to the gradient's green end.
   **Measured before fix** (accounting for the "More" link's real 82%-opacity text, i.e. the
   true composited glyph colour, not an assumed pure white): **2.32-2.36:1 at 820-1024px** — fails
   even the 3:1 non-text minimum. **Fix**: moved the gradient's last stop from `100%` to `300%`
   (`AppShell.jsx`'s header comment explains the reasoning) — this keeps the interpolation toward
   `quinsGreen` at only ~16% progress by the real 100%-width edge, regardless of viewport width,
   without touching the earlier three stops or any of the four colour values (the red/crest end
   is unchanged, per the brief's constraint). **Re-measured after fix**: 4.74-5.04:1 across all 8
   widths (accounting for the true 82%-opacity glyph) — clears AA everywhere, with a healthy
   margin at the widest tested widths (up to 6.7:1 at full opacity/hover).

2. **Role badge / active-nav-pill failure — a second, separate defect the brief did NOT
   hypothesize, found by this task's own measurement.** The role badge sits at a roughly constant
   ~52-63% position along the gradient regardless of viewport width (pushed right by the header's
   `flex-1` spacer, not by viewport growth) — nowhere near green, always within the
   `quinsRed`→`#B23A38` band. **Measured before fix**: white text on the badge's
   `bg-white/[.16]` pill fill measured **4.06-4.46:1 at every one of the 8 widths** — under
   4.5:1 everywhere, independent of the green-stop issue (this band is entirely within the
   *unmoved* portion of the gradient, so fix #1 does nothing for it). Root cause: a *white*
   overlay **lightens** the red underneath it, which is the wrong direction for contrast against
   white text. **Fix**: changed the fill to `bg-black/[.22]` (badge and the identical
   active-nav-pill fill in `Nav.jsx`, which shares the exact same defect). **Re-measured after
   fix**: 8.33-8.49:1 (badge), 8.22-8.41:1 (active pill) — a large, robust margin, not a bare
   pass. A third smaller fix fell out of the same investigation: inactive nav pills had **no
   fill at all** (bare 82%-opacity text on the gradient), which even after fix #1 measured
   4.19-4.28:1 at 820-1440px — still under 4.5:1. Given a light `bg-black/[.1]` fill
   (mutually exclusive with the active pill's `/.22]`, never both classes on one element, to
   avoid depending on Tailwind's utility-ordering to resolve a conflict) — re-measured 4.74-5.04:1.

Full per-width numbers for both failures, before and after each fix, are recorded in
`docs/accessibility.md` §1's "header-gradient contrast investigation" subsection, along with the
exact methodology (so it's reproducible later without needing this report).

**A methodological note worth being explicit about**: my first pass at this measurement used
pure white (255,255,255) as the foreground for every calculation, which is correct for
full-opacity text (the role badge, the active pill) but **overstates** contrast for the inactive
nav pills' `desktop:opacity-[.82]` text — the true rendered glyph colour is a blend of 82% white
over 18% of whatever sits underneath, which is measurably darker (and lower-contrast) than pure
white. I caught this by deliberately recomputing with the correct blended glyph colour rather
than trusting the first pass's "looks fine" numbers, and it changed the verdict for the inactive
pills specifically (they needed the third fix above, which the pure-white numbers alone would not
have surfaced).

**A second thing I initially misread as a bug and then correctly ruled out**: an early real-browser
tab-through of the header showed `box-shadow: 0 0 0 0` (no visible focus ring at all) for three of
the four nav links. Before concluding the focus-visible ring was broken, I re-ran the same check
with a short wait after each `Tab` keypress and found the ring renders correctly — my first script
was reading `getComputedStyle` mid-`transition` (the Nav link's own `transition` class animates the
ring's box-shadow in from 0), catching a near-zero interpolated value rather than the settled one.
This is recorded in `docs/accessibility.md` §2 as a methodology note, not a real finding.

## Skip-to-content link

Added as the very first child of `AppShell.jsx`, `sr-only` by default,
`focus:not-sr-only focus:fixed ...` on focus (same quinsRed/white styling convention as every
other focus treatment in the app), pointing at `<main id="main-content" tabIndex={-1}>`. Verified
in the real-browser harness with actual keypresses (not just class-token assertions):

- Before any `Tab`: present in the DOM but genuinely visually hidden — measured
  `clip: rect(0px, 0px, 0px, 0px)`, a 1x1px box.
- First real `Tab` from a fresh page load focuses it (`document.activeElement` was the
  `<a href="#main-content">`) — confirmed it really is the first focusable thing, not just
  first-in-markup.
- `Enter` moves real keyboard focus to `<main>` itself (`document.activeElement` became the
  `<main>` element) — this is the part a bare anchor-link jump would NOT do on its own (it moves
  the viewport, not focus, unless the target is itself focusable — hence `tabIndex={-1}` on
  `<main>`).
- A subsequent `Tab` from there reaches the real first focusable element inside the routed
  screen (a button in the harness's stand-in content), not back into the header — the whole flow
  works end to end, not just the first hop.

Also covered by 2 new jsdom unit tests in `tests/app-shell.test.jsx` (ordering/target/class-token
assertions — the things jsdom can actually verify; the visual-hiding and focus-ring-colour claims
above are real-browser-only claims, stated as such in `docs/accessibility.md`).

## Availability.jsx focus-ring gap — a real finding from the "verify, don't trust" audit

The brief's list of "already done" a11y claims included "focus-visible rings are already applied
on essentially every interactive element... verify this by actually tabbing through the app... not
just by grepping for the class." I did a more thorough check than a single grep: for every
`<button>` in every file under `src/screens` and `src/components`, I checked whether a
`focus-visible:ring` class was present either directly on the button or via a shared class
constant used above it in the same file (to avoid false negatives from constants like
`PlayerDetail.jsx`'s `FOOTER_BUTTON` or `TeamPills.jsx`'s `PillButton`, both of which turned out to
already be correct once read in full). One genuine gap survived that check:
`Availability.jsx`'s `StatusButtons` (the In/Maybe/Out toggle row) had **no focus-visible ring
class at all**. Fixed with the same convention used elsewhere in the app
(`focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-1`).

## Other claims verified (not re-fixed — already correct)

- Sheet's `role="dialog" aria-modal="true"`, focus trap (Tab/Shift+Tab wrap), Escape-to-close,
  focus-into-panel-on-open/restore-to-trigger-on-close: already implemented, already covered by
  dedicated tests in `tests/components.test.jsx`'s `describe('Sheet', ...)` block. I read those
  tests rather than re-running them live in a browser (nothing in this task touched `Sheet.jsx`),
  and state that distinction explicitly in `docs/accessibility.md` rather than implying a browser
  re-check that didn't happen.
- Icon-only button `aria-label`s: confirmed present verbatim as the brief described —
  `Sheet.jsx`'s `aria-label="Close"`, `Schedule.jsx`'s `aria-label="Previous month"`/`"Next
  month"`, `Roster.jsx`'s `aria-label="Search players"`, `Nav.jsx`'s `aria-label="Primary"` on the
  `<nav>` itself.
- Calendar day cells with events: confirmed real `<button>` elements (`Schedule.jsx`), not
  `cursor:pointer` divs.
- `role="alert"` usage: confirmed present (25 instances across `src/`, a broader count than the
  brief's "13" since that number was scoped to 4 specific files the brief named — both counts are
  consistent, just different scopes).
- `prefers-reduced-motion`: confirmed the global `@media (prefers-reduced-motion: reduce)` block
  in `src/index.css` is unchanged and still forces near-zero transition/animation durations
  app-wide. Confirmed `motion-reduce:animate-none` is paired with every real CSS `animation` in
  the codebase — there are only three such usages total (`Sheet.jsx`'s scrim/slide-up/scale-in,
  `Spinner.jsx`'s spin), all paired, confirmed by grepping for every `animate-*` class in
  `src/**/*.jsx`.
- The Task 12-deferred "jersey number is aria-hidden with no accessible fallback" concern (from
  `progress.md`'s Task 12 minor-deferred note) turned out to be **moot**: the club doesn't use
  jersey numbers at all (a design decision already shipped — see the `edc0d08`/`e1a28e6` commits
  in `docs/design-system.md`'s git history), and `Roster.jsx`'s roster row tile is an initials
  avatar, `aria-hidden` because it restates the adjacent visible name — a correct pattern, not a
  gap. Noted this explicitly in `docs/accessibility.md` rather than silently dropping the old
  deferred note.

## Design-system.md §8 — deliberately not edited

`docs/design-system.md` §8 still lists all of the original prototype's gaps as "absent," even
though most are now closed. I checked git history (`git log -- docs/design-system.md`) and
confirmed no earlier task ever went back to edit §8 as it closed gaps (Sheet's focus trap, icon
`aria-label`s, etc. were all closed without a corresponding design-system.md edit) — this appears
to be a deliberate project convention: `design-system.md` documents the *original prototype's*
spec as a historical reference, and `docs/accessibility.md` (new, this task) is the up-to-date
living reference for actual current state. I followed that same convention rather than retrofit
§8, and said so explicitly in `docs/accessibility.md`'s own header rather than leaving the
inconsistency unexplained.

## docs/accessibility.md — file-split reasoning

Chose a separate file over folding into `docs/e2e-roles.md`, stated in the doc's own opening
section: the two serve different audiences and different moments.  `e2e-roles.md` is a
one-time-per-account-set checklist Jay runs after real accounts exist; `accessibility.md` is a
standing reference anyone (Jay, a future contributor, a future Claude session) consults later to
answer "is this colour pairing safe" or "has keyboard/motion/skip-link been checked" without
re-deriving it. Folding them would make the checklist longer to scan for its actual purpose and
make the accessibility reference harder to find on its own.

## docs/e2e-roles.md

Written as a checklist grounded in the actual RLS policies (cited from `progress.md`'s Task
16/21 live-verification entries and `task-15-report.md`'s explicit policy text — `can_see_team`,
`can_edit_team`, `is_own_player`, the `player_contacts` "contact read"/"contact edit" split) and
the actual client-side scope helpers (`src/lib/scope.js`). Per the brief, I did not (and could
not, per the club's real setup state) run this checklist end-to-end against real
admin/coach/parent accounts — there is no seeded real membership data yet, the Wild Apricot import
being a separate future step. Each item is phrased as a concrete, falsifiable step, including
direct-URL-manipulation checks to distinguish "the UI hides this" from "RLS actually refuses this
server-side," and covers admin/coach/parent/player plus the Task 16 realtime RSVP behaviour, and
states plainly (in its own closing section) what it does not cover.

## docs/deploy.md

Covers build-time env vars (`VITE_SUPABASE_URL`, the publishable `VITE_SUPABASE_ANON_KEY` — never
the secret key), Netlify as the concrete example host (with an explicit note that Vercel/
Cloudflare Pages/Jay's existing host follow the same three settings), the `adhjrt.com` trial
subdomain's DNS/CNAME steps and the "no iframe" constraint (with the reason — Supabase Auth's
redirect flow breaks inside an iframe), the exact Supabase Authentication → URL Configuration
change needed (Site URL + Redirect URLs) and what breaks if it's skipped, and the later
`abudhabiquins.com` re-pointing step. Ends with an explicit "who does what" table distinguishing
Jay's account-setup/DNS/click actions from what's already correct in this repo.

## Test results

- Before this task: 535 tests passing across 23 files (per `RESTORE.md`).
- After this task: **537 tests passing across 23 files** — 2 new tests in
  `tests/app-shell.test.jsx` for the skip link, all existing 535 still green, no regressions.
- `npm run build` is clean. Confirmed the built CSS actually contains the fixed gradient
  (`linear-gradient(100deg,#8e1526,#c21f32 42%,#b23a38 62%,#7dc351 300%)`) and the new
  `bg-black`/`sr-only` classes by grepping the real `dist/assets/index-*.css` output directly,
  not just trusting the source edit.

## Self-review against binding rulings

- **No native `confirm()`**: confirmed absent from every file touched this task.
- **`--muted` text colour precision**: `docs/accessibility.md` §1 explicitly documents the
  `#5c5854`-vs-`#77726e` distinction and the "shipped wrong 3+ times already" history, per the
  binding ruling's own wording — did not blur the two values together anywhere in the new docs.
- **No jersey numbers**: confirmed no new UI touches this; the Task-12-deferred jersey concern was
  found moot (see above) rather than reintroducing numbers to "fix" it.
- **Scoped to this task**: the only app-code changes are the header/nav contrast fixes, the skip
  link, and the one `Availability.jsx` focus-ring fix — no unrelated screens/components touched.
  The throwaway Playwright harness files (`dev-harness.html`/`dev-harness.jsx`) and verification
  scripts (`/tmp/gradient-check.js`, `/tmp/skiplink-check.js`, `/tmp/tabthrough-check.js`) were all
  deleted from the repo working tree before this commit — `git status` shows none of them.

## Concerns / follow-ups for later

1. `docs/design-system.md` §8 still reads as if the original prototype's gaps are all still open.
   This is consistent with how every prior task has handled it (see above), but if this project
   ever wants a single spec document instead of "design-system.md (historical) +
   accessibility.md (current)," that's a small future cleanup, not urgent.
2. The gradient fix (`300%` stop, `bg-black` overlays) was verified at 8 real widths
   (820-3440px) — comfortably covers realistic desktop/laptop/external-monitor use. An
   extreme ultra-wide monitor beyond 3440px was not tested; the underlying math (content's
   position as a fraction of viewport width asymptotically approaches ~50%, safely within the red
   family, as viewport grows) predicts it stays safe, but this wasn't empirically re-verified past
   3440px.
3. `docs/e2e-roles.md` is, by necessity, un-run end-to-end against real accounts (none exist yet).
   It should be treated as "ready to execute," not "already executed" — the first real run of it,
   once real admin/coach/parent accounts exist, is itself the actual verification this project
   still needs before wider rollout.
4. This is the last task in the v1 MVP plan. `RESTORE.md` should be updated to reflect Task 22's
   completion and the new document set — I have not edited `RESTORE.md` myself as part of this
   task's diff (it wasn't listed as a deliverable in the brief), but whoever picks this up next
   should update its "22 of 22 tasks complete" status and mention the three new `docs/` files.
