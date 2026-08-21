# 2026-08-21 (evening) — the Squad Hub, and the whole 2.0 retheme in a day

History, not instruction. Ten PRs merged to production this session (#281,
#282, #283, #284, #285, #286, #287, #289, #290, #291 — #288 was a PARALLEL
session's phase-4 polish, woven in by rebase), every one verified from the
deployed bundle after its build, not from a green suite.

## What shipped, in order

1. **The Squad Hub** (#281, #282) — `/squad`, the coach/manager dashboard.
   Availability-vs-attendance tracking grid (excused excluded from both
   sides of the %, no-show = said-in AND marked-absent, never derived from
   one table), RSVP chips, match-sheet chasers (non-minis only), squad
   noticeboard, event drill-in reusing Dashboard's sheets. Plan:
   `claude/plans/2026-08-21-squad-hub.md`.
2. **The 2.0 retheme, all five phases** (#283 spec, #284–#287, #289) —
   `claude/plans/2026-08-21-retheme-and-shell.md`. Jay's rulings after
   touring abudhabiquins.com and its member portal (signed in, both
   measured live): look like the club, light AND dark mode, the portal's
   sidebar shell on desktop, admin on the phone, maroon replaced.
   design-system.md §−1 records what now ships.
3. **Two phone bugs from Jay's own use, fixed same hour** (#290, #291):
   the iPhone status-bar overlap (no safe-area TOP padding had ever
   existed) and squads out of order (loadTeams had no ORDER BY).

## The traps this session found, for the next one

- **The 6 Aug re-point was half the retheme already** — palette and Inter
  landed then; design-system.md §0 undersold it and this session briefly
  told Jay the app was "maroon with system fonts". The code wins; read it.
- **CSS excision broke the build, and the build caught it** — removing the
  sheen block took `@layer components`' closing brace with it. Run
  `npm run build` after any index.css surgery.
- **jsdom sees BOTH navs** — mobile tab bar and desktop sidebar are both in
  the DOM; shared destinations appear exactly twice in shell tests.
- **The harness cannot render signed-in admin data** (RLS refuses anon) —
  admin phone QA happens on deploy previews with a real login.
- **Two sessions in parallel merged within minutes** (#288 vs #289) — the
  rebase was clean but the changelog conflicted; both entries survive. If
  Jay is running two sessions, fetch before every push.
- **`var(--maroon)` had been dead since 6 Aug** — four checkboxes silently
  browser-blue. A retired token's consumers do not error; they default.

## Where the next session starts

Nothing from this session is blocked or half-done. The retheme spec is
closed. Open threads that predate it are unchanged in
`claude/open-items.md` and `state-of-play.md`'s Blocked-on-Jay list.
Worth watching: first real coach reaction to the Squad Hub's tracking
grid, and whether dark mode surfaces contrast complaints the gate's
arithmetic could not predict.
