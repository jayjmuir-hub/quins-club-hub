// @vitest-environment node
// Reaches @supabase/supabase-js, which needs a global WebSocket. That is why
// this file sat in jsdom until 15 Aug 2026: CI pinned Node 20, where WebSocket
// is not a global. CI now runs Node 24, matching both dev PCs.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const { supabase } = await import('../src/lib/supabase')
const { listAllLeagueTeams, listLeagueTeams, upsertLeagueTeam, setLeagueTeamActive } =
  await import('../src/data/leagueTeams.js')

/** A chainable query stub whose terminal `.order()` resolves. */
function queryStub(result = { data: [], error: null }) {
  const chain = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  let orderCalls = 0
  chain.order = vi.fn(() => {
    orderCalls += 1
    // Two .order() calls; the second is the awaited one.
    return orderCalls >= 2 ? Promise.resolve(result) : chain
  })
  return chain
}

describe('listLeagueTeams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('⚠️ asks only for the given squad, never club-wide', async () => {
    // A club-wide list on the event form would let a U14 fixture be filed under
    // a U16 team, and the league would receive that as a wrong result.
    const chain = queryStub()
    supabase.from.mockReturnValue(chain)

    await listLeagueTeams({ teamId: 'squad-u14b' })

    expect(supabase.from).toHaveBeenCalledWith('league_teams')
    expect(chain.eq).toHaveBeenCalledWith('team_id', 'squad-u14b')
  })

  it('hides retired teams by default', async () => {
    const chain = queryStub()
    supabase.from.mockReturnValue(chain)

    await listLeagueTeams({ teamId: 'squad-u14b' })

    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('includes retired teams when the management screen asks', async () => {
    // The Club screen must show a retired team in order to offer Restore.
    const chain = queryStub()
    supabase.from.mockReturnValue(chain)

    await listLeagueTeams({ teamId: 'squad-u14b', includeRetired: true })

    expect(chain.eq).not.toHaveBeenCalledWith('is_active', true)
  })

  it('⚠️ returns nothing rather than querying when given no squad', async () => {
    // Without this, a screen rendering before its squad loads would ask for
    // `team_id = undefined` and get every league team in the club.
    const result = await listLeagueTeams({})
    expect(result).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('listAllLeagueTeams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('⚠️ reads the club, and filters by no squad at all', async () => {
    // The deliberate opposite of listLeagueTeams. It exists for the management
    // screen, which groups by team_id itself; a `team_id` filter here would
    // just be the other function.
    const chain = queryStub()
    supabase.from.mockReturnValue(chain)

    await listAllLeagueTeams({ includeRetired: true })

    expect(supabase.from).toHaveBeenCalledWith('league_teams')
    expect(chain.eq).not.toHaveBeenCalled()
  })

  it('hides retired teams by default, like its squad-scoped sibling', async () => {
    const chain = queryStub()
    supabase.from.mockReturnValue(chain)

    await listAllLeagueTeams()

    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })
})

describe('upsertLeagueTeam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts when there is no id, and updates when there is', async () => {
    const inserting = queryStub({ data: { id: 'new' }, error: null })
    supabase.from.mockReturnValue(inserting)
    await upsertLeagueTeam({ rcm_name: 'ADHQ2', team_id: 't1', club_id: 'c1' })
    expect(inserting.insert).toHaveBeenCalled()

    vi.clearAllMocks()
    const updating = queryStub({ data: { id: 'x' }, error: null })
    supabase.from.mockReturnValue(updating)
    await upsertLeagueTeam({ id: 'x', rcm_name: 'ADHQ3' })
    expect(updating.update).toHaveBeenCalledWith({ rcm_name: 'ADHQ3' })
    expect(updating.eq).toHaveBeenCalledWith('id', 'x')
  })

  // ⚠️ THESE THREE EXIST BECAUSE ONE HEDGED MESSAGE COST A BUG REPORT.
  // The file shipped saying "you may not have permission, or the name may
  // already be in use" for every failure. Jay hit the unique constraint on
  // 12 Aug 2026, read that, and reported a permission problem. It was not one.
  it('⚠️ names the DUPLICATE as a duplicate, and says the rule is per SQUAD', async () => {
    // "That name is taken" would be true and useless: the obvious next thought
    // is "taken by whom?", and the answer is surprising — always a team in this
    // same age group, never another one.
    supabase.from.mockReturnValue(
      queryStub({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
    )

    await expect(
      upsertLeagueTeam({ club_id: 'c1', team_id: 't-u14b', rcm_name: 'ADHQ1' }),
    ).rejects.toThrow(/already has a league team called ADHQ1/i)

    supabase.from.mockReturnValue(
      queryStub({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
    )
    await expect(
      upsertLeagueTeam({ club_id: 'c1', team_id: 't-u14b', rcm_name: 'ADHQ1' }),
    ).rejects.toThrow(/another age group can still use it/i)
  })

  it('⚠️ does NOT mention permission when the cause is a duplicate', async () => {
    // The whole defect: a message that lists both causes tells the reader
    // nothing, and sends them looking in the wrong place.
    supabase.from.mockReturnValue(
      queryStub({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
    )
    await expect(
      upsertLeagueTeam({ club_id: 'c1', team_id: 't1', rcm_name: 'ADHQ1' }),
    ).rejects.not.toThrow(/permission/i)
  })

  it('surfaces the database\'s own message for a failure it does not recognise', async () => {
    // Rather than a third guess. An unrecognised failure that repeats what the
    // database said is debuggable; "something went wrong" is not.
    supabase.from.mockReturnValue(
      queryStub({ data: null, error: { code: '22001', message: 'value too long for type character varying(8)' } }),
    )
    await expect(upsertLeagueTeam({ rcm_name: 'X'.repeat(50) })).rejects.toThrow(
      /value too long/i,
    )
  })

  it('⚠️ throws when RLS filters the write to zero rows and reports NO error', async () => {
    // This is the failure that looks like success. A non-admin's update is
    // refused by RLS as "matched no rows" — `error` is null and `data` is null.
    // Without the explicit null check the screen would report a saved rename
    // that never happened.
    supabase.from.mockReturnValue(queryStub({ data: null, error: null }))
    await expect(upsertLeagueTeam({ id: 'x', rcm_name: 'NOPE' })).rejects.toThrow(
      /permission|already be in use/i,
    )
  })
})

describe('setLeagueTeamActive', () => {
  beforeEach(() => vi.clearAllMocks())

  it('⚠️ retires by flag and never deletes', async () => {
    // events.league_team_id is ON DELETE SET NULL: deleting would strip the
    // league identity off every fixture the team ever played.
    const chain = queryStub()
    chain.eq = vi.fn(() => Promise.resolve({ error: null }))
    supabase.from.mockReturnValue(chain)

    await setLeagueTeamActive('lt-1', false)

    expect(chain.update).toHaveBeenCalledWith({ is_active: false })
    expect(chain.delete).toBeUndefined()
  })
})
