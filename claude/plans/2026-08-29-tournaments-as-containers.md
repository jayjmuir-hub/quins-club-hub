# Tournaments as containers, with games underneath

**Status: NOT SHIPPED — spec only, no code written.** Dated 2026-08-29.

## What Jay asked for

Adding a tournament today is unintuitive: you pick **Match**, then scroll ten
fields down to a **Competition** dropdown and switch it to Tournament. Jay wants
a tournament to be a first-class thing you choose up front, and — once chosen —
to be set up as its own object with the individual games recorded underneath it.

Decisions taken during the design conversation (29 Aug 2026):

- **Entry point:** a small "What are you adding?" chooser (Match · Tournament ·
  Training · Social) opens first; picking one opens the form already set up for
  that kind. (Option C of the four mocked; the others are recorded in the same
  conversation and were rejected.)
- **Depth: a tournament is a container.** The tournament row holds the day's
  logistics; each **game** played is a separate fixture underneath it. (Model 2
  of three offered.)
- **Per game: "everything".** Each game carries opponent, kick-off time, a
  stage/pool label, a score, and its own team sheet — i.e. a game is an ordinary
  match fixture with a parent.
- **Outcome is two layers, both kept:** each game has its own score (the
  detail), and the tournament carries an optional overall **placing** — Winners,
  Runners-up, Semi-final, Pool stage, custom (the headline). They are not the
  same thing and neither is derived from the other: you can win every pool game
  and lose the final.
- **Team sheet:** the tournament itself shows a **touring-squad list** (who
  travelled — the availability list is the source). The formal positional 22
  belongs to each **game**, reusing the existing match sheet unchanged.

## The shape, in one line

A **tournament** is an `events` row with `competition_type = 'tournament'` and
no parent. Its **games** are `events` rows of `type = 'match'` that point back at
it. Everything a game needs — the match sheet, the score trigger, availability's
security path — already keys off an event row, so a game reuses all of it.

## Data model

### The container / game distinction

| | Tournament (container) | Game (child) |
|---|---|---|
| `type` | `'match'` | `'match'` |
| `competition_type` | `'tournament'` | `'tournament'` |
| `competition` | the tournament's name | the tournament's name (copied down) |
| `tournament_id` (**new**) | `NULL` | the container's `id` |
| `opponent` | `NULL` | the side played (e.g. "Exiles") |
| `placing` (**new**) | optional headline | `NULL` |
| `stage` (**new**) | `NULL` | optional "Pool A" / "Semi-final" |
| `starts_at` / `ends_at` | arrival / finish of the day | the game's kick-off |
| score components | `NULL` | tries/conversions/penalties → `result_us`/`result_them` |
| match sheet | none | one, optional |
| availability (RSVP) | **yes — one, for the day** | none |
| appears in Schedule/calendar | **yes** | **no — only inside its tournament** |

### Why a new `tournament_id`, not `group_id`

`group_id` is already taken. Since 5 Aug 2026 it means **multi-squad fan-out**:
one session copied across several age groups, each copy a separate row sharing
the `group_id` (`db/schema/tables.sql`, the events block; `src/data/pitches.js`
`findPitchClashes` treats a shared `group_id` as *not* a pitch clash; the
availability functions in `db/schema/functions.sql` collapse on it). A
tournament's games are the opposite relationship — different fixtures, one
squad, one parent — so overloading `group_id` would make "same session, many
squads" and "many games, one tournament" indistinguishable and would corrupt
pitch-clash and availability grouping. `series_id` is likewise spoken for
(repeating sessions across dates). A dedicated column is the honest move.

Note this also means the **"Also add for" multi-squad fan-out and Repeats are
not offered on a tournament** — a tournament is a one-off for one squad. Hiding
them keeps `tournament_id` and `group_id`/`series_id` mutually exclusive by
construction, the same discipline the existing `group_id`/`series_id` "never
both set" rule already follows.

### New columns (one additive migration)

```sql
alter table public.events
  add column tournament_id uuid
    references public.events(id) on delete cascade,
  add column placing text,
  add column stage   text;

create index events_tournament_id_idx on public.events
  using btree (tournament_id) where (tournament_id is not null);
```

- `tournament_id … on delete cascade`: deleting a tournament deletes its games,
  and each game's `match_sheets` row already cascades from `events` (see
  `match_sheets_event_id_fkey`, `ON DELETE CASCADE`), so the whole subtree goes
  cleanly. **The UI must confirm loudly** — a two-step inline confirm naming how
  many games will be removed, mirroring the "delete this and every later
  session" series pattern. Never a native `confirm()`.
- `placing`, `stage`: free text, nullable, no CHECK — the same "a one-off needs
  no migration" reasoning `competition` already carries. The app offers a short
  pick list plus a custom box for each.
- All three are nullable with no default, so **every existing row keeps its exact
  meaning** and no backfill is needed.

### Optional integrity (recommended, not required)

A game's `tournament_id` should point at a container of the **same `team_id`**
and one that is itself a tournament. Cross-row invariants need a trigger (a
CHECK can't see another row). Worth a `BEFORE INSERT/UPDATE` trigger on
`events` that rejects a `tournament_id` whose target is not
`competition_type = 'tournament' AND tournament_id IS NULL AND team_id = NEW.team_id`.
Defer if it complicates the first cut; the app writes both sides so a bad link
is only reachable by a hand-written query.

## The rule that keeps the calendar clean

**`tournament_id IS NULL` means "a top-level calendar entry".** Games are shown
only inside their tournament, never loose in the schedule. So every read that
feeds a calendar-shaped surface must add `tournament_id IS NULL`:

- `src/data/events.js` — `listEvents` (the Schedule/Dashboard read).
- `src/data/limits.js` — the paged event reads.
- `public.calendar_events_for_token` (the `.ics` feed, `db/schema/functions.sql`;
  it's a `SECURITY DEFINER` function returning a TABLE — add the filter to its
  `WHERE`, a `CREATE OR REPLACE` migration) and the edge function that serves it
  under `supabase/functions/calendar/`.
- The pitch allocation grid / `findPitchClashes` (`src/data/pitches.js`). Games
  are usually at another club's venue with no pitch, but filter for safety so a
  game can never occupy one of our pitch slots.

Miss one of these and games leak into the calendar as duplicates of the
tournament. This is the single riskiest part of the change and deserves a test
per read path (below).

## Display / naming

`src/lib/eventFormat.js` `eventTitle` currently returns `competition` (the
tournament name) for **any** `type='match'` row with
`competition_type='tournament'`. A game is exactly that shape *and* has an
opponent, so it would wrongly render "Al Ain Tournament" instead of "Quins vs
Exiles". Guard the tournament-name branch so it only fires for the **container**:

```js
// container only: a game (tournament_id set) is named by its opponent
if (event?.type === 'match' && event.competition_type === 'tournament'
    && event.competition && !event.tournament_id) {
  return event.competition
}
```

The existing opponent branch below then handles a game → "Quins vs Exiles". Rows
predating this change have `tournament_id = NULL`, so they keep today's
behaviour exactly.

## Screens and flow

1. **Chooser** (new, small). Schedule's "Add event" opens a `Sheet` with four
   tappable cards. Picking routes into `EventForm` with the chosen kind
   pre-selected (a prop, e.g. `initialType` / a `tournament` flag). This retires
   the top-of-form `Segmented` "Type" control as the entry point, though the
   form can keep it for editing an existing event.

2. **Tournament setup form** (a mode of `src/screens/EventForm.jsx`). When the
   kind is tournament, reshape:
   - **Show:** Tournament name (the existing `TOURNAMENTS` picker + "Something
     else", moved to the top, required) · Age group · Date · Arrival + Finish
     time (+ "time TBD") · Venue · Tier (U11+ only, as today) · Availability.
   - **Hide:** Opponent · Home/Away · League team · Round · the Competition
     dropdown (the chooser already answered it) · score boxes · match sheet ·
     Repeats · "Also add for".
   - On save: one `events` row, `type='match'`, `competition_type='tournament'`,
     `tournament_id=NULL`, `competition=<name>`, optional `placing` left null at
     creation (set later from the detail screen).

3. **Tournament detail** (extend `src/screens/EventDetail.jsx`, or a sibling).
   When the event is a container, render:
   - Header card: name, age group, date, venue, tier.
   - **Placing** — editable pick (Winners / Runners-up / Semi-final / Pool stage
     / custom), writes `placing` on the container.
   - **Touring squad** — a link into the existing availability list for the day.
   - **Games** — list of child rows ordered by `starts_at`, each showing
     kick-off, "Quins vs <opponent>", and the score (won/lost colour). Row taps
     through to the game. Plus **＋ Add game**.

4. **Add game / game form** (the fast path). A lightweight fixture form that
   **inherits** `team_id`, date, `venue`, `tier`, `competition`,
   `competition_type` from the container and asks only: opponent, kick-off time,
   stage, score. Writes an `events` row with `tournament_id = container.id`. This
   is a narrowed reuse of `EventForm`'s existing match path, not a new writer.

5. **Game detail** — reuse `EventDetail` + `src/screens/MatchSheet.jsx` as they
   are. The match sheet keys off `event_id` and needs no change; a game is just
   an event with a parent. Date/venue/squad show as inherited context.

## Security (RLS)

No new policy needed. The `events` "event edit" policy is
`can_edit_team(team_id)` and "event read" is `is_attached_to_team(team_id)`; a
game carries the **same `team_id`** as its container, so create/read/edit/delete
of games is already governed correctly, and the three new columns live on the
same table under the same policies. The cascade delete runs as the deleting
user, so it too is gated by the edit policy on each row. Confirm with a harness
(below) rather than by reading — the standing rule.

## Migration and deploy sequencing

The column add is additive and nullable, so it is safe to apply **before** the
app that uses it. The read-path filters (`tournament_id IS NULL`) only start
mattering once games exist, and no game can exist until the new app writes one —
so ordering is: apply the migration → ship the app. The `eventTitle` guard is a
no-op on existing data (all `tournament_id` null), so it can land with the app.

`calendar_events_for_token` is the one read path that is a **database** object;
its `CREATE OR REPLACE` goes in the same migration as the columns, and — like
every function change — must be proven against an injected fault, not assumed
(the rules' "prove every new assertion" line).

DB branching does not work on this repo (no `supabase/migrations/` to replay);
validate with a rolled-back `db/tests/` harness against production — see
`claude/runbooks/db-harnesses.md` (`npm run db:check`). Prove the rollback
before trusting the runner with DDL.

## Tests

- **Schema harness** (`db/tests/`): the new columns exist; `tournament_id`
  cascade removes games and their match sheets; a control table that should
  survive does. RLS: a coach of the squad can add a game; a coach of another
  squad cannot.
- **Read paths** (unit): `listEvents`, `limits.js`, and the calendar function
  each EXCLUDE game rows and INCLUDE the container. One test per path — this is
  where a leak hides.
- **Display**: `eventTitle` returns the tournament name for a container and
  "Quins vs <opponent>" for a game; existing (`tournament_id` null) rows
  unchanged.
- **Form**: the chooser routes to the right kind; tournament mode hides
  opponent/home-away/league-team/round/competition/score/repeats/also-add-for;
  add-game inherits date/venue/squad/tier and writes `tournament_id`.
- **Delete**: the two-step confirm names the game count; cancel writes nothing.
- Follow the invented-data rule — opponents like "Exiles"/"Dragons"/"Al Ain",
  never a real child's name, in any fixture or harness.

## Suggested build order

1. Migration (columns + index + `calendar_events_for_token` filter) and its
   `db/tests/` harness. Nothing user-visible; safe to land first.
2. Read-path filters + `eventTitle` guard + their tests. Still invisible (no
   games exist yet), but now the calendar is ready for them.
3. Chooser + tournament setup mode in `EventForm`.
4. Tournament detail: games list, placing, touring-squad link.
5. Add-game form + game detail wiring (match sheet reused as-is).
6. Delete-with-confirm.

Steps 1–2 are a self-contained, shippable PR that changes no behaviour. 3–6 are
the visible feature and can be split further.

## Open questions / deferred

- **Multi-day tournaments.** The event model is one club calendar day
  (`handleSubmit` builds both ends from one date field). A festival spanning a
  weekend would need each day as its own container, or an end-DATE field — out
  of scope here; flag if a real one comes up.
- **Placing pick list.** Exact options to confirm with Jay (Winners /
  Runners-up / Semi-final / Quarter-final / Pool stage / Plate / custom?).
- **Stage vocabulary.** Same — a short closed list plus custom, or free text.
- **Does a tournament need availability at all, or is a touring-squad list
  entered directly?** Spec assumes availability drives the squad list, matching
  every other event; revisit only if coaches want to enter a squad without an
  RSVP round.
