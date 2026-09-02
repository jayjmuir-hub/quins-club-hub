// tests/jersey.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isJerseyNumber, jerseyClashMessage, parseJerseyInput, sortByJersey } from '../src/lib/jersey.js'

describe('jersey', () => {
  it('accepts 1–99 integers only', () => {
    expect([1, 9, 99].every(isJerseyNumber)).toBe(true)
    // CONTROL: the edges and the wrong types are refused.
    expect([0, 100, 9.5, '9', null, undefined].some(isJerseyNumber)).toBe(false)
  })

  it('parses the inline editor: blank clears, digits parse, junk refuses', () => {
    expect(parseJerseyInput('')).toBeNull()
    expect(parseJerseyInput(' 12 ')).toBe(12)
    expect(parseJerseyInput('0')).toBeUndefined()
    expect(parseJerseyInput('abc')).toBeUndefined()
  })

  it('names the holder in the clash message', () => {
    expect(jerseyClashMessage(9, 'Harness Prop Aldenbrook')).toBe(
      'Number 9 is already worn by Harness Prop Aldenbrook in this squad. Clear theirs first, or pick another.',
    )
  })

  it('sorts numbered players first, ascending, then the rest by name', () => {
    const rows = [
      { full_name: 'Zed', jersey_num: null },
      { full_name: 'Amy', jersey_num: null },
      { full_name: 'Bob', jersey_num: 10 },
      { full_name: 'Cal', jersey_num: 2 },
    ]
    expect([...rows].sort(sortByJersey).map((r) => r.full_name)).toEqual(['Cal', 'Bob', 'Amy', 'Zed'])
  })
})
