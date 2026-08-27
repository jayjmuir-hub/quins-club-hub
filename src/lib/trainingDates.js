import { clubDayParts, CLUB_TIME_ZONE, eventDate, isTimeTbd, TIME_TBD } from './eventFormat.js'

// Pure decisions for the Squad Training two-week date strip.
// Spec: claude/specs/2026-08-27-training-date-strip.md
//
// Events of type training already ARE the nights. This module does not invent
// a calendar table. The window is the same fourteen club days UpcomingStrip
// uses — only the nights this squad actually trains, never empty weekdays.

const FORTNIGHT_DAYS = 14
const PITCH_PLACEHOLDER = 'Pitch TBD'

function asDate(now) {
  if (now instanceof Date) return now
  if (now == null) return new Date()
  return new Date(now)
}

function clubUtcDay(parts) {
  return Date.UTC(parts.year, parts.month, parts.day)
}

function eventClubDay(event) {
  const at = eventDate(event)
  return at ? clubDayParts(at) : null
}

/** Inclusive [today, today + 13] in Asia/Dubai. */
export function inNextTwoWeeks(event, now = new Date()) {
  const day = eventClubDay(event)
  if (!day) return false
  const today = clubDayParts(asDate(now))
  const start = clubUtcDay(today)
  const end = Date.UTC(today.year, today.month, today.day + (FORTNIGHT_DAYS - 1))
  const key = clubUtcDay(day)
  return key >= start && key <= end
}

export function trainingNightsInWindow(events, now = new Date()) {
  return (events ?? [])
    .filter((event) => event?.type === 'training' && inNextTwoWeeks(event, now))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
}

function isTonight(event, now) {
  const day = eventClubDay(event)
  if (!day) return false
  const today = clubDayParts(asDate(now))
  return clubUtcDay(day) === clubUtcDay(today)
}

export function defaultSelectedNight(nights, now = new Date()) {
  const rows = nights ?? []
  if (rows.length === 0) return null
  return rows.find((event) => isTonight(event, now)) ?? rows[0]
}

export function resolveSelectedNight(nights, previous, now = new Date()) {
  const rows = nights ?? []
  if (previous?.id && rows.some((event) => event.id === previous.id)) {
    return rows.find((event) => event.id === previous.id)
  }
  return defaultSelectedNight(rows, now)
}

export function sessionStatus(plan) {
  if (!plan) return { key: 'empty', label: 'Empty' }
  if (plan.visibility === 'draft') return { key: 'draft', label: 'Draft' }
  if (plan.visibility === 'staff') return { key: 'staff', label: 'Staff' }
  if (plan.visibility === 'squad') return { key: 'squad', label: 'Squad' }
  return { key: 'empty', label: 'Empty' }
}

export function pitchBookedLabel(event) {
  const pitch = (event?.pitch ?? '').trim()
  if (!pitch || pitch === PITCH_PLACEHOLDER) return null
  return `${pitch} booked`
}

export function nightDateLabel(event) {
  const at = eventDate(event)
  if (!at) return '—'
  const weekday = at.toLocaleDateString('en-GB', { weekday: 'short', timeZone: CLUB_TIME_ZONE })
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', timeZone: CLUB_TIME_ZONE })
  const month = at.toLocaleDateString('en-US', { month: 'short', timeZone: CLUB_TIME_ZONE })
  return `${weekday} ${day} ${month}`
}

export function nightTimeLabel(event) {
  if (isTimeTbd(event)) return TIME_TBD
  const at = eventDate(event)
  if (!at) return TIME_TBD
  return at.toLocaleTimeString('en-GB', {
    timeZone: CLUB_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function statusSummary(plan) {
  const status = sessionStatus(plan)
  if (status.key === 'empty') return 'nothing published yet'
  if (status.key === 'draft') return 'draft'
  if (status.key === 'staff') return 'published to staff'
  if (status.key === 'squad') return 'published to the squad'
  return 'nothing published yet'
}

export function nightSummary(event, plan) {
  const bits = [nightDateLabel(event), statusSummary(plan)]
  const pitch = pitchBookedLabel(event)
  if (pitch) bits.push(pitch)
  return bits.join(' · ')
}
