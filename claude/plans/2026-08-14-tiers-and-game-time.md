# A/B/C tiers, player grading, and game time

**STATUS: PHASES 1 AND 2 SHIPPED AND MERGED.** Phase 1 (game time) shipped as
`1419a21`. Phase 2 — `events.tier`, `player_grades`, `player_positions` — is on
`main` and applied to production.

⚠️ **THIS LINE SAID "PHASE 2 NOT YET MERGED" AND "no player has been graded and
no multi-position player exists yet" UNTIL 17 Aug 2026, AND BOTH WERE FALSE.**
Measured that day: `db/migrations/20260814_tiers_and_player_grades.sql`,
`src/data/playerTiers.js` and the Roster/PlayerForm wiring are all on `main`, and
the club had **4 graded players, 6 multi-position rows and 1 fixture carrying a
tier**. Somebody had been using it for days while this file said nobody could.
**Re-run the counts rather than trusting the previous sentence** — that is the
whole reason it is written here as a warning and not as a number.

⚠️ **THE ELIGIBILITY WARNING IN THE LINEUP PICKER IS STILL NOT BUILT** — the data
supports it (a fixture knows its tier, a player knows their grade) but nothing
compares them. **This is the agreed next piece of work as of 17 Aug 2026.**

Phase 3 (minutes) is not started and was waiting on Jay's answer that fair game
time means appearances, which he has since given: **appearances**, so minutes may
never be needed.

Jay, 14 Aug 2026: *"need to be able to designate players as A, B, or C league
players and also track matches played per player"*; then, correcting a wrong
assumption of mine, *"its not the same [as ADHQ1/2/3], since an age group might
have their ADHQ1 team in the B or C league… if they only have 1 team they might
decide that team should not be in the A league which is for the best players and
teams"*; the need is *"fair game, eligibility, and milestone… tracking which
players haven't had a chance to play in matches or tournaments"*; and
*"tournaments would have same tier levels as league, only the coaches and
managers would see tier grading"*.

## What already exists — measured, not assumed

⚠️ **`league_teams.division` ALREADY HOLDS A/B/C**, and already independently of
the team's name. Measured 14 Aug 2026: every squad currently runs ADHQ1→A,
ADHQ2→B, ADHQ3→C, which is exactly why the distinction is invisible — **the
schema has always allowed ADHQ1 to sit in Div B**, which is Jay's point. Nothing
needs building for the TEAM side.

⚠️ **A TOURNAMENT CAN ALREADY RECORD WHICH OF OUR TEAMS ENTERED IT.**
`EventForm`'s League team picker is rendered for `isMatch`, not gated on
competition type, and the save accepts it. So no new plumbing is needed to say
"ADHQ2 went to the Al Ain Tournament".

⚠️ **`lineup_players.role` ALREADY DISTINGUISHES STARTED FROM BENCHED.** Game
time by appearance is therefore mostly a rollup, not a new recording burden.

## The tier belongs to the FIXTURE, not to our team

⚠️ **THIS IS THE ONE REAL MODELLING DECISION, AND DERIVING IT WOULD BE WRONG.**
The obvious shortcut is "tier = the division of the league team we entered". That
holds for a league fixture by definition. It breaks for a tournament, which is the
case Jay explicitly asked for: **we might send our B team (ADHQ2) to an A-tier
tournament.** Deriving would then record a B appearance for a match played at A
level — which is precisely backwards for eligibility, the thing the grade exists
to police.

So: `events.tier`, nullable, `A | B | C`.

⚠️ **PREFILLED FROM THE LEAGUE TEAM, NEVER DERIVED FROM IT.** When a coach picks
a league team the form fills the tier in from that team's `division`, because for
a league fixture they agree and typing it twice invites them to disagree. It stays
editable, because for a tournament they need not agree. One column, one truth, a
convenience prefill — not two sources.

⚠️ **NULL IS A REAL ANSWER**: a friendly has no tier, and must not be counted as
one. Same rule `competition_type` NULL already carries.

## Grading a player

`players.tier`, nullable, `A | B | C`. Null means ungraded, which is most players
and is not a problem to be fixed.

⚠️ **COACH AND MANAGER ONLY — JAY WAS EXPLICIT.** This is a judgement about a
CHILD'S ABILITY, recorded in an app their parents use. It must never appear on a
parent-facing screen, and ⚠️ **MUST NEVER REACH THE SHARED LINEUP IMAGE**, which
leaves the app entirely and can be forwarded onward. That image is built in
`src/screens/Lineup.jsx`; anything added to it is published.

⚠️ **`players` IS ALREADY READABLE BY PARENTS** (`player read` carries an
`is_own_player` arm, and squad-wide read for approved members). So a plain column
on `players` is NOT automatically coach-only — RLS grants ROWS, not COLUMNS. The
options, and this needs settling before the migration:
 1. **A separate `player_grades` table** with its own coach-only policy. Clean,
    one more join, and the only version that is actually enforced.
 2. A column on `players` plus a **column-level GRANT revoke** for the parent
    path — the pattern `announcements` already uses for `team_id`. Cheaper, but
    column grants are per-ROLE, and a parent and a coach are the same
    `authenticated` role here, so **this does not work**. Recorded so nobody
    tries it.
 ⚠️ **Therefore option 1.** A column on `players` cannot be hidden from parents by
 any mechanism this schema has.

## What "matches played" counts

⚠️ **SELECTION IN A LINEUP, not attendance and not minutes.** Reasoning:
- `lineup_players` is the thing coaches now actually fill in, and `role` gives
  starts vs bench for free.
- `attendance` exists but has **zero rows in use** (measured 14 Aug) — counting
  from it would report every player as having played nothing.
- Minutes would need live on/off capture pitch-side, which is a different and much
  larger feature. **Not in scope until Jay says fair game time means minutes
  rather than appearances** — the question was asked and is still open.

⚠️ **HISTORY STARTS NOW.** Two lineups exist. Fairness going forward is fine;
"50th appearance" cannot be backfilled without hand-entering the past, and nothing
should imply otherwise on screen.

## Phases

1. **Who hasn't had a chance.** A coach-only rollup per squad: starts, bench,
   total, ordered fewest-first, over a date range. **No schema change** — it reads
   `lineup_players` joined to `events`. This is the piece Jay described most
   concretely, and it builds the rollup the other two need.
2. **Tiers.** `events.tier` (+ prefill in EventForm) and the `player_grades`
   table. Unlocks eligibility warnings in the picker: "graded C, this is an
   A-tier fixture."
3. **Maybe.** Minutes, if appearances turn out not to be enough. Backfilling
   history.
