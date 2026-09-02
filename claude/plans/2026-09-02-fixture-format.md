# Format on the fixture: 7s, 10s, 12s or 15s

**Status: BUILT on branch claude/fixture-format, 2 Sep 2026 — pull request pending; see the implementation plan.** Dated 2026-09-02.

Piece 1 of 3 in the senior-squads work. It ships on its own, before and
independently of `claude/plans/2026-09-02-senior-squads.md`, which builds on it.

## What Jay asked for, and why this comes first

Jay, 2 Sep 2026: *"all the age groups that play league play 15's, but
sometimes tournaments are 10, 12, or 15 or even 7's."*

The RCM and UAERF 2025/26 Mini and Youth law variations (Rev.3, read the same
day) confirm the shape, and add the one fact the app currently gets wrong:
U18 Boys and U18 Girls play **10s, 12s or 15s depending on the fixture, with a
maximum squad of 15, 18 or 22 to match**, and U16 Girls play 10s. The match
sheet has 22 fixed slots, so a U18 10s fixture already gets a sheet with seven
slots that should not exist. That is a live defect, not a senior-side wish.

This piece is small and both later pieces depend on it: senior squads play
15s in the league and 7s at tournaments, and a U18 called up to a 7s day needs
a 12-player sheet, not a 22.

⚠️ Correction found in the build: the RCM match sheet applies to league
fixtures only, so no live fixture had a mis-sized sheet; see the changelog
entry.

## Decisions taken (2 Sep 2026)

- **Format is a property of the FIXTURE, not the squad.** A squad plays 15s
  on Friday and a 7s tournament the next weekend. Storing it on the squad
  would be wrong for every tournament.
- **A league match is always 15s.** The form does not ask. Jay: every age
  group that plays league plays 15s.
- **A tournament asks**, defaulting from the squad's usual format.
- **A friendly asks**, same default.
- **The format drives sheet size, replacements and substitution rows.** It
  does not drive anything about permissions.

## Arguments against, recorded so they are not re-made

- *"Derive it from the age group, the laws table says which format each age
  plays."* The laws table gives U18 three formats and a tournament can be any
  of them. A derived answer would be wrong exactly when it matters.
- *"Put it on the squad as a default and stop there."* A default alone
  leaves the U18 10s sheet wrong. The fixture has to hold the answer.
- *"Use `lineups.players_per_side`, it already exists."* That column is a
  per-LINEUP guide the coach sets when picking, and it is a warning not a
  rule (`db/migrations/20260814_lineup_squad_size.sql`). A fixture's format
  is known before any lineup exists and the match sheet needs it without one.
  The lineup's `players_per_side` should DEFAULT from the fixture's format;
  it does not replace it.

## Data

One column on `events`:

| Column | Type | Meaning |
|---|---|---|
| `format` | `smallint`, nullable, CHECK in (7, 10, 12, 15) | Players a side. NULL means "not stated" and reads as 15 everywhere, so every existing row behaves exactly as today. |

One column on `teams`:

| Column | Type | Meaning |
|---|---|---|
| `default_format` | `smallint`, nullable, same CHECK | What a new tournament or friendly for this squad pre-selects. NULL means 15. Set per squad by an admin on the Club tab. |

A league fixture (`competition_type = 'league'`) is written with `format = 15`
by the form, and a DB CHECK refuses any other value on a league row, so a
hand-rolled REST call cannot make a league game a 7s.

Derived, not stored, in one place (`src/lib/fixtureFormat.js`, pure, no React):

| Format | Sheet slots | Replacements | Squad max |
|---|---|---|---|
| 7 | 12 | 5 | 12 |
| 10 | 15 | 5 | 15 |
| 12 | 18 | 6 | 18 |
| 15 | 22 | 7 | 22 |

Squad max comes straight from the laws table (12 / 15 / 18 / 22). Sheet slots
equal squad max. These numbers live in the lib and nowhere else; the match
sheet, the lineup and the availability count all import them.

⚠️ Minis are untouched. U6 to U10 have their own formats and squad sizes
(`src/lib/minis.js`) and no match sheet. The format field is not OFFERED on a
minis fixture. The existing fail-open rule in `minis.js` stands.

## Screens

- **Event form** (`src/screens/EventForm.jsx`, `src/screens/AddGameForm.jsx`):
  a four-way segmented control, 7s / 10s / 12s / 15s, shown for a tournament
  or friendly on a U11-and-over squad. Hidden on a league match, which is
  written as 15. Pre-selected from the squad's `default_format`.
- **Event detail and the schedule chip**: the format appears in the subtitle
  only when it is not 15 ("7s · Al Ain Tournament"). Fifteen is the norm and
  saying it on every row is noise.
- **Match sheet** (`src/screens/MatchSheet.jsx`): `emptySlots()` and
  `slotsFrom()` take the slot count from the fixture's format instead of the
  literal 22. A sheet saved with 22 slots for a fixture later changed to 10s
  keeps its saved rows and shows the extras under a "beyond the 15 allowed"
  note rather than dropping them silently.
- **Lineup** (`src/screens/Lineup.jsx`): `players_per_side` defaults from the
  fixture's format on first open. `SIDE_SIZES` gains nothing; 7, 10, 12 and
  15 are already in it.
- **Club tab**: a per-squad "usual tournament format" select, admin only.

## Notifications

None. Changing a fixture's format is an edit like any other and goes through
the existing fixture-changed push.

## Testing

- `tests/fixture-format.test.js`: the table above, asserted both ways, plus
  "null reads as 15" with a control that a stated 7 does not.
- Match sheet: render a 10s fixture, assert 15 slots and not 22, with the
  control that a null-format fixture still renders 22.
- Event form: league hides the control and writes 15; tournament shows it and
  writes the pick; a minis squad shows nothing.
- `db/tests/fixture-format.sql`: the CHECK refuses 9, refuses a 7s league
  row, accepts a 7s tournament; rolled back.

## Deploy

One migration, one app deploy. No edge function changes. The calendar feed
(`supabase/functions/calendar`) does not need the format, so it is not
redeployed.

## Non-goals

- No half lengths or match timings from the laws table. Game Time does not
  read them today and this piece does not start.
- No "everyone plays half the match" or "90 minutes per day" enforcement.
  Worth doing for juniors one day; not here.
- No per-format pitch or ball size. The sheet does not carry them.
