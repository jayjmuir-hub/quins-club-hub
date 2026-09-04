# Standings and results: league tables from three routes into one table

**Status: STEP 1 AND THE SEASON IMPORT BUILT, #684, 3 Sep 2026** — competitions,
sides, fixtures, results with a supersedes chain, the standings function, the
sheet trigger, division setup, route 1 (type it) and the grid import
(`db/migrations/20260905_competitions_and_standings.sql`, `src/lib/rcmGrid.js`,
`src/screens/Standings.jsx`, `src/screens/AdminCompetitions.jsx`). The keeper UI and the
Monday nudge followed in #688 (4 Sep 2026). Routes 2 and 3 are NOT built. Keepers are a join table rather
than a scoped admin right — see the migration header. Dated 2026-09-02.

Piece 4 of the senior-squads work, split out of
`claude/plans/2026-09-02-senior-squads.md` because it applies to every age
group that plays league, juniors included, and would have bloated a senior
spec. Depends on piece 1 (`claude/plans/2026-09-02-fixture-format.md`) only
in that it reuses the fixture's competition fields; it can be built before or
after pieces 2 and 3.

## What Jay asked for

Jay, 2 Sep 2026: *"we should have league tables and standings and we also
need to discuss that for juniors who play league (how to do it?)."* Then,
offered three routes — type the other clubs' results in, import them from
wherever the union publishes them, or show only this club's own record —
*"option 1 and 2 for standings and tables, option to use either."* And on
where the results live today: *"it could be a website or document or
message."*

## The problem, plainly

A league table needs EVERY result in the division, including matches this
club did not play. The app records only this club's own scores
(`events.result_us`, `result_them`, derived from the match sheet's
components). Everything below is about getting the other results in, from
whatever form they arrive in, without a person having to retype what a
machine could read, and without a machine ever writing a score nobody
checked.

## Decisions (2 Sep 2026)

- **Both manual entry and import, per division, switchable any week.** Not
  one or the other.
- **Standings are computed, never stored.** A corrected result fixes the
  table by itself.
- **Nothing reaches the results table without a person confirming it.** The
  reader (below) proposes; a person confirms. This is the rule that makes
  import safe to offer.
- **Juniors get the same screens**, per age group per division, using the
  league teams the app already holds (`league_teams`: `rcm_name`,
  `division`, per squad). U11 and below stay out — no league there
  (`src/lib/minis.js`).
- **Every result carries its source.** A reader can tell a scraped score
  from a typed one from an unconfirmed guess.

## Arguments against, recorded so they are not re-made

- *"Just link to the union's table."* That was option 3 and Jay wants the
  table in the app. The link still appears under the table where a division
  has one.
- *"Only manual entry; import is over-engineering."* Manual entry rots the
  first week nobody does it, across six junior divisions and several senior
  ones. Import with a human confirm is what keeps the table alive when the
  volunteer is busy.
- *"Let the reader write results directly, it is accurate enough."* A wrong
  score in a league table is a dispute with another club. The confirm step
  costs one tap and buys that argument never happening.
- *"Store the standings."* Then a corrected result needs a recompute job, and
  the job is the thing that breaks. Computing from results is cheap at this
  size — a division is a few hundred rows a season.

## Data

### `competitions`

One row per division per season: `club_id`, `name` ("U14 Division 2"),
`season` ("2026-27"), `age_band` (nullable smallint; null for senior),
`is_senior`, `results_url` (nullable text — the union's page for route 3),
`points_win`, `points_draw`, `points_loss`, `bonus_try_threshold`,
`bonus_losing_margin` (all smallint, nullable; null means "not used").
`league_teams` gains `competition_id` so an existing ADHQ1/2/3 maps onto its
division.

⚠️ Points rules are a SETTING, not code. RCM may not use World Rugby's
4/2/0 with try and losing bonuses at every age, and a junior division may use
none. A change is an admin edit, not a deploy.

### `competition_sides`

The other clubs' sides in a division: `competition_id`, `name`, `is_ours`
(true for the row that maps to a `league_teams` row), `sort_order`. Added by
the keeper as results mention them, or from the fixture list if the union
publishes one.

### `competition_results`

Every match in the division: `competition_id`, `round` (nullable), `played_on`
(date), `home_side_id`, `away_side_id`, `home_score`, `away_score`,
`source` (`'sheet' | 'typed' | 'read' | 'fetched'`), `source_note` (the
text the reader read, or the URL, or null), `confirmed_by`, `confirmed_at`,
`supersedes` (nullable self-reference), `superseded_at`, `created_by`.

- Our own match is written here automatically when its match sheet is
  saved with a score, `source = 'sheet'`, already confirmed — staff entered
  it on the sheet and that is the confirmation.
- A correction is a NEW row with `supersedes` pointing at the old one, and
  a reason in `source_note`. The old row stays, marked superseded. Standings
  read only unsuperseded, confirmed rows. Cheap, and it ends "who changed
  the score".

### `competition_result_proposals`

The review queue: `competition_id`, `raw_text` (what the reader was given
or found), `proposed` (jsonb — an array of `{home, away, home_score,
away_score, round?, played_on?, confidence}`), `origin` (`'pasted' |
'photo' | 'pdf' | 'fetched'`), `created_by`, `status` (`'open' |
'confirmed' | 'discarded'`). A confirm writes `competition_results` rows and
closes the proposal.

### Standings

A SQL function `competition_standings(_competition uuid)` returning position,
side, played, won, drawn, lost, points for, against, difference, bonus
points, points — from unsuperseded confirmed results and the competition's
points settings. Ties broken by points difference then points for, which is
World Rugby's default; a `tiebreak` setting can come later if a division
differs.

## Routes in

### 1. Type it

A grid for a round: the division's fixtures down the side, two score boxes
per row. Our own match is pre-filled from the sheet and not editable here.
If the fixture list is not known in advance, the keeper adds a row by
picking two sides. Saves as confirmed `typed` results in one tap.

### 2. Paste or share it

A WhatsApp message with the round's results, a screenshot of a table, a PDF
the league secretary circulates, a photo of a printed sheet. The keeper
shares it into the app (the PWA share target, or a paste box, or a file
picker). A **reader** — an AI model called from a Supabase edge function,
the same place `notify-*` and `push-send` live — extracts
`{home, away, home_score, away_score}` rows and writes a PROPOSAL. The
review screen shows each line the reader read beside the result it thinks
that is, with sides matched to `competition_sides` by fuzzy name and
unmatched names flagged. Nothing is saved until the keeper confirms. Model
choice and prompt are the implementation plan's business (read the
`claude-api` skill reference at build time; do not pin a model id here, it
will rot). The edge function holds the API key as a function secret; the
key never reaches the app.

⚠️ THE READER NEVER WRITES `competition_results`. It writes proposals. The
one RLS policy that matters here is that `competition_results` insert
requires `confirmed_by = auth.uid()` and the keeper or admin right.

### 3. Fetch it

A division may have `results_url`. A pg_cron job (the pattern
`private.send_availability_nudges` uses) fetches the page once a day in
season, hands the text to the same reader, and writes a proposal for any
result not already in the table. Same review screen, same confirm. If the
page changes shape the reader finds nothing and the proposal says so; it
never invents scores. Fetching is a `net.http_get` from the database, which
the push and notify triggers already use.

All three routes land in the same proposals queue and the same results
table. A division can use any of them in any week.

## Who does what

- **Results keeper** — a job per division, held by whoever the club names,
  titled by the job (`claude/decisions/2026-08-12-jobs-not-people.md`).
  Enters, confirms and corrects results for that division. Gets a push on
  Monday: "3 results missing for U14 Division 2, round 6". Implemented as a
  `results` admin right scoped by competition — the first scoped right in
  the app, so the plan must say how `ADMIN_RIGHTS` grows a scope.
- **Admins** can do everything a keeper can, in every division.
- **Squad staff** enter our own score, through the match sheet as today.
- **Everyone else** reads.

## Screens

- **Standings** on the league team's squad page and on the Senior Section
  overview (seniors) and the Youth Manager dashboard (juniors): the table,
  our side highlighted, "last updated", "N results missing", and the union's
  link if `results_url` is set. Below it, the round's results with source
  labels.
- **Results entry** (keeper): the round grid (route 1); a "Share results"
  entry point that accepts text, image or PDF (route 2); the proposals
  queue with confirm/edit/discard per line.
- **Division setup** (admin, Club tab): name, season, sides, points rules,
  results URL, keeper.

## "Results missing"

Exact only when the season's fixture list per division is known in advance.
✅ **ANSWERED, Jay, 3 Sep 2026: RCM publishes the fixture list per division.**
For the seniors it is already out — the 2026–27 men's grid (three divisions)
and the women's dates were loaded on 3 Sep (`db/seeds/2026-09-03-senior-fixtures-2026-27.sql`,
#678), so the seniors' "missing" count can be exact from Round 1. For the
juniors, Jay: *"the rcm will eventually publish the fixtures list and we will
import it when it comes out for juniors."* So the grid pre-fills for the
season from an IMPORT, not from the keeper typing fixtures in as results
arrive, and "missing" is a count of unplayed-and-unrecorded fixtures.
⚠️ **Consequence for the build:** the one-off senior seed becomes a real
"import a season" route — the RCM grid in, one row per fixture per division,
with our own sides' rows landing on the squad schedules and every side's
fixtures landing in `competition_sides`/the round grid. Build it once, for
both seniors and juniors, rather than a second hand-written seed in October.

## Privacy

Every row here is a club side and a score. No player, no child, no contact.
The reader is given results text only; the edge function must never be
handed a roster or a team sheet. A photo shared for reading is stored only
until the proposal is confirmed or discarded, then deleted, so the bucket
does not accumulate other clubs' paperwork.

## Testing

- `db/tests/standings.sql`: a division with six results and 4/2/0 plus both
  bonuses computes the expected table; a superseding correction changes it;
  an unconfirmed result does not count; a reader (service role) cannot
  insert into `competition_results`. Rolled back.
- Standings function: tie on points broken by difference, with the control
  that a different points-for does not break a difference tie the other way.
- Reader: fixture texts for a WhatsApp message, a screenshot's OCR text and
  a PDF's text, each expected to propose the same rows; a text with a side
  the division does not know flags it rather than guessing.
- Fetch: a page that changed shape yields an empty proposal with a note, not
  zero silent rows.

## Non-goals

- Player statistics. Piece 2 covers senior stats from sheets.
- Cup competitions and knockout brackets. League tables only.
- Historic seasons imported from anywhere. A season starts empty.
- Predictions, form guides, anything derived beyond the table.

## Order of work

1. `competitions`, `competition_sides`, `competition_results`, the
   standings function, division setup, and route 1 (type it). The table
   exists and can be kept by hand from here.
2. Route 2 (paste or share) with the proposals queue and the reader.
3. Route 3 (fetch) reusing the reader.
4. Keeper right, Monday push, "results missing".
