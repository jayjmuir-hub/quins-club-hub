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
let guestFlags = []

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
  throw new Error(`players-list-membership.test.js: unexpected supabase.from('${table}')`)
})

const rpcMock = vi.fn(async (name) => {
  if (name === 'squad_guest_flags') return { data: guestFlags, error: null }
  throw new Error(`players-list-membership.test.js: unexpected rpc('${name}')`)
})

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table) => fromMock(table),
    rpc: (...args) => rpcMock(...args),
  },
}))

import { listPlayers } from '../src/data/players.js'

beforeEach(() => {
  fromMock.mockClear()
  rpcMock.mockClear()
  playersRows = []
  guestFlags = []
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
    // squad_guest_flags returns only ACTIVE guests. guest-2 (left) is the
    // CONTROL: absent from the RPC result, so they must not appear.
    guestFlags = [{ player_id: 'guest-1', team_id: 'B', playup_consent: null }]

    const result = await listPlayers({ teamIds: ['B'] })

    expect(result.map((row) => row.id)).toEqual(['guest-1', 'home-1'])
    expect(result.find((row) => row.id === 'home-1').guest_of).toBeNull()
    expect(result.find((row) => row.id === 'guest-1').guest_of).toBe('B')
    expect(result.find((row) => row.id === 'guest-2')).toBeUndefined()
    expect(rpcMock).toHaveBeenCalledWith('squad_guest_flags', { _teams: ['B'] })
  })

  it('names the FIRST requested team a player is a guest of, in teamIds order', async () => {
    playersRows = [{ id: 'guest-3', full_name: 'Harness Guest Dunwoody', team_id: 'A', left_at: null }]
    guestFlags = [
      { player_id: 'guest-3', team_id: 'C', playup_consent: null },
      { player_id: 'guest-3', team_id: 'B', playup_consent: null },
    ]

    const result = await listPlayers({ teamIds: ['B', 'C'] })

    expect(result.find((row) => row.id === 'guest-3').guest_of).toBe('B')
  })

  it('hides a guest who has left, same left_at rule as the home fetch', async () => {
    playersRows = [{ id: 'guest-4', full_name: 'Harness Guest Elmswood', team_id: 'A', left_at: '2026-01-01' }]
    guestFlags = [{ player_id: 'guest-4', team_id: 'B', playup_consent: null }]

    const result = await listPlayers({ teamIds: ['B'] })

    expect(result).toEqual([])
  })

  it('runs no membership query and adds no guest_of when teamIds is undefined', async () => {
    playersRows = [{ id: 'p-1', full_name: 'Harness Player Foxglen', team_id: 'A', left_at: null }]

    const result = await listPlayers()

    expect(result).toEqual([{ id: 'p-1', full_name: 'Harness Player Foxglen', team_id: 'A', left_at: null }])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns [] without querying when teamIds is an empty array', async () => {
    const result = await listPlayers({ teamIds: [] })

    expect(result).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('a junior home player with an active guest membership on another junior squad is guest_of that squad', async () => {
    playersRows = [
      { id: 'p-home', full_name: 'Harness Home Alderton', team_id: 't-u16', left_at: null },
      { id: 'p-playup', full_name: 'Harness Playup Brackwood', team_id: 't-u14', left_at: null },
    ]
    guestFlags = [{ player_id: 'p-playup', team_id: 't-u16', playup_consent: 'approved' }]

    const result = await listPlayers({ teamIds: ['t-u16'] })

    expect(result.find((row) => row.id === 'p-playup').guest_of).toBe('t-u16')
    expect(result.find((row) => row.id === 'p-home').guest_of).toBeNull()
  })

  it('stamps playup_consent from squad_guest_flags onto the guest row', async () => {
    playersRows = [
      { id: 'p-home', full_name: 'Harness Home Alderton', team_id: 't-u16', left_at: null },
      { id: 'p-playup', full_name: 'Harness Playup Brackwood', team_id: 't-u14', left_at: null },
    ]
    guestFlags = [{ player_id: 'p-playup', team_id: 't-u16', playup_consent: 'pending' }]

    const result = await listPlayers({ teamIds: ['t-u16'] })

    expect(result.find((row) => row.id === 'p-playup').guest_of).toBe('t-u16')
    expect(result.find((row) => row.id === 'p-playup').playup_consent).toBe('pending')
    expect(result.find((row) => row.id === 'p-home').playup_consent).toBeNull()
  })
})

// ⚠️ listPlayerSquads' TESTS WERE HERE — deleted 2 Sep 2026, whole-branch
// review finding 6, alongside the export itself (src/data/players.js) and
// its harness stub, all for the same reason: zero production callers. The
// guest mark this function was built to feed ships from `listPlayers`'s own
// `guest_of` field instead (tested above).
