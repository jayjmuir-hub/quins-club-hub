// What can be scored, and for how many points, at each age band.
//
// Pure, no imports beyond ageGroup — same rule as src/lib/ageGroup.js and
// src/lib/scope.js: plain values in, plain values out, trivially testable.
// Plan: claude/plans/2026-08-12-scoring-model.md
//
// ⚠️ THESE ARE AGE-GRADE RUGBY'S RULES, AND THIS APP OWNS ITS OWN COPY OF THEM.
// A try is five points because that is rugby, not because any other system says
// so. Nothing here is derived from, synchronised with, or answerable to another
// project — this app is authoritative for this club's fixtures, full stop.
//
// ⚠️ AN EARLIER VERSION OF THIS HEADER (12 Aug 2026) DESCRIBED THE VALUES AS A
// COPY TAKEN FROM ANOTHER CLUB SYSTEM AND WARNED THAT THIS FILE COULD GO
// "SILENTLY WRONG" IF THAT SYSTEM CHANGED. That was a misreading of the brief —
// Jay asked for the same TYPE of scoring setup, not a shared one — and it is
// corrected rather than softened, because a wrong "why" sends the next reader
// to another codebase to understand this one. **Do not reintroduce a dependency
// on any other project here.**
//
// ⚠️ WHAT IS GENUINELY DUPLICATED IS INSIDE THIS APP: private.scoring_kinds_for_team
// in the database carries the same three thresholds, so the total the FORM shows
// and the total the DATABASE stores cannot disagree. That is the only copy worth
// worrying about, and db/tests/ is where it gets checked.
//
// ⚠️ CONFIRM AGAINST THE UAERF AGE-GRADE LAWS BEFORE A SEASON. These follow the
// standard progression — kicking at goal is introduced gradually — but the
// governing body's laws are the authority, not this file. The club can override
// any squad without a deploy (see scoringForTeam), which is what makes a wrong
// default cheap to fix.

import { ageBandFromTeamName } from './ageGroup.js'

/**
 * What each scoring act is worth. World Rugby's, not the club's.
 *
 * ⚠️ NOT EDITABLE FROM THE APP, DELIBERATELY. The VALUES are the laws of the
 * game; what varies by age is which of them are AVAILABLE. An admin screen that
 * let somebody set a try to 4 would be offering to record a score that is not
 * rugby.
 */
export const SCORE_POINTS = Object.freeze({
  tries: 5,
  conversions: 2,
  penalties: 3,
  drops: 3,
})

/**
 * Every scoring kind, in the order forms should render them.
 *
 * ⚠️ ORDER IS PART OF THE CONTRACT. A score-entry row that reorders itself
 * between two age groups is how a coach types a conversion into the penalties
 * box, and the mistake is invisible because the total still looks plausible.
 */
export const SCORE_KINDS = Object.freeze(['tries', 'conversions', 'penalties', 'drops'])

/**
 * How each scoring act is named to a person.
 *
 * ⚠️ "DROP GOALS", NOT "DROPS". The column is `drops` because `drop` is a
 * Postgres keyword and the plural reads badly in SQL; on a pitch the thing is a
 * drop goal, and a box labelled "Drops" beside "Penalties" invites somebody to
 * count dropped balls.
 *
 * ⚠️ HERE RATHER THAN IN EACH SCREEN, and that is not tidiness. The match sheet
 * offers these boxes and the Club tab decides which ones a squad gets — two
 * screens describing the same four things. A label that drifted between them
 * would let an admin switch on "Drop goals" and a coach look for something else.
 */
export const SCORE_LABELS = Object.freeze({
  tries: 'Tries',
  conversions: 'Conversions',
  penalties: 'Penalties',
  drops: 'Drop goals',
})

const TRIES_ONLY = Object.freeze(['tries'])
const TRIES_CONV = Object.freeze(['tries', 'conversions'])
const FULL = Object.freeze(['tries', 'conversions', 'penalties', 'drops'])

/**
 * The default scoring set for an age band.
 *
 * ⚠️ THE BAND NUMBER, NEVER THE SQUAD NAME'S LETTER. In a name like `U14B` the
 * trailing letter is GENDER (U14 Boys), not a grade. This repo has already been
 * bitten by exactly that letter: src/lib/ageGroup.js carries a note about
 * `U12G` failing to parse because a letter follows the digits, which returned
 * null and offered a twelve-year-old girls' squad the child's own contact
 * fields. Keying on the number sidesteps it entirely.
 *
 * ⚠️ THREE THRESHOLDS COVER EVERY SQUAD THE CLUB HAS, checked band by band in
 * tests/scoring.test.js — U6 through U18, boys and girls, tag and contact. That
 * is why three rules need not become a fifteen-row lookup, and why a new squad
 * needs no code change at all.
 *
 * The reasoning behind the thresholds is the age-grade progression itself:
 * kicking at goal arrives gradually. U6-U8 is tag. At U9-U11 a penalty is a
 * free pass or tap-and-play, so there is no kick at goal to record at all.
 *
 * ⚠️ AN UNKNOWN BAND GETS THE FULL SET, AND THIS IS DELIBERATELY THE OPPOSITE OF
 * allowsOwnContact — do not "correct" one to match the other. The two fail in
 * opposite directions because the HARM is asymmetric in opposite directions:
 *
 *   allowsOwnContact fails CLOSED. Its bad outcome is offering a twelve-year-
 *   old's own email and phone. That has actually happened here.
 *
 *   Scoring fails OPEN. Its bad outcome is a coach on a pitch who cannot record
 *   a drop goal that was genuinely kicked, on a form the governing body wants.
 *
 * Better to offer an option that goes unused than to make a score impossible to
 * enter. Anyone who unifies these two defaults will be breaking one of them.
 */
export function scoringForBand(band) {
  if (typeof band !== 'number' || !Number.isFinite(band)) return FULL
  if (band <= 11) return TRIES_ONLY
  if (band <= 13) return TRIES_CONV
  return FULL
}

/** Keeps only known kinds, in SCORE_KINDS order. Never returns an empty set. */
export function cleanScoringKinds(input) {
  if (!Array.isArray(input)) return null
  const kept = SCORE_KINDS.filter((kind) => input.includes(kind))
  // ⚠️ An empty override is not a squad that cannot score — it is a mistake, or
  // a half-finished edit. Falling back to tries keeps a score enterable, which
  // is the same fail-open reasoning as the unknown band above.
  return kept.length > 0 ? kept : [...TRIES_ONLY]
}

/**
 * What a squad may score, honouring the club's own override.
 *
 * ⚠️ THE OVERRIDE IS A COLUMN ON `teams`, NEVER THE SQUAD'S NAME — the same
 * rule `teams.is_senior` and `teams.self_registration_allowed` already carry,
 * and for the same reason: renaming a squad must not silently change what the
 * app will let somebody record against it.
 *
 * ⚠️ NULL MEANS "USE THE DEFAULT", NOT "NOTHING IS SCOREABLE". A club that has
 * never opened the scoring screen has null on every squad, and every squad must
 * still work.
 */
export function scoringForTeam(team) {
  const override = cleanScoringKinds(team?.scoring_kinds)
  if (override) return override
  return scoringForBand(ageBandFromTeamName(team?.name))
}

const count = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

/**
 * The total for a set of components, under a squad's scoring set.
 *
 * ⚠️ COMPUTED FROM THE COMPONENTS, NEVER TAKEN FROM A CALLER. That is what stops
 * a typo — or a tampered request — producing a score that does not match the
 * tries and kicks recorded beside it. The database enforces the same thing on
 * write; this is what the FORM shows, so the two cannot disagree in front of a
 * coach.
 *
 * ⚠️ A KIND THE SQUAD MAY NOT SCORE CONTRIBUTES NOTHING, even if a value is
 * passed. An old row carrying penalties for a U10 squad is data from before a
 * rule changed, and silently adding 3 points to a U10 result is worse than
 * ignoring it.
 */
export function totalFor(team, parts) {
  return scoringForTeam(team).reduce(
    (sum, kind) => sum + count(parts?.[kind]) * SCORE_POINTS[kind],
    0,
  )
}

/**
 * True when every component is absent — which is NOT the same as all zero.
 *
 * ⚠️ "NOT RECORDED" AND "SCORED NOTHING" ARE DIFFERENT FACTS, and this is the
 * predicate that keeps them apart. The register already makes the same
 * distinction, where "not recorded" is the absence of a row rather than an
 * `absent`. It matters most on the way in to the database: a fixture whose
 * result was typed by hand before components existed has a real score and no
 * components, and recomputing its total from nothing would silently make it 0.
 */
export function hasNoComponents(parts) {
  return SCORE_KINDS.every((kind) => parts?.[kind] === null || parts?.[kind] === undefined)
}
