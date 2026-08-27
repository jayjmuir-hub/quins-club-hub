import { clubDayParts, CLUB_TIME_ZONE } from './eventFormat.js'
import { CATEGORIES } from './trainingPlans.js'

// Pure decisions for the Squad Training shelf.
// Spec: claude/specs/2026-08-27-training-shelf.md
//
// No Supabase, no React. The chip-apply confirm, the coach bucket, and
// "used this week" are numbers and sentences a test can pin without a DOM.

export const CLUB_BUCKET = 'Club / World Rugby'

export const CHIP_ORDER = ['Tackle', 'Passing', 'Ruck', 'Attack', 'Defence']

export { CATEGORIES }

/** Templates the shelf draws as focus chips — `chip_label` set, never hidden. */
export function chipHours(templates) {
  return (templates ?? []).filter((row) => Boolean(row?.chip_label))
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
