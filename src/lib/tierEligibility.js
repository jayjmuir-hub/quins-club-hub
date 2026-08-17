// Comparing a fixture's tier against a player's grade, for the warning in the
// lineup picker — claude/plans/2026-08-17-lineup-eligibility-warning.md.
//
// ⚠️ NO REACT AND NO SUPABASE IN HERE, DELIBERATELY. The whole input space is
// nine pairs plus the empties, so it can be swept exhaustively in a plain node
// test — which is what caught the unreachable guard in `ageGradeCheck`. A
// comparison living inside a component can only be tested through a render.
//
// ⚠️ IT WARNS, IT NEVER BLOCKS, and nothing here should ever grow a way to. Same
// rule the over-picked count on the lineup screen already follows: show a coach
// what they may not have noticed, then let them decide. A coach who means to play
// a strong child down a tier must not have to argue with the app.

/** The comparison found nothing worth saying — including "there was nothing to compare". */
export const TIER_OK = 'ok'

/**
 * The fixture is a tier ABOVE the child's grade — a C-graded child in an A-tier
 * match. The worry is about the CHILD: they are in a match above their assessed
 * level.
 */
export const ABOVE_GRADE = 'aboveGrade'

/**
 * The fixture is a tier BELOW the child's grade — an A-graded child in a C-tier
 * match. The worry is about the FIXTURE: a strong player in a weak tier is the
 * stacking problem an opposition club complains about, and it is the half with a
 * rule outside the club.
 */
export const BELOW_GRADE = 'belowGrade'

// A is the strongest tier and C the weakest. Numbers rather than an index into
// `TIERS` so that the comparison below reads as a comparison, and so an unknown
// letter falls out as `undefined` instead of `-1` — which would otherwise compare
// as the weakest tier of all and invent a warning.
const RANK = { A: 3, B: 2, C: 1 }

/**
 * Compares one fixture's tier against one player's grade.
 *
 * Returns `{ status, message }`. `message` is `''` whenever the status is
 * `TIER_OK`, so a caller can render it unconditionally.
 *
 * ⚠️ SILENCE IS THE ANSWER FOR EVERYTHING IT CANNOT JUDGE, and that is the
 * feature rather than defensiveness. Most of the club is ungraded — a grade is a
 * coach's judgement about a child and most children have never had one recorded —
 * so a warning on the ungraded would appear against nearly every name, and a
 * warning that is always on is furniture. A friendly's NULL tier is a real answer
 * too, carrying the same meaning `competition_type` NULL already carries.
 */
export function tierEligibility(fixtureTier, grade) {
  const quiet = { status: TIER_OK, message: '' }

  const fixtureRank = RANK[fixtureTier]
  const gradeRank = RANK[grade]

  // Covers null, undefined, '' and any letter that is not a tier, in one check.
  if (!fixtureRank || !gradeRank) return quiet
  if (fixtureRank === gradeRank) return quiet

  // ⚠️ THE TWO MESSAGES ARE NOT ONE TEMPLATE WITH THE LETTERS SWAPPED — Jay's
  // call, 17 Aug 2026, on being offered either direction alone. They are two
  // different worries, so one names the child's position and the other asks a
  // question. A shared template would read as a single rule with a sign flip and
  // would quietly lose the distinction.
  //
  // ⚠️ "PLAYING UP" IS DELIBERATELY NOT THE WORDING, natural though it is. This
  // app already uses play-up to mean a YOUNGER CHILD IN AN OLDER SQUAD — what
  // `plays_up_confirmed_at` records and what the 17 Aug cut-off fix was about.
  // Reusing the phrase here would make two unrelated warnings read identically on
  // a coach's screen. A test asserts the phrase stays out.
  if (fixtureRank > gradeRank) {
    return {
      status: ABOVE_GRADE,
      message: `Graded ${grade} — this fixture is ${fixtureTier} tier, above their grade.`,
    }
  }

  return {
    status: BELOW_GRADE,
    message: `Graded ${grade} — this fixture is ${fixtureTier} tier. Check they’re eligible.`,
  }
}
