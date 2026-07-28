# Task 14 — Event create/edit/delete — report

Branch `build/v1-mvp`, from `ac67abb`.

## What I implemented

### `src/lib/eventFormat.js` — the write direction (new, pure, no imports)
Two new exports, tested in the existing `tests/event-format.test.js`:

- `clubWallTimeToUtc(dateValue, timeValue)` — takes an `<input type="date">`
  value and an `<input type="time">` value, reads BOTH as **Abu Dhabi
  wall-clock**, and returns the UTC ISO string for `starts_at`. Returns
  `null` for a missing/unparseable pair so the caller treats it as a
  validation failure rather than writing an Invalid Date.
- `clubDateTimeInputs(date)` — the exact inverse, used to prefill the edit
  form. Zero-padded 24-hour time so it is a legal time-input value.

**Approach (the abstraction question).** The offset is *derived from the IANA
zone at the instant in question*, never hardcoded as `+04:00`. A private
`clubOffsetMsAt(ts)` formats the instant through an `Intl.DateTimeFormat`
bound to `CLUB_TIME_ZONE` (`hourCycle: 'h23'`, so midnight is `00` and not
en-US's `24`), rebuilds those fields with `Date.UTC`, and subtracts. The
conversion then treats the typed wall-clock as if it were UTC, subtracts the
offset, and looks the offset up a second time at the first approximation —
one refinement, which is what makes it land on the correct side of a DST
transition should the UAE ever adopt one. This is the same reasoning
`CLUB_TIME_ZONE` already documents for the read side.

### `src/data/events.js` — `upsertEvent` / `deleteEvent`
- `upsertEvent(event)`: one function, branching on `event.id` — `insert`
  when falsy, `update(...).eq('id', id)` when set. The id is used only as the
  filter and is **never sent as a column** on either path.
- `deleteEvent(id)`: `delete().eq('id', id).select()`.
- Both follow the file's existing conventions (throw on error, never a
  `{data, error}` tuple, JSDoc + prose comments).
- **New for this codebase (there was no `upsert*` precedent — `players.js` /
  `members.js` are read-only):** both writers ask for the affected row(s)
  back and **throw when nothing comes back**. This is the security-relevant
  bit: an RLS-refused write is *not* a PostgREST error — the policy filters
  the row out, the statement affects zero rows, and the response is a
  perfectly successful "nothing". Without this the form would show a
  success and close on a write the database silently threw away. The check
  is a *reporting* mechanism, explicitly not an access control.

### `src/screens/EventForm.jsx` (new)
Design-system §5.6 field order: segmented Type (Match/Training/Social) →
Opponent (match) or Title (training/social) → Date+Time field-row → Age
group select → Home/Away segmented (match only) → Venue (prefilled "Zayed
Sports City, Abu Dhabi") → Competition (match only) → Quins/Opposition score
(match only) → full-width Save.

- **Squad dropdown** = `visibleTeams(memberships, allTeams).filter(t =>
  canEditTeam(memberships, t.id))`. Admin gets every team; a coach gets only
  the squads they coach. `canEditTeam` is asked per team rather than inferred
  from the role, so its deliberate null-`team_id` refusal applies here too.
- **Zero editable teams** → the screen **refuses to render a form at all**:
  the Sheet opens with a `role="alert"` explanation and no Save button. An
  empty dropdown over a live Save button would offer a write RLS is
  guaranteed to refuse. (Both entry points already gate on the same check, so
  this is defensive.)
- **Chosen squad is reconciled against the live editable list on every
  render** (same pattern Schedule/Roster use for their team filters) rather
  than trusting stored state, which can outlive the scope that produced it.
- **Validation:** date, time, squad, and opponent (match) / title
  (training-social) are required. Submit is blocked, a `role="alert"` region
  explains why, and the offending fields get `aria-invalid` + a dark-red
  border. Venue, competition and scores are optional. `noValidate` on the
  form so our announced message replaces the native bubble.
- **Score is optional even for a match** — a future fixture has none — and a
  half-entered score is written as `null/null`, mirroring `hasResult()`'s
  both-halves rule so a half-score can never knock a fixture out of Upcoming.
  0–0 is written as a real score.
- **Segmented control** uses `<label>` + visually-hidden radio + `<span>`,
  with the checked look driven by React state (the design system's port note
  warns against silently relying on `:has()`). Options are `<span>`s, not
  `<button>`s, precisely to avoid the UA content-centring trap.
- Disabled-while-saving submit ("Saving…"), plus a non-state `inFlight` ref
  so a double click cannot land two inserts.
- The one place the form names the zone: "Times are Abu Dhabi time." under
  the date/time row, mirroring the detail sheet.
- **No jersey field, and no numeric player identifier anywhere.**

### UX decisions

**Delete.** Design-system §5.5 puts Edit + Delete in the **EventDetail
footer**, not in the form, and that is where I put them. There is no existing
delete pattern in the codebase to follow — `PlayerDetail.jsx` explicitly
defers its own to Task 15, so **this is the first one**, and it sets the
precedent. Delete is **two-step and inline**: the Delete button swaps the
footer for "Delete this event? This can't be undone." with `Keep it` /
`Yes, delete`. I deliberately did **not** use a native `confirm()` (the
prototype's demo-only reset used one) — it is unstyled, unreliably announced,
and invisible to the browser check. After a successful delete the sheet
closes and the user lands back on the list they came from, which then
reloads. A failed delete surfaces in a `role="alert"` inside the sheet and
leaves the event on screen.

**Entry points.**
1. **Schedule section-head "Add fixture" button** (design-system §5.2,
   admin/coach only, absent — not disabled — otherwise). Task 13 removed the
   dashboard placeholder under the no-disabled-placeholders rule; this is the
   task that makes a real control possible, and §5.2 is where the design
   system puts it.
2. **EventDetail "Edit"**, from both Schedule *and* Dashboard.

I wired the Dashboard's EventDetail too. That was not optional: once
EventDetail grew a footer, leaving `canEdit` at its default would have told a
coach tapping a fixture on the landing screen that the event is read-only,
which is false. The Dashboard does **not** get an "add" affordance — that
belongs to Schedule per §5.2, and the quick-actions card stays as it is until
Task 15's player form lands with its pair (its existing comment says exactly
this). No scope creep into Tasks 15/16.

Only one sheet is open at a time: opening the form unmounts the detail sheet
rather than stacking two dialogs, and closing the form drops back to the
schedule, which is where a coach who just saved wants to be.

### RLS writability check (done, not assumed)
Queried the live project (`lusmshimxdcxpnrktlgz`) directly:

- `pg_policies` on `public.events`:
  - `event read` — `SELECT`, `USING can_see_team(team_id)`
  - `event edit` — **`ALL`**, `USING can_edit_team(team_id)` **and
    `WITH CHECK can_edit_team(team_id)`**
- `can_edit_team(_team)` = `exists (select 1 from memberships m where
  m.profile_id = auth.uid() and ((m.role='admin' and m.club_id = (select
  club_id from teams where id=_team)) or (m.role='coach' and
  m.team_id=_team)))`

So INSERT/UPDATE/DELETE on `events` are already enforced server-side for
exactly admin-of-the-club and coach-of-that-team, with `WITH CHECK` covering
the row a write *lands on* (a coach cannot re-point a fixture at a squad they
don't coach). `upsertEvent`/`deleteEvent` therefore need nothing beyond
issuing the call — the only client-side addition is the zero-row detection
described above, which reports refusals rather than enforcing anything.

Schema note: `events.club_id` is `NOT NULL` with no default, so the form
derives it from the selected team's `club_id` (`teams` is fetched with
`select('*')`, so it is available) rather than hardcoding the club constant.

## What I tested

`tests/event-format.test.js` (+11): both new helpers, every assertion run
under all three `HOSTILE_ZONES` (`UTC`, `America/New_York`,
`Pacific/Auckland`) via the file's existing `withTimeZone`, including 20:00
Dubai → 16:00Z, an after-midnight kick-off crossing back a UTC day, exact
midnight, a month boundary, a seconds-bearing time value, a round trip
through the display formatters, the exact-inverse property, and null/garbage
handling.

`tests/data.test.js` (+9): insert-when-no-id (and when id is `null`/`''`),
update-when-id, no `id` column sent either way, `.eq('id', …)` filter,
`.select()` requested, error thrown not returned, and the zero-row RLS
refusal on both writers. The shared mock builder gained
`insert`/`update`/`delete` chain recorders.

`tests/event-form.test.jsx` (new, 34): sheet titles, dropdown limited to
editable teams (coach vs admin), refusal to render with no editable team,
conditional fields in all three directions, blocked submit + `aria-invalid`
on the right fields only, the club-time submit payload, optional/0–0/half
scores, training payload shape, edit prefill + update-by-id, an unchanged
round trip not shifting `starts_at`, a Supabase error surfacing while
keeping typed values and re-enabling the button, disabled-while-saving,
double-click protection, typing without lost keystrokes, and the Schedule +
EventDetail wiring (Add button gating, opening the form, reload after save,
Edit/Delete vs the parent read-only note, cancel-delete, confirm-delete,
delete failure).
**The whole file runs under `TZ=America/New_York`**, with a guard test
asserting the process zone really is hostile so the timezone assertions
cannot pass vacuously.

`tests/dashboard.test.jsx` (+3): the Dashboard's detail sheet offers
Edit/Delete to a coach, the read-only note to a parent, and opens the form.

**Anti-vacuity (the suite was not green on the first attempt, and I
mutation-tested the risky parts anyway):**
- Replacing `clubWallTimeToUtc`/`clubDateTimeInputs` with the naive
  `new Date(\`${date}T${time}\`)` / `getHours()` implementations → **9
  failures** in `event-format.test.js`.
- Hardcoding `canEdit={false}` in Dashboard → **2 failures** in
  `dashboard.test.jsx`.

## TDD evidence

**RED — eventFormat**
```
$ npx vitest run tests/event-format.test.js
TypeError: clubWallTimeToUtc is not a function
TypeError: clubDateTimeInputs is not a function
 Test Files  1 failed (1)
      Tests  11 failed | 43 passed (54)
```
**GREEN** → `Tests  54 passed (54)`

**RED — data layer**
```
$ npx vitest run tests/data.test.js
 FAIL  tests/data.test.js > upsertEvent > inserts when there is no id, and does not send an id column
 FAIL  tests/data.test.js > upsertEvent > updates the matching row when there is an id, …
 FAIL  tests/data.test.js > deleteEvent > deletes the row with the given id
 … (9 failed)
      Tests  9 failed | 25 passed (34)
```
**GREEN** → `Tests  34 passed (34)`

**RED — form**
```
$ npx vitest run tests/event-form.test.jsx
Failed to resolve import "../src/screens/EventForm.jsx"
 Test Files  1 failed (1)
      Tests  no tests
```
**GREEN** → `Tests  34 passed (34)`

**Full suite (baseline 330 across 16 files):**
```
$ npm test
 Test Files  17 passed (17)
      Tests  387 passed (387)
```
No regressions, no `act(...)` warnings, no stderr noise.

```
$ npm run build
✓ built in 2.32s
```

## Browser check

`harness/shoot-eventform.mjs` (new; `harness/stubs/events.js` gained
write stubs that record payloads on `window.__writes`; `harness/main.jsx`
gained a `schedule-parent` scenario and `club_id` on the stub teams).
13 shots × {375×812, 1280×900} = 26, **with the browser context pinned to
`timezoneId: 'America/New_York'`.**

- **The load-bearing result.** Typing 30 Jul 2026 / 20:00 in a New York
  browser produced
  `starts_at: "2026-07-30T16:00:00.000Z"` — correct Abu Dhabi time. A naive
  implementation would have written `2026-07-31T00:00:00.000Z`. Full recorded
  payload: `{club_id, team_id: "t1", type:"match", title:null, opponent, home:true,
  venue, competition:null, starts_at, result_us:null, result_them:null}` —
  and no `id`, i.e. an insert.
- **Edit prefill** of a `15:00Z` fixture showed `07/30/2026` / `07:00 PM` —
  19:00 Dubai, not 11:00 New York.
- **Typing (Sheet focus trap):** a `pressSequentially` shot (one key at a
  time, 25ms apart) typed "Jebel Ali Dragons" and "West Asia Premiership" in
  full, with `document.activeElement` still on the field being typed into.
- **Type selector:** Match shows Opponent/Home-Away/Competition/Score;
  Training and Social swap in Title and remove all four. Verified in the DOM
  and in the screenshots.
- **Button-as-layout-box:** segmented options measured 108×42 / 108×42 /
  108×42 (and 166×42 / 166×42) at identical `y` — no misalignment.
- **Contrast:** every uppercase form label computes to `rgb(92,88,84)` =
  `#5c5854`. No `quinsGreen` on white anywhere in the form. Checked state is
  `#8E1526` on `#fbf3f6`.
- **Overflow:** `document.scrollWidth === innerWidth` at 375px on all 26
  shots; zero overflowing elements.
- **Console:** zero errors, zero page errors. The only warnings are the two
  pre-existing React Router v7 future-flag notices the harness's MemoryRouter
  emits on every scenario (not from this change).
- Screenshots reviewed with the Read tool: `add-match`,
  `add-match-scrolled`, `add-training`, `validation`, `edit-match` (desktop
  dialog), `edit-match-scrolled`, `detail-footer`, `delete-confirm`,
  `detail-footer-parent`, `schedule-head-admin`, `schedule-head-parent`.
  Saved under `screenshots/task14/` (git-ignored).

## Files changed

- `src/screens/EventForm.jsx` — new
- `src/data/events.js` — `upsertEvent`, `deleteEvent`
- `src/lib/eventFormat.js` — `clubWallTimeToUtc`, `clubDateTimeInputs`
- `src/screens/EventDetail.jsx` — `FooterActions` (Edit/Delete/confirm/parent
  note), `canEdit`/`onEdit`/`onDeleted` props
- `src/screens/Schedule.jsx` — "Add fixture" button, form state, wiring
- `src/screens/Dashboard.jsx` — detail-sheet edit/delete wiring
- `tests/event-form.test.jsx` — new
- `tests/event-format.test.js`, `tests/data.test.js`,
  `tests/dashboard.test.jsx`
- `harness/shoot-eventform.mjs` — new; `harness/stubs/events.js`,
  `harness/main.jsx`

## Self-review findings (fixed before reporting)

1. **Stale squad id.** The form initialised `teamId` once from the editable
   list. If teams hadn't loaded on first render, or memberships reloaded and
   shrank, the select displayed one squad while state held another (or `''`).
   Fixed by reconciling against the live list every render, the same pattern
   Schedule/Roster already use.
2. **`act(...)` warning** leaking from the double-click test, whose deferred
   promise settled after the test ended. Now awaited.
3. **First screenshot pass was wrong**, not the UI: `fullPage: true` on a
   `position: fixed` sheet clips the panel and renders the page behind it.
   Switched the form shots to viewport-only with explicit scrolled variants.
4. **`fill()` is not a keystroke test** — it sets the value in one go and
   would not have caught a focus-stealing Sheet. Added the
   `pressSequentially` shot.

## Concerns

- **None on RLS.** The `events` write policy was read from the live database
  and does permit coach/admin writes with a matching `WITH CHECK`. No
  client-side-only permission gate exists.
- Minor, deliberate inconsistency: form labels use `#5c5854` where
  `EventDetail`'s key/value labels use `#77726e`. Both clear AA on white
  (4.755:1 for the latter); I took the darker value for the 12.5px labels
  since the muted-on-light defect has shipped twice. Worth normalising
  codebase-wide at some point, not in this task.
- Negative scores are typeable (`min="0"` is not enforced under
  `noValidate`). Out of scope for the brief; a `< 0` guard would be a
  one-liner if wanted.
- `upsertEvent`'s zero-row check assumes PostgREST returns the affected row
  when `.select()` is chained. That is its documented behaviour and the
  behaviour the mocked builder reproduces, but it has not been exercised
  against the live project — the first real save on `adhjrt.com` is where
  that gets confirmed.
