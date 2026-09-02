import { describe, it, expect } from 'vitest'
import { isLeaver, leaverName, isLeftOnly, LEFT_TAG } from '../src/lib/leavers.js'

describe('leavers helpers', () => {
  it('isLeaver is true only for a non-null left_at', () => {
    expect(isLeaver({ left_at: '2026-09-02T08:00:00Z' })).toBe(true)
    expect(isLeaver({ left_at: null })).toBe(false)
    expect(isLeaver({})).toBe(false)
    expect(isLeaver(null)).toBe(false)
  })

  it('leaverName tags a leaver and leaves a current player alone', () => {
    expect(leaverName({ full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' })).toBe(`Rafiq Delacroix-Obi · ${LEFT_TAG}`)
    expect(leaverName({ full_name: 'Tomasz Delacroix-Obi', left_at: null })).toBe('Tomasz Delacroix-Obi')
  })

  it('isLeftOnly: every row left → true; any active or pending → false; none → false', () => {
    expect(isLeftOnly([{ status: 'left' }, { status: 'left' }])).toBe(true)
    expect(isLeftOnly([{ status: 'left' }, { status: 'pending' }])).toBe(false)
    expect(isLeftOnly([{ status: 'left' }, { status: 'active' }])).toBe(false)
    expect(isLeftOnly([])).toBe(false)
    expect(isLeftOnly(null)).toBe(false)
  })
})
