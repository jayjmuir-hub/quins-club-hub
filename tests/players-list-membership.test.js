// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// listPlayers({teamIds}) reading "home OR active membership" (Task 3,
// claude/plans/2026-09-02-senior-squads-2a-implementation.md). Modeled on
// tests/teams-default-format.test.js, extended with a `from(table)` router
// so `players` and `memberships` return different fixtures — and, unlike
// that file's single canned result, this mock does REAL filtering
// (in/eq/is narrow an in-memory row set) so the CONTROL below is a genuine
// proof that the source code's `.eq('status','active')` is load-bearing,
// not just a fixture that happens not to include a left row.
//
// ⚠️ EVERY NAME BELOW IS INVENTED — "Harness …" — checked against nothing
// live since these ids never touch the database; this file mocks
// ../src/data/../lib/supabase entirely. This repo is public and its members
// are mostly children (CLAUDE.md rule 9).

let playersRows = []
let membershipsRows = []

function fakeTable(rows) {
  let filtered = [...rows]
  const builder = {}
  builder.select = vi.fn(() => builder)
  builder.in = vi.fn((col, vals) => {
    filtered = filtered.filter((row) => vals.includes(row[col]))
    return builder
  })
  builder.eq = vi.fn((col, val) => {
    filtered = filtered.filter((row) => row[col] === val)
    return builder
  })
  builder.is = vi.fn((col, val) => {
    filtered = filtered.filter((row) => row[col] === val)
    return builder
  })
  builder.order = vi.fn(() => builder)
  builder.limit = vi.fn(() => builder)
  builder.range = vi.fn(() => builder)
  builder.then = (resolve, reject) => Promise.resolve({ data: filtered, error: null }).then(resolve, reject)
  return builder
}

const fromMock = vi.fn((table) => {
  if (table === 'players') return fakeTable(playersRows)
  if (table === 'memberships') return fakeTable(membershipsRows)
  throw new Error(`players-list-membership.test.js: unexpected supabase.from('${table}')`)
})

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table) => fromMock(table),
  },
}))

import { listPlayers, listPlayerSquads } from '../src/data/players.js'

beforeEach(() => {
  fromMock.mockClear()
  playersRows = []
  membershipsRows = []
})

describe('listPlayers({ teamIds }) — home or active membership', () => {
  it('marks a home player guest_of: null and a guest player guest_of: <requested team>', async () => {
    playersRows = [
      { id: 'home-1', full_name: 'Harness Home Alderton', team_id: 'B', left_at: null },
      // Home squad A, holds an ACTIVE membership in B — a guest of B.
      { id: 'guest-1', full_name: 'Harness Guest Brackwood', team_id: 'A', left_at: null },
      // Home squad A, holds only a 'left' membership in B — the CONTROL.
      { id: 'guest-2', full_name: 'Harness Guest Cravenmoor', team_id: 'A', left_at: null },
    ]
    membershipsRows = [
      { player_id: 'guest-1', team_id: 'B', status: 'active' },
      { player_id: 'guest-2', team_id: 'B', status: 'left' },
    ]

    const result = await listPlayers({ teamIds: ['B'] })

    expect(result.map((row) => row.id)).toEqual(['guest-1', 'home-1'])
    expect(result.find((row) => row.id === 'home-1').guest_of).toBeNull()
    expect(result.find((row) => row.id === 'guest-1').guest_of).toBe('B')
    // CONTROL: a player whose only membership in B is 'left' is absent —
    // this is the assertion the fault injection below (dropping
    // .eq('status','active')) is proven to break.
    expect(result.find((row) => row.id === 'guest-2')).toBeUndefined()
  })

  it('names the FIRST requested team a player is a guest of, in teamIds order', async () => {
    playersRows = [{ id: 'guest-3', full_name: 'Harness Guest Dunwoody', team_id: 'A', left_at: null }]
    membershipsRows = [
      { player_id: 'guest-3', team_id: 'C', status: 'active' },
      { player_id: 'guest-3', team_id: 'B', status: 'active' },
    ]

    const result = await listPlayers({ teamIds: ['B', 'C'] })

    expect(result.find((row) => row.id === 'guest-3').guest_of).toBe('B')
  })

  it('hides a guest who has left, same left_at rule as the home fetch', async () => {
    playersRows = [{ id: 'guest-4', full_name: 'Harness Guest Elmswood', team_id: 'A', left_at: '2026-01-01' }]
    membershipsRows = [{ player_id: 'guest-4', team_id: 'B', status: 'active' }]

    const result = await listPlayers({ teamIds: ['B'] })

    expect(result).toEqual([])
  })

  it('runs no membership query and adds no guest_of when teamIds is undefined', async () => {
    playersRows = [{ id: 'p-1', full_name: 'Harness Player Foxglen', team_id: 'A', left_at: null }]

    const result = await listPlayers()

    expect(result).toEqual([{ id: 'p-1', full_name: 'Harness Player Foxglen', team_id: 'A', left_at: null }])
    expect(fromMock).not.toHaveBeenCalledWith('memberships')
  })

  it('returns [] without querying when teamIds is an empty array', async () => {
    const result = await listPlayers({ teamIds: [] })

    expect(result).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('listPlayerSquads', () => {
  it('returns active membership team ids per player, excluding the home team', async () => {
    playersRows = [
      { id: 'p-1', team_id: 'A' },
      { id: 'p-2', team_id: 'A' },
    ]
    membershipsRows = [
      // p-1's own home squad, redundant — must not appear in the result.
      { player_id: 'p-1', team_id: 'A', status: 'active' },
      { player_id: 'p-1', team_id: 'B', status: 'active' },
      { player_id: 'p-2', team_id: 'C', status: 'left' },
    ]

    const result = await listPlayerSquads(['p-1', 'p-2'])

    expect(result.get('p-1')).toEqual(['B'])
    expect(result.has('p-2')).toBe(false)
  })

  it('returns an empty Map without querying when given no ids', async () => {
    const result = await listPlayerSquads([])

    expect(result).toEqual(new Map())
    expect(fromMock).not.toHaveBeenCalled()
  })
})
