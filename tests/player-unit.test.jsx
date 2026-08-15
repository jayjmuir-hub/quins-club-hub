import { describe, it, expect } from 'vitest'
import { positionGroup } from '../src/lib/rosterUnit.js'

// players.unit — "designate players as forwards or back" (Jay, 14 Aug 2026),
// with the specific positions to follow later.
//
// ⚠️ THE RULE JAY CHOSE, between two options put to him: where the unit and the
// position disagree, THE UNIT WINS and the mismatch is a data error for a human
// to fix. Deriving the unit from the position was rejected because it cannot
// express "forward, position not decided yet" — which is the entire reason the
// column exists.

describe('positionGroup — unit first, position as the fallback', () => {
  it('groups by the unit when it is set, with no position at all', () => {
    // ⚠️ THE CASE THE COLUMN EXISTS FOR. Before it, this player had no named
    // position and therefore fell into "Other" — invisible in the forwards list
    // a coach was reading.
    expect(positionGroup({ unit: 'forward', position: null })).toBe('Forwards')
    expect(positionGroup({ unit: 'back', position: null })).toBe('Backs')
  })

  it('lets the unit OVERRIDE a contradicting position', () => {
    // Not reconciled, not warned about here — the unit simply wins. A human
    // fixes the contradiction.
    expect(positionGroup({ unit: 'back', position: 'Flanker' })).toBe('Backs')
    expect(positionGroup({ unit: 'forward', position: 'Wing' })).toBe('Forwards')
  })

  it('falls back to the position when no unit is set', () => {
    // ⚠️ EVERY EXISTING PLAYER IS THIS CASE. The column landed null on every
    // row, so the fallback is not an edge case — it is the whole club until
    // coaches start filling it in, and the roster must group exactly as it did.
    expect(positionGroup({ unit: null, position: 'Prop' })).toBe('Forwards')
    expect(positionGroup({ unit: null, position: 'Fullback' })).toBe('Backs')
  })

  it('is Other only when neither says anything', () => {
    expect(positionGroup({ unit: null, position: null })).toBe('Other')
    expect(positionGroup({ unit: null, position: 'Utility' })).toBe('Other')
  })

  it('does not fall over on a missing player', () => {
    expect(positionGroup(undefined)).toBe('Other')
  })
})
