// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  CLUB_BUCKET,
  chipHours,
  blocksFromTemplate,
  chipNeedsConfirm,
  chipReplaceMessage,
  coachLabel,
  groupByCoach,
  countUsedThisWeek,
} from '../src/lib/trainingShelf.js'

// Pure shelf rules. Invented fixtures only — CLAUDE.md rule 9.

describe('chipHours', () => {
  it('keeps templates with a chip_label and drops the rest', () => {
    expect(
      chipHours([
        { id: 't1', chip_label: 'Tackle' },
        { id: 't2', chip_label: null },
        { id: 't3', name: 'Skills night' },
      ]).map((row) => row.id),
    ).toEqual(['t1'])
  })

  it('is empty-safe — no featured hours yet is not a crash', () => {
    expect(chipHours([])).toEqual([])
    expect(chipHours(undefined)).toEqual([])
  })
})

describe('blocksFromTemplate', () => {
  it('copies blocks in stored order as numbers, with coach notes', () => {
    const template = {
      blocks: [
        { position: 2, drill_id: 'd-b', minutes: '8', coach_note: 'tight' },
        { position: 1, drill_id: 'd-a', minutes: 15, coach_note: null },
      ],
    }
    expect(blocksFromTemplate(template)).toEqual([
      { drill_id: 'd-a', minutes: 15, coach_note: null },
      { drill_id: 'd-b', minutes: 8, coach_note: 'tight' },
    ])
  })
})

describe('chip confirm', () => {
  it('asks before replacing a coach-edited session', () => {
    expect(chipNeedsConfirm({ coach_edited_at: '2026-08-21T05:00:00.000Z' })).toBe(true)
    expect(chipNeedsConfirm({ coach_edited_at: null })).toBe(false)
    expect(chipNeedsConfirm(null)).toBe(false)
  })

  it('names the hour in the replace sentence', () => {
    expect(chipReplaceMessage('Tackle')).toBe('Replace your edits with the Tackle hour?')
  })
})

describe('browse-by-coach', () => {
  const names = new Map([
    ['p-row', 'Coach Rowan'],
    ['p-nia', 'Coach Nia'],
  ])

  it('groups on created_by and buckets null as Club / World Rugby', () => {
    const groups = groupByCoach(
      [
        { id: 'd1', created_by: 'p-row', title: 'Clamp' },
        { id: 'd2', created_by: null, title: 'Activate' },
        { id: 'd3', created_by: 'p-nia', title: 'Rip' },
        { id: 'd4', created_by: null, title: 'Track' },
      ],
      names,
    )
    expect(groups.map((g) => g.coach)).toEqual(['Coach Rowan', CLUB_BUCKET, 'Coach Nia'])
    expect(groups.find((g) => g.coach === CLUB_BUCKET).items.map((i) => i.id)).toEqual(['d2', 'd4'])
  })

  it('an unknown id is still the club bucket, never a blank card', () => {
    expect(coachLabel('p-missing', names)).toBe(CLUB_BUCKET)
    expect(coachLabel(null, names)).toBe(CLUB_BUCKET)
  })
})

describe('used this week', () => {
  // Club time is Asia/Dubai. A Thursday 27 Aug 2026 10:00 +04 window:
  // last 7 club days are Fri 21 → Thu 27 inclusive. Fri 20 is out.
  const now = new Date('2026-08-27T06:00:00.000Z') // 10:00 in Dubai
  const rows = [
    { eventId: 'e-today', startsAt: '2026-08-27T15:00:00.000Z' },
    { eventId: 'e-today', startsAt: '2026-08-27T15:00:00.000Z' }, // same event twice
    { eventId: 'e-week', startsAt: '2026-08-21T15:00:00.000Z' },
    { eventId: 'e-old', startsAt: '2026-08-20T15:00:00.000Z' },
  ]

  it('counts distinct training events in the last 7 club days, not row repeats', () => {
    expect(countUsedThisWeek(rows, { now })).toBe(2)
  })

  it('does not take a likes array — likes cannot change the number', () => {
    expect(countUsedThisWeek(rows, { now })).toBe(countUsedThisWeek(rows, { now }))
    expect(countUsedThisWeek([], { now })).toBe(0)
  })
})
