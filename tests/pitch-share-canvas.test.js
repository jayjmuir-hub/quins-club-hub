import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// src/lib/pitchShareCanvas.js — the NATIVE-canvas renderer for the shared
// pitch-layout picture. It replaced html2canvas, which mangled the small squad
// codes into dashes. jsdom has no 2D backend, so we install a recording context
// and assert the right glyphs actually reach the canvas as drawn text — the
// thing the old exporter got wrong. Squad codes and, for a club-wide booking, a
// free-text title (invented data — the repo is public) must both survive.

import { drawPitchDayCanvas, drawPitchWeekCanvas } from '../src/lib/pitchShareCanvas.js'
import { shortSquad, clip, segLabel } from '../src/lib/pitchShareStyle.js'

let drawnText

function recordingContext() {
  const noop = () => {}
  return {
    font: '400 12px sans',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    scale: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: (text) => drawnText.push(String(text)),
    measureText(text) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 12)
      return { width: String(text).length * px * 0.55 }
    },
  }
}

beforeEach(() => {
  drawnText = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext())
})

afterEach(() => vi.restoreAllMocks())

const seg = (squad, { clubWide = false, portionShort = '½', fraction = 0.5 } = {}) => ({
  key: `k-${squad}`,
  squad,
  clubWide,
  portionShort,
  portionLabel: 'Half pitch',
  fraction,
})

const bar = (pitch, segments, extra = {}) => ({
  pitch,
  segments,
  spareFraction: 0,
  over: false,
  statusText: 'Full — nothing spare',
  spoken: `${pitch} spoken`,
  ...extra,
})

describe('drawPitchDayCanvas', () => {
  it('draws the time, pitch names, squad codes and the footer as real text', () => {
    const canvas = drawPitchDayCanvas({
      title: 'Tuesday, 1 September',
      slots: [
        {
          timeMs: 1,
          timeLabel: '6:00 PM',
          pitches: [bar('D1', [seg('U12G QR', { fraction: 0.5 }), seg('U14B', { fraction: 0.5 })])],
        },
      ],
    })
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    expect(drawnText).toContain('6:00 PM')
    expect(drawnText).toContain('D1')
    expect(drawnText).toContain('Tuesday, 1 September')
    // The day card shows the full squad name, not the first-word short form.
    expect(drawnText).toContain('U12G QR')
    expect(drawnText).toContain('U14B')
    expect(drawnText.some((t) => t.includes('generated from Club Hub'))).toBe(true)
  })

  it('draws a club-wide booking by its title, not a squad code', () => {
    drawPitchDayCanvas({
      title: 'Friday, 4 September',
      slots: [
        {
          timeMs: 1,
          timeLabel: '7:30 PM',
          pitches: [bar('D3', [seg('Adult Social Evening', { clubWide: true, fraction: 1 })], {
            statusText: 'Full — nothing spare',
          })],
        },
      ],
    })
    expect(drawnText).toContain('Adult Social Evening')
  })
})

describe('drawPitchWeekCanvas', () => {
  it('draws each weekday, a dash for an empty day, and the short squad code', () => {
    const canvas = drawPitchWeekCanvas({
      title: '1 Sep – 7 Sep',
      days: [
        { weekday: 'MON', dayNum: 1, empty: true, slots: [] },
        {
          weekday: 'TUE',
          dayNum: 2,
          empty: false,
          slots: [
            { timeMs: 1, timeLabel: '6:00 PM', pitches: [bar('D1', [seg('U12G QR', { fraction: 1 })])] },
          ],
        },
        { weekday: 'WED', dayNum: 3, empty: true, slots: [] },
        { weekday: 'THU', dayNum: 4, empty: true, slots: [] },
        { weekday: 'FRI', dayNum: 5, empty: true, slots: [] },
        { weekday: 'SAT', dayNum: 6, empty: true, slots: [] },
        { weekday: 'SUN', dayNum: 7, empty: true, slots: [] },
      ],
    })
    expect(canvas.width).toBeGreaterThan(0)
    expect(drawnText).toContain('MON')
    expect(drawnText).toContain('TUE')
    expect(drawnText).toContain('—')
    // The tight week columns clip a squad to its leading token.
    expect(drawnText).toContain('U12G')
    expect(drawnText).not.toContain('U12G QR')
  })
})

describe('shared label rules', () => {
  it('shortSquad keeps the leading token', () => {
    expect(shortSquad('U12G QR')).toBe('U12G')
    expect(shortSquad('U6')).toBe('U6')
  })

  it('clip caps a long title with an ellipsis', () => {
    expect(clip('Adult Social Evening', 16)).toBe('Adult Social Ev…')
    expect(clip('Short', 16)).toBe('Short')
  })

  it('segLabel abbreviates a squad on the week bar but never a club-wide title', () => {
    expect(segLabel({ squad: 'U12G QR', clubWide: false }, true)).toBe('U12G')
    expect(segLabel({ squad: 'U12G QR', clubWide: false }, false)).toBe('U12G QR')
    expect(segLabel({ squad: 'Adult Tag', clubWide: true }, true)).toBe('Adult Tag')
  })
})
