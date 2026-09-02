// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Task 3's remaining writers (Task 3,
// claude/plans/2026-09-02-senior-squads-2a-implementation.md):
// setTeamUsesJerseyNumbers (src/data/teams.js, mirrors setTeamRequiresContact)
// and createTeam (src/data/teams.js, the create_team RPC), plus
// setPlayerJerseyNumber (src/data/players.js) — grouped here because all
// three are single-mock WRITER tests in the shape
// tests/teams-default-format.test.js already uses, unlike
// tests/players-list-membership.test.js's router (which two DIFFERENT
// fixtures across two tables need).
//
// ⚠️ EVERY NAME BELOW IS INVENTED — "Harness …" — this file mocks
// ../src/lib/supabase entirely, so nothing here reaches the database.

const updateMock = vi.fn()
const rpcMock = vi.fn()

// `players` needs a QUEUE, not one canned result: setPlayerJerseyNumber
// makes up to three separate supabase.from('players') calls in one run (the
// update, then — only on a clash — a lookup of the caller's own team_id,
// then a lookup of the holder). Each call gets the next queued result; a
// single remaining item is reused for any further calls, matching the
// no-clash path's single call.
let playersQueue = []
let playersFromCallCount = 0
function nextPlayersResult() {
  playersFromCallCount += 1
  if (playersQueue.length === 0) throw new Error('teams-senior-writers.test.js: players queue exhausted')
  return playersQueue.length > 1 ? playersQueue.shift() : playersQueue[0]
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'teams') {
        return {
          update: (patch) => {
            updateMock(patch)
            return {
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => updateMock.result,
                }),
              }),
            }
          },
        }
      }
      if (table === 'players') {
        const result = nextPlayersResult()
        const builder = {}
        builder.update = () => builder
        builder.select = () => builder
        builder.eq = () => builder
        builder.maybeSingle = async () => result
        return builder
      }
      throw new Error(`teams-senior-writers.test.js: unexpected supabase.from('${table}')`)
    },
    rpc: (...args) => rpcMock(...args),
  },
}))

import { setTeamUsesJerseyNumbers, createTeam } from '../src/data/teams.js'
import { setPlayerJerseyNumber } from '../src/data/players.js'

beforeEach(() => {
  vi.clearAllMocks()
  updateMock.result = { data: { id: 't1', uses_jersey_numbers: true }, error: null }
  rpcMock.mockResolvedValue({ data: { id: 'new-team', name: 'Harness Senior C' }, error: null })
  playersQueue = []
  playersFromCallCount = 0
})

describe('setTeamUsesJerseyNumbers', () => {
  it('writes the flag as a real boolean, mirroring setTeamRequiresContact', async () => {
    await setTeamUsesJerseyNumbers('t1', true)
    expect(updateMock).toHaveBeenCalledWith({ uses_jersey_numbers: true })

    await setTeamUsesJerseyNumbers('t1', undefined)
    expect(updateMock).toHaveBeenCalledWith({ uses_jersey_numbers: false })
  })

  it('throws when RLS filters the write to zero rows', async () => {
    // CONTROL of the shape: data null AND error null is what a refused write
    // looks like through supabase-js — a perfectly successful nothing.
    updateMock.result = { data: null, error: null }
    await expect(setTeamUsesJerseyNumbers('t1', true)).rejects.toThrow(/club admin/)
  })
})

describe('createTeam', () => {
  it('calls create_team with the p_-prefixed params and returns the row', async () => {
    const result = await createTeam({
      name: 'Harness Senior C',
      isSenior: true,
      usesJerseyNumbers: true,
      selfRegistrationAllowed: false,
    })

    expect(rpcMock).toHaveBeenCalledWith('create_team', {
      p_name: 'Harness Senior C',
      p_is_senior: true,
      p_uses_jersey_numbers: true,
      p_self_registration_allowed: false,
    })
    expect(result).toEqual({ id: 'new-team', name: 'Harness Senior C' })
  })

  it('maps a 42501 error to the admin sentence', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })

    await expect(
      createTeam({ name: 'Harness Senior D', isSenior: true, usesJerseyNumbers: false, selfRegistrationAllowed: true }),
    ).rejects.toThrow('Only a club admin can add a squad.')
  })

  // CONTROL: any OTHER error rethrows ITS OWN message rather than the admin
  // sentence — proving the 42501 branch above is actually selective, not a
  // catch-all that would hide a different failure behind the wrong words.
  it('rethrows any other error with its own message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid squad name' } })

    await expect(
      createTeam({ name: '', isSenior: true, usesJerseyNumbers: false, selfRegistrationAllowed: true }),
    ).rejects.toThrow('invalid squad name')
  })
})

describe('setPlayerJerseyNumber', () => {
  it('refuses an out-of-range number before any request goes out', async () => {
    await expect(setPlayerJerseyNumber('p1', 0)).rejects.toThrow(/1 to 99/)
    await expect(setPlayerJerseyNumber('p1', 100)).rejects.toThrow(/1 to 99/)
    expect(playersFromCallCount).toBe(0)
  })

  it('maps a unique violation (23505) to the clash sentence, naming the holder in the same squad', async () => {
    playersQueue = [
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { data: { team_id: 'squad-B' }, error: null },
      { data: { full_name: 'Harness Holder Doyle' }, error: null },
    ]

    await expect(setPlayerJerseyNumber('p1', 9)).rejects.toThrow(
      /Number 9 is already worn by Harness Holder Doyle in this squad/,
    )
  })

  it('falls back to "another player" when the holder lookup finds nobody', async () => {
    playersQueue = [
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { data: { team_id: 'squad-B' }, error: null },
      { data: null, error: null },
    ]

    await expect(setPlayerJerseyNumber('p1', 9)).rejects.toThrow(/already worn by another player/)
  })

  // CONTROL: a DIFFERENT error code rethrows ITS OWN message rather than the
  // clash sentence, and never runs the two holder-lookup queries at all.
  it('maps an unrecognised database error to the plain fallback, without looking up a holder', async () => {
    // friendlyMessage: a code outside its trusted list is raw database text and
    // must not reach the screen (UX review item 2, 2 Sep 2026).
    playersQueue = [{ data: null, error: { code: '55000', message: 'some other failure' } }]

    await expect(setPlayerJerseyNumber('p1', 9)).rejects.toThrow('We could not save that number.')
    // Only the update itself — no holder lookups for a non-clash error.
    expect(playersFromCallCount).toBe(1)
  })

  it('CONTROL: a message written for a person (trusted code) passes through unchanged', async () => {
    playersQueue = [{ data: null, error: { code: 'P0001', message: 'Only squad staff may set numbers.' } }]

    await expect(setPlayerJerseyNumber('p1', 9)).rejects.toThrow('Only squad staff may set numbers.')
  })

  it('treats data === null && error === null as an RLS refusal', async () => {
    playersQueue = [{ data: null, error: null }]

    await expect(setPlayerJerseyNumber('p1', 9)).rejects.toThrow(/Only squad staff/)
  })

  it('writes null to clear the number', async () => {
    playersQueue = [{ data: { id: 'p1', team_id: 'squad-B' }, error: null }]

    const result = await setPlayerJerseyNumber('p1', null)
    expect(result).toEqual({ id: 'p1', team_id: 'squad-B' })
  })
})
