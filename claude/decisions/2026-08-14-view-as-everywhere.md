# View-as moves back into the masthead, on every screen

**14 Aug 2026.** Jay: *"i want to be able to select view as with a drop down
from any screen, as an admin"*.

This **overturns the 7 Aug 2026 decision** to move `ViewAsSwitcher` out of the
masthead and onto `/admin`. That decision is recorded at its old call site in
`src/components/AppShell.jsx` and was correct on its own terms; what follows is
why the conclusion changes and the reasoning does not.

## What the 7 Aug decision actually said

Not *"this control does not belong in the masthead"*. It said the masthead row
could not afford **84px of text pill**:

```
crest 46 | role pill 75 | account 77 | View-as 84 | nav 492
club wordmark gets 238px, needs 257 -> "ABU DHABI HARLE…"
```

⚠️ **The mechanism is the thing to carry: every item in that row is `shrink-0`
except the club wordmark, so the wordmark absorbs 100% of any overflow.** It
does not wrap, it does not scroll, it truncates — and it truncates on
production, where nobody is measuring, because jsdom applies no CSS and no unit
test in this repo can see a layout overflow.

## What changed

**The control, not the constraint.** The 84px text pill is now a **32px icon
button**, and the persona it used to spell out is already stated in full, at
every width, by `ViewAsBanner` directly above it. The masthead was restating the
banner and charging the wordmark for it.

## Measured, not reasoned

Harness scenario `view-as` (real component, real Tailwind, real React state),
Chromium, admin, not previewing:

| | |
|---|---|
| Trigger width | **32px** |
| Wordmark box / natural text | 257 / 257 — **not truncated** |
| Slack remaining in the row | **296px** |
| Menu at 375px | 264px wide, sits 95→359, no document overflow |
| Menu at 320px | sits 40→304, no document overflow, no inner scroll |
| Escape | closes, and focus returns to the trigger |

⚠️ **THE SLACK FIGURE IS A PROBE RESULT, NOT AN INFERENCE.** A spacer was grown
in the flex row until the wordmark gave way; it first gives at **+296px**, which
is exactly the measured width of the row's `flex-1` spacer. Two independent
routes to the same number is what makes it worth writing down.

⚠️ **AND `scrollWidth > clientWidth` IS THE WRONG TRUNCATION DETECTOR HERE — it
never fires.** The first probe run reported "not truncated" at every width right
up to a 142px box, which reads as a pass and is a broken check. The wordmark
gives way by re-flowing rather than by overflowing its own box, so what works is
comparing the **natural text width** (`Range.selectNodeContents`) against the
box. **A check that cannot go red is not a check**, and this one had to be
replaced before any of the numbers above meant anything.

## What was decided beyond "put it back"

- **It renders at EVERY width**, not `desktop:` only. The old control was
  desktop-only partly because it was a desk-bound tool and partly because the
  row had no room. An admin on a touchline checking what a parent sees is the
  case Jay described, and 320px is verified above.
- **It is a dropdown, not a `Sheet`.** Asked for by name, and right anyway: a
  full-screen modal on a phone is heavier than the thing it previews. ⚠️ The
  cost is that Escape, outside-click and focus-return are now **hand-written**
  in `ViewAsSwitcher`. The account link two elements away is deliberately a
  plain `<Link>` *because* nobody wanted to write those; `tests/view-as.test.jsx`
  is what stands behind them now.
- **The menu groups by squad and labels rows "Coach" / "Parent"**, which is what
  keeps it usable on a phone. ⚠️ **Each row carries an `aria-label` of "Coach of
  U12 Boys"**, because a visual group heading is a visual association only —
  without it a screen reader gets fifteen buttons all called "Coach". The
  heading itself is `aria-hidden`.
- **`AdminDashboard` lost its copy entirely**, rather than keeping one alongside.
  Two copies of one control drift, and on that screen they would have sat six
  inches apart doing the same job. The `PreviewingNotice` copy was reworded: it
  said "change who you are previewing **below**", and "below" now points at
  nothing.

## ⚠️ It shipped clipped, and the check that missed it is the lesson

**14 Aug 2026, reported from a screenshot minutes after the deploy.** The panel
was `absolute` inside the trigger's wrapper, and **the masthead row carries
`overflow-hidden`** — deliberately, to clip the `harlequin` diagonals that bleed
off its right edge. An absolutely-positioned child of a clipped ancestor is
clipped with it, so the dropdown rendered as a ~6px sliver.

⚠️ **THE PRE-MERGE MEASUREMENT WAS INCAPABLE OF SEEING IT.** It asked
`getBoundingClientRect()` whether the menu sat inside the viewport, and it did —
264px at 40→304 on a 320px screen. **A layout box reports its full size even
when an ancestor is visually clipping it to nothing.** Measured afterwards with
the bug injected back in:

| | rect | sample points hitting the menu |
|---|---|---|
| Portalled (fixed) | 264 × 475 | **5/5** |
| Back inside the clipped row | **264 × 475 — identical** | **0/5** |

**Geometry and visibility are different questions, and only one of them is the
one a person asks.** Use `document.elementFromPoint` on sampled points inside
the element; a rect cannot answer it.

**The fix:** the panel is portalled to `<body>` and positioned `fixed` from the
trigger's rect, recomputed on resize and on capture-phase scroll.

⚠️ **`position: fixed` escapes the clip only because no ancestor sets
`transform` / `filter` / `perspective`** — any of those would become the
containing block and re-clip it. `Sheet.jsx` depends on exactly the same
property and states the same caveat; if a page-transition wrapper ever adds a
transform, both break together.

⚠️ **PORTALLING CHANGED THE OUTSIDE-CLICK RULE, AND GETTING IT WRONG WOULD HAVE
BEEN SILENT.** The panel is no longer inside the trigger's wrapper, so the
handler must test **both** refs. Wrapper-only would treat every click on a menu
item as "outside", closing the menu on `pointerdown` before the click landed —
choosing a persona would simply do nothing.

## What must not be undone

⚠️ **DO NOT PUT THE PERSONA TEXT BACK ON THE TRIGGER.** "Coach, Senior Men 2nd
XV" is 200px+ and re-creates the exact 7 Aug failure. The banner says it; the
`aria-label` and `title` say it; the masthead must not.

⚠️ **RE-MEASURE WITH THE PROBE BEFORE CHANGING THE TRIGGER'S WIDTH AT ALL** —
and use the natural-text detector, not `scrollWidth`.

⚠️ **Every gate in `ViewAsSwitcher` reads `realMemberships`, never the effective
`memberships`.** While previewing as a parent `isAdmin(memberships)` is false;
gating the trigger on it would hide the only way out and soft-lock the admin.
That requirement is older than this decision and unchanged by it — it is now
tested from an ordinary screen rather than from `/admin`, which is strictly
stronger.

## Not done

❌ **No arrow-key roving focus.** The menu items are real buttons in DOM order,
so Tab works and Escape works; ↑/↓ do not move between items. A menu of 31 items
in a fifteen-squad club is a lot of tabbing, and this is the obvious next
improvement.
❌ **`npm run check:overflow` was not run** — Playwright is still not installed
on jay-pc. The widths above were driven in Chromium by hand.
