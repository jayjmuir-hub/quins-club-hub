# Task 16 report — Availability RSVPs + coach team-sheet

## Commits (build/v1-mvp)
- `4b99eb7` feat: add setAvailability upsert to availability data module
- `c356883` feat: add Availability RSVP / team-sheet screen
- `4ffbb30` feat: wire Availability sheet into EventDetail and Schedule

## What was built

### 1. `src/data/availability.js` — `setAvailability(eventId, playerId, status)`
Upserts one row on the `event_id,player_id` conflict target (availability has
no surrogate key for that pair — same shape as `upsertContact` against
`player_contacts`). Follows the file's existing conventions exactly: throws
on a Supabase error, throws a distinct "couldn't save that RSVP" message
when the write succeeds but returns zero rows (the RLS-refusal case — a
parent targeting a player who isn't their child, or a coach targeting a
player outside their team), and refuses up front (no network call) if
either id is missing. TDD: 5 tests added to `tests/data.test.js` first,
watched fail (`setAvailability is not a function`), then implemented.

### 2. `src/screens/Availability.jsx` — the RSVP / team-sheet screen
One screen serves both halves of the brief rather than two:
- Fetches the event's team roster (`listPlayers({ teamIds: [event.team_id] })`)
  and the event's availability rows (`listAvailability`) in parallel.
- Renders every player on the roster, tallying `{in, maybe, out, none}` —
  "no response" is derived by diffing the roster against the rows that
  exist; there is no stored row for it, per the brief.
- Per row, `editable = canOverrideAll || myPlayerIds.has(player.id)` decides
  whether the status is a clickable 3-way toggle (In/Maybe/Out buttons) or
  a static label — never a control the database is guaranteed to refuse.
  `canOverrideAll` is `canEditTeam(memberships, event.team_id)` (coach of
  that team, or admin); `myPlayerIds` is `childPlayerIds(memberships)`. A
  parent with no player on this roster simply sees every row as static.
- Realtime: subscribes via `subscribeAvailability(event.id, …)`, bumps a
  reload token on any change, and uses the same settled-ref pattern as
  `EventDetail`'s `AvailabilitySummary` so a background refresh swaps the
  tally in place rather than flashing a spinner over the roster.
- Save errors (including an RLS refusal) render in a `role="alert"` banner,
  not a crash; load errors (players or availability) do the same.
- No jersey numbers — player rows use `initials()` from `playerFormat.js`,
  matching Roster.jsx's tile.

TDD: `tests/availability.test.jsx` (13 tests) written first against a
nonexistent module, watched fail on the import, then the screen was
implemented and all 13 passed without needing a second edit pass.

### 3. Entry-point wiring decision
**Chosen approach:** the parent screen (Schedule) holds the "is the RSVP
sheet open" boolean and renders `Availability` from it — the same
parent-holds-the-state pattern `EventForm`/`PlayerForm` already use from
Schedule/Roster — rather than composing it as a second internal view inside
`EventDetail`'s own `Sheet`. Reasons:
- `EventDetail` stays presentational (its own header comment already says
  this): it takes an `onOpenAvailability` callback and renders one button,
  the same shape as its existing `onEdit`/`onDeleted` props. It does not
  need to know anything about a second sheet's lifecycle.
- Reusing the established "parent owns open/closed state, closing resets
  it" wiring meant no new pattern for a future reader to learn, and made it
  trivial to enforce "one sheet at a time" the same way the form already
  does.
- The affordance is a button in `EventDetail`'s Availability section
  ("View & set availability" for a coach/admin, "Set my availability" for
  everyone else), shown **regardless of `canEdit`** — a player/parent who
  cannot edit the fixture itself still needs to RSVP, which the brief calls
  out explicitly as the reason FooterActions' Edit/Delete pair isn't reused
  for this.
- Closing `Availability` returns to the **event's detail sheet**, not all
  the way back to the schedule list — deliberately different from
  `EventForm`'s onClose (which drops fully back to the list). This is a
  "drill in and back" flow: someone who just set an RSVP, or a coach who
  just overrode a player, is more likely to want to glance back at the
  fixture they were on than lose their place in the list.
- `availabilityOpen` is tied to `selectedEventId` via a `useEffect` reset
  (`setAvailabilityOpen(false)` whenever `selectedEventId` changes), because
  picking a different fixture from the list underneath bypasses the normal
  "close, then open" round trip that would otherwise clear it — without
  this reset, selecting fixture B while fixture A's availability sheet was
  open would show B's *availability* screen instead of B's *detail* sheet.
  Covered by a dedicated test.

## Test count
- Before: 451 passing (per brief).
- After: **472 passing**, 19 test files, 0 failing.
  - `tests/data.test.js`: +5 (`setAvailability`)
  - `tests/availability.test.jsx`: new file, 13 tests
  - `tests/schedule.test.jsx`: +3 (entry-point wiring)
- `npm test` (`vitest run`): all 472 green.
- `npm run build`: clean, no warnings (`vite build` succeeds, 108 modules).

## Self-review findings
- Checked the binding rulings from RESTORE.md against the new code:
  - Throw-on-error / `[]` not `null`: `setAvailability` follows this;
    `Availability.jsx` never invents a `{data, error}` shape.
  - Dubai-anchored formatting: the screen's header uses
    `formatLongDate`/`formatTime`/`eventDate` from `eventFormat.js`, no
    `toLocale*` calls added directly.
  - No native `confirm()`: none needed or added.
  - Parent scoping: toggles are gated on `childPlayerIds(memberships)`
    intersected with the roster; covered by two dedicated tests (toggle
    shown only for own child; `setAvailability` never called for another
    player even when the parent could theoretically click a different
    row's — there is no such control to click, which the test also
    verifies).
  - `--muted` on paper: used `#5c5854` for the header sub-line and the
    static status labels (not `#77726e`).
  - No jersey numbers: confirmed, initials tile only.
  - Loading/empty/error contract: all three states covered by tests
    (spinner on first load only, "no players" empty state, alert on
    either `listPlayers` or `listAvailability` failure, alert on a
    `setAvailability` failure).
  - Realtime + first-load/refresh distinction: covered by a dedicated
    test that holds the refetch promise open mid-flight and asserts the
    previous tally stays on screen with no spinner.
- One judgment call worth flagging: the coach/admin team-sheet and the
  parent/player RSVP view are literally the same component and the same
  list, differing only per-row in whether the status is a button group or
  a label. I considered two separate screens (as the brief's phrasing
  suggests) but concluded one screen with per-row `editable` is simpler,
  has less duplicated fetch/realtime/tally logic, and still satisfies every
  requirement in the brief's bullet list. Flagging this since it diverges
  from a literal reading of "two screens" even though the brief's actual
  test bullets don't require two files.
- Did not touch `Schedule.jsx`'s fixture rows to add the "N available"
  count the brief explicitly says is out of scope for this task.
- No accessibility regressions expected: `Sheet` is reused unmodified;
  each status button carries `aria-pressed`; the status-button group has
  `role="group"` with an `aria-label`.

## Concerns / follow-ups (none blocking)
- `Availability.jsx`'s per-row save state (`savingPlayerId`) disables only
  the row currently saving, not the whole list — intentional (lets a coach
  fire several overrides in quick succession without waiting), but worth
  knowing if a future reviewer expects the whole list to lock during any
  save.
- The screen re-derives `players.find`/`sort` on every render rather than
  memoising; matches the same "not memoised, whole scope is small" decision
  Roster.jsx already made and documents for the same reason (at most one
  team's roster, not hundreds of fixtures).

## Post-review fix (28 Jul 2026): D1 — RSVP toggle click never visually updated

Independent Chromium browser visual verification
(`task-16-visual-verification.md`) found one High-severity defect: `handleSet`
in `src/screens/Availability.jsx` called `setAvailability(...)` and correctly
wrote to the database, but never updated the component's own `rows` state
with the result. The only thing that could ever refresh the displayed status
was the realtime subscription's `reloadToken` bump, which depends on
Supabase Realtime echoing the write back to the same client that made it —
architecturally guaranteed staleness for the clicking user, not an
occasional glitch. A coach tapping "Out" for a player had no visual
confirmation the tap registered.

**Fix:** `handleSet`'s `.then` now patches the saved row (which
`setAvailability` already returns on success) into local `rows` state
directly — replacing any existing row for that `player_id` or adding a new
one — so the clicked row's status, its button `aria-pressed` state, and the
in/maybe/out/no-response tally all update immediately, without waiting on a
realtime round-trip. This only runs in the success branch (`.then`), so a
refused/failed write (RLS refusal, network error — caught in `.catch`) never
optimistically shows a status that was never actually saved; the row simply
stays at its last known-good value and the existing `saveError` alert
appears, exactly as before. The realtime-driven refresh path (`reloadToken`
bump on another user's change) and the first-load-vs-refresh spinner
suppression (`settledForEvent` ref) are both untouched — this only added a
`.then` branch, nothing else in the effect/subscription logic changed.

**Test added (`tests/availability.test.jsx`):** two new tests under
"Availability — coach/admin can override anyone":
- Confirms clicking a toggle updates that row's `aria-pressed` state and the
  in/maybe/out tally immediately after the save promise resolves, without
  invoking the realtime callback at all. Verified this test fails against
  the pre-fix code (`aria-pressed` stayed on the old status).
- Confirms a rejected `setAvailability` call (RLS-style refusal) leaves the
  row's status/`aria-pressed` unchanged (in addition to the existing alert
  assertion in the "save failures" block), so the fix doesn't introduce a
  false-positive optimistic update on failure.

`npm test`: 474 passed (up from 472), 19 test files, all green.
`npm run build`: clean.
