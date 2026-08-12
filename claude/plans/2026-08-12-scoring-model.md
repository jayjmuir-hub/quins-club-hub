# Scoring — tries, conversions and the rest, per age group

**STATUS: SHIPPED, 12 Aug 2026.** Written the same day. All five steps are
live.

⚠️ **THE PLAN IS NOW HISTORY AND THE CODE IS THE AUTHORITY.** `src/lib/scoring.js`,
`private.scoring_kinds_for_team` and `db/tests/scoring.sql` are what the rules
actually are; this file records why they are that.

⚠️ **ONE THING SHIPPED WIDER THAN THIS PLAN ASKED, AND IT IS RECORDED RATHER
THAN QUIETLY DONE.** Step 4 says to drop `match_sheets.score_us` / `score_them`.
`tries_us` / `tries_them` went with them, because the plan's own §Where the
numbers live says `events` had no home for a try *at the time of writing* —
step 2 gave it one, and that turned those two columns into exactly the duplicate
the other two were. Leaving them would have kept half the disagreement the
ruling existed to remove.

⚠️ **AND ONE THING THE PLAN DID NOT MENTION AT ALL: `EventForm`.** It writes
`result_us` / `result_them` directly and does NOT send the components, so on a
fixture that has them the trigger recomputed from the stored ones and silently
overwrote whatever was typed. The boxes are now read-only there. **Nothing in
this plan predicted it** — it fell out of building step 3.

**Jay, 12 Aug 2026:** *"coaches and managers need a way to add scoring like
tries, conversions, etc - this should mirror the adhjrt scoring attributes per
age group, also a selectable option for scoring methods, like the tournamen, the
match sheets should also auto populate the details of the person filling it out,
coach or manager, full name, and phone number"*.

## The rules — the club's own, from age-grade rugby

⚠️ **THIS APP OWNS THESE RULES. THEY ARE NOT SHARED WITH, DERIVED FROM, OR
ANSWERABLE TO ANY OTHER PROJECT.** Jay, 12 Aug 2026, correcting an earlier draft
of this plan: *"this app and project should have absolutely nothing to do with
adhjrt, that is a completely different project, i only told you to use the same
type of scoring setup"*. A try is five points because that is rugby.

⚠️ **THE EARLIER DRAFT TREATED ANOTHER CLUB SYSTEM AS AN UPSTREAM SOURCE OF
TRUTH** and warned this app could go "silently wrong" if that system changed.
That was a misreading of the brief and is corrected rather than softened,
because a wrong "why" sends the next reader into another codebase to understand
this one. **Do not reintroduce a dependency on any other project here.**

```
POINTS = { tries: 5, conversions: 2, penalties: 3, drops: 3 }

U6-U8    tag rugby   tries only
U9-U11   contact     tries only  (a penalty is a free pass at U9 and
                                  tap-and-play at U10/U11, so there is no
                                  kick at goal to record)
U12-U13  contact     tries + conversions
U14+     full laws   tries + conversions + penalties + drops
```

⚠️ **CONFIRM AGAINST THE UAERF AGE-GRADE LAWS BEFORE A SEASON.** The progression
above is standard, but the governing body's laws are the authority, not this
file — which is exactly why the club can override any squad without a deploy.

⚠️ **EVERY SQUAD THE CLUB FIELDS COLLAPSES ONTO THE BAND NUMBER WITH NO
EXCEPTIONS**, which is what lets three thresholds replace a fifteen-row lookup:

| Band | Scoreable |
|---|---|
| ≤ 11 | `tries` |
| 12-13 | `tries`, `conversions` |
| ≥ 14 | `tries`, `conversions`, `penalties`, `drops` |

Checked band by band in `tests/scoring.test.js`, U6 through U18, boys and girls,
tag and contact. **A new squad needs no code change at all.**

⚠️ **KEY OFF `ageBandFromTeamName`, NEVER OFF THE SQUAD NAME'S LETTER.** In
`U14B` the trailing letter is **gender**, not a grade, and this repo has already
been bitten by it: `src/lib/ageGroup.js` carries a note about `U12G` failing to
parse because a letter follows the digits.

## ⚠️ The one duplication that is real, and it is INSIDE this app

The three thresholds exist twice here: `src/lib/scoring.js` and
`private.scoring_kinds_for_team` in the database.

**That is deliberate, and the alternative was worse.** If the trigger summed
every component while `scoring.js` ignores the kinds a squad may not score, the
**form would show one total and the database would store another** — and both
numbers would look plausible, which is the worst kind of disagreement.

What is duplicated is **three thresholds, not fifteen rows**, and
`tests/scoring.test.js` pins the JS side while `db/tests/` is where the SQL side
gets checked against it.



## ⚠️ The unknown-band default is PERMISSIVE, and that is deliberate

**Better to offer an option that goes unused than to make a score impossible to
enter.**

**Copy that, and do not "correct" it to match `allowsOwnContact`.** The two look
contradictory and are not:

- `allowsOwnContact` fails **closed** on an unknown squad, because the failure
  mode is *offering a twelve-year-old's own email and phone*. That already
  happened here.
- Scoring fails **open**, because the failure mode is *a coach on a pitch who
  cannot record a drop goal that was actually kicked*.

⚠️ **The harm is asymmetric in opposite directions, so the defaults point
opposite ways.** Anyone who unifies them will be breaking one of the two. Say
so in the module header.

## Where the numbers live — Jay ruled ONE score, on the fixture

Ruling, 12 Aug 2026: the fixture is the single source of the score, and
`match_sheets.score_us` / `score_them` go.

⚠️ **BUT TRIES HAVE NO HOME ON `events` AT ALL TODAY.** `events` has
`result_us` / `result_them` and nothing else; `match_sheets` has
`tries_us` / `tries_them`. That asymmetry is why the score fix was deliberately
left out of `4e8f646` — fixing it without this plan would build it twice.

**Add the components to `events`**, four per side:

```
tries_us conversions_us penalties_us drops_us
tries_them conversions_them penalties_them drops_them   -- all smallint null
```

⚠️ **NULL MEANS "NOT RECORDED", NEVER ZERO** — the same distinction the register
already makes, where "not recorded" is the absence of a row rather than an
`absent`. A side that scored no penalties and a side whose penalties nobody
wrote down are different facts, and averaging them together is how a statistic
becomes a lie.

### The total is DERIVED, and the trigger must not eat existing results

**The total is always computed from the components, never taken from the
client.** That is what stops a typo — or a tampered request — producing a score
that does not match the tries and kicks recorded beside it.

**Do it in the database**, which is where it belongs: RLS is already the
boundary, and the app is not the only possible writer.

⚠️ **AND THE TRIGGER MUST FIRE ONLY WHEN COMPONENTS ARE PRESENT.** There is
live data that would be destroyed otherwise: the U16B fixture holds
`result_us = 22, result_them = 12` with **every component null**, entered by
hand before components existed. A trigger that recomputes unconditionally turns
that into 0-0 and nothing reports it.

```
if every component on a side is null -> leave that side's result alone
otherwise                            -> result = sum(component * points)
```

⚠️ **Per SIDE, not per row.** A fixture where our components are recorded and
the opposition's are not is the normal case at half-time.

⚠️ **A Postgres self-assignment (`set x = x`) does NOT fire a `distinct from`
check** — already recorded in `state-of-play.md`, and this migration is exactly
where it would bite. **Read the rows back.**

## Scoring method — Jay's "selectable option, like the tournament"

`events.competition_type` already answers *league / tournament / neither*.
**Reuse it. Do not add a second axis that can disagree with it.**

The scoring method is then: **band default**, or **the tournament's rules**.
⚠️ **A tournament may run its own scoring**, so picking that option must say
which rules were applied and when — not silently recompute months later. That is
what `teams.scoring_kinds` is for.

⚠️ **`competition_type = 'tournament'` WITH A LEAGUE-SOUNDING NAME IS ALREADY IN
THE DATA.** The U16B fixture is `competition_type = 'tournament'` and
`competition = 'UAE Youth League'`. That contradiction is what left its
`league_team_id` null and produced the wrong TEAM box. **Surface it; do not
guess which one the coach meant.**

## Auto-populating the person filling it in

The RCM form's footer is `Team Manager/Coach details — NAME: / SIGNATURE:`.
`match_sheets.manager_name` is free text and was **null** on the sheet Jay
filed, because it asks a human to retype what the app already knows.

**Default it from the signed-in profile**, `full_name` and `phone`.

⚠️ **DEFAULT, NOT LOCK.** The person filling the form in is not always the
person whose details RCM wants — a manager fills it, a coach signs it.
**Prefill and let it be overwritten.**

⚠️ **PHONE IS A NEW FIELD ON THE SHEET AND NEEDS A COLUMN**
(`match_sheets.manager_phone`). ⚠️ **AND IT IS STORED AS TEXT, NOT JOINED** —
same rule as `full_name` beside a live `player_id`: a filed sheet must still say
what was filed after somebody changes their phone number.

⚠️ **`profiles.phone` IS ONE OF ONLY FIVE COLUMNS `authenticated` MAY UPDATE**,
and `profiles.email` is protected by a COLUMN grant rather than a policy. Adding
a column to `profiles` is a decision, not a detail — but **nothing here needs
one**, because the phone is copied onto the sheet, not added to the profile.

## Order to build

1. ✅ `src/lib/scoring.js` + its pinning test. Pure, no schema. **Prove the band
   mapping against every band the club fields.**
2. ✅ The migration: eight component columns, the guarded trigger, grants,
   `db/schema/` re-capture. ⚠️ **Grants are not optional** — `docs:check` fails
   a build if a migration grants on a table the capture does not name.
3. ✅ Score entry on the match sheet, built FROM `scoringFor(band)` so the form and
   the total can never disagree.
   ⚠️ **IT SITS OUTSIDE THE FACSIMILE, AND THAT WAS THE ONE DESIGN CALL THIS
   PLAN LEFT OPEN.** RCM's form has exactly two boxes per side — FINAL SCORE and
   TRIES. Conversion, penalty and drop-goal boxes drawn INSIDE it would
   photograph as a form the governing body never issued, and the photograph is
   the entire artefact. So the components are entered in a card above the form,
   and the form's four boxes became derived text.
4. ✅ Drop `match_sheets.score_us` / `score_them` **last**, once nothing reads
   them. ⚠️ Both are null on the only sheet that exists — measured 12 Aug — so
   nothing is lost, but re-measure before dropping. **Re-measured, and it still
   held: one sheet, all four columns null.** `tries_us` / `tries_them` went too
   — see the note at the top of this file.
5. ✅ Manager name and phone.

**Shipped alongside, not in this list:**

- ✅ **`teams.scoring_kinds` is settable**, on the Club tab, in the same row as
  the league teams. Step 2 added the column; nothing could write to it, which
  made the override a thing only SQL could reach. Clearing writes NULL rather
  than the band's list, so a squad following the age-grade progression keeps
  following it when the progression is corrected.
- ✅ **`db/tests/scoring.sql`**, which step 2's migration already claimed
  existed. Run against production: all fifteen squads agree with the JS, all six
  trigger cases pass, and the fault injection goes red.
- ✅ **A `match-sheet` harness scenario.** The widest screen in the app had no
  real-browser coverage at all.

## What this plan deliberately does NOT do

- **No standings or league table.** Out of scope for this app.
- **No per-player attribution of tries.** Jay asked for team scoring; who scored
  is a bigger feature and a separate conversation.
- **No editing of the points VALUES from the app.** They are World Rugby's, not
  the club's. The scoreable SET per band is what varies.
