import { describe, it, expect } from 'vitest'
import {
  MONTHS_BACK,
  MONTHS_FORWARD,
  defaultEventWindow,
  monthWindow,
  isMonthOutsideWindow,
  windowCovering,
} from '../src/lib/eventWindow.js'

// The read window the event screens fetch through.
//
// ⚠️ THE HEADLINE TEST IS "JAY'S QUESTION" BELOW. The first proposal was a
// 3-month lookback, and he asked the obvious thing: "in 6 months will I still
// be able to see events from Sept?" The answer was no — and because Results is
// derived from the same single fetch as Upcoming, that would have emptied the
// season-in-review screen halfway through the season. The lookback is 12
// months so that it always spans a season from any point inside it, and the
// test below is that question, executable.

const months = (window) => ({ from: window.from.slice(0, 7), to: window.to.slice(0, 7) })

describe('the default event window', () => {
  it('⚠️ Jay\'s question: six months on, September is still in the window', () => {
    // The season starts in September. Stand in each later month of it and
    // check September has not fallen out of the fetch — which is what would
    // empty the Results tab.
    const september = Date.UTC(2026, 8, 15)

    for (const monthsLater of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const standingIn = { year: 2026, month: 8 + monthsLater }
      const window = defaultEventWindow(standingIn)
      expect(
        Date.parse(window.from),
        `standing ${monthsLater} months after September, the window starts ` +
          `${window.from} — September's fixtures would not be fetched, and the ` +
          'Results tab reads from the same fetch as Upcoming.',
      ).toBeLessThanOrEqual(september)
    }
  })

  it('⚠️ a 3-month lookback would have failed that — the test can fail', () => {
    // Guarding the guard. If MONTHS_BACK were ever "tidied" down, the test
    // above must actually catch it, so prove the assertion is load-bearing by
    // running the rejected proposal through it.
    const february = { year: 2027, month: 1 }
    const shortWindow = monthWindow(february, 3, 9)
    const september = Date.UTC(2026, 8, 15)
    expect(Date.parse(shortWindow.from)).toBeGreaterThan(september)
  })

  it('spans a whole season either side of the anchor', () => {
    expect(MONTHS_BACK).toBeGreaterThanOrEqual(12)
    expect(MONTHS_FORWARD).toBeGreaterThanOrEqual(3)
  })

  it('covers whole months, never a partial one', () => {
    // ⚠️ Half a loaded month looks exactly like a quiet month. The window's
    // edges are month boundaries so a month inside it is always complete.
    const { from, to } = defaultEventWindow({ year: 2026, month: 7 })
    expect(from.endsWith('-01T00:00:00.000Z')).toBe(true)
    expect(to).toMatch(/T23:59:59\.999Z$/)
    expect(months({ from, to })).toEqual({ from: '2025-08', to: '2027-02' })
  })

  it('rolls forward with the anchor rather than sitting on fixed dates', () => {
    const august = months(defaultEventWindow({ year: 2026, month: 7 }))
    const september = months(defaultEventWindow({ year: 2026, month: 8 }))
    expect(september.from).not.toBe(august.from)
    expect(september.to).not.toBe(august.to)
  })

  it('handles a window that crosses a year boundary in both directions', () => {
    // January minus 12 months is the previous year; Date.UTC normalises it,
    // and this pins that rather than trusting it.
    expect(months(defaultEventWindow({ year: 2027, month: 0 }))).toEqual({
      from: '2026-01',
      to: '2027-07',
    })
  })
})

describe('paging the calendar out of the window', () => {
  const window = defaultEventWindow({ year: 2026, month: 7 }) // Aug 2025 – Feb 2027

  it('recognises a month inside it', () => {
    expect(isMonthOutsideWindow({ year: 2026, month: 8 }, window)).toBe(false)
  })

  it('⚠️ recognises the months just outside each edge', () => {
    // The off-by-one that would render an unloaded month as an empty one.
    expect(isMonthOutsideWindow({ year: 2025, month: 6 }, window)).toBe(true) // Jul 2025
    expect(isMonthOutsideWindow({ year: 2027, month: 2 }, window)).toBe(true) // Mar 2027
  })

  it('treats the boundary months themselves as inside', () => {
    expect(isMonthOutsideWindow({ year: 2025, month: 7 }, window)).toBe(false) // Aug 2025
    expect(isMonthOutsideWindow({ year: 2027, month: 1 }, window)).toBe(false) // Feb 2027
  })

  it('⚠️ widens rather than moves, so what is loaded is never dropped', () => {
    // Paging back three years must not discard the fixtures Upcoming and
    // Results are currently showing.
    const widened = windowCovering({ year: 2023, month: 4 }, window)
    expect(Date.parse(widened.from)).toBeLessThan(Date.parse(window.from))
    expect(widened.to).toBe(window.to)
    expect(isMonthOutsideWindow({ year: 2023, month: 4 }, widened)).toBe(false)
    // and everything that was inside still is
    expect(isMonthOutsideWindow({ year: 2026, month: 8 }, widened)).toBe(false)
  })

  it('settles — widening twice for the same month is a no-op', () => {
    // Otherwise the widen effect and the fetch effect would trade updates
    // forever, which is a spinner that never stops.
    const once = windowCovering({ year: 2023, month: 4 }, window)
    const twice = windowCovering({ year: 2023, month: 4 }, once)
    expect(twice).toEqual(once)
  })
})
