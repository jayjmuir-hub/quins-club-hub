// What can be scored, and for how many points, at each age band.
//
// Pure, no imports beyond ageGroup — same rule as src/lib/ageGroup.js and
// src/lib/scope.js: plain values in, plain values out, trivially testable.
// Plan: claude/plans/2026-08-12-scoring-model.md
//
// ⚠️ THE UPSTREAM IS ANOTHER REPO, AND THIS IS A COPY. Measured 12 Aug 2026 off
// `C:\Users\Jay\GitHub\adhjrt\netlify\functions\_scoring.js` — the ADHJRT
// tournament site. That file is in a DIFFERENT repo whose root is a published
// website; it was read and nothing was written to it.
//
// ⚠️ AND IT IS THE THIRD COPY OF THIS MODEL, WHICH IS THE THING TO KNOW BEFORE
// TRUSTING IT. adhjrt carries it twice already — a server copy and a browser
// copy — and has a test file whose header says in as many words that "the
// scoring model is carried TWICE and nothing asserted the two copies agree".
// Worse: adhjrt's loadRules() merges organiser overrides out of Netlify Blobs,
// so an organiser can change any age group's scoring THERE WITHOUT A DEPLOY,
// after which this copy is silently wrong and no test in either repo could
// compare them.
//
// So: this app is authoritative for THIS CLUB's own fixtures, and never for an
// ADHJRT tournament's rules. The club can override any squad (see
// scoringForTeam), which is what makes the copy survivable — a wrong default is
// a thing an admin can fix in the app rather than a thing that needs a deploy.

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

const TRIES_ONLY = Object.freeze(['tries'])
const TRIES_CONV = Object.freeze(['tries', 'conversions'])
const FULL = Object.freeze(['tries', 'conversions', 'penalties', 'drops'])

/**
 * The default scoring set for an age band.
 *
 * ⚠️ THE BAND NUMBER, NEVER THE SQUAD NAME'S LETTER. adhjrt keys its table on
 * ids like `u16b`, where the letter is GENDER (U16 Boys) and not a grade. This
 * repo has already been bitten by that exact letter: src/lib/ageGroup.js
 * carries a note about `U12G` failing to parse because a letter follows the
 * digits, which returned null and offered a twelve-year-old girls' squad the
 * child's own contact fields. Keying on the number sidesteps it entirely.
 *
 * ⚠️ THE THRESHOLDS REPRODUCE ADHJRT'S FIFTEEN-ROW TABLE EXACTLY, checked row by
 * row: u6-u11 tries only, u12/u12g/u13 tries+conversions, u14b/u14g/u16b/u16g/
 * u18b/u18g full. No row disagrees, which is why three rules can replace fifteen
 * entries — and why a fourteenth squad appearing needs no code change.
 *
 * The reasoning behind the thresholds, from the upstream file: kicking at goal
 * is introduced gradually. U6-U8 is tag. At U9-U11 a penalty is a free pass or
 * tap-and-play, so there is no kick at goal to record at all.
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
 * adhjrt states the same choice: "better to offer an option that is not used
 * than to make a score impossible to enter". Anyone who unifies these two
 * defaults will be breaking one of them.
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
 * ⚠️ COMPUTED FROM THE COMPONENTS, NEVER TAKEN FROM A CALLER. adhjrt states the
 * reason and it holds here: it is what stops a typo — or a tampered request —
 * producing a score that does not match the tries and kicks recorded beside it.
 * The database enforces the same thing on write; this is what the FORM shows so
 * the two cannot disagree in front of a coach.
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
