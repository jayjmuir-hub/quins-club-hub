import { ageBandFromTeamName } from './ageGroup.js'

// What is DIFFERENT about U10 and below — the club calls them the minis.
//
// Pure, no imports beyond ageGroup: the same rule scoring.js and
// matchSheetDeadline.js already follow, and for the same reason — this is read
// by five screens and a lib that pulled React in would be unusable from a test.
//
// ⚠️ THE FACTS, confirmed by the club's youth section on 15 Aug 2026:
//
//   THERE IS NO LEAGUE BELOW U11. The league starts at U11. Everything younger
//   plays friendlies, and always has — the app has been offering a League
//   option, a league team and a round on a U6 fixture since the competition
//   field shipped on 12 Aug.
//
//   U6-U8 play MIGHTY MINIS at the cricket stadium, on league match weekends.
//
//   U9-U10 play FRIENDLY MATCHES on league match weekends — usually a mini
//   tournament of three or four clubs, with each club hosting one weekend.
//
// ⚠️ AND THE RCM MATCH SHEET DOES NOT APPLY TO THEM EITHER. That is not a new
// fact and it is not inferred from the two above: the form's own instructions
// name "U11 to u16" and "U18 Boys & Girls, WXV, W7s" and nothing younger. See
// claude/plans/2026-08-11-match-sheets.md, which quotes it. matchSheetDeadline
// was nonetheless handing every band under 18 a "within 24 hours" deadline,
// U6 included, from the day it was written until this module landed.
//
// ⚠️ THIS FAILS OPEN, WHICH IS THE OPPOSITE OF allowsOwnContact — DO NOT
// "CORRECT" ONE TO MATCH THE OTHER. They fail in opposite directions because
// the harm is asymmetric in opposite directions, exactly as scoring.js already
// argues for its own default:
//
//   allowsOwnContact fails CLOSED. Its bad outcome is offering a twelve-year-
//   old's own email and phone. That has actually happened here.
//
//   This fails OPEN. A squad whose name will not parse — or a senior side, which
//   ageBandFromTeamName also answers null for — is NOT a minis squad, so it
//   keeps the league fields and the match sheet it has today. Its bad outcome is
//   a coach seeing a control they do not need. Failing closed would silently
//   take the RCM sheet away from the Women's XV, which is ON the form ("WXV").
//
// ⚠️ NOTHING HERE IS A PERMISSION. Every consequence below is a control that is
// not OFFERED. RLS decides what the database will accept, and it does not know
// or care how old a squad is.

/** The last band that is minis. U10 and below; the league starts at U11. */
export const MINIS_MAX_AGE = 10

/** The last band that plays Mighty Minis rather than friendly festivals. */
export const MIGHTY_MINIS_MAX_AGE = 8

/**
 * The youngest band that records a score at all. U6 and U7 do not.
 *
 * Jay, 15 Aug 2026, asked directly: *"i would say keep scoring for U8/U9/U10"*.
 * The two he left out are the two he left out.
 *
 * ⚠️ THIS IS A THIRD BOUNDARY AND IT DELIBERATELY DOES NOT MATCH THE OTHER TWO.
 * The club now has three lines in a row and they fall in three different places:
 *
 *   U6-U7    no score recorded at all
 *   U6-U8    Mighty Minis, at the cricket stadium   (MIGHTY_MINIS_MAX_AGE)
 *   U6-U10   no league, no match sheet              (MINIS_MAX_AGE)
 *
 * It would be tidier if scoring stopped where the format changes. It does not,
 * and a reader who "corrects" 8 to match one of the others will silently either
 * take the score off a U8 side that uses it or hand one to a U7 side that does
 * not. Each constant is named so that no call site has to remember which of the
 * three it meant.
 */
export const SCORES_FROM_AGE = 8

/**
 * Whether a band number is minis.
 *
 * ⚠️ NULL IS NOT MINIS. See the header — a band we could not read must keep the
 * full feature set, never lose it.
 */
export function isMinisBand(band) {
  if (typeof band !== 'number' || !Number.isFinite(band)) return false
  return band <= MINIS_MAX_AGE
}

/**
 * Whether a squad is minis, from its name.
 *
 * "U8 Tag" → true. "U11 Mixed Contact" → false. "Senior Men 1st XV" → false,
 * and so does anything unparseable, a blank, or a non-string.
 */
export function isMinisTeam(name) {
  return isMinisBand(ageBandFromTeamName(name))
}

/**
 * Whether a score is recorded for this squad at all.
 *
 * ⚠️ NOT THE SAME QUESTION AS `scoringForTeam`, AND THE TWO MUST NOT BE MERGED.
 * That one answers *which kinds* may be scored (tries only, tries plus
 * conversions, the full set) and its thresholds are mirrored inside the database
 * by `private.scoring_kinds_for_team` — so changing it means changing a
 * migration too. This one answers *whether anybody enters a score*, is a UI
 * question only, and the database neither knows nor cares.
 *
 * ⚠️ IT HIDES THE ENTRY, IT DOES NOT ERASE A STORED VALUE. A U7 fixture that
 * somehow carries a score still shows it — the same rule the league fields on
 * EventForm follow. Measured 15 Aug 2026: no U6 or U7 fixture exists at all, let
 * alone a scored one, so this is insurance rather than a migration.
 *
 * Fails OPEN like everything else here: an unreadable squad name records scores.
 */
export function recordsScores(teamName) {
  const band = ageBandFromTeamName(teamName)
  if (band === null) return true
  return band >= SCORES_FROM_AGE
}

/**
 * How this squad's season actually works, for the card that tells a parent.
 *
 * Returns null for every squad that plays the ordinary league season — there is
 * nothing to explain about those, and a card reading "you play in the league"
 * on fifteen squads is the sort of permanent furniture people stop seeing.
 *
 * ⚠️ TWO SHAPES, NOT ONE. U6-U8 and U9-U10 are both outside the league and are
 * otherwise nothing alike: one is a coaching session at a cricket ground, the
 * other is a mini tournament the club takes a turn at hosting. Collapsing them
 * into "no league below U11" would answer the question nobody asked and leave
 * the one every new parent does ask — "so what happens on Saturday?" —
 * unanswered.
 *
 * @param {string} name squad name, e.g. "U8 Tag"
 * @returns {{key: string, band: number, title: string, summary: string, points: string[]}|null}
 */
export function squadFormat(name) {
  const band = ageBandFromTeamName(name)
  if (!isMinisBand(band)) return null

  if (band <= MIGHTY_MINIS_MAX_AGE) {
    return {
      key: 'mighty-minis',
      band,
      title: 'Mighty Minis',
      summary:
        'This age group plays Mighty Minis at the cricket stadium, on league match weekends.',
      points: [
        'No league and no table — the league starts at U11.',
        'Matches are on the same weekends as the older squads’ league games.',
      ],
    }
  }

  return {
    key: 'festival',
    band,
    title: 'Friendly festivals',
    summary:
      'This age group plays friendly matches on league match weekends — usually a mini tournament with three or four clubs.',
    points: [
      'No league and no table — the league starts at U11.',
      'Each club hosts one of the weekends in turn.',
    ],
  }
}
