# Decision: gender on a player (7 Aug 2026)

**Commit:** `12b0fe0` on `build/v1-mvp` · **Migration:** `db/migrations/20260807_player_gender.sql` (applied live)

Jay asked for "male female buttons for the players". Recorded here because
four of the decisions underneath it are not obvious from the code.

## What was chosen

| Question | Jay's answer |
|---|---|
| Values | Male / Female only |
| Behaviour | Show on roster list, filter the roster, warn on squad mismatch |
| Who can set it | Admins, coaches **and parents** |

## 1. The column is nullable, permanently

`players.gender text` with `CHECK (gender IS NULL OR gender IN ('male','female'))`.

All 307 existing players have no value and there is nothing to backfill from —
the insurance export doesn't carry it, and squad names don't imply it (every
youth group is mixed). So **"not recorded" is a permanent third state**, not a
migration gap, whether or not the UI offers a button for it.

The CHECK also refuses `''`, so a form sending empty-on-no-answer cannot invent
a fourth state that reads as "recorded" to every `gender is not null` test.

Proven live with injected faults: `'M'` rejected, `''` rejected,
`'male'`/`'female'`/`null` accepted.

## 2. Parents needed a FUNCTION, not a policy

A parent holds **no write on `public.players` at all** — the only write policy
is `player edit`, gated on `can_edit_team`.

The obvious fix, an owner-update policy scoped by `is_own_player`, is the trap
already documented in `20260804_self_service_profile.sql` for `photo_path`:
RLS grants access to **rows, not columns**, so it would hand the parent
`full_name`, `position`, `is_captain` and — fatally — `team_id`. "Move my own
child into another squad" would become an RLS-approved write.

Column GRANTs can't save it (they attach to the `authenticated` role, shared by
coaches and parents), and no policy expression sees old and new rows at once,
so "unchanged except gender" is not statable.

So: `public.set_own_player_gender(uuid, text)` — SECURITY DEFINER, hard-coded
column list, `is_own_player` checked explicitly and first. Modelled line for
line on `set_own_player_photo`.

Proven live: an unowned caller is refused **and** the row is unmutated; the
function body contains no reference to `team_id` at all.

## 3. The squad-mismatch warning fails OPEN, deliberately

`squadExpects()` in `src/lib/gender.js` reads the squad **name**, because that
is the only signal in the schema (`teams` has id, club_id, name, sort_order,
is_senior). It classifies only the senior sides:

- `Senior Men 1st XV`, `Senior Men 2nd XV` → male
- `Women's XV` → female
- **every youth group → null, warns about nobody**

That last line is the point. A rule guessing "U15 means boys" would fire a
false warning on every girl in the youth section — hundreds of them — and a
warning that is usually wrong is one people learn to click past.

**The note never blocks a save.** The club has four women recorded in
"Senior Men 2nd XV"; a hard validation would make those four players
uneditable by anybody. There is a test that sets that exact case and asserts
the save goes through.

## 4. The roster filter reports what it is hiding

With almost every player unrecorded, "Female" on a 53-player squad can
legitimately show 2 rows — which reads as *"this squad has 2 girls"* rather
than *"2 recorded girls and 49 players nobody has answered for"*. Very
different things to put in front of a coach picking a team.

So the filter states the unrecorded count whenever it is non-zero. This is the
honest half of the feature, not decoration.

The filter is **not** persisted to localStorage (unlike the team filter) — a
sticky gender filter would look like players had vanished on the next visit.

## Visibility — flagged and accepted

`players.gender` is readable squad-wide under the `player read` policy
(`can_see_team`). Putting it on the roster list therefore means **every parent
in an age group can see it for every child in that group**. Jay was told this
before it shipped and chose it knowingly.

## Where it lives

- `src/lib/gender.js` — pure: `GENDERS`, `genderLabel`, `canonicalGender`, `squadExpects`, `squadMismatch`
- `src/components/Segmented.jsx` — extracted from PlayerForm so both forms share one control
- `src/screens/PlayerForm.jsx` — buttons + advisory mismatch note
- `src/screens/MyPlayerForm.jsx` — buttons, writes via the RPC, only when changed
- `src/components/RosterTable.jsx` — sortable, inline-editable column (the bulk-entry path for ~300 players; also the only control that can return someone to Not set)
- `src/screens/Roster.jsx` — row display + filter + unrecorded note
- `src/lib/playerImport.js` — optional 4th column; Male/M/Boy, Female/F/Girl
- `tests/gender.test.js`, `tests/gender-ui.test.jsx`

## Verification

1195 tests across 54 files, build clean. Both new client assertions proved
against injected faults: routing the parent save through `upsertPlayer` turned
the suite red; zeroing the unrecorded count turned it red.

Deployed bundle checked directly (`/assets/index-B1BxQEme.js`) — all eight
markers present, and the pre-change parent-form wording absent, proving it is
not a cached file.

Caught during the work: the new filter radios are named "Male"/"Female" too, so
an unscoped `getByRole('radio')` in a form test matches two elements. Every
form radio query is scoped to the dialog.

## Still open

The importer now carries gender, so the pending roster rebuild can bring it in
from the membership-system export — **if** that export has a gender column.
Worth checking before the rebuild, since the alternative is ~300 rows of
inline entry in the desktop table.
