# Decision: U10 and below get a simplified app

*15 Aug 2026. Jay's ruling, from facts supplied by the club's youth section the
same morning. Reasoning, not current state — `RESTORE.md` and the code win on
what is true today.*

## The facts the app did not have

Four, and only the last one was ever written down anywhere in this repo:

1. **There is no league below U11.** The league starts at U11. Everything
   younger plays friendlies.
2. **U6-U8 play Mighty Minis**, at the cricket stadium, on league match
   weekends.
3. **U9-U10 play friendly matches** on those same weekends — usually a mini
   tournament of three or four clubs, with each club hosting one weekend in
   turn.
4. **The RCM match sheet starts at U11.** The form's own instructions say
   *"U11 to u16 Games"* and *"U18 Boys & Girls, WXV, W7s"*. Nothing younger is
   on it. This was quoted in `claude/plans/2026-08-11-match-sheets.md` when the
   sheet was built and the lower bound was simply not implemented.

Jay: *"we are going to simplify the features provided to U10 and below"*, and
*"i can reorganize those age groups so they can have specific info that pertains
to them"*.

## What was decided, and what was deliberately NOT

**Removed for U10 and below:** the League competition option, the league team,
the competition tier and the round; the RCM match sheet; player grades,
forward-or-back and positions.

**Kept, and each was considered:**

- **Scores.** Offered and refused. `scoringForBand` already gives these squads
  tries-only, and a U9 festival result is a thing a coach may reasonably want to
  record. Taking it away would be a second, separate argument.
- **The team sheet.** A festival of three clubs still needs a team picked and
  sent to a WhatsApp group. Only the governing body's *result* form goes.
- **Game time.** *Who has not had a chance to play* is arguably more important
  at minis than anywhere else in the club.
- **Availability, the register, notices, squad contacts, photos.** Untouched.

## How it is keyed, and why not a column

**From the squad name**, `band <= 10`, via `ageBandFromTeamName` — the same
mechanism `scoringForBand` and `matchSheetDeadline` already use.

A `teams` column was the alternative, and it is what `teams.scoring_kinds` does.
It was refused for this: a scoring set is a thing a club genuinely varies (a U10
side entered in a competition that allows conversions), whereas *"is there a
league at this age"* is a fact about the governing body's season, not a club
preference. A column would have cost a migration, a schema re-capture and an
admin control, and its only purpose would have been to let somebody record
something untrue. **If the age at which the league starts ever moves, one
constant in `src/lib/minis.js` moves with it.**

## ⚠️ It fails OPEN, and that is the opposite of `allowsOwnContact`

`ageBandFromTeamName` answers `null` both for a senior side and for a name it
cannot parse, and `isMinisTeam` cannot tell those apart. It answers **false** —
not minis, keep everything.

That is deliberately the reverse of `allowsOwnContact`, which fails closed, and
the reason is that the harm is asymmetric in opposite directions. Offering a
twelve-year-old their own email and phone is a safeguarding failure and **has
actually happened here**. Leaving a league dropdown on a squad that will never
use it is an annoyance.

**The concrete case that settles it:** the Women's XV is named on the RCM form
(*"WXV"*) and its squad name carries no age band at all. A rule that failed
closed would have silently taken its match sheet away.

`src/lib/scoring.js` already argues this exact asymmetry for its own default,
and its warning applies here word for word: anyone who unifies the two will be
breaking one of them.

## The care that went into the legacy rows

Fixtures created before today can be holding a league team, a tier or
`competition_type = 'league'` on a U8 squad. **Each of those fields reappears on
the form when the fixture is actually holding a value**, and clearing it is what
makes it go away.

Hiding a control over a value that is really stored would make it uneditable and
invisible at once — the person who came to correct the mistake would find
nothing wrong. And nothing is normalised on open: rewriting data as a side
effect of somebody opening a sheet to change a kick-off time is the one thing a
form must never do.

The same rule governs `PlayerForm`. A U8 player who was graded before today
keeps their `player_grades` row; the form still writes back what it loaded, so
hiding the control writes nothing. Moving them up to U11 shows it again.

## What a minis parent now gets instead

A card on the home screen and a note on each match, saying which of the two
formats their squad plays and that the league starts at U11.

⚠️ **Grouped by format, not by squad** — Jay: *"we have some parents who could
have up to 5 age groups worth of players"*. There are only ever two formats, so
that is at most two cards however many children somebody has, with the squads
named on the card so a parent can tell which children it is about.

⚠️ **It renders nothing at all from U11 up.** `squadFormat` returns null rather
than a placeholder, which is the property that lets the block sit on the home
screen without becoming furniture — the same argument `NoticeBoard` won when it
was placed above the fixture hero. If it ever starts rendering a placeholder,
its position has to be re-argued.

## Where it lives

- `src/lib/minis.js` — the rule, the threshold and the two formats.
- `src/lib/matchSheetDeadline.js` — gained the lower bound it should have had.
- `src/screens/EventForm.jsx`, `EventDetail.jsx`, `MatchSheet.jsx`,
  `YouthDashboard.jsx`, `Roster.jsx`, `PlayerForm.jsx`, `Dashboard.jsx`.
- `tests/minis.test.js`, `tests/minis-fixtures.test.jsx`,
  `tests/minis-roster.test.jsx`, and a block in `tests/dashboard.test.jsx`.

⚠️ **Every screen test is paired with a U14 control**, because the failure this
change could introduce is not *"the minis still see it"* — it is *"everybody
lost it"*, and a suite that only asserts absence cannot tell those apart. Both
directions were proved by injecting a fault into `isMinisBand`: forcing it false
failed 23 tests, forcing it true failed all six controls.
