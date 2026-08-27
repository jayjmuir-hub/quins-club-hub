import { clubDayParts, CLUB_TIME_ZONE } from './eventFormat.js'
import { CATEGORIES, squadFitsTemplate } from './trainingPlans.js'

// Pure decisions for the Squad Training shelf.
// Spec: claude/specs/2026-08-27-training-shelf.md
//
// No Supabase, no React. The chip-apply confirm, the coach bucket, and
// "used this week" are numbers and sentences a test can pin without a DOM.

export const CLUB_BUCKET = 'Club / World Rugby'

export const CHIP_ORDER = ['Tackle', 'Passing', 'Ruck', 'Attack', 'Defence']

export { CATEGORIES }

/** Width of an age band. Unbounded ends are looser than a closed pack. */
function ageSpan(template) {
  const min = template?.min_age ?? null
  const max = template?.max_age ?? null
  if (min == null && max == null) return Number.POSITIVE_INFINITY
  if (min == null) return (max ?? 19) - 4
  if (max == null) return 19 - min
  return max - min
}

function pickChipForSquad(candidates, team) {
  const fitting = candidates.filter((row) => squadFitsTemplate(team, row).ok)
  if (fitting.length === 1) return fitting[0]
  if (fitting.length > 1) {
    return [...fitting].sort((a, b) => ageSpan(a) - ageSpan(b))[0]
  }
  const contactFail = candidates.find((row) => /this squad is tag/i.test(squadFitsTemplate(team, row).reason ?? ''))
  return contactFail ?? candidates[0]
}

/**
 * One chip per `chip_label`. A label that fits this squad uses the tightest
 * matching pack; a label that does not still appears once, disabled.
 * Extra age-pack copies are not emitted — that is the picker's job, not CSS.
 */
export function chipHours(templates, team) {
  const rows = (templates ?? []).filter((row) => Boolean(row?.chip_label))
  const byLabel = new Map()
  for (const row of rows) {
    const label = row.chip_label
    if (!byLabel.has(label)) byLabel.set(label, [])
    byLabel.get(label).push(row)
  }
  const extras = [...byLabel.keys()].filter((label) => !CHIP_ORDER.includes(label))
  const labels = [...CHIP_ORDER.filter((label) => byLabel.has(label)), ...extras]
  return labels.map((label) => pickChipForSquad(byLabel.get(label), team))
}

/**
 * Why a chip is enabled or not. Age-pack mismatch is "No hour for this age"
 * (the picker already dropped the other copies). Contact stays the Publish-tab
 * sentence. Contact is never inferred from the squad name.
 */
export function chipFit(team, template) {
  const fit = squadFitsTemplate(team, template)
  if (fit.ok) return fit
  if (/outside this /.test(fit.reason ?? '')) {
    return { ok: false, reason: 'No hour for this age' }
  }
  return fit
}

/** Library rows that fit this squad. Age from the name; contact from the column.
 * Session Plan's template/drill <select>s and the shelf From-coaches row
 * reuse this — omit, never a disabled option. Chips use chipHours instead. */
export function shelfRowsForSquad(rows, team, { allAges = false } = {}) {
  if (allAges) return rows ?? []
  return (rows ?? []).filter((row) => squadFitsTemplate(team, row).ok)
}

/**
 * Copy a template's blocks into the shape createSession / saveSessionBlocks
 * write: numbers, stored order, coach notes kept. The mould, not a reference.
 */
export function blocksFromTemplate(template) {
  return [...(template?.blocks ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((block) => ({
      drill_id: block.drill_id ?? block.drill?.id ?? null,
      minutes: Number(block.minutes),
      coach_note: block.coach_note ?? null,
    }))
}

/** A session the coach has already saved is the one publish_training skips. */
export function chipNeedsConfirm(session) {
  return Boolean(session?.coach_edited_at)
}

export function chipReplaceMessage(chipLabel) {
  return `Replace your edits with the ${chipLabel} hour?`
}

/**
 * `created_by` → the adult name on the card. NULL (Director / imported /
 * unattributed) is the Club / World Rugby bucket — never a missing group
 * and never a player name.
 */
export function coachLabel(createdBy, namesById) {
  if (createdBy == null) return CLUB_BUCKET
  const name = namesById instanceof Map ? namesById.get(createdBy) : namesById?.[createdBy]
  return name || CLUB_BUCKET
}

export function groupByCoach(rows, namesById) {
  const groups = new Map()
  for (const row of rows ?? []) {
    const label = coachLabel(row.created_by, namesById)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(row)
  }
  return [...groups.entries()].map(([coach, items]) => ({ coach, items }))
}

function clubDayUtcMs(date) {
  const { year, month, day } = clubDayParts(date)
  return Date.UTC(year, month, day)
}

/** Inclusive window of `days` club calendar days ending today in Asia/Dubai. */
export function inLastClubDays(at, { now = new Date(), days = 7 } = {}) {
  if (at == null) return false
  const instant = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(instant.getTime())) return false
  const end = clubDayUtcMs(now)
  const start = end - (days - 1) * 86_400_000
  const day = clubDayUtcMs(instant)
  return day >= start && day <= end
}

/**
 * Distinct training events in the last 7 Asia/Dubai days. `rows` is
 * `{ eventId, startsAt }[]` already scoped to one drill or one template.
 * Likes are not an input and cannot change the number.
 */
export function countUsedThisWeek(rows, opts) {
  const events = new Set()
  for (const row of rows ?? []) {
    if (!row?.eventId) continue
    if (inLastClubDays(row.startsAt, opts)) events.add(row.eventId)
  }
  return events.size
}

export function clubWeekday(event) {
  const at = event?.starts_at ? new Date(event.starts_at) : null
  if (!at || Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: CLUB_TIME_ZONE })
}
