# Task 16 — Independent Browser Verification (Availability RSVPs + coach team-sheet)

Repo: `/home/claude/quins-club-hub`, branch `build/v1-mvp`, HEAD `4ffbb30`.
Tool: Playwright (`chromium 141.0.7390.37`, via `/opt/node-tools/node_modules/playwright`),
harness dev server on `http://localhost:5199` (`harness/vite.config.js`).

New harness artifacts added for this pass (not part of the app build):
- `harness/shoot-availability.mjs` — the main scripted run (19 logged cases,
  report at `screenshots/task16-availability/report.json`).
- `harness/main.jsx` — added an `availability` scenario that mounts
  `src/screens/Availability.jsx` directly (same pattern as the existing
  `playerform` scenario), parameterised by `?who=` and `?team=`.
- `harness/stubs/players.js` — added a `?playersDelay=<ms>` knob (same
  pattern as the existing `?contactDelay=`).
- `harness/stubs/availability.js` — added a `?availDelay=<ms>` knob, real
  per-player rows keyed to `e6`/`e7` (`REAL_ROWS`), a real `setAvailability`
  stub that records writes on `window.__writes`, and exposed each event's
  realtime callback on `window.__availabilityCallbacks[eventId]` so a
  refresh could be triggered on demand from the controller script (mirrors
  how `tests/schedule.test.jsx` reaches its mocked subscribe callback).

Ad-hoc follow-up scripts (`/tmp/spin-check.mjs`, `/tmp/refresh-check.mjs`,
`/tmp/toggle-check2.mjs`, `/tmp/last-row-check.mjs`) were used to chase down
specific findings with longer delays / different probes than the main run;
their results are folded into the relevant sections below.

## Verdict: 1 DEFECT found (High severity). All 10 other checks are CLEAN.

---

## Defect

### D1 — RSVP toggle click never visually updates: the row keeps showing the OLD status forever, with no optimistic update and no local refresh after a successful save

- **File/line:** `src/screens/Availability.jsx:171-177` (`handleSet`)
- **Severity:** High (correctness / UX — the core interaction of this screen)
- **Repro (confirmed twice, mobile 375px and general layout, real Chromium):**
  1. Load `?scenario=availability&who=coach&team=t1`. Aaron Whitfield's row
     shows `In` pressed (`aria-pressed="true"`, green fill
     `rgb(238,247,238)`), matching the stub's real row
     `{ player_id: 'p1', status: 'in' }`.
  2. Click `Maybe` on that same row.
  3. `window.__writes` immediately and correctly records
     `{ op: 'upsert', table: 'availability', payload: { event_id: 'e6', player_id: 'p1', status: 'maybe' } }`
     — the write itself is correct.
  4. But the row's buttons are **unchanged** at every checkpoint (0ms, 50ms,
     1000ms after the click): `In` still `aria-pressed="true"` with the green
     "in" background, `Maybe` still `aria-pressed="false"` with only its
     plain hover background. The click produces **no visible confirmation
     whatsoever** that the RSVP was set.
- **Root cause:** `handleSet` calls `setAvailability(...)` and only manages
  `savingPlayerId`/`saveError` in its `.then`/`.catch`/`.finally` — it never
  writes the new status into the component's own `rows` state. The *only*
  path that would ever refresh `rows` is `subscribeAvailability`'s realtime
  callback bumping `reloadToken`, which:
  - depends entirely on a Supabase realtime round-trip echoing the writer's
    own change back to them (network latency, and requires the
    `availability` table to actually be in the `supabase_realtime`
    publication with a matching RLS-visible row for realtime to deliver it)
  - never fires at all in this offline harness, which is exactly why no unit
    test caught it: `tests/availability.test.jsx`'s three `setAvailability`-
    related tests (lines 139-186) only assert the mock was *called* with the
    right arguments — none of them re-queries `aria-pressed`/the row's status
    after the click to check the UI actually reflects it.
  - even when realtime does eventually reach the client in production, this
    still means the person who just tapped a status sees no reaction until
    that round trip completes — architecturally guaranteed staleness, not
    just an occasional glitch.
- **Failure scenario:** A coach taps `Out` for a player who just told them
  they can't make it. The tile keeps showing `In` for as long as it takes for
  Supabase Realtime to echo the write back (or forever, if realtime is
  disconnected, rate-limited, or the table isn't in the realtime publication)
  — extremely likely to read as "my tap didn't register," causing a repeat
  tap/duplicate concern, or the coach walking away believing the RSVP wasn't
  saved when it actually was (or vice versa on a flaky connection).
- **Suggested fix direction (not applied — verification-only pass):**
  either optimistically patch local `rows` state inside `handleSet`'s
  `.then`, or call `setRows` with the row `setAvailability` already returns
  (it returns the saved row on success), rather than relying solely on the
  realtime subscription to close the loop.

---

## Everything else checked: CLEAN

### 1. Button-as-layout-box trap (In/Maybe/Out toggles, player rows)
Measured real `getBoundingClientRect()` for every button in every row, both
375px and 1280px (`case 1-coach-t1`, 24 rows total across two viewports).
Every button's vertical centre falls within 6px of its row's vertical centre
(`centeredWithinRow: true` on all 72 buttons checked). No layout-box defect.

### 2. First-load vs refresh spinner flash
- First load (genuine, `?availDelay=3000`, checked at 500ms): a real
  `role="status"` spinner (`aria-label="Loading team sheet…"`) is present and
  the roster/tally are absent — correct "first load" behaviour.
- At settle (3.2s later): spinner gone, 12 rows present.
- Realtime-triggered refresh on an **already-rendered** roster/tally
  (`window.__availabilityCallbacks['e6']({...})`, checked immediately and at
  +300ms): `totalRows` stayed at 12 throughout, `statusRoles` stayed empty —
  no spinner ever tore the roster out. The `settledForEvent` ref does what
  the report claims.

### 3. Contrast (`--muted`-style text)
`getComputedStyle(...).color` for every leaf `<p>`/`<span>` inside the
dialog, across coach/admin/foreign-coach/parent scenarios, only ever
returned `rgb(92, 88, 84)` (`#5c5854`) for muted text (plus the expected
`rgb(255,255,255)` white on the icon tile and `rgb(34,31,29)` for primary
text). `rgb(119,114,110)` (`#77726e`, the failing value) never appeared
anywhere in this screen.

### 4. Parent scoping is real in the DOM, not just logically gated
- Parent whose child (`p1`) **is** on the roster (`?who=parent-own&team=t1`):
  `document.querySelectorAll('[role="dialog"] ul button')` returns exactly
  **3** buttons (the In/Maybe/Out group for exactly **1** row), confirmed by
  name (`Aaron Whitfield` × 3). All 11 other rows have `buttonCount: 0`.
- Same parent viewing team t2, where `p1` is not on the roster
  (`?who=parent-own&team=t2`): `querySelectorAllButtonCount: 0`, and
  `anyHiddenButtons: 0` too — confirming rows are genuinely **absent** from
  the DOM (not CSS-hidden buttons sitting there disabled).
- Stricter case: parent membership scoped to the **same** team but with a
  `player_id` that doesn't match any real roster row (`?who=parent-foreign`):
  `clickableRowCount: 0` of 12. Defense-in-depth holds even for a
  same-team/mismatched-player edge case.

### 5. Coach/admin override vs. non-editing viewer
- Coach of the team (`?who=coach`) and club admin (`?who=admin`):
  `clickableRowCount: 12` of 12 in both cases, both viewports.
- Coach of the *other* team only (`?who=coach-foreign`): `clickableRowCount:
  0` of 12; every row instead shows a static read-only label (`In`, `Out`,
  `No response`), confirmed via `querySelectorAll`, not just screenshot.

### 6. `availabilityOpen` reset race
Using `?scenario=schedule-admin&playersDelay=500` (admin sees both teams'
events): opened event A's (`U12 Squad Training`, t1) Availability sheet,
waited for it to fully settle (12 rows), then force-clicked the underlying
`U14 Contact & Conditioning` (t2) fixture row directly via
`element.click()` in `page.evaluate` (a real Playwright `.click()` can't
reach it — it's occluded by the open sheet's full-screen overlay, which is
itself informative: this path isn't reachable through ordinary pointer
interaction, only through a click dispatched programmatically or one that
bypasses the overlay).

Captured immediately (same tick), then at +50ms, +200ms, +600ms: **every**
capture already showed the correct target — event B's own `EventDetail`
sheet (heading `Training`, `U14 Contact & Conditioning`, its own fresh
availability tally `0 in / 1 maybe / 0 out` matching t2's real stub data),
never a stale Availability view for event A's roster under event B's
header, and never a mixed state. The reset effect (`setAvailabilityOpen(false)`
on `selectedEventId` change) resolves before any frame is ever observed with
stale data — no race defect found here.

### 7. No jersey numbers
`jerseyAnywhere` regex (`/jersey|shirt number|squad number|\bno\.\s*\d/i`)
against the dialog's full `innerText` returned `false` in every case. Every
row's leading tile is `initials(full_name)` (e.g. `AW`, `BH`, `RO` for the
single-word "Ronaldinho") — never a number.

### 8. No horizontal overflow at 375px / bottom tab bar
`document.documentElement.scrollWidth` === `window.innerWidth` (375) in
every 375px case (`overflow: []` every time). Availability renders inside
the shared `Sheet` component, which is a fixed, full-viewport, independently
scrolling overlay (not embedded content under `AppShell`'s tab bar) — scrolled
the sheet to `scrollHeight` and confirmed the last row's bottom edge
(`795.7px`) sits inside the 812px viewport, i.e. fully visible and not
clipped by anything.

### 9. Dubai-anchored date/time under a hostile browser timezone
Ran with Playwright's `timezoneId: 'America/New_York'` (a real browser-level
override, not just `process.env.TZ`), scenario `?who=coach&team=t1`. Header
subline read `U12 Boys · Tue, Jul 28, 2026 · 7:30 PM` — correct Abu Dhabi
wall-clock time for `2026-07-28T15:30:00Z` (UTC+4), while
`Intl.DateTimeFormat().resolvedOptions().timeZone` inside the page confirmed
the browser really was running as `America/New_York`. Correctly anchored.

### 10. Console/page errors
Zero `error`-level console messages and zero `pageerror` events across all
19 logged cases in `shoot-availability.mjs` plus every ad-hoc follow-up
script. The only console output anywhere was the two benign React Router v7
future-flag warnings that appear on every screen in this app.

### 11. EventDetail's entry-point button for a non-editing user
`?scenario=schedule-parent` (parent role, cannot edit fixtures): opened the
first available fixture's detail sheet, found the button labelled `Set my
availability` (the parent-specific wording, distinct from `View & set
availability` for coach/admin), confirmed present and independently
confirmed clickable via Playwright's `trial: true` actionability check
(passes real hit-testing/visibility/enabled checks without performing the
click).

---

## Screenshots
`screenshots/task16-availability/*.png` (gitignored) — 375px and 1280px for
the coach/admin/foreign-coach/parent-own/parent-foreign-team cases, the
toggle-click case, the mid-first-load/settled pair, the race-condition
settled state, the parent entry-point case, and the hostile-timezone case.
Full machine-readable measurements: `screenshots/task16-availability/report.json`.
