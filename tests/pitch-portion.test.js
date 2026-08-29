import { describe, it, expect } from 'vitest'
import {
  PITCH_PORTIONS,
  portionFraction,
  portionLabel,
  defaultPitchPortion,
  QUARTER_PITCH_MAX_AGE,
  MATCH_FULL_MIN_AGE,
} from '../src/lib/pitchPortion.js'

// The portion vocabulary and the age-based default. Pure, so exhaustively
// testable — and the defaults are the club's real rule, worth pinning so a
// later edit cannot quietly move a boundary (the same care minis.js takes).

describe('portionFraction', () => {
  it('maps each portion to its share of a pitch', () => {
    expect(portionFraction('quarter')).toBe(0.25)
    expect(portionFraction('half')).toBe(0.5)
    expect(portionFraction('full')).toBe(1)
  })

  it('⚠️ treats anything unset or unrecognised as a WHOLE pitch', () => {
    // The backward-compatibility hinge: a booking with no portion counts as a
    // full pitch, so clash detection over portion-less data behaves as it did.
    expect(portionFraction(null)).toBe(1)
    expect(portionFraction(undefined)).toBe(1)
    expect(portionFraction('third')).toBe(1)
    expect(portionFraction('')).toBe(1)
  })
})

describe('portionLabel', () => {
  it('gives a human label, or null when unset', () => {
    expect(portionLabel('quarter')).toBe('Quarter')
    expect(portionLabel('full')).toBe('Full pitch')
    expect(portionLabel(null)).toBe(null)
    expect(portionLabel('nonsense')).toBe(null)
  })
})

describe('PITCH_PORTIONS', () => {
  it('lists the three portions small → large with fractions', () => {
    expect(PITCH_PORTIONS.map((p) => p.value)).toEqual(['quarter', 'half', 'full'])
    expect(PITCH_PORTIONS.map((p) => p.fraction)).toEqual([0.25, 0.5, 1])
  })
})

describe('defaultPitchPortion — matches', () => {
  it('U6–U8 get a quarter', () => {
    expect(defaultPitchPortion('U6 Tag')).toBe('quarter')
    expect(defaultPitchPortion('U8 Tag')).toBe('quarter')
  })

  it('U9–U11 get a half', () => {
    expect(defaultPitchPortion('U9')).toBe('half')
    expect(defaultPitchPortion('U11 Mixed Contact')).toBe('half')
  })

  it('⚠️ U12 and older get a full pitch (Jay, 29 Aug 2026)', () => {
    expect(defaultPitchPortion('U12')).toBe('full')
    expect(defaultPitchPortion('U16B')).toBe('full')
    expect(defaultPitchPortion('U18 Colts')).toBe('full')
  })

  it('a senior side or an unreadable name gets a full pitch', () => {
    expect(defaultPitchPortion('Senior Men 1st XV')).toBe('full')
    expect(defaultPitchPortion('')).toBe('full')
    expect(defaultPitchPortion(null)).toBe('full')
  })
})

describe('defaultPitchPortion — training leans smaller', () => {
  it('U6–U8 still a quarter', () => {
    expect(defaultPitchPortion('U8 Tag', { type: 'training' })).toBe('quarter')
  })

  it('every youth band above U8 defaults to a half, U12+ included', () => {
    expect(defaultPitchPortion('U9', { type: 'training' })).toBe('half')
    expect(defaultPitchPortion('U11', { type: 'training' })).toBe('half')
    expect(defaultPitchPortion('U14B', { type: 'training' })).toBe('half')
    expect(defaultPitchPortion('U18 Colts', { type: 'training' })).toBe('half')
  })

  it('seniors train on a full pitch', () => {
    expect(defaultPitchPortion('Womens XV', { type: 'training' })).toBe('full')
  })
})

describe('the named boundaries', () => {
  it('are where the tests assume they are', () => {
    expect(QUARTER_PITCH_MAX_AGE).toBe(8)
    expect(MATCH_FULL_MIN_AGE).toBe(12)
  })
})
