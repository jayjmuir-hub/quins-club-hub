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

/** Whether a drill may be offered inside a template: contact, then age overlap. */
export function drillFitsTemplate(drill, template) {
  if (drill?.requires_contact && !template?.requires_contact) {
    return { ok: false, reason: 'Contact drill; this template is tag' }
  }
  const dMin = drill?.min_age ?? null
  const dMax = drill?.max_age ?? null
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if (dMin != null && tMax != null && dMin > tMax) {
    return { ok: false, reason: `Drill is for ${bandPhrase(dMin, dMax)}; template is ${bandPhrase(tMin, tMax)}` }
  }
  if (dMax != null && tMin != null && dMax < tMin) {
    return { ok: false, reason: `Drill is for ${bandPhrase(dMin, dMax)}; template is ${bandPhrase(tMin, tMax)}` }
  }
  return { ok: true, reason: null }
}

/**
 * Whether a template may be published to a squad.
 *
 * ⚠️ THE NULL-BAND RULE. ageBandFromTeamName returns null for a name it cannot
 * parse, and null here means "no guidance" — the squad is refused WITH THE
 * REASON, never given a default band. That null once offered a twelve-year-old
 * girls' squad an adult contact form; this is the place it would recur.
 * ⚠️ Contact is read from teams.requires_contact, never from the name.
 *
 * ⚠️ ORDER MATTERS, AND THE NULL BAND IS NOT CHECKED FIRST. A template that
 * sets NEITHER min_age NOR max_age is fine for any squad, because there is
 * nothing a band would be compared against — so it is allowed through before
 * the band is ever consulted. That is NOT a default band: a template that DOES
 * set an age still refuses an unparseable name below. Checking the null band
 * first refused every senior squad ("Senior Men" carries no band by design)
 * for every template, which left a senior coach's whole drill picker disabled.
 *
 * `subject` is the word the refusal calls the thing being fitted. Publish
 * keeps the default ('template'). Session Plan pickers no longer surface a
 * disabled option — they omit via shelfRowsForSquad — so they do not pass
 * 'session' here.
 */
export function squadFitsTemplate(team, template, subject = 'template') {
  if (template?.requires_contact && team?.requires_contact !== true) {
    return { ok: false, reason: `Contact ${subject}; this squad is tag` }
  }
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if (tMin == null && tMax == null) {
    return { ok: true, reason: null }
  }
  const band = ageBandFromTeamName(team?.name)
  if (band === null) {
    return { ok: false, reason: "Can't tell this squad's age group from its name" }
  }
  if ((tMin != null && band < tMin) || (tMax != null && band > tMax)) {
    return { ok: false, reason: `U${band} is outside this ${subject}'s ${bandPhrase(tMin, tMax)}` }
  }
  return { ok: true, reason: null }
}

/** One line per squad on the publish preview. */
export function describePublishRow(row) {
  if (!row || row.no_events) return 'No training in this range'
  const n = row.will_write ?? 0
  const parts = [`${n} ${n === 1 ? 'session' : 'sessions'} will get the plan`]
  if (row.skipped_coach_edited > 0) parts.push(`${row.skipped_coach_edited} kept (coach edited)`)
  return parts.join(' · ')
}
