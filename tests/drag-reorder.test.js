import { describe, it, expect } from 'vitest'
import { targetIndex } from '../src/lib/useDragReorder.js'
import { ROSTER_FORMATS, rosterFormat, slotLabel } from '../src/lib/rosterFormats.js'

// The drag maths, tested where jsdom can actually see it. The pointer wiring
// in useDragReorder is deliberately thin (measure, call targetIndex, commit
// once on release); the INDEX decision is the part a regression would corrupt
// silently, and it is pure — see tests/lineup-views.test.jsx's header for why
// a synthetic pointer sequence in jsdom would prove nothing.

describe('targetIndex', () => {
  const midpoints = [50, 150, 250] // three remaining rows, centres 100px apart

  it('lands above the first row when the pointer is above every midpoint', () => {
    expect(targetIndex(midpoints, 10)).toBe(0)
  })

  it('steps down one place per midpoint crossed', () => {
    expect(targetIndex(midpoints, 51)).toBe(1)
    expect(targetIndex(midpoints, 151)).toBe(2)
  })

  it('lands after the last row when the pointer is below everything', () => {
    expect(targetIndex(midpoints, 900)).toBe(3)
  })

  it('sits exactly on a midpoint without crossing it', () => {
    expect(targetIndex(midpoints, 150)).toBe(1)
  })

  it('handles an empty list — a one-row drag has nowhere to go', () => {
    expect(targetIndex([], 123)).toBe(0)
  })
})

describe('roster format presets', () => {
  it('every format has as many pitch spots as players, and names to match', () => {
    for (const format of Object.values(ROSTER_FORMATS)) {
      expect(format.pitch).toHaveLength(format.perSide)
      if (format.positions != null) {
        expect(format.positions).toHaveLength(format.perSide)
      }
    }
  })

  it('every pitch coordinate is inside the drawing', () => {
    for (const format of Object.values(ROSTER_FORMATS)) {
      for (const point of format.pitch) {
        expect(point.x).toBeGreaterThan(0)
        expect(point.x).toBeLessThan(100)
        expect(point.y).toBeGreaterThan(0)
        expect(point.y).toBeLessThan(100)
      }
    }
  })

  it('returns null rather than inventing a format', () => {
    expect(rosterFormat(null)).toBeNull()
    expect(rosterFormat(8)).toBeNull()
  })

  it('labels a slot with its shirt, and a position only when the format has one', () => {
    expect(slotLabel(rosterFormat(15), 9)).toEqual({ shirt: '10', position: 'Fly-half' })
    expect(slotLabel(rosterFormat(5), 0)).toEqual({ shirt: '1', position: null })
    expect(slotLabel(null, 0)).toEqual({ shirt: '1', position: null })
  })
})
