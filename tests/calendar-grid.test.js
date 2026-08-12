import { describe, it, expect, afterAll } from 'vitest'
import {
  clubMidnight,
  dayKey,
  dayKeyOf,
  monthGrid,
  sameDay,
  shiftDay,
  shiftMonth,
  startOfWeek,
  weekDays,
  windowFor,
} from '../src/lib/calendarGrid.js'

// The pitch calendar's date arithmetic.
//
// PROCESS ZONE, and it is the whole point of this file. Every bug these
// helpers can have is a time-zone bug, and under a UTC runner they all pass.
// America/New_York is deliberately BEHIND the club: an Abu Dhabi morning is
// the previous evening in New York, so anything that reaches for the reader's
// calendar instead of the club's lands on the wrong day here and nowhere else.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('the week starts on MONDAY, because the UAE weekend is Sat–Sun', () => {
  it('puts Saturday and Sunday together at the END of the week', () => {
    // ⚠️ THE RULE THIS PINS IS A CLUB FACT, NOT A LOCALE DEFAULT. Rugby is
    // played at the weekend; a Sunday-start week splits Saturday and Sunday
    // across two screens, so the two days Pitch Management actually cares about
    // would never be side by side.
    // 12 Aug 2026 is a Wednesday.
    const days = weekDays({ year: 2026, month: 7, day: 12 })
    expect(days).toHaveLength(7)
    expect(days[0].day).toBe(10) // Monday
    expect(days[5].day).toBe(15) // Saturday
    expect(days[6].day).toBe(16) // Sunday
  })

  it('treats a Sunday as the END of its week, not the start', () => {
    // The off-by-one that a naive `getUTCDay()` produces: Sunday is 0, so
    // subtracting it moves nothing and Sunday becomes its own Monday.
    const sunday = { year: 2026, month: 7, day: 16 }
    expect(startOfWeek(sunday)).toEqual({ year: 2026, month: 7, day: 10 })
  })

  it('walks backwards across a month boundary', () => {
    // 1 Aug 2026 is a Saturday, so its week starts in July.
    expect(startOfWeek({ year: 2026, month: 7, day: 1 })).toEqual({
      year: 2026,
      month: 6,
      day: 27,
    })
  })
})

describe('the month grid', () => {
  it('is always whole weeks, so the column headings keep meaning what they say', () => {
    for (const month of [0, 1, 5, 7, 11]) {
      expect(monthGrid({ year: 2026, month, day: 1 }).length % 7).toBe(0)
    }
  })

  it('⚠️ pads with REAL neighbouring days, never blanks', () => {
    // A fixture on 1 March that falls in the last row of February's grid must
    // still be visible there. A blank pad would hide a booking on the one
    // screen whose job is showing what is booked.
    const grid = monthGrid({ year: 2026, month: 7, day: 12 }) // August 2026
    const first = grid[0]
    expect(first.inMonth).toBe(false)
    expect(first.month).toBe(6) // July
    expect(first.day).toBe(27) // the Monday
    expect(grid.some((cell) => cell.inMonth && cell.day === 1)).toBe(true)
    expect(grid.some((cell) => cell.inMonth && cell.day === 31)).toBe(true)
  })

  it('marks exactly the real days of the month as inMonth', () => {
    const grid = monthGrid({ year: 2026, month: 1, day: 3 }) // Feb 2026, 28 days
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28)
  })

  it('handles a leap February', () => {
    const grid = monthGrid({ year: 2028, month: 1, day: 3 })
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(29)
  })
})

describe('paging by month', () => {
  it('⚠️ CLAMPS rather than rolling over — 31 Jan back one month is 28 Feb', () => {
    // `new Date(2026, 1, 31)` is 3 MARCH. Paging forward from 31 January would
    // land in March and skip February entirely: a bug that only exists on five
    // days of the year, which is why it survives casual testing.
    expect(shiftMonth({ year: 2026, month: 0, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 1,
      day: 28,
    })
  })

  it('keeps the day when the target month is long enough', () => {
    expect(shiftMonth({ year: 2026, month: 0, day: 15 }, 1)).toEqual({
      year: 2026,
      month: 1,
      day: 15,
    })
  })

  it('crosses a year boundary in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 11, day: 10 }, 1)).toEqual({
      year: 2027,
      month: 0,
      day: 10,
    })
    expect(shiftMonth({ year: 2026, month: 0, day: 10 }, -1)).toEqual({
      year: 2025,
      month: 11,
      day: 10,
    })
  })
})

describe('the fetch window', () => {
  it('runs club midnight to club midnight, not the reader’s', () => {
    // ⚠️ THE ASSERTION IS THE `T20:00:00.000Z`. Abu Dhabi is +04:00, so club
    // midnight on 12 Aug is 20:00 UTC on the 11th. Under a browser in New York
    // a window built from local midnight would start four hours into the
    // previous club day and drop that day's early kick-offs.
    const window = windowFor([{ year: 2026, month: 7, day: 12 }])
    expect(window.from).toBe('2026-08-11T20:00:00.000Z')
    expect(window.to).toBe('2026-08-12T19:59:59.999Z')
  })

  it('spans the whole range for a multi-day view', () => {
    const window = windowFor(weekDays({ year: 2026, month: 7, day: 12 }))
    expect(window.from).toBe('2026-08-09T20:00:00.000Z') // Mon 10 Aug, club time
    expect(window.to).toBe('2026-08-16T19:59:59.999Z') // end of Sun 16 Aug
  })

  it('returns null for an empty range rather than an invalid window', () => {
    expect(windowFor([])).toBeNull()
    expect(windowFor(null)).toBeNull()
  })
})

describe('filing an event under a day', () => {
  it('⚠️ files by the CLUB’S calendar day, not by the UTC date', () => {
    // A 01:00 Abu Dhabi kick-off is 21:00 UTC the day BEFORE. Slicing on the
    // UTC date files it under yesterday — rare enough to be found in November
    // rather than in testing.
    const lateNight = new Date('2026-08-12T21:00:00.000Z') // 01:00 on the 13th, club time
    expect(dayKeyOf(lateNight)).toBe(dayKey({ year: 2026, month: 7, day: 13 }))
  })

  it('files an ordinary morning kick-off under that morning', () => {
    const saturdayMorning = new Date('2026-08-15T05:00:00.000Z') // 09:00 club time
    expect(dayKeyOf(saturdayMorning)).toBe(dayKey({ year: 2026, month: 7, day: 15 }))
  })

  it('agrees with the grid’s own keys, which is what makes the join work', () => {
    // dayKeyOf and dayKey are two halves of one lookup: if their shapes ever
    // drift, every cell renders empty and nothing errors.
    const grid = monthGrid({ year: 2026, month: 7, day: 12 })
    const cell = grid.find((day) => day.inMonth && day.day === 15)
    expect(dayKeyOf(clubMidnight(cell))).toBe(dayKey(cell))
  })
})

describe('sameDay', () => {
  it('is false for a null on either side rather than throwing', () => {
    expect(sameDay(null, { year: 2026, month: 7, day: 12 })).toBe(false)
    expect(sameDay({ year: 2026, month: 7, day: 12 }, undefined)).toBe(false)
  })

  it('does not confuse the same day-number in different months', () => {
    expect(sameDay({ year: 2026, month: 7, day: 12 }, { year: 2026, month: 8, day: 12 })).toBe(false)
    expect(sameDay({ year: 2026, month: 7, day: 12 }, { year: 2026, month: 7, day: 12 })).toBe(true)
  })
})

describe('shiftDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDay({ year: 2026, month: 7, day: 31 }, 1)).toEqual({ year: 2026, month: 8, day: 1 })
    expect(shiftDay({ year: 2026, month: 0, day: 1 }, -1)).toEqual({ year: 2025, month: 11, day: 31 })
  })
})
