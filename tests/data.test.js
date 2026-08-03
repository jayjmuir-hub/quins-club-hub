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
import { listEvents, subscribeEvents, upsertEvent, deleteEvent } from '../src/data/events.js'
import {
  listPlayers,
  getPlayerContact,
  upsertPlayer,
  deletePlayer,
  upsertContact,
  listContactsForPlayers,
} from '../src/data/players.js'
import {
  listAvailability,
  subscribeAvailability,
  setAvailability,
  listAvailabilityForEvents,
} from '../src/data/availability.js'
// Task 3 (view-as + Accounts plan). NOTE the split: the earlier
// src/data/members.js functions (loadMyMemberships, listClubMembers,
// createInvite, acceptInvite) are tested in tests/scope.test.js, which
// predates this file and uses its own ad-hoc select/insert mocks. Those mocks
// cannot express an update/delete chain, and the plan directs data-layer
// tests here, so the write functions and the listClubMembers select shape are
// covered below against createQueryBuilder() instead of being bolted onto
// scope.test.js. Both files therefore touch members.js — look in both.
// createInvite is now genuinely split across the two: its single-row/legacy
// shape stays in scope.test.js, and its invite_targets half is here, because
// only createQueryBuilder() can express the two-insert-plus-rollback chain.
import {
  listClubMembers,
  updateMembershipRole,
  deleteMembership,
  updateProfileName,
  listPendingProfiles,
  grantMembership,
  grantMemberships,
  getMyProfile,
  createInvite,
} from '../src/data/members.js'

function createQueryBuilder({ data = null, error = null } = {}) {
  const calls = { select: [], in: [], gte: [], lte: [], eq: [], order: [], insert: [], update: [], delete: [], upsert: [] }
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
  // Write-side chain methods (Task 14). Like the read ones, each records its
  // args and returns the same thenable builder, mirroring the real
  // PostgrestQueryBuilder where .insert()/.update()/.delete() are chainable
  // with .eq()/.select() and awaited directly.
  builder.insert = chain('insert')
  builder.update = chain('update')
  builder.delete = chain('delete')
  // Task 15. player_contacts is keyed by player_id (its PRIMARY KEY), so its
  // writer uses a real ON CONFLICT upsert rather than an insert/update
  // branch — hence a chain method the event writers never needed.
  builder.upsert = chain('upsert')
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

// --- upsertEvent ----------------------------------------------------------

// Task 14. A single function that inserts when the row has no id and updates
// when it has one — the two branches are the reason it exists, so both are
// asserted on the recorded query, not just on the return value.
describe('upsertEvent', () => {
  it('inserts when there is no id, and does not send an id column', async () => {
    const saved = { id: 'e-new', type: 'match' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await upsertEvent({ type: 'match', team_id: 't1', starts_at: '2026-07-30T16:00:00.000Z' })

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(builder.update).not.toHaveBeenCalled()
    expect(calls.insert[0][0]).toEqual({
      type: 'match',
      team_id: 't1',
      starts_at: '2026-07-30T16:00:00.000Z',
    })
    expect(calls.insert[0][0]).not.toHaveProperty('id')
    // No .eq() filter on an insert — an insert has no row to match.
    expect(builder.eq).not.toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('inserts when the id is explicitly null or an empty string', async () => {
    // A "new event" form field can legitimately carry id: null rather than
    // omitting the key. A truthiness test is what makes both behave the same.
    for (const id of [null, undefined, '']) {
      const { builder } = createQueryBuilder({ data: { id: 'e-new' } })
      supabase.from.mockReturnValue(builder)
      await upsertEvent({ id, type: 'training', team_id: 't1' })
      expect(builder.insert).toHaveBeenCalledTimes(1)
      expect(builder.update).not.toHaveBeenCalled()
    }
  })

  it('updates the matching row when there is an id, and does not send the id as a column', async () => {
    const saved = { id: 'e-1', type: 'training' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await upsertEvent({ id: 'e-1', type: 'training', team_id: 't2' })

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(builder.update).toHaveBeenCalledTimes(1)
    expect(builder.insert).not.toHaveBeenCalled()
    expect(calls.update[0][0]).toEqual({ type: 'training', team_id: 't2' })
    // Sending the primary key back as a column is at best a no-op write and
    // at worst an attempt to repoint a foreign-keyed row.
    expect(calls.update[0][0]).not.toHaveProperty('id')
    expect(calls.eq[0]).toEqual(['id', 'e-1'])
    expect(result).toEqual(saved)
  })

  it('asks for the saved row back so the caller can refresh from it', async () => {
    const { builder } = createQueryBuilder({ data: { id: 'e-1' } })
    supabase.from.mockReturnValue(builder)

    await upsertEvent({ id: 'e-1', type: 'social' })

    expect(builder.select).toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('duplicate key value') })
    supabase.from.mockReturnValue(builder)

    await expect(upsertEvent({ type: 'match', team_id: 't1' })).rejects.toThrow('duplicate key value')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    // The security case. An update or insert a coach is not allowed to make
    // is not an *error* from PostgREST — RLS simply matches zero rows and
    // returns nothing. Without this the form would show "Saved" for a write
    // the database silently threw away.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(upsertEvent({ id: 'e-1', type: 'match', team_id: 'not-mine' })).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })
})

// --- deleteEvent ----------------------------------------------------------

describe('deleteEvent', () => {
  it('deletes the row with the given id', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'e-1' }] })
    supabase.from.mockReturnValue(builder)

    await deleteEvent('e-1')

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(builder.delete).toHaveBeenCalledTimes(1)
    expect(calls.eq[0]).toEqual(['id', 'e-1'])
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(deleteEvent('e-1')).rejects.toThrow('network down')
  })

  it('throws when nothing was deleted (an RLS refusal)', async () => {
    // Same silent-refusal shape as upsertEvent: a delete a coach may not
    // make removes zero rows and reports no error.
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(deleteEvent('e-1')).rejects.toThrow(/permission|not allowed|couldn.t delete/i)
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

// --- upsertPlayer ---------------------------------------------------------

// Task 15. Same shape as upsertEvent, against the players table: insert when
// the row has no id, update when it has one, and treat a zero-row response as
// the RLS refusal it is.
describe('upsertPlayer', () => {
  it('inserts when there is no id, and does not send an id column', async () => {
    const saved = { id: 'p-new', full_name: 'Tom Fletcher' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await upsertPlayer({ full_name: 'Tom Fletcher', team_id: 't1', club_id: 'c1' })

    expect(supabase.from).toHaveBeenCalledWith('players')
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(builder.update).not.toHaveBeenCalled()
    expect(calls.insert[0][0]).toEqual({ full_name: 'Tom Fletcher', team_id: 't1', club_id: 'c1' })
    expect(calls.insert[0][0]).not.toHaveProperty('id')
    expect(builder.eq).not.toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('inserts when the id is explicitly null or an empty string', async () => {
    for (const id of [null, undefined, '']) {
      const { builder } = createQueryBuilder({ data: { id: 'p-new' } })
      supabase.from.mockReturnValue(builder)
      await upsertPlayer({ id, full_name: 'Tom Fletcher', team_id: 't1' })
      expect(builder.insert).toHaveBeenCalledTimes(1)
      expect(builder.update).not.toHaveBeenCalled()
    }
  })

  it('updates the matching row when there is an id, and does not send the id as a column', async () => {
    const saved = { id: 'p-1', full_name: 'Tom Fletcher' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await upsertPlayer({ id: 'p-1', full_name: 'Tom Fletcher', team_id: 't2' })

    expect(builder.update).toHaveBeenCalledTimes(1)
    expect(builder.insert).not.toHaveBeenCalled()
    expect(calls.update[0][0]).toEqual({ full_name: 'Tom Fletcher', team_id: 't2' })
    expect(calls.update[0][0]).not.toHaveProperty('id')
    expect(calls.eq[0]).toEqual(['id', 'p-1'])
    expect(result).toEqual(saved)
  })

  it('asks for the saved row back so the caller has the new id', async () => {
    // A new player's id is not optional here: the contact write is a second,
    // separate statement keyed on that id, so a caller with no id back has no
    // way to save the contact details it was just given.
    const { builder } = createQueryBuilder({ data: { id: 'p-new' } })
    supabase.from.mockReturnValue(builder)

    await upsertPlayer({ full_name: 'Tom Fletcher', team_id: 't1' })

    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('null value in column "team_id"') })
    supabase.from.mockReturnValue(builder)

    await expect(upsertPlayer({ full_name: 'Tom Fletcher' })).rejects.toThrow('null value in column')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(upsertPlayer({ id: 'p-1', team_id: 'not-mine' })).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })
})

// --- deletePlayer ---------------------------------------------------------

describe('deletePlayer', () => {
  it('deletes the row with the given id', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'p-1' }] })
    supabase.from.mockReturnValue(builder)

    await deletePlayer('p-1')

    expect(supabase.from).toHaveBeenCalledWith('players')
    expect(builder.delete).toHaveBeenCalledTimes(1)
    expect(calls.eq[0]).toEqual(['id', 'p-1'])
  })

  it('does not issue a separate player_contacts delete', async () => {
    // player_contacts.player_id is a FK with ON DELETE CASCADE, so the
    // contact row goes with the player. A second client-side delete would be
    // a redundant statement whose failure mode (contact gone, player left) is
    // strictly worse than the database's own atomic one.
    const { builder } = createQueryBuilder({ data: [{ id: 'p-1' }] })
    supabase.from.mockReturnValue(builder)

    await deletePlayer('p-1')

    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalledWith('player_contacts')
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(deletePlayer('p-1')).rejects.toThrow('network down')
  })

  it('throws when nothing was deleted (an RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(deletePlayer('p-1')).rejects.toThrow(/permission|not allowed|couldn.t delete/i)
  })
})

// --- upsertContact --------------------------------------------------------

// Task 15. player_contacts has no surrogate key — player_id IS the primary
// key — so this is the one writer in the codebase that uses a genuine
// ON CONFLICT upsert rather than an insert/update branch.
describe('upsertContact', () => {
  it('upserts on player_id, sending the id as a column because it is the key', async () => {
    const saved = { player_id: 'p-1', phone: '+971 50 200 1000', email: 'a@example.com' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await upsertContact({
      player_id: 'p-1',
      phone: '+971 50 200 1000',
      email: 'a@example.com',
    })

    expect(supabase.from).toHaveBeenCalledWith('player_contacts')
    expect(builder.upsert).toHaveBeenCalledTimes(1)
    // Unlike upsertPlayer, the key stays in the payload: it is what the row
    // is keyed BY, not a surrogate id being needlessly rewritten.
    expect(calls.upsert[0][0]).toEqual({
      player_id: 'p-1',
      phone: '+971 50 200 1000',
      email: 'a@example.com',
    })
    // The conflict target is stated rather than inferred, so this keeps
    // updating in place if a second unique constraint is ever added.
    expect(calls.upsert[0][1]).toMatchObject({ onConflict: 'player_id' })
    expect(builder.insert).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('writes nulls through, so clearing a wrong phone number actually clears it', async () => {
    const { builder, calls } = createQueryBuilder({ data: { player_id: 'p-1', phone: null, email: null } })
    supabase.from.mockReturnValue(builder)

    await upsertContact({ player_id: 'p-1', phone: null, email: null })

    expect(calls.upsert[0][0]).toEqual({ player_id: 'p-1', phone: null, email: null })
  })

  it('refuses to write without a player_id rather than creating an orphan row', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(upsertContact({ phone: '0500000000' })).rejects.toThrow(/player/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('asks for the saved row back', async () => {
    const { builder } = createQueryBuilder({ data: { player_id: 'p-1' } })
    supabase.from.mockReturnValue(builder)

    await upsertContact({ player_id: 'p-1', phone: null, email: null })

    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)

    await expect(upsertContact({ player_id: 'p-1', phone: '1' })).rejects.toThrow('boom')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    // The safeguarding case. "contact edit" is a separate policy from
    // "player edit"; a refusal here must be reported, never conflated with a
    // successful player save.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(upsertContact({ player_id: 'p-1', phone: '1' })).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })

  it('names contact details in its refusal message, distinctly from a player refusal', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(upsertContact({ player_id: 'p-1', phone: '1' })).rejects.toThrow(/contact/i)
  })
})

// --- listContactsForPlayers -------------------------------------------

// Task 2 (Club Overview Dashboard plan). Bulk contact-presence fetch across
// many players in one query, so the Overview screen can compute per-team
// roster gaps (a player id with no row in the returned set) without an
// N+1 of getPlayerContact calls — same teamIds-array convention as
// listPlayers({teamIds})/listAvailabilityForEvents: an empty array must
// never be read as "no filter", so it short-circuits without querying.
describe('listContactsForPlayers', () => {
  it('does not query at all when playerIds is an empty array, and returns []', async () => {
    const result = await listContactsForPlayers([])

    expect(supabase.from).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('queries player_contacts with select(player_id, phone, email) and .in("player_id", playerIds)', async () => {
    const rows = [{ player_id: 'p1', phone: '+971500000000', email: 'a@example.com' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listContactsForPlayers(['p1', 'p2'])

    expect(supabase.from).toHaveBeenCalledWith('player_contacts')
    expect(builder.select).toHaveBeenCalledWith('player_id, phone, email')
    expect(calls.in).toEqual([['player_id', ['p1', 'p2']]])
    expect(result).toEqual(rows)
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    const result = await listContactsForPlayers(['p1'])

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('rls refused') })
    supabase.from.mockReturnValue(builder)

    await expect(listContactsForPlayers(['p1'])).rejects.toThrow('rls refused')
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

// --- listAvailabilityForEvents ---------------------------------------------

// Task 1 (Club Overview Dashboard plan). Bulk RSVP fetch across many events
// in one query, for the Overview screen — same teamIds-array convention as
// listEvents({teamIds})/listPlayers({teamIds}): an empty array must never be
// read as "no filter", so it short-circuits without querying at all.
describe('listAvailabilityForEvents', () => {
  it('does not query at all when eventIds is an empty array, and returns []', async () => {
    const result = await listAvailabilityForEvents([])

    expect(supabase.from).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('queries availability with .in("event_id", eventIds)', async () => {
    const rows = [
      { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'in' },
      { id: 'a2', event_id: 'e2', player_id: 'p2', status: 'maybe' },
    ]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listAvailabilityForEvents(['e1', 'e2'])

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.in).toEqual([['event_id', ['e1', 'e2']]])
    expect(result).toEqual(rows)
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    const result = await listAvailabilityForEvents(['e1'])

    expect(result).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(listAvailabilityForEvents(['e1'])).rejects.toThrow('network down')
  })
})

// --- setAvailability -------------------------------------------------------

// Task 16. availability has no surrogate key for a (event, player) pair —
// same shape as upsertContact against player_contacts: a genuine ON CONFLICT
// upsert naming its conflict target explicitly, not an insert/update branch.
describe('setAvailability', () => {
  it('upserts on the (event_id, player_id) conflict target', async () => {
    const saved = { id: 'a-1', event_id: 'e-1', player_id: 'p-1', status: 'in' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await setAvailability('e-1', 'p-1', 'in')

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(builder.upsert).toHaveBeenCalledTimes(1)
    expect(calls.upsert[0][0]).toEqual({ event_id: 'e-1', player_id: 'p-1', status: 'in' })
    expect(calls.upsert[0][1]).toMatchObject({ onConflict: 'event_id,player_id' })
    expect(builder.insert).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('asks for the saved row back', async () => {
    const { builder } = createQueryBuilder({ data: { id: 'a-1', event_id: 'e-1', player_id: 'p-1', status: 'out' } })
    supabase.from.mockReturnValue(builder)

    await setAvailability('e-1', 'p-1', 'out')

    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)

    await expect(setAvailability('e-1', 'p-1', 'in')).rejects.toThrow('boom')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    // The scoping case: a parent trying to set availability for a player who
    // is not their own child, or a player outside the team a coach edits.
    // RLS matches zero rows and PostgREST reports a successful empty
    // response, not an error — so this must be turned into a visible refusal
    // the same way upsertEvent/upsertPlayer/upsertContact already do.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(setAvailability('e-1', 'not-my-child', 'in')).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })

  it('refuses to write without an event id or player id rather than hitting the network', async () => {
    await expect(setAvailability(null, 'p-1', 'in')).rejects.toThrow(/event|player/i)
    await expect(setAvailability('e-1', null, 'in')).rejects.toThrow(/event|player/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// --- listClubMembers (select shape) ---------------------------------------

// Task 3. The behavioural tests (rows through, [] not null, throw on error)
// live in tests/scope.test.js; what is asserted here is the one thing that
// file's mock cannot see and that changed in this task — the exact embed
// string. The email column and the admin-read policy that makes the profiles
// embed populate for an admin both arrived in the live migration
// `profiles_email_and_admin_access`; a regression to `profiles(full_name)`
// would leave the Accounts screen with an empty Email column and no error.
describe('listClubMembers select shape', () => {
  it('embeds profiles(full_name, email), teams(name) and players(full_name)', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listClubMembers()

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(builder.select).toHaveBeenCalledWith(
      '*, profiles(full_name, email), teams(name), players(full_name)',
    )
  })

  // Task 5. The players embed is what the Accounts screen's "Linked player"
  // column renders; without it that column could only show a raw
  // memberships.player_id uuid. Asserted as its own case so a regression that
  // drops just this embed (leaving profiles/teams intact) still fails loudly,
  // rather than silently turning every linked parent/player row into an
  // em dash. memberships.player_id is the only FK from memberships to players
  // (memberships_player_id_fkey, verified against the live schema), so no
  // disambiguating !fkey hint belongs in the string.
  it('names the players embed without an !fkey hint', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listClubMembers()

    const selectArg = builder.select.mock.calls[0][0]
    expect(selectArg).toContain('players(full_name)')
    expect(selectArg).not.toContain('!')
  })
})

// --- updateMembershipRole -------------------------------------------------

// Task 3. Unlike every other writer in src/data, this one validates before
// querying, because memberships has no check constraint mirroring
// invites_team_required_unless_admin — verified against the live table, whose
// only constraints are the PK, four FKs and memberships_role_check. The JS
// guard is the sole enforcement, so it is tested as behaviour, not style.
describe('updateMembershipRole', () => {
  it('updates the row by id with the new role and team, and reads it back', async () => {
    const saved = { id: 'm-1', role: 'coach', team_id: 't-12' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await updateMembershipRole({ membershipId: 'm-1', role: 'coach', teamId: 't-12' })

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(builder.update).toHaveBeenCalledTimes(1)
    expect(calls.update[0][0]).toEqual({ role: 'coach', team_id: 't-12' })
    expect(calls.eq[0]).toEqual(['id', 'm-1'])
    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('never sends the membership id as a column, only as the filter', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-1' } })
    supabase.from.mockReturnValue(builder)

    await updateMembershipRole({ membershipId: 'm-1', role: 'parent', teamId: 't-12' })

    expect(calls.update[0][0]).not.toHaveProperty('id')
  })

  it('forces team_id to null for the admin role, even when a team id is passed', async () => {
    // The promote-to-admin case: a form's team dropdown still holds the
    // previous selection at the moment the role flips. Coercing to the only
    // valid value keeps the write correct without failing in front of the
    // user, and an admin row carrying a team_id is meaningless to scope.js.
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-1', role: 'admin' } })
    supabase.from.mockReturnValue(builder)

    await updateMembershipRole({ membershipId: 'm-1', role: 'admin', teamId: 't-12' })

    expect(calls.update[0][0]).toEqual({ role: 'admin', team_id: null })
  })

  it('allows the admin role with no team id at all', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-1', role: 'admin' } })
    supabase.from.mockReturnValue(builder)

    await updateMembershipRole({ membershipId: 'm-1', role: 'admin' })

    expect(calls.update[0][0]).toEqual({ role: 'admin', team_id: null })
  })

  it('refuses a non-admin role with no team, without hitting the network', async () => {
    // The opposite half of the rule, and the one that must throw: there is no
    // safe value to coerce to, and a coach/parent/player row with a null
    // team_id scopes to nothing.
    for (const role of ['coach', 'parent', 'player']) {
      await expect(updateMembershipRole({ membershipId: 'm-1', role })).rejects.toThrow(/age group/i)
      await expect(
        updateMembershipRole({ membershipId: 'm-1', role, teamId: null }),
      ).rejects.toThrow(/age group/i)
    }
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a role outside the four the database allows', async () => {
    await expect(
      updateMembershipRole({ membershipId: 'm-1', role: 'manager', teamId: 't-12' }),
    ).rejects.toThrow(/role/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses to write without a membership id rather than updating every row', async () => {
    // A missing .eq() filter on an UPDATE is the worst failure mode available
    // to this function: it would rewrite every membership row RLS lets the
    // admin touch, i.e. the whole club.
    await expect(updateMembershipRole({ role: 'coach', teamId: 't-12' })).rejects.toThrow(/membership/i)
    await expect(updateMembershipRole()).rejects.toThrow(/membership/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('violates check constraint') })
    supabase.from.mockReturnValue(builder)

    await expect(
      updateMembershipRole({ membershipId: 'm-1', role: 'coach', teamId: 't-12' }),
    ).rejects.toThrow('violates check constraint')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    // `memb manage` matches zero rows for a non-admin and PostgREST reports
    // that as a successful empty response — the same silent refusal
    // createInvite/upsertPlayer already turn into a visible message.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      updateMembershipRole({ membershipId: 'm-1', role: 'coach', teamId: 't-12' }),
    ).rejects.toThrow(/permission|not allowed|couldn.t change/i)
  })
})

// --- deleteMembership -----------------------------------------------------

describe('deleteMembership', () => {
  it('deletes the membership row with the given id', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await deleteMembership('m-1')

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(builder.delete).toHaveBeenCalledTimes(1)
    expect(calls.eq[0]).toEqual(['id', 'm-1'])
  })

  it('touches only memberships — the profile and login survive a revoke', async () => {
    // Revoking access removes the club role, not the person. Deleting the
    // auth user needs the service-role key, which never reaches this client.
    const { builder } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await deleteMembership('m-1')

    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
  })

  it('refuses to delete without an id rather than deleting every row', async () => {
    await expect(deleteMembership(undefined)).rejects.toThrow(/membership/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(deleteMembership('m-1')).rejects.toThrow('network down')
  })

  it('throws when nothing was deleted (an RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(deleteMembership('m-1')).rejects.toThrow(/permission|not allowed|couldn.t remove/i)
  })
})

// --- updateProfileName ----------------------------------------------------

// Task 3. Writes profiles, not memberships: one person can hold several
// membership rows (no unique constraint on (profile_id, club_id, role)), and
// they share a single name. Permitted by the `profile update club admin`
// policy added in the profiles_email_and_admin_access migration.
describe('updateProfileName', () => {
  it('updates profiles.full_name for the given profile id and reads the row back', async () => {
    const saved = { id: 'u-1', full_name: 'Jay Muir', email: 'jay@example.com' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await updateProfileName({ profileId: 'u-1', fullName: 'Jay Muir' })

    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(builder.update).toHaveBeenCalledTimes(1)
    expect(calls.update[0][0]).toEqual({ full_name: 'Jay Muir' })
    expect(calls.eq[0]).toEqual(['id', 'u-1'])
    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('never writes the email column, which mirrors the login address', async () => {
    // profiles.email is a trigger-maintained mirror of auth.users.email.
    // Writing it here would desync the address the person signs in with.
    const { builder, calls } = createQueryBuilder({ data: { id: 'u-1' } })
    supabase.from.mockReturnValue(builder)

    await updateProfileName({ profileId: 'u-1', fullName: 'Jay Muir', email: 'new@example.com' })

    expect(calls.update[0][0]).not.toHaveProperty('email')
    expect(calls.update[0][0]).not.toHaveProperty('id')
  })

  it('trims the name before writing', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'u-1' } })
    supabase.from.mockReturnValue(builder)

    await updateProfileName({ profileId: 'u-1', fullName: '  Jay Muir  ' })

    expect(calls.update[0][0]).toEqual({ full_name: 'Jay Muir' })
  })

  it('refuses a blank name rather than writing one', async () => {
    // Admin.jsx renders `full_name ?? 'Unnamed member'` — null falls back, an
    // empty string does not, so a blank save would render a nameless row.
    for (const fullName of ['', '   ', null, undefined]) {
      await expect(updateProfileName({ profileId: 'u-1', fullName })).rejects.toThrow(/name/i)
    }
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses to write without a profile id rather than updating every row', async () => {
    await expect(updateProfileName({ fullName: 'Jay Muir' })).rejects.toThrow(/profile/i)
    await expect(updateProfileName()).rejects.toThrow(/profile/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)

    await expect(updateProfileName({ profileId: 'u-1', fullName: 'Jay' })).rejects.toThrow('boom')
  })

  it('throws when the write succeeds but comes back with no row (an RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(updateProfileName({ profileId: 'u-other-club', fullName: 'Jay' })).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })
})

// --- listPendingProfiles --------------------------------------------------

// Task A (pending-access plan). The function whose name lies: it returns
// EVERY profile the caller can read, not just the unattached ones. The
// "has no membership" test lives inside private.can_admin_see_pending(), the
// SECURITY DEFINER predicate behind the `profile read pending` SELECT policy,
// and is not expressible as a PostgREST filter — so the pending set is
// obtained by subtracting listClubMembers()'s profile_ids in the screen.
// These tests pin that: no filter is sent, and rows come back untouched.
describe('listPendingProfiles', () => {
  it('selects the profile columns the waiting-for-access list needs, newest first', async () => {
    const rows = [
      { id: 'pr-new', full_name: '', email: 'janice@example.com', created_at: '2026-08-03T11:37:00Z' },
    ]
    const { builder } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listPendingProfiles()

    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(builder.select).toHaveBeenCalledWith('id, full_name, email, created_at')
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual(rows)
  })

  it('applies no filter at all — RLS decides what is readable, not this query', async () => {
    // The load-bearing assertion. Any .eq()/.in() added here would silently
    // narrow the set the screen diffs against and could hide a real signup;
    // there is no client-side predicate that can express "zero memberships".
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listPendingProfiles()

    expect(calls.eq).toEqual([])
    expect(calls.in).toEqual([])
  })

  it('returns every readable profile, including ones that already have access', async () => {
    // Proof that it does NOT pre-filter: an admin's own row and a club
    // member's row come straight back, and it is the caller's job to subtract
    // them. A future "fix" that drops them here would break the contract this
    // documents.
    const rows = [
      { id: 'pr-jay', full_name: 'Jay Muir', email: 'jay@example.com', created_at: '2026-01-05T09:00:00Z' },
      { id: 'pr-new', full_name: '', email: 'janice@example.com', created_at: '2026-08-03T11:37:00Z' },
    ]
    const { builder } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listPendingProfiles()

    expect(result).toHaveLength(2)
    expect(result.map((row) => row.id)).toContain('pr-jay')
  })

  it('returns [] rather than null when data is null', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    expect(await listPendingProfiles()).toEqual([])
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('permission denied') })
    supabase.from.mockReturnValue(builder)

    await expect(listPendingProfiles()).rejects.toThrow('permission denied')
  })
})

// --- getMyProfile ---------------------------------------------------------

describe('getMyProfile', () => {
  it('reads the one profile row by id with maybeSingle', async () => {
    const row = { id: 'u-1', full_name: '', email: 'jay@example.com', created_at: '2026-01-05T09:00:00Z' }
    const { builder, calls } = createQueryBuilder({ data: row })
    supabase.from.mockReturnValue(builder)

    const result = await getMyProfile('u-1')

    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(calls.eq).toEqual([['id', 'u-1']])
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(row)
  })

  it('returns null, not a throw, when the row is not there yet', async () => {
    // The profiles row is created by the on_auth_user_created trigger, so
    // straight after a first magic-link sign-in the session can exist a
    // moment before the row does. That is "not known yet", not an error.
    const { builder } = createQueryBuilder({ data: null, error: null })
    supabase.from.mockReturnValue(builder)

    expect(await getMyProfile('u-brand-new')).toBeNull()
  })

  it('refuses to query without a user id rather than reading someone else', async () => {
    // Unfiltered, an admin's profiles select returns many rows (the club-admin
    // and pending read policies), and .maybeSingle() over many rows is an
    // error — or, worse read, a stranger's profile treated as "mine".
    await expect(getMyProfile()).rejects.toThrow(/user id/i)
    await expect(getMyProfile(null)).rejects.toThrow(/user id/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws rather than swallowing a Supabase error', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)

    await expect(getMyProfile('u-1')).rejects.toThrow('boom')
  })
})

// --- grantMembership ------------------------------------------------------

// Task A. Insert-side twin of updateMembershipRole, for someone who signed up
// but was never invited. memberships still has no check constraint mirroring
// invites_team_required_unless_admin, so the same JS guard is the only
// enforcement — asserted here as behaviour, not duplicated style.
describe('grantMembership', () => {
  it('inserts a membership with the profile, club, role and team', async () => {
    const saved = { id: 'm-new', profile_id: 'pr-new', club_id: 'c-1', role: 'coach', team_id: 't-12' }
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await grantMembership({
      profileId: 'pr-new',
      clubId: 'c-1',
      role: 'coach',
      teamId: 't-12',
    })

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(builder.update).not.toHaveBeenCalled()
    expect(calls.insert[0][0]).toEqual({
      profile_id: 'pr-new',
      club_id: 'c-1',
      role: 'coach',
      team_id: 't-12',
      player_id: null,
    })
    // An insert has no existing row to match.
    expect(builder.eq).not.toHaveBeenCalled()
    expect(builder.select).toHaveBeenCalled()
    expect(builder.maybeSingle).toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('never sends an id column — the row is new and the default supplies it', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-new' } })
    supabase.from.mockReturnValue(builder)

    await grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'parent', teamId: 't-12' })

    expect(calls.insert[0][0]).not.toHaveProperty('id')
  })

  it('passes a linked player through when one is given', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-new' } })
    supabase.from.mockReturnValue(builder)

    await grantMembership({
      profileId: 'pr-new',
      clubId: 'c-1',
      role: 'parent',
      teamId: 't-12',
      playerId: 'p-9',
    })

    expect(calls.insert[0][0].player_id).toBe('p-9')
  })

  it('forces team_id to null for the admin role, even when a team id is passed', async () => {
    // Same coercion as updateMembershipRole, and for the same reason: the
    // grant form's age-group select may still hold a selection at the moment
    // the role is set to admin.
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-new', role: 'admin' } })
    supabase.from.mockReturnValue(builder)

    await grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'admin', teamId: 't-12' })

    expect(calls.insert[0][0]).toMatchObject({ role: 'admin', team_id: null })
  })

  it('allows the admin role with no team id at all', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-new', role: 'admin' } })
    supabase.from.mockReturnValue(builder)

    await grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'admin' })

    expect(calls.insert[0][0]).toMatchObject({ role: 'admin', team_id: null })
  })

  it('refuses a non-admin role with no team, without hitting the network', async () => {
    for (const role of ['coach', 'parent', 'player']) {
      await expect(grantMembership({ profileId: 'pr-new', clubId: 'c-1', role })).rejects.toThrow(
        /age group/i,
      )
      await expect(
        grantMembership({ profileId: 'pr-new', clubId: 'c-1', role, teamId: null }),
      ).rejects.toThrow(/age group/i)
    }
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a role outside the four the database allows', async () => {
    await expect(
      grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'manager', teamId: 't-12' }),
    ).rejects.toThrow(/role/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses to insert without a profile id or a club id', async () => {
    // club_id and profile_id are both NOT NULL on the live table, and club_id
    // is what `memb manage`'s is_admin() check is evaluated against — a
    // missing one is a guaranteed server-side failure worth catching here.
    await expect(grantMembership({ clubId: 'c-1', role: 'admin' })).rejects.toThrow(/profile/i)
    await expect(grantMembership({ profileId: 'pr-new', role: 'admin' })).rejects.toThrow(/club/i)
    await expect(grantMembership()).rejects.toThrow(/profile/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('violates foreign key constraint') })
    supabase.from.mockReturnValue(builder)

    await expect(
      grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'admin' }),
    ).rejects.toThrow('violates foreign key constraint')
  })

  it('throws when the insert succeeds but comes back with no row (an RLS refusal)', async () => {
    // `memb manage` (FOR ALL, WITH CHECK private.is_admin(club_id)) matches
    // zero rows for a non-admin and PostgREST reports that as a successful
    // empty response — the same silent refusal every other writer here turns
    // into a visible message.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'admin' }),
    ).rejects.toThrow(/permission|not allowed|couldn.t give/i)
  })
})

// --- grantMemberships -----------------------------------------------------

// The multi-access grant (docs/superpowers/specs/2026-08-03-multi-access-design.md).
// One person legitimately holds several membership rows — two children in
// different age groups, two coached squads, coach-and-also-parent — and
// memberships has no unique constraint, so the "don't write the same row
// twice" guard tested here is the only one there is.
describe('grantMemberships', () => {
  it('inserts every row in ONE insert call, as an array, and returns the saved rows', async () => {
    const saved = [
      { id: 'm-1', role: 'parent', team_id: 't-u10', player_id: 'p-1' },
      { id: 'm-2', role: 'parent', team_id: 't-u14', player_id: 'p-2' },
    ]
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'parent', teamId: 't-u10', playerId: 'p-1' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'parent', teamId: 't-u14', playerId: 'p-2' },
    ])

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(calls.insert[0][0]).toEqual([
      { profile_id: 'pr-1', club_id: 'c-1', role: 'parent', team_id: 't-u10', player_id: 'p-1' },
      { profile_id: 'pr-1', club_id: 'c-1', role: 'parent', team_id: 't-u14', player_id: 'p-2' },
    ])
    expect(builder.select).toHaveBeenCalled()
    // A set insert reads back with .select(), not .maybeSingle() — many rows.
    expect(builder.maybeSingle).not.toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('keeps rows that differ only in role — the coach-who-is-also-a-parent case', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }, { id: 'm-2' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'parent', teamId: 't-u10', playerId: 'p-1' },
    ])

    expect(calls.insert[0][0]).toHaveLength(2)
  })

  it('collapses identical rows within one save', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14' },
    ])

    expect(calls.insert[0][0]).toEqual([
      { profile_id: 'pr-1', club_id: 'c-1', role: 'coach', team_id: 't-u14', player_id: null },
    ])
  })

  it('treats an absent playerId and an explicit null playerId as the same row', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14', playerId: null },
    ])

    expect(calls.insert[0][0]).toHaveLength(1)
  })

  it('keeps two rows for the same team when they link different children', async () => {
    // Same age group, two siblings: NOT a duplicate, and collapsing them
    // would lose one child's access.
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }, { id: 'm-2' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'parent', teamId: 't-u10', playerId: 'p-1' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'parent', teamId: 't-u10', playerId: 'p-2' },
    ])

    expect(calls.insert[0][0]).toHaveLength(2)
  })

  it('collapses duplicate admin rows — the failure that has bitten this project before', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([
      { profileId: 'pr-1', clubId: 'c-1', role: 'admin' },
      { profileId: 'pr-1', clubId: 'c-1', role: 'admin', teamId: 't-u14' },
    ])

    // The second row's team is coerced to null first, so the two become
    // identical and only one is written.
    expect(calls.insert[0][0]).toEqual([
      { profile_id: 'pr-1', club_id: 'c-1', role: 'admin', team_id: null, player_id: null },
    ])
  })

  it('applies the same admin coercion as grantMembership to every row', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'm-1' }] })
    supabase.from.mockReturnValue(builder)

    await grantMemberships([{ profileId: 'pr-1', clubId: 'c-1', role: 'admin', teamId: 't-u14' }])

    expect(calls.insert[0][0][0]).toMatchObject({ role: 'admin', team_id: null })
  })

  it('refuses the WHOLE set when any row is invalid, without hitting the network', async () => {
    // All-or-nothing validation: a half-applied grant is the thing worth
    // making impossible, and a multi-row insert is one statement anyway.
    await expect(
      grantMemberships([
        { profileId: 'pr-1', clubId: 'c-1', role: 'coach', teamId: 't-u14' },
        { profileId: 'pr-1', clubId: 'c-1', role: 'parent' },
      ]),
    ).rejects.toThrow(/age group/i)

    await expect(
      grantMemberships([{ profileId: 'pr-1', clubId: 'c-1', role: 'manager', teamId: 't-u14' }]),
    ).rejects.toThrow(/role/i)

    await expect(
      grantMemberships([{ clubId: 'c-1', role: 'admin' }]),
    ).rejects.toThrow(/profile/i)

    await expect(
      grantMemberships([{ profileId: 'pr-1', role: 'admin' }]),
    ).rejects.toThrow(/club/i)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns [] without querying for an empty or missing list', async () => {
    expect(await grantMemberships([])).toEqual([])
    expect(await grantMemberships()).toEqual([])
    expect(await grantMemberships(null)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('violates foreign key constraint') })
    supabase.from.mockReturnValue(builder)

    await expect(
      grantMemberships([{ profileId: 'pr-1', clubId: 'c-1', role: 'admin' }]),
    ).rejects.toThrow('violates foreign key constraint')
  })

  it('throws when the insert succeeds but comes back with no rows (an RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(
      grantMemberships([{ profileId: 'pr-1', clubId: 'c-1', role: 'admin' }]),
    ).rejects.toThrow(/permission|couldn.t give/i)
  })
})

// --- createInvite with multiple targets -----------------------------------

// The single-target/legacy half of createInvite is covered in
// tests/scope.test.js (which predates this file). What is tested here is the
// invite_targets half: the second insert, and the hand-rolled rollback that
// stands in for the transaction PostgREST cannot give the browser.
describe('createInvite (multi-target)', () => {
  it('inserts one invite_targets row per target, carrying the new invite id', async () => {
    const invite = { id: 'inv-1', token: 'tok-abc' }
    const inviteQ = createQueryBuilder({ data: invite })
    const targetsQ = createQueryBuilder({ data: [{ id: 'it-1' }, { id: 'it-2' }] })
    supabase.from.mockReturnValueOnce(inviteQ.builder).mockReturnValueOnce(targetsQ.builder)

    const result = await createInvite({
      clubId: 'club-1',
      email: 'parent@example.com',
      role: 'parent',
      createdBy: 'user-1',
      targets: [
        { teamId: 't-u10', playerId: 'p-1' },
        { teamId: 't-u14', playerId: 'p-2' },
      ],
    })

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'invites')
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'invite_targets')
    expect(targetsQ.calls.insert[0][0]).toEqual([
      { invite_id: 'inv-1', team_id: 't-u10', player_id: 'p-1' },
      { invite_id: 'inv-1', team_id: 't-u14', player_id: 'p-2' },
    ])
    // The invite row itself is still what comes back — the caller needs its
    // token to build the accept link.
    expect(result).toEqual(invite)
  })

  it('defaults a target with no player to player_id null (an age-group-only target)', async () => {
    const inviteQ = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    const targetsQ = createQueryBuilder({ data: [{ id: 'it-1' }] })
    supabase.from.mockReturnValueOnce(inviteQ.builder).mockReturnValueOnce(targetsQ.builder)

    await createInvite({
      clubId: 'club-1',
      email: 'coach@example.com',
      role: 'coach',
      createdBy: 'user-1',
      targets: [{ teamId: 't-u10' }],
    })

    expect(targetsQ.calls.insert[0][0]).toEqual([
      { invite_id: 'inv-1', team_id: 't-u10', player_id: null },
    ])
  })

  it('makes no second call at all when there are no targets (the legacy path)', async () => {
    const { builder } = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    supabase.from.mockReturnValue(builder)

    await createInvite({
      clubId: 'club-1',
      email: 'coach@example.com',
      role: 'coach',
      teamId: 't-u10',
      createdBy: 'user-1',
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(supabase.from).toHaveBeenCalledWith('invites')
  })

  it('refuses a target with no team id before creating anything', async () => {
    // invite_targets.team_id is NOT NULL, so this could only fail after the
    // invite row existed — cheaper and safer to refuse up front.
    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'parent@example.com',
        role: 'parent',
        createdBy: 'user-1',
        targets: [{ teamId: 't-u10' }, { playerId: 'p-2' }],
      }),
    ).rejects.toThrow(/age group/i)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('deletes the invite row and throws when the targets insert errors', async () => {
    const inviteQ = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    const targetsQ = createQueryBuilder({ error: new Error('violates foreign key constraint') })
    const deleteQ = createQueryBuilder({ data: [{ id: 'inv-1' }] })
    supabase.from
      .mockReturnValueOnce(inviteQ.builder)
      .mockReturnValueOnce(targetsQ.builder)
      .mockReturnValueOnce(deleteQ.builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'parent@example.com',
        role: 'parent',
        createdBy: 'user-1',
        targets: [{ teamId: 't-u10' }],
      }),
    ).rejects.toThrow('violates foreign key constraint')

    // A targetless invite is not inert — accept_invite would fall back to the
    // invite's own (null) team_id and grant the wrong access — so it must not
    // be left behind.
    expect(supabase.from).toHaveBeenNthCalledWith(3, 'invites')
    expect(deleteQ.builder.delete).toHaveBeenCalled()
    expect(deleteQ.calls.eq[0]).toEqual(['id', 'inv-1'])
  })

  it('deletes the invite row and throws a friendly message when the targets insert is silently refused', async () => {
    const inviteQ = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    const targetsQ = createQueryBuilder({ data: [] })
    const deleteQ = createQueryBuilder({ data: [{ id: 'inv-1' }] })
    supabase.from
      .mockReturnValueOnce(inviteQ.builder)
      .mockReturnValueOnce(targetsQ.builder)
      .mockReturnValueOnce(deleteQ.builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'parent@example.com',
        role: 'parent',
        createdBy: 'user-1',
        targets: [{ teamId: 't-u10' }],
      }),
    ).rejects.toThrow(/no invite was sent/i)

    expect(deleteQ.builder.delete).toHaveBeenCalled()
  })

  it('still reports the original failure when the cleanup delete is itself refused', async () => {
    const inviteQ = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    const targetsQ = createQueryBuilder({ data: [] })
    const deleteQ = createQueryBuilder({ error: new Error('permission denied') })
    supabase.from
      .mockReturnValueOnce(inviteQ.builder)
      .mockReturnValueOnce(targetsQ.builder)
      .mockReturnValueOnce(deleteQ.builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'parent@example.com',
        role: 'parent',
        createdBy: 'user-1',
        targets: [{ teamId: 't-u10' }],
      }),
    ).rejects.toThrow(/no invite was sent/i)
  })

  it('never writes targets when the invite row itself was refused', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'parent@example.com',
        role: 'parent',
        createdBy: 'user-1',
        targets: [{ teamId: 't-u10' }],
      }),
    ).rejects.toThrow(/permission|couldn.t send/i)

    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})
