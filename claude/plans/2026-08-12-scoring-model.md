# Scoring — tries, conversions and the rest, per age group

**STATUS: NOT SHIPPED.** Written 12 Aug 2026.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

**Jay, 12 Aug 2026:** *"coaches and managers need a way to add scoring like
tries, conversions, etc - this should mirror the adhjrt scoring attributes per
age group, also a selectable option for scoring methods, like the tournamen, the
match sheets should also auto populate the details of the person filling it out,
coach or manager, full name, and phone number"*.

## The upstream model — MEASURED, not remembered

Read off `C:\Users\Jay\GitHub\adhjrt\netlify\functions\_scoring.js` on
12 Aug 2026. ⚠️ **That file is in a DIFFERENT REPO whose root is a published
website. It was read and nothing was written to it** — see `CLAUDE.md`.

```
POINTS = { tries: 5, conversions: 2, penalties: 3, drops: 3 }

u6-u8    tag rugby   tries only
u9-u11   contact     tries only  (penalties are a free pass at U9 and
                                  tap-and-play at U10/U11, so there is no
                                  kick at goal to record)
u12-u13  contact     tries + conversions
u14+     full laws   tries + conversions + penalties + drops
```

⚠️ **THE FIFTEEN-ROW TABLE COLLAPSES ONTO THE BAND NUMBER WITH NO EXCEPTIONS**,
which matters because it lets this app avoid adhjrt's age-group *ids* entirely:

| Band | Scoreable |
|---|---|
| ≤ 11 | `tries` |
| 12-13 | `tries`, `conversions` |
| ≥ 14 | `tries`, `conversions`, `penalties`, `drops` |

Checked against every row: `u6 u7 u8 u9 u10 u11` → tries; `u12 u12g u13` →
tries+conv; `u14b u14g u16b u16g u18b u18g` → full. **No row disagrees.**

⚠️ **KEY OFF `ageBandFromTeamName`, NEVER OFF THE SQUAD NAME'S LETTER.**
adhjrt's ids encode gender (`u16b` = U16 **Boys**), and this repo has already
been bitten by exactly that: `src/lib/ageGroup.js` carries a note about `U12G`
failing to parse because a letter follows the digits. The band number is the
only thing needed here, and it sidesteps the trap completely.

## ⚠️ THE FINDING THAT CHANGES THE DESIGN — a copy here would be the THIRD

adhjrt's own test file says it out loud:

> *"The scoring model is carried TWICE and nothing asserted the two copies
> agree"* — `netlify/functions/_scoring.js` (server) and `scores-data.js`
> (browser). `tests/test-scoring-model.js` exists because a drift there means
> the form shows one total and the server stores another.

**Copying the table into this repo makes a third copy, in a third deploy, that
no test in either repo can compare.** And it is worse than an ordinary
duplicate:

⚠️ **adhjrt LETS AN ORGANISER CHANGE ANY AGE GROUP'S SCORING WITHOUT A DEPLOY.**
`loadRules()` merges overrides out of Netlify Blobs over the defaults. So the
moment an organiser edits the tournament's rules, adhjrt is right and this app's
copy is silently wrong — **and nothing anywhere would report it.** This is the
same shape as every "two copies of a fact" failure already recorded here.

**What to do about it, and it is not "import it":** the two apps cannot share
code — different repos, different hosts, different runtimes.

1. **The defaults live in ONE module here**, `src/lib/scoring.js`, with the
   adhjrt file named in its header as the upstream.
2. **The values are pinned by a test** that fails if anyone edits them casually,
   the way `tests/theme.test.js` pins tokens.
3. ⚠️ **The screen says where the rule came from** when a scoring method other
   than the club default is in play. A coach entering a tournament score needs
   to know whose rules the total was computed under.
4. **This app never claims to be authoritative for an adhjrt tournament.**
   The tournament's own site is.

## ⚠️ The unknown-band default is PERMISSIVE, and that is deliberate

adhjrt: *"Unknown age groups get the full set rather than the narrowest — better
to offer an option that is not used than to make a score impossible to enter."*

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

adhjrt: *"Totals are always computed from the components, never taken from the
client. That is what stops a typo — or a tampered request — producing a score
that does not match the tries and kicks recorded beside it."*

**Do it in the database here**, which is stronger than adhjrt's server-side
computation because RLS is already the boundary.

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
⚠️ **A tournament's rules are adhjrt's to change**, per the finding above, so
picking that option must say which rules were applied and when — not silently
recompute months later.

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

1. `src/lib/scoring.js` + its pinning test. Pure, no schema. **Prove the band
   mapping against every adhjrt row.**
2. The migration: eight component columns, the guarded trigger, grants,
   `db/schema/` re-capture. ⚠️ **Grants are not optional** — `docs:check` fails
   a build if a migration grants on a table the capture does not name.
3. Score entry on the match sheet, built FROM `scoringFor(band)` so the form and
   the total can never disagree.
4. Drop `match_sheets.score_us` / `score_them` **last**, once nothing reads
   them. ⚠️ Both are null on the only sheet that exists — measured 12 Aug — so
   nothing is lost, but re-measure before dropping.
5. Manager name and phone.

## What this plan deliberately does NOT do

- **No standings or league table.** adhjrt owns that.
- **No per-player attribution of tries.** Jay asked for team scoring; who scored
  is a bigger feature and a separate conversation.
- **No editing of the points VALUES from the app.** They are World Rugby's, not
  the club's. The scoreable SET per band is what varies.
