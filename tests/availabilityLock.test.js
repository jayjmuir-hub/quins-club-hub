import { describe, it, expect } from 'vitest'
import { availabilityLockInstant, isAvailabilitySelfLocked } from '../src/lib/availabilityLock.js'

// Abu Dhabi is UTC+4, no DST, so 00:00 club time is 20:00Z the previous day.
describe('availabilityLockInstant', () => {
  it('locks a match at 00:00 Abu Dhabi five days before the event date', () => {
    // Match 2026-09-13 16:00 Abu Dhabi (= 12:00Z). 13 - 5 = the 8th.
    const event = { type: 'match', starts_at: '2026-09-13T12:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-07T20:00:00.000Z')
  })

  it('locks a training at 00:00 Abu Dhabi one day before the event date', () => {
    // Training 2026-09-09 18:00 Abu Dhabi (= 14:00Z). 9 - 1 = the 8th.
    const event = { type: 'training', starts_at: '2026-09-09T14:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-07T20:00:00.000Z')
  })

  it('never locks a social', () => {
    expect(availabilityLockInstant({ type: 'social', starts_at: '2026-09-09T14:00:00Z' })).toBeNull()
  })

  it('never locks an unknown type or a missing start', () => {
    expect(availabilityLockInstant({ type: 'festival', starts_at: '2026-09-09T14:00:00Z' })).toBeNull()
    expect(availabilityLockInstant({ type: 'match', starts_at: null })).toBeNull()
  })

  it('resolves the club date from Abu Dhabi wall time, not UTC', () => {
    // 2026-09-13T21:00Z is 2026-09-14 01:00 Abu Dhabi — club date is the 14th.
    // 14 - 5 = the 9th; 00:00 AD = 20:00Z on the 8th.
    const event = { type: 'match', starts_at: '2026-09-13T21:00:00Z' }
    expect(availabilityLockInstant(event).toISOString()).toBe('2026-09-08T20:00:00.000Z')
  })
})

describe('isAvailabilitySelfLocked', () => {
  const match = { type: 'match', starts_at: '2026-09-13T12:00:00Z' } // locks 2026-09-07T20:00Z
  it('is open just before the cutoff', () => {
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-07T19:59:00Z'))).toBe(false)
  })
  it('is locked at and after the cutoff', () => {
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-07T20:00:00Z'))).toBe(true)
    expect(isAvailabilitySelfLocked(match, new Date('2026-09-10T00:00:00Z'))).toBe(true)
  })
  it('never locks a social', () => {
    const social = { type: 'social', starts_at: '2026-09-13T12:00:00Z' }
    expect(isAvailabilitySelfLocked(social, new Date('2026-09-13T11:00:00Z'))).toBe(false)
  })
})
