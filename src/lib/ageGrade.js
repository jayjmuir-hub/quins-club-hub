import { OWN_CONTACT_MIN_AGE, ageBandFromTeamName, allowsOwnContact } from './ageGroup.js'

// UAERF age-grade eligibility: which squad a child's birthday puts them in, and
// when they are PLAYING UP.
//
// Jay, 17 Aug 2026: "we need the ability for players to play up one age group
// with a notification", and "check the adhjrt.com repo for age bands".
//
// ══ WHERE THIS CAME FROM, AND WHY IT IS NOT A SECOND GUESS ═══════════════
//
// The tournament site (…\GitHub\adhjrt, `Quins JRT.dc.html`) has held the whole
// model since July 2026: the cut-off date, the band per group, the one-hop
// ladder, and the wider allowance for the girls' groups. This is a PORT of it,
// read from that repo rather than reasoned out again.
//
// ⚠️ AND IT REPLACES A DELIBERATE APPROXIMATION MADE EARLIER THE SAME DAY.
// `dobBandMismatch` in ageGroup.js guessed a plausible band from "age today"
// with a year of grace, because nothing in THIS repo recorded the cut-off. That
// was the honest thing to do while the fact was unknown; it is the wrong thing
// to keep now the fact is known, so it is gone rather than left beside this.
//
// ⚠️ ⚠️ IT IS STILL A SECOND COPY OF A RULE THAT LIVES IN ANOTHER REPO. The two
// cannot import from each other — different repos, different sites, and adhjrt
// has no build step. If UAERF moves the cut-off or the ladder, BOTH have to be
// edited. The tournament one is the original; this one is downstream of it.
//
// ══ THE CUT-OFF ══════════════════════════════════════════════════════════
//
// A player's age group is fixed by their age at midnight on 31 AUGUST — the
// start of the season — so "Under X" means they are exactly X−1 on that date.
//
// ⚠️ THIS IS WHY "IS THIS CHILD 13 TODAY?" IS THE WRONG QUESTION, and why a U13
// squad is mostly TWELVE-year-olds for most of the season. Anything that reasons
// about a child's age has to ask it AT THE CUT-OFF, never today.
//
// ⚠️ THE EMIRATI U18 EXCEPTION IS NOT ENFORCED, and that is inherited from the
// tournament site with its reasoning intact: UAERF gives Emirati U18 players a
// 31 December cut-off, and neither app collects nationality. A U18 player caught
// by this would read as "one age group young" and be offered the play-up path,
// which is the right failure — it asks rather than refuses.

/** The month and day the season is counted from. Month is 1-based here. */
export const CUTOFF_MONTH = 8
export const CUTOFF_DAY = 31

/**
 * ⚠️ U16 AND U18 SPAN **TWO** CUT-OFF AGES EACH, and everything else spans one.
 * There is no U15 or U17 competition, so a 14-year-old in U16 and a 16-year-old
 * in U18 are entirely NORMAL rather than playing up. A model that assumed one
 * age per band would flag two whole squads as anomalies.
 */
const DOUBLE_BANDS = new Set([16, 18])

/**
 * The cut-off ages a squad is for, from its name. `[11]` for U12, `[14, 15]` for
 * U16. Null for a senior side or an unparseable name.
 *
 * ⚠️ DERIVED FROM THE NAME, LIKE EVERY OTHER AGE ANSWER IN THIS APP. `teams` has
 * no age column. That is consistent with `ageGroup.js` and it is the weaker part
 * of this file: renaming a squad changes what it is for. It is only ever used to
 * ASK a question, never to grant access — the ruling in
 * 20260806_claim_roster_access.sql (a rename must not hand out a role) is why
 * `self_registration_allowed` is a COLUMN and this is not.
 */
export function cutoffAgesForTeam(teamName) {
  const band = ageBandFromTeamName(teamName)
  if (band === null) return null
  return DOUBLE_BANDS.has(band) ? [band - 2, band - 1] : [band - 1]
}

/**
 * The squad one step DOWN the real competition ladder — not simply "one year
 * younger", which is what makes this a table rather than arithmetic.
 *
 * ⚠️ THE GIRLS' LADDER SKIPS YEARS AND THAT IS THE WHOLE REASON THIS EXISTS.
 * U14G's next-younger group is U12G, not a U13G — there is no U13G. A one-year
 * subtraction walks straight past a real thirteen-year-old, which is exactly the
 * bug the tournament site hit with a live registration in July 2026.
 */
const PREV_BAND = {
  7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12, 14: 13, 16: 14, 18: 16,
}

/**
 * ⚠️ AND THE GIRLS' LADDER DIVERGES AT EXACTLY ONE RUNG. U14G's next-younger
 * group is U12G, where U14B's is U13 — because there is no U13G. Everything
 * else follows the same chain.
 */
function prevBand(band, isGirls) {
  if (isGirls && band === 14) return 12
  return PREV_BAND[band] ?? null
}

/**
 * How far below the squad this age sits, or null when it is not an allowed
 * play-up at all.
 *
 * ⚠️ ⚠️ THE MODEL IS DELIBERATELY HYBRID, AND NEITHER HALF WORKS ALONE. I
 * ported it as a pure ladder walk first and two tests caught it; the tournament
 * site is hybrid for reasons that are load-bearing in both directions:
 *
 *   BOYS AND MIXED — walk ONE rung of the LADDER, and the age must fit that
 *   group. Subtracting years is wrong at the DOUBLE bands: a fourteen-year-old
 *   in U18B is ONE group below, because U16B is for 14s AND 15s, but 16 minus
 *   14 says two and would refuse a play-up the club allows.
 *
 *   GIRLS — subtract YEARS from the squad's own age, allow one or two. The
 *   ladder is wrong here because it has HOLES: U12G is for 11s and U14G is for
 *   13s, so there is no group at 12 at all, and one hop steps straight over a
 *   real twelve-year-old. That is not hypothetical — it refused a live U14G
 *   registration on the tournament site in July 2026, which is why Jay widened
 *   it.
 *
 * ⚠️ SO DO NOT "SIMPLIFY" THIS INTO ONE RULE. Each branch is the fix for a bug
 * the other branch has.
 */
function playUpDistance(band, isGirls, ages, cutoffAge) {
  if (isGirls) {
    const yearsYoung = ages[0] - cutoffAge
    return yearsYoung === 1 || yearsYoung === 2 ? yearsYoung : null
  }

  const below = prevBand(band, isGirls)
  if (below === null) return null
  const belowAges = DOUBLE_BANDS.has(below) ? [below - 2, below - 1] : [below - 1]
  return belowAges.includes(cutoffAge) ? 1 : null
}

/**
 * ⚠️ THE GIRLS' GROUPS ALLOW **TWO** AGE GROUPS OF PLAY-UP, NOT ONE. Jay's
 * explicit instruction on the tournament site, 28 Jul 2026, after a real U14G
 * registration at age 12 was wrongly refused: the girls' ladder has no group at
 * age 12 at all, so one hop is not enough to reach a legitimate player.
 *
 * ⚠️ IT COVERS THE CONTACT GROUPS TOO (U16G, U18G), which the tournament site
 * flags once and this file repeats rather than quietly dropping: those are
 * TACKLE formats, so two years of play-up there is a materially different
 * injury and age-grade judgement from the same allowance in non-contact QR. It
 * is Jay's call and it is recorded here so it stays a call rather than becoming
 * an assumption.
 */
function girlsGroup(teamName) {
  return /^u\d{1,2}\s*g/i.test(String(teamName ?? '').trim())
}

/** Whole years old at a given date. Null for anything unparseable. */
export function ageAt(dateOfBirth, when) {
  if (typeof dateOfBirth !== 'string' || dateOfBirth.trim() === '') return null
  const born = new Date(`${dateOfBirth.trim()}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return null
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) return null

  let years = when.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = when.getUTCMonth() - born.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && when.getUTCDate() < born.getUTCDate())) years -= 1
  return years < 0 ? null : years
}

/**
 * The cut-off date governing a given day.
 *
 * ⚠️ THE SEASON TURNS OVER ON 31 AUGUST, SO THE ANSWER DEPENDS ON WHEN YOU ASK.
 * In October 2026 the governing cut-off is 31 Aug 2026; in March 2027 it is
 * still 31 Aug 2026; in September 2027 it becomes 31 Aug 2027. Computing it from
 * "this year" alone is wrong for eight months of every twelve.
 */
export function cutoffFor(today = new Date()) {
  const year = today.getUTCFullYear()
  const thisYears = Date.UTC(year, CUTOFF_MONTH - 1, CUTOFF_DAY)
  return new Date(today.getTime() >= thisYears ? thisYears : Date.UTC(year - 1, CUTOFF_MONTH - 1, CUTOFF_DAY))
}

/**
 * Whether a player may hold their OWN email and phone, now that the club has a
 * birthday to ask.
 *
 * This is the `allowsOwnContact` re-point promised since 3 Aug 2026 and deferred
 * three times — item 3 of claude/plans/2026-08-16-account-creation-redesign.md.
 *
 * ══ ⚠️ IT MAY ONLY EVER MAKE THE RULE STRICTER, AND THE CODE SAYS SO IN ONE
 *    LINE ═══════════════════════════════════════════════════════════════════
 *
 * A PARENT MAY WRITE THEIR OWN CHILD'S BIRTHDAY — deliberately, because the
 * family is the source of truth. So if a birthday could ever OPEN this gate, a
 * family could unlock a field the club forbids by typing a different year. The
 * squad answer is computed first and a `false` is returned immediately: the
 * birthday is consulted only to take the field away, never to offer it.
 *
 * ⚠️ IT LIVES HERE, NOT IN ageGroup.js, AND THAT IS NOT PREFERENCE. This module
 * already imports that one for the band table; putting a DOB-aware gate there
 * would make the two import each other. The plain squad-name version stays
 * exported from ageGroup.js for the callers that have no birthday to offer.
 *
 * ══ ⚠️ WHY IT ASKS THE CUT-OFF AND NOT "HOW OLD ARE THEY TODAY" ════════════
 *
 * Rugby age bands are season-relative and a birthday is not. A U13 squad is
 * mostly TWELVE-year-olds for most of the season, so "is this child 13 today?"
 * would strip the field from nearly a whole squad the club's own rule permits it
 * for — gradually, as birthdays passed, which is the hardest kind of bug to
 * attribute. `U13` means age 12 at the cut-off, so the threshold here is
 * `OWN_CONTACT_MIN_AGE - 1`.
 *
 * ══ ⚠️ AN UNKNOWN BIRTHDAY CHANGES NOTHING, AND MUST NOT FAIL CLOSED ═══════
 *
 * `getPlayerDob` returns null both for "not set" and for "RLS will not show you"
 * — its own header forbids distinguishing them. Failing closed on null would
 * strip the field from every child in the club today, because `player_private`
 * is nearly empty, and it would do it to team-mates' records purely because a
 * reader could not see them. So an unreadable or absent birthday leaves the
 * squad's answer exactly as it was.
 *
 * @param {object} args
 * @param {string} args.teamName
 * @param {string|null} [args.dateOfBirth] ISO date, or null for "we don't know"
 * @param {Date} [args.today]
 */
export function allowsOwnContactFor({ teamName, dateOfBirth = null, today = new Date() } = {}) {
  const bySquad = allowsOwnContact(teamName)
  // ⚠️ THE STRICTER-ONLY GUARANTEE, IN ONE RETURN. Everything below can only
  // turn a true into a false.
  if (!bySquad) return false

  const cutoffAge = ageAt(dateOfBirth, cutoffFor(today))
  if (cutoffAge === null) return bySquad

  return cutoffAge >= OWN_CONTACT_MIN_AGE - 1
}

export const OK = 'ok'
export const PLAY_UP = 'playUp'
export const MISMATCH = 'mismatch'

/**
 * Whether this birthday and this squad agree, and what to say if they do not.
 *
 * Returns `{ status, message, groupsYoung, cutoffAge }`.
 *
 *   ok        the age fits the squad, or there is not enough to judge
 *   playUp    young enough to be allowed up — ONE group, or TWO for a girls'
 *             group. Permitted, with the parent's consent, and the club is told.
 *   mismatch  anything else. ⚠️ STILL NOT A REFUSAL IN THIS APP — see below.
 *
 * ⚠️ `mismatch` WARNS WHERE THE TOURNAMENT SITE BLOCKS, AND THE DIFFERENCE IS
 * DELIBERATE. That form is a stranger entering a competition, where a wrong age
 * grade is somebody else's child on the pitch. This is the club's own roster,
 * where the person is registering their own child, a coach can fix it, and the
 * standing ruling here is that the age-group picker asks rather than refuses —
 * the same asymmetry as the gender rule, which refuses a BLANK and permits a
 * CONTRADICTION.
 */
export function ageGradeCheck(teamName, dateOfBirth, today = new Date()) {
  const empty = { status: OK, message: '', groupsYoung: 0, cutoffAge: null }

  const ages = cutoffAgesForTeam(teamName)
  if (!ages) return empty // a senior side, or a name with no band in it

  const cutoff = cutoffFor(today)
  const cutoffAge = ageAt(dateOfBirth, cutoff)
  if (cutoffAge === null) return empty // nothing typed yet

  if (ages.includes(cutoffAge)) return { ...empty, cutoffAge }

  const squad = String(teamName).trim()
  const when = `${CUTOFF_DAY} Aug ${cutoff.getUTCFullYear()}`
  const band = ageBandFromTeamName(squad)
  const isGirls = girlsGroup(squad)

  // ⚠️ ONLY DOWNWARDS. Being OLDER than the squad is never a play-up, and
  // walking the ladder from an age above it would find nothing anyway — but
  // saying so here means the answer does not depend on that happening to be true.
  if (cutoffAge < ages[0]) {
    const groupsYoung = playUpDistance(band, isGirls, ages, cutoffAge)
    if (groupsYoung !== null) {
      return {
        status: PLAY_UP,
        groupsYoung,
        cutoffAge,
        message:
          `They are ${cutoffAge} at the ${when} cut-off, which puts them ` +
          `${groupsYoung === 1 ? 'one age group' : 'two age groups'} below ${squad}. ` +
          'Playing up is allowed with your say-so, and the squad’s coaches will be told.',
      }
    }
  }

  return {
    status: MISMATCH,
    groupsYoung: 0,
    cutoffAge,
    message:
      `${squad} is for players aged ${ages.join(' or ')} at the ${when} cut-off, and this ` +
      `birthday makes them ${cutoffAge}. Check the date and the age group — you can still ` +
      'save if it is right.',
  }
}
