import { describe, it, expect } from 'vitest'
import { dayLabel, daysDiffer } from '../src/lib/chatDays.js'

// Round 3: "there are marks for messages Today, Yesterday, and then older
// get a date". Pure functions; the clock is an argument.

const NOW = new Date('2026-08-24T21:00:00')

describe('dayLabel', () => {
  it('Today, Yesterday, then a short date, with the year only when it differs', () => {
    expect(dayLabel('2026-08-24T09:00:00', NOW)).toBe('Today')
    expect(dayLabel('2026-08-23T23:59:00', NOW)).toBe('Yesterday')
    expect(dayLabel('2026-08-18T12:00:00', NOW)).toMatch(/Tue.*18.*Aug/)
    expect(dayLabel('2026-08-18T12:00:00', NOW)).not.toMatch(/2026/)
    expect(dayLabel('2025-12-31T12:00:00', NOW)).toMatch(/2025/)
  })

  it('midnight boundaries are LOCAL days: 00:01 today is Today, 23:59 yesterday is Yesterday', () => {
    expect(dayLabel('2026-08-24T00:01:00', NOW)).toBe('Today')
    expect(dayLabel('2026-08-23T23:59:59', NOW)).toBe('Yesterday')
  })
})

describe('daysDiffer', () => {
  it('splits on the local midnight and always before the first message', () => {
    expect(daysDiffer(undefined, '2026-08-24T09:00:00')).toBe(true)
    expect(daysDiffer('2026-08-24T09:00:00', '2026-08-24T21:00:00')).toBe(false)
    expect(daysDiffer('2026-08-23T23:59:00', '2026-08-24T00:01:00')).toBe(true)
  })
})
