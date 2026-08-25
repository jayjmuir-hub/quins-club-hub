import { describe, it, expect } from 'vitest'
import {
  groupEventsByMonth,
  initialVisibleMonthCount,
  showMoreMonthsLabel,
} from '../src/lib/scheduleMonthGroups.js'

// Invented opponents and session titles only — no real names.

function event(id, startsAt) {
  return { id, starts_at: startsAt, type: 'training', title: id }
}

describe('groupEventsByMonth', () => {
  it('buckets by the club calendar month, preserving caller order', () => {
    const groups = groupEventsByMonth([
      event('a', '2030-03-10T11:00:00Z'),
      event('b', '2030-03-20T11:00:00Z'),
      event('c', '2030-04-02T11:00:00Z'),
    ])
    expect(groups.map((g) => g.label)).toEqual(['March 2030', 'April 2030'])
    expect(groups[0].events.map((e) => e.id)).toEqual(['a', 'b'])
    expect(groups[1].events.map((e) => e.id)).toEqual(['c'])
  })

  it('skips events with no parseable start, same as the calendar grid', () => {
    expect(groupEventsByMonth([event('x', null), event('y', 'nope')])).toEqual([])
  })

  it('uses the Abu Dhabi day, not UTC, at the month boundary', () => {
    // 20:30 UTC on 31 March = 00:30 on 1 April in Asia/Dubai.
    const groups = groupEventsByMonth([event('late', '2030-03-31T20:30:00Z')])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('April 2030')
  })
})

describe('initialVisibleMonthCount', () => {
  function months(counts) {
    return counts.map((n, i) => ({
      events: Array.from({ length: n }, (_, j) => ({ id: `${i}-${j}` })),
    }))
  }

  it('shows every month when the list is short', () => {
    expect(initialVisibleMonthCount(months([4, 4]))).toBe(2)
  })

  it('keeps at least three months even when those already pass the row soft cap', () => {
    expect(initialVisibleMonthCount(months([20, 20, 20, 20]))).toBe(3)
  })

  it('stops once three months are showing and the row cap is met', () => {
    expect(initialVisibleMonthCount(months([10, 10, 10, 10, 10, 10]))).toBe(4)
  })
})

describe('showMoreMonthsLabel', () => {
  it('names the next month so it is not a hunt through pages', () => {
    expect(showMoreMonthsLabel([{ label: 'June 2030' }])).toBe('Show June 2030')
    expect(showMoreMonthsLabel([{ label: 'June 2030' }, { label: 'July 2030' }])).toBe(
      'Show more months (June 2030 onwards)',
    )
  })
})
