// tests/fixture-format.test.js
// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FORMAT,
  FORMATS,
  formatLabel,
  formatOf,
  isFormat,
  replacements,
  sheetSlots,
  squadMax,
} from '../src/lib/fixtureFormat.js'

// Format on the fixture (claude/plans/2026-09-02-fixture-format.md). The
// numbers are the RCM/UAERF 2025-26 law variations' squad maxima: 7s 12,
// 10s 15, 12s 18, 15s 22. This file is the ONLY home for them.

describe('fixtureFormat', () => {
  it('knows exactly the four formats the club plays', () => {
    expect(FORMATS).toEqual([7, 10, 12, 15])
    expect(DEFAULT_FORMAT).toBe(15)
    expect(isFormat(10)).toBe(true)
    // CONTROL: a plausible wrong number is refused, so the positive above is
    // not "everything passes".
    expect(isFormat(9)).toBe(false)
    expect(isFormat('15')).toBe(false)
    expect(isFormat(null)).toBe(false)
  })

  it('maps every format to its sheet slots, replacements and squad max', () => {
    expect([7, 10, 12, 15].map(sheetSlots)).toEqual([12, 15, 18, 22])
    expect([7, 10, 12, 15].map(replacements)).toEqual([5, 5, 6, 7])
    expect([7, 10, 12, 15].map(squadMax)).toEqual([12, 15, 18, 22])
    // Sheet slots equal squad max by definition — if these ever diverge the
    // sheet is lying about how many players may be named.
    for (const f of [7, 10, 12, 15]) expect(sheetSlots(f)).toBe(squadMax(f))
  })

  it('reads a missing or null format as 15, and a stated one as itself', () => {
    expect(formatOf({})).toBe(15)
    expect(formatOf({ format: null })).toBe(15)
    expect(formatOf(null)).toBe(15)
    // CONTROL: a stated 7 does NOT read as 15 — the fallback is for absence
    // only.
    expect(formatOf({ format: 7 })).toBe(7)
    // A value the database could never hold still degrades to 15 rather than
    // to a sheet with an impossible size.
    expect(formatOf({ format: 9 })).toBe(15)
  })

  it('labels formats the way the club says them', () => {
    expect([7, 10, 12, 15].map(formatLabel)).toEqual(['7s', '10s', '12s', '15s'])
  })
})
