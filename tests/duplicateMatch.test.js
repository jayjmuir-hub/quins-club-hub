import { describe, expect, it } from 'vitest'
import { findPossibleDuplicates } from '../src/lib/duplicateMatch.js'

// ⚠️ EVERY NAME HERE IS INVENTED. The spellings reproduce the shape of the real
// 31 Aug 2026 case — one first name, two transliterations, one letter apart —
// and the people do not exist. CLAUDE.md rule 9: this repo is public and its
// members are mostly children.
const U16 = 'team-u16'
const U12 = 'team-u12'

const roster = [
  { id: 'p1', team_id: U16, full_name: 'Hamza Tarek Nabil Alkhatib' },
  { id: 'p2', team_id: U16, full_name: 'Rowan Fairbairn' },
  { id: 'p3', team_id: U16, full_name: 'Reuben Fairbairn' },
  { id: 'p4', team_id: U12, full_name: 'Tom Smith' },
]

describe('findPossibleDuplicates', () => {
  it('flags a transliteration one letter apart — the case that got through', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Hamsa Alkhatib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
    expect(found[0].reason).toBe('similar-name')
  })

  // ⚠️ THE FIXTURE THE WHOLE RULE TURNS ON. These two are twins on the live
  // roster: same surname, same birthday, and a matcher that keyed on the
  // birthday would nag about them forever. They must stay silent.
  it('does not flag twins who share a surname', () => {
    const found = findPossibleDuplicates({
      player: { id: 'p2', team_id: U16, full_name: 'Rowan Fairbairn' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('does not flag the same name in a different squad', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Tom Smith' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('flags an identical name in the same squad', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'hamza  ALKHATIB' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
    expect(found[0].reason).toBe('same-name')
  })

  it('flags a shortened first name', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Ham Alkhatib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
  })

  it('ignores accents rather than mangling them', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Hámza Alkhâtib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
  })

  it('never matches a row against itself', () => {
    const found = findPossibleDuplicates({
      player: { id: 'p1', team_id: U16, full_name: 'Hamza Tarek Nabil Alkhatib' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('returns nothing, and does not throw, for a nameless or punctuation-only row', () => {
    for (const full_name of [null, '', '   ', '—', '.']) {
      expect(
        findPossibleDuplicates({ player: { id: 'new', team_id: U16, full_name }, roster }),
      ).toEqual([])
    }
  })

  it('survives a roster row with no name', () => {
    expect(
      findPossibleDuplicates({
        player: { id: 'new', team_id: U16, full_name: 'Hamza Alkhatib' },
        roster: [{ id: 'x', team_id: U16, full_name: null }],
      }),
    ).toEqual([])
  })

  it('takes an absent roster as an empty one', () => {
    expect(findPossibleDuplicates({ player: { id: 'n', team_id: U16, full_name: 'A B' } })).toEqual(
      [],
    )
  })
})
