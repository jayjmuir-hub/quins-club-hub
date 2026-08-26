// The pure halves of three-state presence
// (claude/plans/2026-08-26-last-active-and-presence-dots.md): channel state
// → Map, and Map → dot state. The socket plumbing stays untested here — the
// live check after deploy is its proof.
import { describe, it, expect } from 'vitest'
import { computePresence, dotState } from '../src/lib/presence.js'

describe('computePresence', () => {
  it('reads online and away from the tracked payloads', () => {
    const map = computePresence({
      'p-1': [{ profile_id: 'p-1', state: 'online' }],
      'p-2': [{ profile_id: 'p-2', state: 'away' }],
    })
    expect(map.get('p-1')).toBe('online')
    expect(map.get('p-2')).toBe('away')
  })

  it('⚠️ two tabs, one away one online — online wins', () => {
    const map = computePresence({
      'p-1': [
        { profile_id: 'p-1', state: 'away' },
        { profile_id: 'p-1', state: 'online' },
      ],
    })
    expect(map.get('p-1')).toBe('online')
  })

  it('a legacy payload with no state still counts as online', () => {
    // The 25 Aug feature tracked { profile_id } alone; a tab running the old
    // bundle mid-deploy must not vanish from the map.
    const map = computePresence({ 'p-1': [{ profile_id: 'p-1' }] })
    expect(map.get('p-1')).toBe('online')
  })
})

describe('dotState', () => {
  it('answers offline for anyone not in the map — including nobody', () => {
    const map = computePresence({ 'p-1': [{ profile_id: 'p-1', state: 'online' }] })
    expect(dotState(map, 'p-1')).toBe('online')
    expect(dotState(map, 'p-9')).toBe('offline')
    expect(dotState(map, null)).toBe('offline')
  })
})
