// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Thin wrappers around add_junior_playup / remove_junior_playup and the
// guest-squad membership list. The database is the gate; this file pins
// the RPC names, the refusal mapping, and that listPlayers still marks
// guest_of from those twin rows.
//
// ⚠️ EVERY NAME BELOW IS INVENTED — "Harness …" — this file mocks
// ../src/lib/supabase entirely.

const rpcMock = vi.fn()
let membershipsRows = []

function fakeTable(rows) {
  let filtered = [...rows]
  const builder = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn((col, val) => {
    filtered = filtered.filter((row) => row[col] === val)
    return builder
  })
  builder.neq = vi.fn((col, val) => {
    filtered = filtered.filter((row) => row[col] !== val)
    return builder
  })
  builder.then = (resolve, reject) => Promise.resolve({ data: filtered, error: null }).then(resolve, reject)
  return builder
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (table) => {
      if (table === 'memberships') return fakeTable(membershipsRows)
      throw new Error(`playups.test.js: unexpected supabase.from('${table}')`)
    },
  },
}))

import { addJuniorPlayup, removeJuniorPlayup, listPlayerGuestTeamIds } from '../src/data/playups.js'

beforeEach(() => {
  rpcMock.mockReset()
  membershipsRows = []
})

describe('addJuniorPlayup / removeJuniorPlayup', () => {
  it('calls add_junior_playup with the player and guest team', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await addJuniorPlayup('p-u14', 't-u16')
    expect(rpcMock).toHaveBeenCalledWith('add_junior_playup', {
      _player: 'p-u14',
      _guest_team: 't-u16',
    })
  })

  it('calls remove_junior_playup with the player and guest team', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await removeJuniorPlayup('p-u14', 't-u16')
    expect(rpcMock).toHaveBeenCalledWith('remove_junior_playup', {
      _player: 'p-u14',
      _guest_team: 't-u16',
    })
  })

  it('surfaces a super-admin refusal as the database sentence', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Only a super admin can add a junior to another age group.' },
    })
    await expect(addJuniorPlayup('p-u14', 't-u16')).rejects.toThrow(
      'Only a super admin can add a junior to another age group.',
    )
  })

  it('surfaces a senior guest-team refusal as the database sentence', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'The play-up squad must be a junior age group.' },
    })
    await expect(addJuniorPlayup('p-u14', 't-men1')).rejects.toThrow(
      'The play-up squad must be a junior age group.',
    )
  })

  it('surfaces a home=guest refusal as the database sentence', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '22023', message: "The play-up squad cannot be the player's home age group." },
    })
    await expect(addJuniorPlayup('p-u14', 't-u14')).rejects.toThrow(
      "The play-up squad cannot be the player's home age group.",
    )
  })
})

describe('listPlayerGuestTeamIds', () => {
  it('returns distinct active guest team ids, not home', async () => {
    membershipsRows = [
      { player_id: 'p-u14', team_id: 't-u14', status: 'active' },
      { player_id: 'p-u14', team_id: 't-u16', status: 'active' },
      { player_id: 'p-u14', team_id: 't-u16', status: 'active' },
      { player_id: 'p-u14', team_id: 't-u18', status: 'left' },
      { player_id: 'p-other', team_id: 't-u16', status: 'active' },
    ]
    await expect(listPlayerGuestTeamIds('p-u14', 't-u14')).resolves.toEqual(['t-u16'])
  })
})
