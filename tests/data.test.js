import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for Task 10's data-access modules: src/data/{events,players,
// availability}.js. RLS does all the permission scoping server-side, so
// these modules are thin query builders — the tests exist to prove each
// function builds the *exact* Supabase query (table, filters, ordering)
// it's supposed to, throws rather than swallows errors, and (for
// subscribe*) wires up realtime correctly. No network is touched: the
// Supabase client is fully mocked.
//
// Mocking strategy: the real supabase-js query builder is chainable
// (.select().in().order()...) AND thenable (`await query` works without an
// explicit terminal call) — a naive mock that only implements one of those
// will pass for the wrong reasons. createQueryBuilder() below returns an
// object whose chain methods (select/in/gte/lte/eq/order) each record their
// call args and return the same object, plus a real `.then` so `await`
// resolves it like the real builder does. Assertions check the recorded
// calls directly, not just the final return value, so a function that
// queries the wrong table/column would fail a test even though the shape
// of its return value looks right.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

import { supabase } from '../src/lib/supabase.js'
import { listEvents, subscribeEvents } from '../src/data/events.js'
import { listPlayers, getPlayerContact } from '../src/data/players.js'
import { listAvailability, subscribeAvailability } from '../src/data/availability.js'

function createQueryBuilder({ data = null, error = null } = {}) {
  const calls = { select: [], in: [], gte: [], lte: [], eq: [], order: [] }
  const builder = {}
  const chain = (name) =>
    vi.fn((...args) => {
      calls[name].push(args)
      return builder
    })
  builder.select = chain('select')
  builder.in = chain('in')
  builder.gte = chain('gte')
  builder.lte = chain('lte')
  builder.eq = chain('eq')
  builder.order = chain('order')
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  // Real PostgrestFilterBuilder instances are thenable so `await query`
  // resolves without an explicit terminal method — mirror that here.
  builder.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject)
  return { builder, calls }
}

function createChannel() {
  return {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
})

// --- listEvents -------------------------------------------------------

describe('listEvents', () => {
  it('queries events, orders by starts_at ascending, with no filters when called with no args', async () => {
    const rows = [{ id: 'e-1' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listEvents()

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.in).toEqual([])
    expect(calls.gte).toEqual([])
    expect(calls.lte).toEqual([])
    expect(builder.order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(result).toEqual(rows)
  })

  it('filters with .in("team_id", teamIds) when teamIds is a non-empty array', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listEvents({ teamIds: ['team-1', 'team-2'] })

    expect(calls.in).toEqual([['team_id', ['team-1', 'team-2']]])
  })

  it('does not query at all when teamIds is an empty array, and returns []', async () => {
    const result = await listEvents({ teamIds: [] })

    expect(supabase.from).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('queries without a team filter when teamIds is undefined (omitted)', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listEvents({ teamIds: undefined })

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(calls.in).toEqual([])
  })

  it('filters starts_at with from/to when provided', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listEvents({ from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z' })

    expect(calls.gte).toEqual([['starts_at', '2026-01-01T00:00:00Z']])
    expect(calls.lte).toEqual([['starts_at', '2026-12-31T23:59:59Z']])
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    const result = await listEvents()

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('permission denied') })
    supabase.from.mockReturnValue(builder)

    await expect(listEvents()).rejects.toThrow('permission denied')
  })
})

// --- subscribeEvents ----------------------------------------------------

describe('subscribeEvents', () => {
  it('subscribes to postgres_changes on the events table and returns an unsubscribe function', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const callback = vi.fn()

    const unsubscribe = subscribeEvents(callback)

    expect(supabase.channel).toHaveBeenCalled()
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: '*', schema: 'public', table: 'events' }),
      callback,
    )
    expect(channel.subscribe).toHaveBeenCalled()
    expect(typeof unsubscribe).toBe('function')
  })

  it('the returned unsubscribe function is idempotent (safe to call twice)', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)

    const unsubscribe = subscribeEvents(vi.fn())

    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('uses a distinct channel per call so two concurrent subscribers do not collide', () => {
    const channelA = createChannel()
    const channelB = createChannel()
    supabase.channel.mockReturnValueOnce(channelA).mockReturnValueOnce(channelB)

    subscribeEvents(vi.fn())
    subscribeEvents(vi.fn())

    const [nameA] = supabase.channel.mock.calls[0]
    const [nameB] = supabase.channel.mock.calls[1]
    expect(nameA).not.toEqual(nameB)
  })
})

// --- listPlayers ----------------------------------------------------------

describe('listPlayers', () => {
  it('queries players, orders by full_name ascending, with no filter when called with no args', async () => {
    const rows = [{ id: 'p-1', full_name: 'Ana' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listPlayers()

    expect(supabase.from).toHaveBeenCalledWith('players')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.in).toEqual([])
    expect(builder.order).toHaveBeenCalledWith('full_name', { ascending: true })
    expect(result).toEqual(rows)
  })

  it('filters with .in("team_id", teamIds) when teamIds is a non-empty array', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listPlayers({ teamIds: ['team-1'] })

    expect(calls.in).toEqual([['team_id', ['team-1']]])
  })

  it('does not query at all when teamIds is an empty array, and returns []', async () => {
    const result = await listPlayers({ teamIds: [] })

    expect(supabase.from).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('queries without a team filter when teamIds is undefined (omitted)', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listPlayers({ teamIds: undefined })

    expect(supabase.from).toHaveBeenCalledWith('players')
    expect(calls.in).toEqual([])
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    const result = await listPlayers()

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('permission denied') })
    supabase.from.mockReturnValue(builder)

    await expect(listPlayers()).rejects.toThrow('permission denied')
  })
})

// --- getPlayerContact -------------------------------------------------

describe('getPlayerContact', () => {
  it('queries player_contacts scoped to the player id, using maybeSingle', async () => {
    const row = { player_id: 'p-1', phone: '0500000000', email: 'a@example.com' }
    const { builder, calls } = createQueryBuilder({ data: row })
    supabase.from.mockReturnValue(builder)

    const result = await getPlayerContact('p-1')

    expect(supabase.from).toHaveBeenCalledWith('player_contacts')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.eq).toEqual([['player_id', 'p-1']])
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(row)
  })

  it('returns null, not a throw, when RLS/absence yields zero rows', async () => {
    const { builder } = createQueryBuilder({ data: null, error: null })
    supabase.from.mockReturnValue(builder)

    const result = await getPlayerContact('p-hidden-from-parent')

    expect(result).toBeNull()
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)

    await expect(getPlayerContact('p-1')).rejects.toThrow('boom')
  })
})

// --- listAvailability ---------------------------------------------------

describe('listAvailability', () => {
  it('queries availability scoped to the event id', async () => {
    const rows = [{ id: 'a-1', event_id: 'e-1', player_id: 'p-1', status: 'in' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listAvailability('e-1')

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.eq).toEqual([['event_id', 'e-1']])
    expect(result).toEqual(rows)
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    const result = await listAvailability('e-1')

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('permission denied') })
    supabase.from.mockReturnValue(builder)

    await expect(listAvailability('e-1')).rejects.toThrow('permission denied')
  })
})

// --- subscribeAvailability ------------------------------------------------

describe('subscribeAvailability', () => {
  it('subscribes to postgres_changes on availability, filtered server-side to one event_id', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const callback = vi.fn()

    const unsubscribe = subscribeAvailability('e-1', callback)

    expect(supabase.channel).toHaveBeenCalled()
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'availability',
        filter: 'event_id=eq.e-1',
      }),
      callback,
    )
    expect(channel.subscribe).toHaveBeenCalled()
    expect(typeof unsubscribe).toBe('function')
  })

  it('the returned unsubscribe function is idempotent (safe to call twice)', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)

    const unsubscribe = subscribeAvailability('e-1', vi.fn())

    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('uses a distinct channel per event id so two subscriptions do not collide', () => {
    const channelA = createChannel()
    const channelB = createChannel()
    supabase.channel.mockReturnValueOnce(channelA).mockReturnValueOnce(channelB)

    subscribeAvailability('e-1', vi.fn())
    subscribeAvailability('e-2', vi.fn())

    const [nameA] = supabase.channel.mock.calls[0]
    const [nameB] = supabase.channel.mock.calls[1]
    expect(nameA).not.toEqual(nameB)
  })
})
