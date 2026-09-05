// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Junior play-up parent consent (slice 1). The database is the gate; this
// file pins the helper, the RPC names, and that listPlayers stamps
// playup_consent onto a guest row from squad_guest_flags.
//
// ⚠️ EVERY NAME BELOW IS INVENTED. CLAUDE.md rule 9.

import { isPlayupConsentPending, playupBlocksLineup } from '../src/lib/playupConsent.js'

describe('playup consent helper', () => {
  it('a guest with pending consent is blocked from a lineup', () => {
    const guest = { id: 'p-guest', guest_of: 't-u16', playup_consent: 'pending' }
    expect(isPlayupConsentPending(guest)).toBe(true)
    expect(playupBlocksLineup(guest)).toBe(true)
  })

  it('an approved guest is not blocked', () => {
    const guest = { id: 'p-guest', guest_of: 't-u16', playup_consent: 'approved' }
    expect(isPlayupConsentPending(guest)).toBe(false)
    expect(playupBlocksLineup(guest)).toBe(false)
  })

  it('CONTROL: a home player is never blocked, even with a stray pending flag', () => {
    const home = { id: 'p-home', guest_of: null, playup_consent: 'pending' }
    expect(isPlayupConsentPending(home)).toBe(false)
    expect(playupBlocksLineup(home)).toBe(false)
  })
})

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
      throw new Error(`playup-consent.test.js: unexpected supabase.from('${table}')`)
    },
  },
}))

import {
  answerJuniorPlayup,
  listMyPendingPlayups,
} from '../src/data/playups.js'

beforeEach(() => {
  rpcMock.mockReset()
  membershipsRows = []
})

describe('answerJuniorPlayup', () => {
  it('calls answer_junior_playup with the player, guest team and yes', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await answerJuniorPlayup('p-u14', 't-u16', true)
    expect(rpcMock).toHaveBeenCalledWith('answer_junior_playup', {
      _player: 'p-u14',
      _guest_team: 't-u16',
      _yes: true,
    })
  })

  it('surfaces a non-parent refusal as the database sentence', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Only a linked parent of that player can answer.' },
    })
    await expect(answerJuniorPlayup('p-u14', 't-u16', false)).rejects.toThrow(
      'Only a linked parent of that player can answer.',
    )
  })
})

describe('listMyPendingPlayups', () => {
  it('returns this profile’s pending guest rows, not approved ones', async () => {
    membershipsRows = [
      {
        player_id: 'p-u14',
        team_id: 't-u16',
        playup_consent: 'pending',
        status: 'active',
        players: { full_name: 'Harness Playup Alderton' },
        teams: { name: 'U16B Contact' },
      },
      {
        player_id: 'p-other',
        team_id: 't-u18',
        playup_consent: 'approved',
        status: 'active',
        players: { full_name: 'Harness Other Brackwood' },
        teams: { name: 'U18B Contact' },
      },
    ]
    await expect(listMyPendingPlayups()).resolves.toEqual([
      {
        player_id: 'p-u14',
        team_id: 't-u16',
        playup_consent: 'pending',
        status: 'active',
        players: { full_name: 'Harness Playup Alderton' },
        teams: { name: 'U16B Contact' },
      },
    ])
  })
})
