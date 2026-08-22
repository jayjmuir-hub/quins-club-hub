# 2026-08-22 — the invisible text that wasn't

History, not instruction. The night-and-morning debugging arc that followed
the 2.0 retheme (#294–#303), ending in a one-class-string fix.

## What it looked like vs what it was

Jay's phone rendered the Squad Hub and its player sheet as near-empty black
(then near-empty white in light mode): both themes, Chrome AND the installed
app, surviving reinstall and a site-data wipe. It looked exactly like a
dark-mode colour bug — and the session spent four hours fixing REAL colour
bugs it found along the way (217 fill-red-as-text call sites, the missing
color-scheme declaration, the bg-ink/text-white pill) that were all worth
fixing and none of which were IT.

It was the Squad Hub header's squad-switcher chip row: `shrink-0` +
flex-wrap, which pins the row at max-content width. An ADMIN carries all
fifteen squads ≈ 1127px, the document blew out to 1142px on a 360px phone,
and opening a sheet re-fit the visual viewport to 32%. The text was never
invisible. It was outside the zoomed view. `claude/changelog.md` (22 Aug)
has the full chain; the fix is `min-w-0` and the proof is the harness
overflow gate, which now runs `squadhub-admin` and fails 5 width pairs with
the fault re-injected.

## The lessons, ranked by what they cost

1. **The repo already knew.** "A row that overruns does not clip: the
   DOCUMENT gets wider than the viewport, on screens three away from the
   cause" — written in bold in AdminDashboard, backed by a purpose-built
   harness gate. The row was written by the same session that had read it.
   New UI with a variable-count flex row goes INTO the overflow gate the
   day it is born, with its LARGEST fixture (the coach fixture's two squads
   could never reproduce what fifteen did).
2. **Measure on the device, and make the culprit name itself.**
   `src/components/PaintDebug.jsx` (flag-gated, `?paintdebug=1`) ended in
   two screenshots what remote theorising could not in four hours — the
   moment it reported layout width (1142) and the widest element (the chip
   row, by class and text). KEPT, not deleted: it costs nothing gated off,
   and the next impossible phone is a screenshot away. Its header still
   says TEMPORARY; repoint that comment on the next src-touching change.
3. **Exit codes, never grep, decide green.** #299 merged half-patched and
   unparseable because a piped grep masked six transform-failed files.
   Netlify's build refused it (production was never at risk) — but the
   suite verdict must come from the command's exit code.
4. **Distrust a probe in a hidden browser tab.** A non-compositing page
   never advances CSS transitions; the contrast probe read buttons frozen
   mid-fade and reported phantom 1.1:1 ratios. A real renderer (headless
   Playwright composits) or a visible pane, always.
5. **"Browser too" proved less than it seemed** — the service worker
   controls plain browser tabs on the same origin, and an armed debug flag
   outlives a reinstall. Independence of evidence has to be checked, not
   assumed.

## Also true this morning

GitHub Actions stalled repo-wide for ~1h40 (nothing triggered 17:41–06:58);
#296–#302 went in on Jay's explicit admin override with local green as
evidence, and #303 — the real fix — passed full CI after recovery and turned
main's docs-check green again.
