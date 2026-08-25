# 2026-08-25 — Roster builder: three views over one lineup

**Status: phase 1 SHIPPED (this branch); phase 2 (pitch share style + drag-onto-pitch) not started.**

Jay, 25 Aug 2026: a drag-and-drop match roster builder, format-aware
(players per side varies by age group), and the simple tap path must stay
for making a team sheet to send to parents. "Build all 3" — quick pick,
numbered slots, pitch view.

## The shape: one picker, three VIEWS — not three builders

One state, one save (`lineups` + `lineup_players`), one share pipeline.
The view toggle only changes how the same roster is looked at and touched:

| View | What it adds | Interaction |
|---|---|---|
| Quick | nothing — today's flow, unchanged | tap Start / Bench |
| Slots | shirt numbers + position names per format | tap a slot to fill, drag to reorder |
| Pitch | per-format field layout | tap a circle to fill, tap two to swap |

- **Format is data, not UI** — `src/lib/rosterFormats.js` holds one preset
  per players-per-side value (5/7/9/10/12/13/15): position names and pitch
  coordinates. Every view reads the same preset. Adding a format is a data
  row. ⚠️ Position names are a GUIDE, like players_per_side itself — the
  save writes them onto `lineup_players.position` for the slotted starters,
  and nothing anywhere refuses a roster over them.
- **The parent sheet is a render, not a view.** Share produces the same
  image whatever view the coach used. Phase 2 adds "pitch" as a second
  STYLE of that image.
- **Slot model.** Starters carry a `slotIndex` (shirt − 1). Quick-adds take
  the lowest free slot. Over-picking past the format (allowed — guide, not
  gate) shows as unnumbered extras under the slots. `sort_order` on save is
  slot order, then extras, then replacements — so MatchSheet's seed and the
  share image inherit shirt order for free.

## Drag: hand-rolled pointer events, no dependency

`src/lib/useDragReorder.js` (+ pure `targetIndex()` for the math). Pointer
events work on touch; `touch-action: none` on the HANDLE only, so the page
still scrolls from everywhere else. Tap-to-assign stays everywhere as the
accessible path — drag is additive. This re-opens the 14 Aug no-drag
ruling with its objections answered, not ignored:
`claude/decisions/2026-08-25-drag-reopened.md`.

## Phases

1. **(this branch)** `rosterFormats.js`, view toggle (Quick default —
   every existing lineup test passes untouched), Slots view with
   tap-assign + drag reorder, Pitch view tap-first, positions written on
   save.
2. Pitch-style share image (coach picks list or pitch at share time);
   drag-onto-pitch polish; per-club format editing if ever asked for.

## What deliberately did NOT change

- Quick view markup and behaviour — the tests in tests/lineup.test.jsx and
  tests/lineup-eligibility.test.jsx are the contract, including the
  measured layout guards jsdom cannot see.
- Coach-only, parents get an image (14 Aug ruling, untouched).
- Guide-not-gate counting; picking someone who said no stays possible and
  stays collapsed.
- The share facsimile carries names and never grades.
