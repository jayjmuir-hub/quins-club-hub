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

function bandLabel(min, max) {
  if (min != null && max != null) return `U${min}–U${max}`
  if (min != null) return `U${min} and up`
  if (max != null) return `up to U${max}`
  return 'any age'
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
    return { ok: false, reason: `Drill is for ${bandLabel(dMin, dMax)}; template is ${bandLabel(tMin, tMax)}` }
  }
  if (dMax != null && tMin != null && dMax < tMin) {
    return { ok: false, reason: `Drill is for ${bandLabel(dMin, dMax)}; template is ${bandLabel(tMin, tMax)}` }
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
 */
export function squadFitsTemplate(team, template) {
  const band = ageBandFromTeamName(team?.name)
  if (band === null) {
    return { ok: false, reason: "Can't tell this squad's age group from its name" }
  }
  if (template?.requires_contact && team?.requires_contact !== true) {
    return { ok: false, reason: 'Contact template; this squad is tag' }
  }
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if ((tMin != null && band < tMin) || (tMax != null && band > tMax)) {
    return { ok: false, reason: `U${band} is outside this template's ${bandLabel(tMin, tMax)}` }
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
