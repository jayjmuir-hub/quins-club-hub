import { ageBandFromTeamName } from './ageGroup.js'

// Pure decisions for the training-plans feature. No Supabase, no React, so the
// rules that keep a tackle drill off a tag squad are tested in isolation.
// claude/specs/2026-08-21-training-plans-dashboard-design.md

/** The club's hour. A DEFAULT the builder aims at, not a constraint it enforces. */
export const DEFAULT_MINUTES = 60

export const CATEGORIES = ['warm_up', 'skill', 'game', 'conditioning', 'cool_down']
export const CATEGORY_LABELS = {
  warm_up: 'Warm-up',
  skill: 'Skill',
  game: 'Game',
  conditioning: 'Conditioning',
  cool_down: 'Cool-down',
}

/** Sum of block minutes. Non-numbers count as zero rather than poisoning the total. */
export function totalMinutes(blocks) {
  return (blocks ?? []).reduce((sum, block) => sum + (Number.isFinite(block?.minutes) ? block.minutes : 0), 0)
}

/**
 * Null when the blocks make exactly the default hour; otherwise the sentence
 * the builder shows before saving. ⚠️ A QUESTION, NOT A REFUSAL — a wet-night
 * 40 is deliberate; a 65 is the arithmetic slip this exists to catch.
 */
export function totalWarning(blocks) {
  const total = totalMinutes(blocks)
  if (total === DEFAULT_MINUTES) return null
  return `This is ${total} minutes, not ${DEFAULT_MINUTES}. Save anyway?`
}

/**
 * The band as a fragment SPLICED INTO A SENTENCE — "Drill is for any age;
 * template is …". Lower case, and private, because a capital in the middle of
 * a sentence reads as a bug. The standalone form a row draws is the exported
 * `bandLabel` below; the two differ by one letter and by where they appear,
 * which is why they are two functions and not one with a flag.
 */
function bandPhrase(min, max) {
  if (min != null && max != null) return `U${min}–U${max}`
  if (min != null) return `U${min} and up`
  if (max != null) return `up to U${max}`
  return 'any age'
}

/**
 * "U9–U13", "U13 and up", "up to U13", "Any age" — the STANDALONE label on a
 * row, where a lower-case start looks like a bug. The Library and the
 * Templates screen both draw it, and both had their own byte-identical copy
 * until 21 Aug 2026. See `bandPhrase` above for the sentence form.
 */
export function bandLabel(minAge, maxAge) {
  if (minAge != null && maxAge != null) return `U${minAge}–U${maxAge}`
  if (minAge != null) return `U${minAge} and up`
  if (maxAge != null) return `up to U${maxAge}`
  return 'Any age'
}

/** A blank box is "not said", which is NULL — never '' and never 0. */
export function textOrNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * ⚠️ THE FIELD THE PAYLOAD TESTS EXIST FOR. `min_age`/`max_age` carry
 * `check (… between 4 and 19)`, so a blank box sent as 0 is refused by
 * Postgres and a blank box sent as '' is not a smallint at all. Blank means
 * "no limit at this end" and the only value that says so is NULL. `Number('')`
 * is 0, which is exactly the slip this guards.
 */
export function ageOrNull(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Why the form's age boxes are refused BEFORE Postgres gets to.
 *
 * The DB has the real rules — `check (… between 4 and 19)` and the
 * `*_age_order` constraints — but its refusal surfaces as a raw
 * `drills_min_age_check` string no coach can act on (21 Aug review). This
 * mirrors those two checks, in the same order, over the form's raw strings.
 * Blank stays a real answer at either end, exactly as ageOrNull sends it.
 *
 * Returns the message to show, or null when the draft would satisfy the DB.
 */
export function ageDraftProblem(minValue, maxValue) {
  const ends = [minValue, maxValue].map((value) => (value ?? '').trim())
  for (const end of ends) {
    if (end === '') continue
    const parsed = Number(end)
    if (!Number.isInteger(parsed) || parsed < 4 || parsed > 19) return 'Ages are 4 to 19'
  }
  if (ends[0] !== '' && ends[1] !== '' && Number(ends[0]) > Number(ends[1])) {
    return 'Youngest is above oldest'
  }
  return null
}

/**
 * Whether a drill may be offered inside a template.
 *
 * ⚠️ TWO HALVES, AND ONLY ONE OF THEM REFUSES. Contact is safeguarding: a
 * contact drill on a tag template is `ok: false` with the reason, exactly as
 * it always was. Age is GUIDANCE since 2 Sep 2026 — the band is compared and
 * a mismatch is reported in `guidance`, but `ok` stays true. A coach, via
 * Jay: drills and templates "should not be age group locked".
 * `claude/plans/2026-09-02-training-suggestions-and-age-guidance.md`.
 * Every caller that read only `ok` keeps working; a caller that wants the
 * nudge reads `guidance`.
 */
export function drillFitsTemplate(drill, template) {
  if (drill?.requires_contact && !template?.requires_contact) {
    return { ok: false, reason: 'Contact drill; this template is tag', guidance: null }
  }
  const dMin = drill?.min_age ?? null
  const dMax = drill?.max_age ?? null
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if ((dMin != null && tMax != null && dMin > tMax) || (dMax != null && tMin != null && dMax < tMin)) {
    return {
      ok: true,
      reason: null,
      guidance: `Drill is for ${bandPhrase(dMin, dMax)}; template is ${bandPhrase(tMin, tMax)}`,
    }
  }
  return { ok: true, reason: null, guidance: null }
}

/** Adult overlap for `teams.is_senior`. U18 packs include them; max_age 16 does not. */
export const SENIOR_SQUAD_BAND = 18

function squadBand(team) {
  if (team?.is_senior === true) return SENIOR_SQUAD_BAND
  return ageBandFromTeamName(team?.name)
}

/**
 * Whether a template may reach a squad — and, separately, whether the club
 * would have suggested it for that age.
 *
 * ⚠️ CONTACT IS THE ONLY REFUSAL, AND IT IS UNCHANGED. Read from
 * teams.requires_contact, never from the name. That rule once stopped a
 * twelve-year-old girls' squad being offered an adult contact form, and the
 * age loosening below does not touch it.
 *
 * ⚠️ AGE IS GUIDANCE, NOT A GATE — since 2 Sep 2026. Until then a squad
 * outside the template's band was refused, and a squad whose name carried no
 * band ("Senior Men") was refused by ANYTHING that set an age at all, which
 * left senior coaches a thinner library than juniors for no reason but a
 * regex. Now: `ok` is true, and `guidance` carries the sentence ("U16 is
 * outside this template's U9–U13") for a picker to show beside the row or
 * sort by. A name with no band, and without `teams.is_senior`, is still
 * never "outside" anything — do not guess "senior" from the letters.
 *
 * ⚠️ `teams.is_senior` IS ADULTS, since 4 Sep 2026 (Jay: junior cards on a
 * senior picker "doesn't make any sense"). That column, never the name, is
 * the senior signal. The squad overlaps as band 18: any-age and adult-open
 * packs (U16-and-up, U16–U18) fit; a junior-capped `max_age` does not.
 * `ok` stays true so Publish can still warn without gating. Session Plan
 * and the shelf OMIT those rows for seniors (`shelfRowsForSquad`); youth
 * still see them with this sentence. The 27 Aug 2026 ruling that U18 must
 * not SEE U9 copies is superseded for youth by the 2 Sep guidance ruling,
 * and restored for seniors by this one.
 *
 * `subject` is the word the sentence calls the thing being fitted.
 */
export function squadFitsTemplate(team, template, subject = 'template') {
  if (template?.requires_contact && team?.requires_contact !== true) {
    return { ok: false, reason: `Contact ${subject}; this squad is tag`, guidance: null }
  }
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if (tMin == null && tMax == null) {
    return { ok: true, reason: null, guidance: null }
  }
  const band = squadBand(team)
  if (band === null) {
    return { ok: true, reason: null, guidance: null }
  }
  if ((tMin != null && band < tMin) || (tMax != null && band > tMax)) {
    const who = team?.is_senior === true ? 'Seniors are' : `U${band} is`
    return {
      ok: true,
      reason: null,
      guidance: `${who} outside this ${subject}'s ${bandPhrase(tMin, tMax)}`,
    }
  }
  return { ok: true, reason: null, guidance: null }
}

/**
 * One line per squad on the publish preview. Rows are suggest_training's:
 * `will_suggest` sessions get a suggestion, `unchanged` already carry this
 * template (any status — the director is never told "declined" here, that is
 * the uptake view's job), `no_events` means nothing in range.
 */
export function describePublishRow(row) {
  if (!row || row.no_events) return 'No training in this range'
  const n = row.will_suggest ?? 0
  const parts = [`${n} ${n === 1 ? 'session' : 'sessions'} will get the suggestion`]
  if (row.unchanged > 0) parts.push(`${row.unchanged} already ${row.unchanged === 1 ? 'has' : 'have'} it`)
  return parts.join(' · ')
}

/**
 * The director's uptake, per squad: did the programme land? Rows are
 * listSuggestionUptake's. A session embed may arrive as an object or a
 * one-element array depending on how PostgREST reads the unique FK — both
 * are handled, and a missing session simply means "not adjusted".
 *
 * `adjusted` is accepted AND the coach saved the session AFTER accepting
 * (coach_edited_at later than decided_at) — accept itself stamps
 * coach_edited_at, so "later than" is what separates a tweak from a plain yes.
 */
export function summariseUptake(rows) {
  const byTeam = new Map()
  for (const row of rows ?? []) {
    const teamId = row?.event?.team_id
    if (!teamId) continue
    if (!byTeam.has(teamId)) {
      byTeam.set(teamId, { team_id: teamId, total: 0, accepted: 0, adjusted: 0, declined: 0, pending: 0, notes: [] })
    }
    const bucket = byTeam.get(teamId)
    bucket.total += 1
    const session = Array.isArray(row.event.session) ? row.event.session[0] : row.event.session
    if (row.status === 'accepted') {
      bucket.accepted += 1
      const edited = session?.coach_edited_at ? Date.parse(session.coach_edited_at) : NaN
      const decided = row.decided_at ? Date.parse(row.decided_at) : NaN
      if (Number.isFinite(edited) && Number.isFinite(decided) && edited > decided + 1000) bucket.adjusted += 1
    } else if (row.status === 'declined') {
      bucket.declined += 1
      const note = (row.decline_note ?? '').trim()
      if (note) bucket.notes.push(note)
    } else {
      bucket.pending += 1
    }
  }
  return [...byTeam.values()]
}

/** One line per squad on the uptake card. */
export function describeUptake(bucket) {
  if (!bucket || bucket.total === 0) return 'Nothing suggested'
  const parts = []
  if (bucket.accepted > 0) {
    parts.push(`${bucket.accepted} accepted${bucket.adjusted > 0 ? ` (${bucket.adjusted} adjusted)` : ''}`)
  }
  if (bucket.declined > 0) parts.push(`${bucket.declined} declined`)
  if (bucket.pending > 0) parts.push(`${bucket.pending} unanswered`)
  return parts.join(' · ')
}
