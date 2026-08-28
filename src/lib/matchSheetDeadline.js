import { ageBandFromTeamName } from './ageGroup.js'
import { isMinisBand, isMinisTeam } from './minis.js'

// When an RCM match sheet is due, derived from the squad's age band.
//
// The form's own instructions carry TWO deadlines on opposite sides of the
// match:
//
//   "U11 to u16 Games … within 24hours of completion of game."
//   "U18 Boys & Girls, WXV, W7s … 1hour in advance of Kick Off."
//
// ⚠️ AND THE LOWER BOUND IS IN THAT FIRST LINE, WHICH THIS MODULE IGNORED UNTIL
// 15 Aug 2026. "U11 to u16" — nothing younger is on the form at all. This
// returned `side: 'after'` for every band below 18, so a U6 Tag fixture was
// given a confident "Due within 24 hours of the final whistle" for a sheet
// nobody has ever filed and RCM does not want. The 12 Aug ruling that one
// EDITOR serves every age group was never a claim that every age group files
// one. See src/lib/minis.js.
//
// ⚠️ THE APP BUILDS ONE EDITOR, AND STILL TELLS THE TRUTH ABOUT BOTH.
// Jay ruled on 12 Aug 2026 that every age group uses the same result-style
// sheet, rather than building a separate pre-match team-sheet mode for U18. He
// was told that is the wrong deadline for U18B and U18G, which both exist, and
// ruled anyway — his call.
//
// ⚠️ THAT RULING IS ABOUT THE EDITOR, NOT ABOUT THIS MODULE. Not offering a
// pre-match flow is a very different thing from telling a U18 coach their sheet
// is due 24 hours after the final whistle. This returns what RCM actually
// requires; the screens present it. Do NOT "simplify" it to one number to match
// the single editor mode — that would make the app say something untrue.
//
// Pure, no imports beyond ageGroup: same rule as scope.js and playerFormat.js.

/** U11-U16: due AFTER the game. */
export const HOURS_AFTER = 24
/** U18 and above: due BEFORE kick-off. */
export const HOURS_BEFORE = 1
/** The band at which the deadline flips to the other side of the match. */
const PRE_MATCH_FROM_AGE = 18

// ⚠️ THERE WAS A `SHEET_FROM_AGE = 11` HERE AND IT WAS A SECOND SOURCE OF TRUTH.
// Removed 17 Aug 2026. Its docstring — "the youngest band the form applies to at
// all" — was accurate, authoritative-looking, and read by nothing: the rule is
// enforced below by `isMinisBand(band)`, i.e. by `MINIS_MAX_AGE = 10` in
// src/lib/minis.js, whose own docstring already says "the league starts at U11".
//
// ⚠️ THE DANGER WAS NOT THE DUPLICATION, IT WAS WHICH COPY A READER TRUSTS. The
// unused one sat beside three constants that ARE the rule they name, so it read
// as equally load-bearing; move `MINIS_MAX_AGE` and this file would have gone on
// declaring 11 while behaving differently, with nothing to fail. minis.js makes
// exactly this argument about its own three boundaries — that each is named so
// no call site has to remember which it meant — and a fourth name for a boundary
// that already had one is the failure that argument warns about.
//
// **If you need the number here, import MINIS_MAX_AGE; do not restate it.**

/**
 * The deadline for a fixture's sheet, or null when there is no rule for it.
 *
 * @param {string} teamName squad name, e.g. "U14B Contact"
 * @param {Date|string|number} kickOff the fixture's start
 * @returns {{ at: Date, side: 'before'|'after', band: number }|null}
 *
 * ⚠️ NULL MEANS "SHOW NO DEADLINE", AND IT MUST NEVER FALL THROUGH TO EITHER
 * RULE. ageBandFromTeamName returns null for a senior side AND for anything it
 * cannot parse, and this module cannot tell those apart. That module's null has
 * already caused one real incident here: allowsOwnContact read it as "a senior
 * side: adults" and offered a twelve-year-old girls' squad the child's own email
 * and phone fields. **The lesson was the null default, not the regex.**
 *
 * Inventing a deadline is the same shape of mistake in a quieter register: a
 * coach shown a confident wrong time files late and believes they were early.
 *
 * ⚠️ AND NULL FOR THE MINIS IS THE SAME ANSWER FOR A DIFFERENT REASON. A senior
 * side gets null because this module does not know the rule; U6-U10 get null
 * because there IS no rule — the form starts at U11. Both callers want the same
 * thing (show nothing, never flag it late), which is why they share a return
 * value rather than getting a third state nobody would handle.
 */
/**
 * Whether a fixture takes an RCM match sheet at all.
 *
 * RCM result sheets are for LEAGUE matches, U11 and up — NOT tournaments (run
 * by their own organiser and not RCM league games), NOT friendlies (no
 * competition), NOT minis. Jay, 27 Aug 2026: "tournaments are not RCM league
 * matches." This is the SINGLE gate every screen asks before listing a fixture
 * in the Youth Manager tracker, showing a "Match sheet" button, or opening the
 * sheet editor — so a tournament or friendly never appears in any of them.
 *
 * ⚠️ THIS REPLACES THE OLDER, LOOSER RULE (`type === 'match'` and not-minis)
 * that the tracker and the Open-sheet button used until 27 Aug 2026. That rule
 * put every tournament and friendly in the RCM queue as "Not started" forever
 * — a queue that could never be emptied, exactly the failure the minis
 * exclusion already guarded against for a younger age group.
 *
 * ⚠️ ASKED OF THE EVENT AND THE SQUAD, NOT OFF matchSheetDeadline. The deadline
 * is null for the Women's XV too (WXV is on the form), so gating on the
 * deadline would wrongly drop a squad the form covers. Minis is the one age
 * exclusion, and it is asked directly.
 */
export function matchSheetApplies(event, squadName) {
  return (
    event?.type === 'match' &&
    event?.competition_type === 'league' &&
    !isMinisTeam(squadName)
  )
}

export function matchSheetDeadline(teamName, kickOff) {
  const band = ageBandFromTeamName(teamName)
  if (band === null) return null
  // U10 and below are not on the RCM form. See the header, and src/lib/minis.js.
  if (isMinisBand(band)) return null

  const start = kickOff instanceof Date ? kickOff : new Date(kickOff)
  if (Number.isNaN(start.getTime())) return null

  const before = band >= PRE_MATCH_FROM_AGE
  const shift = (before ? -HOURS_BEFORE : HOURS_AFTER) * 60 * 60 * 1000

  return {
    at: new Date(start.getTime() + shift),
    side: before ? 'before' : 'after',
    band,
  }
}

/**
 * How the deadline reads on screen. Null in, empty string out — a caller that
 * renders this unconditionally shows nothing rather than "null".
 */
export function deadlineLabel(deadline) {
  if (!deadline) return ''
  return deadline.side === 'before'
    ? `Due ${HOURS_BEFORE} hour before kick-off`
    : `Due within ${HOURS_AFTER} hours of the final whistle`
}

/**
 * Whether the deadline has passed, given "now".
 *
 * ⚠️ TAKES `now` RATHER THAN READING THE CLOCK, so a test can pin it and so
 * this stays pure. The same reason clubToday() exists rather than new Date().
 * ⚠️ NO DEADLINE IS NOT OVERDUE. A squad with no rule must never be flagged
 * late — that is the null default again, in the place somebody is most likely
 * to write `deadline.at < now` without checking.
 */
export function isOverdue(deadline, now) {
  if (!deadline) return false
  const at = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(at.getTime())) return false
  return deadline.at.getTime() < at.getTime()
}
