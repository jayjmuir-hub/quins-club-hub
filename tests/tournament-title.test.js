import { describe, it, expect } from 'vitest'
import { eventTitle } from '../src/lib/eventFormat.js'

// Jay, 14 Aug 2026, from the LIVE schedule: a tournament entered for U16B read
// "Quins vs Al Ain Tournament".
//
// ⚠️ THE CAUSE WAS THE REQUIRED OPPONENT FIELD, NOT THE TITLE FUNCTION. A match
// could not be saved without an opponent and a tournament has none, so the only
// way to enter one was to type the tournament's name into the opponent box —
// after which "Quins vs <opponent>" was doing exactly what it was told. The form
// no longer demands an opponent for a tournament; these pin the rendering half,
// including for the rows already carrying the workaround.

const TOURNAMENT = {
  type: 'match',
  opponent: 'Al Ain Tournament', // the workaround, as stored on real rows
  competition: 'Al Ain Tournament',
  competition_type: 'tournament',
}

describe('eventTitle — tournaments are named, not opposed', () => {
  it('renders the tournament name for a tournament fixture', () => {
    expect(eventTitle(TOURNAMENT)).toBe('Al Ain Tournament')
  })

  it('IGNORES the opponent column on a tournament, so rows already entered read correctly', () => {
    // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. Three real fixtures hold the
    // tournament's name in BOTH columns. Checking the opponent first would keep
    // rendering "Quins vs Al Ain Tournament" for every one of them, and the bug
    // would look fixed only for fixtures entered after the change.
    expect(eventTitle(TOURNAMENT)).not.toMatch(/Quins vs/)
  })

  it('still names the tournament when a specific opponent IS known', () => {
    // A fixture within a tournament may later get an opponent. Jay's ruling is
    // that the tournament is what goes on the schedule, so the name still wins.
    expect(eventTitle({ ...TOURNAMENT, opponent: 'Dubai Exiles' })).toBe('Al Ain Tournament')
  })

  it('leaves an ordinary fixture alone', () => {
    expect(eventTitle({ type: 'match', opponent: 'Dubai Exiles' })).toBe('Quins vs Dubai Exiles')
  })

  it('leaves a LEAGUE fixture alone — only tournaments are named', () => {
    expect(
      eventTitle({
        type: 'match',
        opponent: 'Dubai Exiles',
        competition_type: 'league',
        competition: null,
      }),
    ).toBe('Quins vs Dubai Exiles')
  })

  it('does NOT treat an undecided competition as a tournament', () => {
    // ⚠️ 'tbd' means the competition is not known. Rendering it as a tournament
    // would be the mis-filing the TBD option exists to prevent — and it has no
    // name to render anyway.
    expect(
      eventTitle({ type: 'match', opponent: 'Dubai Exiles', competition_type: 'tbd', competition: null }),
    ).toBe('Quins vs Dubai Exiles')
  })

  it('falls back rather than rendering a blank when a tournament has no name', () => {
    expect(eventTitle({ type: 'match', competition_type: 'tournament', competition: null })).toBe(
      'Quins match',
    )
  })
})
