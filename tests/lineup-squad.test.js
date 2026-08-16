import { describe, it, expect } from 'vitest'
import { namesFromLineup } from '../src/lib/lineupSquad.js'

// The one-way bridge from a coach's LINEUP to the RCM sheet's list of 22.
// src/lib/lineupSquad.js carries the reasoning; this pins the rules that are
// easy to "tidy" back into the wrong thing.

const PLAYERS = [
  { id: 'p1', full_name: 'Zara Ali' },
  { id: 'p2', full_name: 'Tom Fletcher' },
  { id: 'p3', full_name: 'Idris Bakhtiari' },
  { id: 'p4', full_name: 'Rory Ellingham' },
]

const row = (player_id, role, sort_order) => ({ player_id, role, sort_order })

describe('namesFromLineup', () => {
  it('puts starters before replacements, each in the coach’s order', () => {
    const lineup = {
      lineup_players: [
        row('p3', 'replacement', 0),
        row('p2', 'starter', 1),
        row('p1', 'starter', 0),
        row('p4', 'replacement', 1),
      ],
    }
    expect(namesFromLineup(lineup, PLAYERS).map((p) => p.full_name)).toEqual([
      'Zara Ali',
      'Tom Fletcher',
      'Idris Bakhtiari',
      'Rory Ellingham',
    ])
  })

  it('⚠️ does not reorder the array it was handed', () => {
    // It lives in the screen's state; sorting in place would reorder the
    // caller's data as a side effect of reading it.
    const players = [row('p3', 'replacement', 0), row('p1', 'starter', 0)]
    const lineup = { lineup_players: players }
    namesFromLineup(lineup, PLAYERS)
    expect(players[0].player_id).toBe('p3')
  })

  it('⚠️ skips a lineup row whose player has no name, rather than emitting a blank', () => {
    // `lineup_players` holds no name of its own — deliberately, so a rename is
    // reflected rather than frozen. A player who has since moved squads is not
    // in the list handed in, and a blank row on the form reads to the governing
    // body as "we were short".
    const lineup = { lineup_players: [row('p1', 'starter', 0), row('gone', 'starter', 1)] }
    expect(namesFromLineup(lineup, PLAYERS)).toEqual([{ player_id: 'p1', full_name: 'Zara Ali' }])
  })

  it('carries the player_id, so the sheet keeps a real link and not just text', () => {
    const lineup = { lineup_players: [row('p2', 'starter', 0)] }
    expect(namesFromLineup(lineup, PLAYERS)[0]).toEqual({
      player_id: 'p2',
      full_name: 'Tom Fletcher',
    })
  })

  it('treats a missing role as a starter', () => {
    // `role` is 'starter' | 'replacement' in the database, but the sort must not
    // depend on that holding — an unknown value belongs with the starters, which
    // is where a player nobody marked as a replacement actually was.
    const lineup = { lineup_players: [row('p2', undefined, 0), row('p1', 'replacement', 0)] }
    expect(namesFromLineup(lineup, PLAYERS).map((p) => p.player_id)).toEqual(['p2', 'p1'])
  })

  it('is empty for no lineup, an empty lineup, or no squad to name them from', () => {
    expect(namesFromLineup(null, PLAYERS)).toEqual([])
    expect(namesFromLineup(undefined, PLAYERS)).toEqual([])
    expect(namesFromLineup({}, PLAYERS)).toEqual([])
    expect(namesFromLineup({ lineup_players: [row('p1', 'starter', 0)] }, [])).toEqual([])
  })
})
