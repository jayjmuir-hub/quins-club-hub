# 2026-08-25 — Drag-and-drop re-opened for the roster builder

**Supersedes the 14 Aug 2026 "NOT DRAG AND DROP, deliberately" ruling in
`src/screens/Lineup.jsx` — re-opened by Jay himself** ("lets design a drop
and drag match roster builder", 25 Aug 2026). The old ruling's three
objections were real; each is answered, not waved away:

| 14 Aug objection | 25 Aug answer |
|---|---|
| HTML5 drag does not work on touch at all | Not HTML5 drag. Pointer events (`pointerdown/move/up` + `setPointerCapture`), which are the same API for mouse and touch. `touch-action: none` on the drag HANDLE only, so the page still scrolls from everywhere else. |
| A pointer-events library is ~30KB on a bundle that already warns | No library. `src/lib/useDragReorder.js` is ~120 lines in-repo, and the pitch drop targets in phase 2 reuse the same primitives. Zero dependency added. |
| An accessible keyboard path must exist anyway, so drag is a second implementation of one piece of state | Still true, and kept: tap-to-assign remains on every view and is the only path the tests REQUIRE. Drag calls the same `move()` state transition the tap path uses — one implementation, two gestures. |

**What did not change:** coach-only; parents get an image; guide-not-gate
counting. The 14 Aug ruling stays in the git history and in the plan file
it shipped with; this record is why the screen now contradicts it.
