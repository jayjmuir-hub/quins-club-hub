# Task 15 — Player create/edit/delete + contact

Branch `build/v1-mvp`, from `7d8a098`. Status: **DONE**.

## What I implemented

### `src/data/players.js` — three new writers

- **`upsertPlayer(player)`** — direct copy of Task 14's `upsertEvent` shape against `players`:
  inserts when there is no id, updates when there is one, destructures `id` out of the payload and
  uses it only as the `.eq` filter, asks for the row back with `.select().maybeSingle()`, throws on
  a Supabase error, and throws `REFUSED_PLAYER` on a zero-row response (the RLS refusal that
  PostgREST reports as a successful "nothing"). No `jersey_num` — the column stays in the schema
  and nothing writes it.
- **`deletePlayer(id)`** — `delete().eq('id', id).select()`, throws on error and on an empty array.
  It deletes **only** the `players` row. I checked the live schema:
  `player_contacts_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE`,
  so the contact row goes with it, atomically, server-side. A second client-side delete would
  introduce a failure mode the database does not have (contact gone, player left). There is a test
  asserting `supabase.from` is called exactly once and never with `player_contacts`.
- **`upsertContact(contact)`** — see the decisions below.

Three distinct refusal messages (`REFUSED_PLAYER`, `REFUSED_PLAYER_DELETE`, `REFUSED_CONTACT`), so
the three failures are never confused for one another in the UI.

### `src/screens/PlayerForm.jsx` (new)

Design-system §5.8 field order, verbatim: Full name → Position → Age group → Phone → Email →
Player/Captain segmented → full-width Save. Built on the shared `Sheet`. Reuses EventForm's
`LABEL`/`FIELD`/`INPUT_BASE`/`Segmented` treatment including the sr-only-radio segmented control
(no `<button>` used as a layout box, no reliance on CSS `:has()`).

**No jersey field.** Confirmed by a test asserting no such label exists and no "jersey" text renders
anywhere, and by a browser probe (`jerseyAnywhere: false` at both breakpoints).

### Entry points

1. **`Roster.jsx` section head → "Add player"**, exactly parallel to Task 14 putting "Add fixture"
   on Schedule's section head (design-system §5.3 item 2 specifies an Add button there). Shown only
   when `canEditAnything` (admin, or holder of any coach membership); **absent**, not disabled, for
   everyone else. Restructured the section head into the same `flex items-start justify-between`
   layout Schedule uses.
2. **`PlayerDetail.jsx` footer → Edit / Delete**, parallel to `EventDetail`'s, gated on a new
   `canEdit` prop that `Roster` computes as `canEditTeam(memberships, selectedPlayer.team_id)`.
   A user without edit rights gets a `ScopeNote tone="parent"` read-only line instead.
   Delete is the Task 14 two-step inline confirm — no native `confirm()`.
3. `Roster` renders one sheet at a time (`selectedPlayer && !formState`), and closing the form drops
   back to the roster rather than to the detail sheet, matching Schedule.

## Decisions, and the reasoning

### `upsertContact`'s conflict target: `.upsert(..., { onConflict: 'player_id' })`

I queried the live database rather than assuming:

```
player_contacts_pkey  PRIMARY KEY (player_id)
columns: player_id uuid NOT NULL, phone text NULL, email text NULL
```

`player_id` **is** the primary key — there is no surrogate id. So this is the one writer in the
codebase where a genuine `ON CONFLICT` upsert is the right tool rather than the id-present/id-absent
branch `upsertPlayer` uses. I chose it over a manual select-then-insert-or-update because:

- **It is one statement, so there is no TOCTOU window.** Two coaches editing the same player would
  both read "no row exists" and both try to insert; one would get a primary-key violation surfaced
  as a raw Postgres error. `ON CONFLICT` makes the second one an update.
- **Fewer round trips** to Tokyo from the UAE, which is the project's known latency profile.
- **The refusal-detection pattern still works unchanged**: `.select().maybeSingle()` after the
  upsert returns nothing when RLS refuses, exactly like the other writers.

The conflict target is named explicitly rather than left to PostgREST's primary-key inference, so
this keeps updating in place if the table ever gains a second unique constraint.

The `player_id` **stays** in the payload (unlike `upsertPlayer`, which strips `id`) — it is what the
row is keyed *by*, not a surrogate being needlessly rewritten. A test asserts both behaviours.

`upsertContact` refuses (before touching the network) when called with no `player_id`, rather than
letting an orphan write fail obscurely at the NOT NULL constraint.

### Blank-both-fields behaviour

I split this between the two layers deliberately:

- **`upsertContact` itself is dumb**: it writes exactly what it is given, nulls included. Clearing a
  wrong phone number has to actually clear it, and a data function that second-guesses its caller
  cannot express that.
- **`PlayerForm` decides whether there is anything worth writing**:
  `writeContact = contactStatus === 'ready' && (phone || email || hadContact)`.
  - New player, both blank → **skip the write**. Nothing to record and nothing to clear; an
    all-null row would be litter. (Verified in the browser: only one write recorded.)
  - Editing, no contact was on file, both still blank → **skip**. Same reasoning.
  - Editing, a contact **was** on file and both are now blank → **write nulls**. This is the case
    where an all-null row is exactly right, and skipping would silently keep a phone number the
    coach just deleted. (Verified: `{ player_id: 'p1', phone: null, email: null }`.)

Neither `null` nor an all-null row is a leak on the read side either: `PlayerDetail`'s
`ContactBlock` already treats `!contact.phone && !contact.email` identically to no row at all.

### Two writes, not one

`upsertPlayer` first (its returned row is where a new player's id comes from), then `upsertContact`
keyed on that id. The two tables have two separate policies and are written by two separate
statements, so a partial failure is reported as a partial failure:

- **Player write fails** → error shown, sheet stays open with the typed values, **`upsertContact`
  is never called**, `onClose`/`onSaved` never fire.
- **Contact write fails** → `onSaved` fires (the player really was saved, so the roster must
  refresh), the sheet **stays open**, and the alert leads with a distinct line: *"The player was
  saved, but their contact details were not."* followed by the underlying message.
- **Retry after a contact failure does not insert the player twice.** The id from the first insert
  is stored in `savedPlayerId` and used on the next submit, so attempt 2 is an `update`. Verified in
  the browser: writes are `insert players` → `upsert player_contacts` (fails) → `update players
  {id: p-new}` → `upsert player_contacts`. This is a real bug that the obvious implementation has.

The player payload carries no `phone`/`email` keys at all — asserted by a test.

### Explicit answer: does edit-access imply contact-read-access?

**Yes, for this database, and I verified it against the live policies rather than reasoning from the
brief alone.**

```
player_contacts "contact read"  (SELECT) — can_edit_team(...) OR is_own_player(player_id)
player_contacts "contact edit"  (ALL)    — can_edit_team(...)  [USING and WITH CHECK]
players         "player edit"   (ALL)    — can_edit_team(team_id)
```

The read predicate is a strict superset of the edit predicate (`can_edit_team OR X` ⊇
`can_edit_team`). This form renders only for a user with at least one `canEditTeam` team, and the
Edit entry point is gated per-player on `canEditTeam(memberships, player.team_id)`. So a user who
reaches the edit form for a given player necessarily satisfies `can_edit_team` for that player's
team, and therefore satisfies the contact-read predicate. **There is no case where edit-form access
exists but the contact read is refused.** A `null` row in this form can therefore only mean "nothing
recorded yet" — never "withheld" — which is why the fields render blank and editable with nothing
said about why, and no hint that anything might be missing.

This is a property of the current policies, not of the schema, so I wrote the code not to *depend*
on it: the two writes are separate and a contact refusal is reported distinctly. If the read policy
were ever narrowed, the failure mode is a visible error, not silent data loss.

### One thing the brief did not anticipate: a *failed* contact read

The brief covers "null because withheld" vs "null because never entered". There is a third case that
is the genuinely dangerous one: **the contact read errors** (network, timeout). The fields would sit
blank, and saving would write those blanks over real details the coach never saw — silent
destruction of safeguarding data. Handled explicitly:

- While the contact read is **in flight**, the phone/email fields are **not rendered** and the Save
  button is **disabled**. (Verified in the browser at 250 ms of simulated latency: `player-phone:
  absent`, save button `disabled: true`, then both present and enabled once it lands. Fields are
  never rendered-then-repopulated, so there is no keystroke-loss window either.)
- If the read **fails**, the contact fields stay absent, an amber note says the details couldn't be
  loaded and that *"Saving will leave them exactly as they are"*, and the contact write is skipped.
  The player's own fields still save normally.

## Safeguarding review (re-read with fresh eyes, per the brief)

1. **The form's existence is gated, not just its buttons.** `editableTeams.length === 0` returns an
   explanatory sheet with **no fields at all** — in particular no phone/email boxes. A test asserts
   `queryByLabelText('Phone')` and `('Email')` are both absent for a parent. An editable phone box
   for a player whose contact row RLS withholds would be exactly the leak `player_contacts` exists
   to prevent.
2. **A refused form issues no contact read.** The prefill effect returns early when `gated`, so a
   user who shouldn't be here never causes a `player_contacts` query. Test:
   `expect(getPlayerContactMock).not.toHaveBeenCalled()`.
3. **The footer sits outside `ContactBlock`, and that difference is deliberate.** `Call`/`Email`
   expose the contact data itself and must vanish with it (Task 12's rule, unchanged). `Edit`/
   `Delete` are about the player record and are governed by squad edit rights alone. If footer
   visibility depended on whether a contact row came back, the footer would become a way to infer
   that withheld details exist. Documented in the file.
4. **Nothing hints at absence.** Browser check on the stub's null-contact player:
   `alerts: []`, `mentionsHidden: false`, both fields present, blank and enabled.
5. **`PlayerDetail`'s read-side contract is untouched** — I added a footer below `ContactBlock` and
   changed nothing inside it; `roster.test.jsx` (39 tests, including the Task 12 second-round
   fixes) still passes unmodified.
6. **The delete confirm names the consequence**: "Remove this player? Their contact details go too,
   and this can't be undone." The cascade is not hidden from the user.

## TDD evidence

**RED — data layer** (`upsertPlayer`/`deletePlayer`/`upsertContact` written as tests first):

```
$ npx vitest run tests/data.test.js
TypeError: upsertContact is not a function
 Test Files  1 failed (1)
      Tests  17 failed | 34 passed (51)
```

**GREEN — data layer:**

```
$ npx vitest run tests/data.test.js
 ✓ tests/data.test.js (51 tests) 45ms
 Test Files  1 passed (1)   Tests  51 passed (51)
```

**RED — form** (`tests/player-form.test.jsx` written before `PlayerForm.jsx` existed):

```
$ npx vitest run tests/player-form.test.jsx
 FAIL  tests/player-form.test.jsx [ tests/player-form.test.jsx ]
 Failed to resolve import "../src/screens/PlayerForm.jsx"
 Test Files  1 failed (1)   Tests  no tests
```

**GREEN — form:**

```
$ npx vitest run tests/player-form.test.jsx
 ✓ tests/player-form.test.jsx (40 tests) 2413ms
 Test Files  1 passed (1)   Tests  40 passed (40)
```

An intermediate GREEN run emitted two `not wrapped in act(...)` warnings from the two
pending-promise tests. Fixed by settling the in-flight save before the test ends (the same
`release()` + `waitFor(onClose)` pattern Task 14 uses and documents). Output is now silent.

**Full suite:**

```
$ npm test
 Test Files  18 passed (18)
      Tests  444 passed (444)
```

Baseline was 387 across 17 files. +57 (17 data, 40 form), +1 file. Nothing regressed —
`roster.test.jsx` still 39, `event-form.test.jsx` still 34.

**Build:**

```
$ npm run build
 ✓ 107 modules transformed.
 ✓ built in 2.51s
```

## What I tested

Unit (40 in `tests/player-form.test.jsx`, 17 added to `tests/data.test.js`), all with the data
modules and `useMemberships` mocked — no network is reachable from either file:

- Shape/scoping: add vs edit title; dropdown limited to `canEditTeam` teams for a coach; every team
  in sort order for an admin; the gated no-editable-team branch (no Save, no Age group, **no Phone,
  no Email**); no contact read for a gated form; no jersey field; the §7 position enum plus a
  "Not set" option.
- Validation: empty name blocks submit with `role="alert"` + `aria-invalid`, and issues **neither**
  write; whitespace-only name treated as empty.
- Saving new: trimmed name/position/squad/captaincy; `null` position not `''`; blank-both skips the
  contact write; contact keyed on the id the insert returned; player-then-contact ordering asserted
  on a recorded call order, with no contact columns in the player payload; trimming.
- Editing: player prefill + update by id; contact prefill; "no contact on file" → blank editable
  fields with nothing said; skip when nothing to write; **nulls written when an existing contact is
  cleared**; Save disabled while the prefill is in flight; a failed prefill never overwrites.
- Failures: player-write failure keeps the form open and skips the contact write; contact failure
  reported as a contact failure with the "player was saved" framing; retry does not double-insert;
  disabled while saving; double-click submits once; no keystroke loss.
- Wiring: Roster "Add player" for a coach, absent for a parent, opens empty, reloads after save;
  PlayerDetail Edit/Delete for a coach, read-only note for a parent, edit prefilled, two-step
  confirm, delete + close, delete failure surfaced.

## Browser check

`harness/shoot-t15-verify.mjs` (new), 8 scenarios × 2 viewports (375×812, 1280×900), real Chromium,
real keystrokes. Full output in `screenshots/task15-verify/report.json`.

| Check | 375px | 1280px |
|---|---|---|
| Character loss typing name / phone / email (real keystrokes, 18 ms) | 0 / 0 / 0 | 0 / 0 / 0 |
| Focus after typing | stays in `player-email` | same |
| Jersey text anywhere | `false` | `false` |
| Horizontal overflow / `docWidth` vs `innerWidth` | none / 375 = 375 | none / 1280 = 1280 |
| Smallest text colour | `12.5px rgb(92,88,84)` = `#5c5854` | same |
| Segmented options aligned (same y, same height) | y 694, 42px both | y 677, 42px both |
| Footer Edit/Delete aligned | y 754, 42px both | y 728, 42px both |
| Native `confirm()` dialogs | 0 | 0 |
| Console errors | none (only the pre-existing React Router v7 future-flag warnings) | same |

Behavioural results (identical at both breakpoints):

- **New player + contact** → exactly two writes, in order:
  `insert players {club_id, team_id, full_name, position: null, is_captain: false}` then
  `upsert player_contacts {player_id: 'p-new', phone, email}`. Sheet closes.
- **Validation** → alert rendered `484×40 visible`, `player-name` bordered `rgb(142,21,38)`,
  **zero writes**.
- **Blank-both contact** → one write only (`insert players`). No contact row.
- **Edit prefill under 250 ms latency** → while loading: `player-phone: absent`, `player-email:
  absent`, Save `disabled: true`. After: both present, populated from the contact row, Save enabled.
- **Clearing both contact fields** → `update players` + `upsert player_contacts {phone: null,
  email: null}`.
- **Player with no contact on file** → fields present, blank, enabled; `alerts: []`;
  `mentionsHidden: false`; saving writes only the player row.
- **Contact write refused** (`?contactFail=1`) → sheet stays open, typed values intact, alert reads
  "The player was saved, but their contact details were not. / We couldn't save the contact
  details…". Retry produces `update players {id: 'p-new'}`, **not** a second insert.
- **Delete** → two clicks (Delete → Yes, delete), zero writes after the first click, zero native
  dialogs, one `delete players p1`, sheet closes.
- **Parent** → `addPlayerButtons: 0`, no footer buttons, read-only note present.

Screenshots: `screenshots/task15-verify/{mobile,desktop}-*.png`.

`Sheet`'s stale-`onClose` latest-ref fix holds — `Roster` passes an inline arrow `onClose` that gets
a fresh identity on every keystroke, and typing 18 characters into three fields lost nothing and
never lost focus. The bug shape was not reintroduced: no caller-supplied callback appears in any
`useEffect` dependency array whose cleanup touches focus.

## Files changed

- `src/data/players.js` — added `upsertPlayer`, `deletePlayer`, `upsertContact` + refusal constants.
- `src/screens/PlayerForm.jsx` — **new**.
- `src/screens/PlayerDetail.jsx` — added `canEdit`/`onEdit`/`onDeleted` props and `FooterActions`.
- `src/screens/Roster.jsx` — "Add player" in the section head, `formState`, `canEditSelected`,
  `refresh`, wired `PlayerDetail` + `PlayerForm`.
- `tests/data.test.js` — `upsert` chain method on the mock builder + 17 new tests.
- `tests/player-form.test.jsx` — **new**, 40 tests.
- `harness/shoot-t15-verify.mjs` — **new** verification script.
- `harness/stubs/players.js` — write stubs recording payloads on `window.__writes`, `?contactFail=1`.
- `harness/main.jsx` — added the `roster-parent` scenario.

## Self-review findings

- **Completeness** — every brief checkbox covered, plus the failed-contact-read case the brief did
  not name (see above).
- **YAGNI** — no availability/RSVP work (Task 16). `POSITIONS` is kept local to `PlayerForm` rather
  than shared with `Roster`'s `FORWARDS`/`BACKS`: those are a *grouping* rule that must handle
  positions outside this list, not a list of choices. Merging them would couple two coincidentally
  similar things. Noted in a comment.
- **Naming** — `upsertPlayer`/`deletePlayer` mirror `upsertEvent`/`deleteEvent`; `upsertContact`
  reads as the natural-key upsert it is.
- **Real behaviour** — the tests assert recorded call payloads and ordering, not just return values;
  the two-writes contract, the retry-no-double-insert case and the blank-vs-cleared distinction are
  all behavioural.
- **Pristine output** — no `act()` warnings, no console errors, clean build.
- **Duplication I accepted**: `LABEL`/`FIELD`/`INPUT_BASE`/`Segmented` and `FOOTER_BUTTON` are now
  each in two files. Task 12 set the precedent ("two small copies is not yet a pattern") and said to
  extract on the third. A third form would be the trigger; there isn't one in the v1 plan.

## Concerns

None blocking. Two things worth flagging for later:

1. `upsertContact` uses `.upsert()`, which under RLS needs **both** the INSERT and UPDATE arms of
   the policy to permit the row. `"contact edit"` is `ALL`, so both are covered today. If that
   policy is ever split into separate INSERT/UPDATE policies, an upsert could be refused where an
   update alone would succeed. It would surface as a visible, correctly-worded error, not as silent
   loss — but it's a coupling worth knowing about.
2. The contact fields have no format validation (any string goes to `phone`/`email`). That matches
   the design system, which specifies plain text inputs, and matches the schema (both nullable
   `text`). The Wild Apricot import will need normalising anyway; validating here first would just
   mean two competing rules.

---

# Fix round 1 — review findings

Four findings addressed (2 Important, 2 Minor). All in `src/screens/PlayerForm.jsx` and
`tests/player-form.test.jsx`. Nothing else touched — in particular `EventForm.jsx` was left alone as
instructed. The deferred items (dead `invalid.teamId` branch, `club_id` on updates, the retry button
label) were not acted on.

## 1 (Important) — `PlayerForm` now enforces the per-player edit check itself

**The finding is correct and I accept it.** My file header claimed "a null contact row here can only
mean nothing recorded yet, never withheld" and justified it with "this form renders only for someone
who passes `can_edit_team`" — but the component's own gate was `editableTeams.length === 0`, i.e.
"has ANY editable squad". The per-player check lived only in `Roster.jsx`. The invariant was
asserted in one file and enforced in another, which is exactly the shape that rots: nothing is
exposed today, but a second caller or a regression in Roster's gating turns a withheld `null` into
blank, editable contact fields.

Split into two named gates in the component:

```js
const noEditableTeams = editableTeams.length === 0
const notThisPlayer = Boolean(player) && !canEditTeam(memberships, player.team_id)
const gated = noEditableTeams || notThisPlayer
```

The two reasons get separate copy, because "you coach no squads" and "you don't coach this one" are
different problems with different fixes: the first keeps the original wording, the second reads
"You can't change players in this age group. Ask a club admin if that looks wrong." The contact-read
effect already returns early on `gated`, so the wider gate also stops the `player_contacts` query
being issued for a player the user may not edit.

Header comment rewritten to state that the enforcement is local, and to say *why* it has to be —
so the next person to touch this can't quietly move it back out to the caller.

**Covering tests:**
- `refuses to render for a player whose squad this user cannot edit` — a coach of U14 handed a U12
  player: asserts the new copy, no Save button, **no Phone or Email field**, and
  `getPlayerContact` never called.
- `still lets a coach edit a player in a squad they do coach` — the gate must not refuse the normal
  case.
- `tells the two refusals apart rather than blaming the wrong thing` — a parent still gets the
  "no squad you can add or change" wording, not the per-player one.

## 2 (Important) — contact disclosure copy corrected

**Also correct.** The note said "Only coaches and club admins can see these." The confirmed read
policy is `can_edit_team(...) OR is_own_player(player_id)`, so the linked player can read their own
row. Not a leak, but it is a written safeguarding promise shown to the person typing a minor's
guardian details in, and it did not match the policy.

Now: **"Only coaches, club admins and the player themselves can see these. Leave them blank if you
don't have them."** The comment above it now quotes the policy verbatim and records that the earlier
wording misstated it.

**Covering test:** `promises exactly who can read the contact details, matching the RLS policy`.

## 3 (Minor) — squad reconciliation can no longer reassign a player's age group

Both the mount-time default and the per-render reconciliation fell through to `editableTeams[0]`
when the player's own team wasn't in the reconciled list, so the form could display and then save a
different squad than the one the player is actually in. Fixed in `PlayerForm.jsx` only:

```js
teamId: player ? player.team_id : fallbackTeamId            // initialValues
// and
: editing ? player.team_id : editableTeams[0]?.id ?? ''      // reconciliation
```

`EventForm.jsx` deliberately untouched.

**Covering test:** `never reassigns an edited player to a different age group behind the coach` —
a U14 player, a coach of both squads, and a `teams` list carrying only U12, so the player's team is
absent from the reconciled options. Asserts the write carries `team_id: 't-u14'` and explicitly
`not.toBe('t-u12')`.

## 5 (Minor) — validation error clears as the field is fixed

**Choice made: clear on any input change, and clear the edited field's highlight immediately.**
Reasoning: the banner's only job is to point at the highlights, and the highlights are already
per-field — a banner that outlives the state it describes is noise. Implemented in the shared `set`
helper so it applies to every field including the selects and the segmented control.

Only *validation* errors are cleared this way. A failed **write** survives typing, because nothing
the user types makes a refused save true again.

**Covering tests:**
- `clears the error and the invalid highlight as soon as the field is fixed` — after a blocked
  submit, typing one character removes `aria-invalid` and the alert.
- `keeps a failed SAVE on screen while typing, unlike a validation error` — the other half, so a
  future "just clear everything on change" simplification fails a test.

## Verification

New tests confirmed non-vacuous: stashing the amended component and re-running the suite fails
**exactly four** tests, one per fix, and nothing else.

```
$ git stash push -q src/screens/PlayerForm.jsx && npx vitest run tests/player-form.test.jsx
   × PlayerForm — shape and scoping > refuses to render for a player whose squad this user cannot edit
   × PlayerForm — shape and scoping > promises exactly who can read the contact details, matching the RLS policy
   × PlayerForm — validation > clears the error and the invalid highlight as soon as the field is fixed
   × PlayerForm — editing an existing player > never reassigns an edited player to a different age group behind the coach
      Tests  4 failed | 43 passed (47)
```

Restored, then:

```
$ npx vitest run tests/player-form.test.jsx
 ✓ tests/player-form.test.jsx (47 tests) 2673ms
 Test Files  1 passed (1)   Tests  47 passed (47)

$ npm test
 Test Files  18 passed (18)
      Tests  451 passed (451)

$ npm run build
 ✓ built in 2.66s
```

451 passing, up from 444 (+7 new tests). Nothing regressed.

Browser check re-run (`harness/shoot-t15-verify.mjs`, 8 scenarios × 375px and 1280px) after the
changes: byte-identical behaviour on every recorded write, zero character loss, no overflow, no
native dialogs, no console errors, and the null-contact player still shows `alerts: []` /
`mentionsHidden: false` with blank editable fields.

## Files changed in this round

- `src/screens/PlayerForm.jsx` — per-player gate, split refusal copy, corrected disclosure note,
  squad-reconciliation fallback, validation-error clearing, header comment updated.
- `tests/player-form.test.jsx` — 7 new tests (40 → 47).
