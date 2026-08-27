// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  trainingNightsInWindow,
  defaultSelectedNight,
  resolveSelectedNight,
  sessionStatus,
  pitchBookedLabel,
  nightDateLabel,
  nightTimeLabel,
  nightSummary,
} from '../src/lib/trainingDates.js'

// Pure two-week strip rules. Invented fixtures only — CLAUDE.md rule 9.
// Club zone is Asia/Dubai (UTC+4, no DST).

// Tuesday 1 Sep 2026, 14:00 Dubai (10:00 UTC).
const NOW = new Date('2026-09-01T10:00:00Z')

const ev = (id, startsAt, extra = {}) => ({
  id,
  type: 'training',
  starts_at: startsAt,
  ...extra,
})

describe('trainingNightsInWindow', () => {
  it('keeps only this squad’s training events inside the next two club weeks', () => {
    const nights = trainingNightsInWindow(
      [
        ev('tue-1', '2026-09-01T14:00:00Z'),
        ev('sat-5', '2026-09-05T14:00:00Z'),
        ev('tue-8', '2026-09-08T14:00:00Z'),
        ev('far', '2026-09-22T14:00:00Z'),
        { id: 'match', type: 'match', starts_at: '2026-09-05T08:00:00Z', opponent: 'Desert Hawks' },
        ev('past', '2026-08-25T14:00:00Z'),
      ],
      NOW,
    )
    expect(nights.map((row) => row.id)).toEqual(['tue-1', 'sat-5', 'tue-8'])
  })

  it('is not a calendar of empty days — a quiet fortnight is an empty list', () => {
    expect(trainingNightsInWindow([], NOW)).toEqual([])
    expect(trainingNightsInWindow(undefined, NOW)).toEqual([])
  })

  it('files a late kick-off under the club day, not UTC', () => {
    // 21:00 UTC on 14 Sep is 01:00 on the 15th in Dubai — outside a window
    // that ends on the 14th. Bucketing on the raw date would keep it.
    const nights = trainingNightsInWindow([ev('late', '2026-09-14T21:00:00Z')], NOW)
    expect(nights).toEqual([])
  })

  it('still includes tonight after the session has started', () => {
    const afterKickoff = new Date('2026-09-01T15:30:00Z')
    const nights = trainingNightsInWindow([ev('tue-1', '2026-09-01T14:00:00Z')], afterKickoff)
    expect(nights.map((row) => row.id)).toEqual(['tue-1'])
  })
})

describe('defaultSelectedNight', () => {
  it('selects tonight when this squad trains today', () => {
    const nights = [
      ev('tue-1', '2026-09-01T14:00:00Z'),
      ev('sat-5', '2026-09-05T14:00:00Z'),
    ]
    expect(defaultSelectedNight(nights, NOW).id).toBe('tue-1')
  })

  it('selects the next upcoming night when there is no training tonight', () => {
    const wednesday = new Date('2026-09-02T10:00:00Z')
    const nights = trainingNightsInWindow(
      [ev('sat-5', '2026-09-05T14:00:00Z'), ev('tue-8', '2026-09-08T14:00:00Z')],
      wednesday,
    )
    expect(defaultSelectedNight(nights, wednesday).id).toBe('sat-5')
  })

  it('is null when the window is empty', () => {
    expect(defaultSelectedNight([], NOW)).toBeNull()
  })
})

describe('resolveSelectedNight', () => {
  it('keeps the already-selected night so switching dates cannot trash another draft', () => {
    const nights = [ev('tue-1', '2026-09-01T14:00:00Z'), ev('sat-5', '2026-09-05T14:00:00Z')]
    expect(resolveSelectedNight(nights, nights[1], NOW).id).toBe('sat-5')
  })

  it('falls back to the default when the previous night has left the window', () => {
    const nights = [ev('sat-5', '2026-09-05T14:00:00Z')]
    expect(resolveSelectedNight(nights, ev('gone', '2026-08-25T14:00:00Z'), NOW).id).toBe('sat-5')
  })
})

describe('sessionStatus', () => {
  it('is Empty with no session, Draft / Staff from visibility', () => {
    expect(sessionStatus(null)).toEqual({ key: 'empty', label: 'Empty' })
    expect(sessionStatus({ visibility: 'draft' })).toEqual({ key: 'draft', label: 'Draft' })
    expect(sessionStatus({ visibility: 'staff' })).toEqual({ key: 'staff', label: 'Staff' })
  })
})

describe('pitch and labels', () => {
  it('puts the pitch on the date, never inventing a booking', () => {
    expect(pitchBookedLabel({ pitch: 'D1' })).toBe('D1 booked')
    expect(pitchBookedLabel({ pitch: 'Pitch TBD' })).toBeNull()
    expect(pitchBookedLabel({ pitch: '' })).toBeNull()
    expect(pitchBookedLabel({})).toBeNull()
  })

  it('labels the chip as weekday + date and a 24-hour club time', () => {
    const night = ev('tue-8', '2026-09-08T14:00:00Z')
    expect(nightDateLabel(night)).toBe('Tue 8 Sep')
    expect(nightTimeLabel(night)).toBe('18:00')
  })

  it('summarises empty vs published-to-staff, with pitch on the date', () => {
    const empty = ev('tue-1', '2026-09-01T14:00:00Z')
    expect(nightSummary(empty, null)).toBe('Tue 1 Sep · nothing published yet')

    const staff = ev('tue-8', '2026-09-08T14:00:00Z', { pitch: 'D1' })
    expect(nightSummary(staff, { visibility: 'staff' })).toBe(
      'Tue 8 Sep · published to staff · D1 booked',
    )
  })
})
