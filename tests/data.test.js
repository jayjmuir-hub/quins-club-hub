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
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

// ⚠️ MOCKED BECAUSE `deletePlayer` NOW REACHES STORAGE, and the client mock
// above has no `storage` key — a real `deletePlayerPhoto` would throw on
// `supabase.storage.from` before it could swallow anything. Mocking it also
// makes the interesting assertion possible: that the photo is deleted with the
// key the deleted ROW carried, rather than one refetched afterwards from a row
// that no longer exists.
const deletePlayerPhotoMock = vi.fn().mockResolvedValue(true)
vi.mock('../src/data/photos.js', () => ({
  deletePlayerPhoto: (...args) => deletePlayerPhotoMock(...args),
}))

import { supabase } from '../src/lib/supabase.js'
import { MAX_ROWS, MAX_TOTAL_ROWS } from '../src/data/limits.js'
import {
  listEvents,
  subscribeEvents,
  upsertEvent,
  insertEvents,
  deleteEvent,
  countSeriesFrom,
  deleteSeriesFrom,
} from '../src/data/events.js'
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
  registerMyPlayer,
  approveMembership,
} from '../src/data/members.js'

// `count` is separate from `data` because a head:true count request resolves
// with { data: null, count, error } — the count arrives in its own field and a
// builder that only carried `data` could not express the shape countSeriesFrom
// actually reads.
function createQueryBuilder({ data = null, error = null, count = null } = {}) {
  const calls = { select: [], in: [], gte: [], lte: [], eq: [], order: [], limit: [], range: [], insert: [], update: [], delete: [], upsert: [] }
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
  // The row cap added 10 Aug 2026 (src/data/limits.js). Every list read now
  // ends in .limit(MAX_ROWS + 1) so a truncated answer cannot arrive looking
  // complete — see tests/limits.test.js for why the +1 is load-bearing.
  builder.limit = chain('limit')
  // ⚠️ `.range()` is what PAGED reads end in — added 10 Aug 2026 when
  // listEvents moved from one capped request to fetchAllPages. It returns the
  // same thenable builder, so a stub whose `data` is shorter than a page ends
  // the loop on the first pass, which is every test in this file. A stub
  // returning exactly a full page would page forever; none does, and
  // tests/limits.test.js drives the multi-page path against its own mock.
  builder.range = chain('range')
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
  builder.then = (resolve, reject) => Promise.resolve({ data, error, count }).then(resolve, reject)
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
  supabase.rpc.mockReset()
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  // ⚠️ `mockClear`, NOT `mockReset` — reset would drop the resolved value set
  // where it is declared and hand `deletePlayer` an undefined to await.
  deletePlayerPhotoMock.mockClear()
})

// --- listEvents -------------------------------------------------------

describe('listEvents', () => {
  it('queries events, orders by starts_at ascending, with no filters when called with no args', async () => {
    const rows = [{ id: 'e-1' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listEvents()

    expect(supabase.from).toHaveBeenCalledWith('events')
    // ⚠️ EVERY COLUMN, PLUS THE LEAGUE TEAM EMBEDDED (11 Aug 2026). It was a
    // bare '*' until then. The embed is what lets Schedule, the Dashboard, the
    // allocation grid and EventDetail all render fixtureLabel() off the row they
    // already have, instead of each issuing its own league_teams query and one
    // of them getting it wrong. PostgREST resolves it through the real foreign
    // key, so a fixture with a null league_team_id embeds null — which is
    // exactly what fixtureLabel treats as "not a league match".
    // ⚠️ The `*` must stay: dropping it would silently shorten every event row.
    expect(builder.select).toHaveBeenCalledWith(
      '*, league_team:league_teams(id, rcm_name, division)',
    )
    expect(calls.in).toEqual([])
    expect(calls.gte).toEqual([])
    expect(calls.lte).toEqual([])
    expect(builder.order).toHaveBeenCalledWith('starts_at', { ascending: true })
    // ⚠️ AND THE `id` TIEBREAK, which is load-bearing rather than tidiness.
    // The read is paged with .range() (OFFSET/LIMIT), and two events can share
    // a starts_at — a Saturday of age-group matches all at 09:00 is normal.
    // Without a unique final sort key Postgres may order those rows differently
    // between pages, returning one twice and dropping another silently.
    expect(builder.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(calls.range[0]).toEqual([0, 899])
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
      // ⚠️ NOT `callback` any more. Since 13 Aug 2026 the handler is a debounce
      // wrapper, so the raw callback is no longer what reaches Supabase. The
      // debouncing itself is asserted below; this line only pins the shape.
      expect.any(Function),
    )
    expect(channel.subscribe).toHaveBeenCalled()
    expect(typeof unsubscribe).toBe('function')
  })

  // ⚠️ NO `filter` KEY, AND THIS IS THE LOAD-BEARING ASSERTION OF THE THREE.
  // Adding `filter: team_id=in.(...)` reads as an obvious optimisation and is
  // a bug: `events` is replica identity DEFAULT, so a DELETE payload carries
  // the primary key only, the filter matches nothing, and a cancelled fixture
  // stops disappearing from other people's screens. RLS already scopes
  // delivery. This test is what stops somebody "improving" it.
  it('passes NO server-side filter — RLS scopes delivery, and a filter would drop deletes', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)

    subscribeEvents(vi.fn())

    const [, config] = channel.on.mock.calls[0]
    expect(config).not.toHaveProperty('filter')
  })

  it('coalesces a burst of changes into ONE callback', () => {
    vi.useFakeTimers()
    try {
      const channel = createChannel()
      supabase.channel.mockReturnValue(channel)
      const callback = vi.fn()

      subscribeEvents(callback, { debounceMs: 400 })
      const [, , onChange] = channel.on.mock.calls[0]

      onChange({})
      onChange({})
      onChange({})
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(400)
      // A coach saving three fixtures must cost every connected client ONE
      // refetch, not three.
      expect(callback).toHaveBeenCalledTimes(1)
      // The payload is deliberately not forwarded — a coalesced burst has no
      // single meaningful one, and callers only ever needed "go and re-read".
      expect(callback).toHaveBeenCalledWith()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fires again for a change arriving after the window', () => {
    vi.useFakeTimers()
    try {
      const channel = createChannel()
      supabase.channel.mockReturnValue(channel)
      const callback = vi.fn()

      subscribeEvents(callback, { debounceMs: 400 })
      const [, , onChange] = channel.on.mock.calls[0]

      onChange({})
      vi.advanceTimersByTime(400)
      onChange({})
      vi.advanceTimersByTime(400)

      // ⚠️ Not a formality: a debounce that latches would silently turn live
      // updates off again after the first one, which is the bug this whole
      // change exists to fix.
      expect(callback).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('unsubscribing cancels a pending callback', () => {
    vi.useFakeTimers()
    try {
      const channel = createChannel()
      supabase.channel.mockReturnValue(channel)
      const callback = vi.fn()

      const unsubscribe = subscribeEvents(callback, { debounceMs: 400 })
      const [, , onChange] = channel.on.mock.calls[0]

      onChange({})
      unsubscribe()
      vi.advanceTimersByTime(400)

      // ⚠️ The callback is a setState. Firing after unmount means an unmounted
      // Schedule refetches and stores into a component that is gone — the kind
      // of leak that only shows up as a console warning nobody reads.
      expect(callback).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

// --- insertEvents ---------------------------------------------------------

// Repeating events. Bulk-creating a term of training goes through ONE
// multi-row insert, so Postgres's implicit transaction makes a refusal
// all-or-nothing rather than leaving half a term created.
describe('insertEvents', () => {
  it('sends every row in a single insert call', async () => {
    const rows = [
      { team_id: 't1', type: 'training', starts_at: '2026-08-11T14:00:00.000Z', series_id: 's1' },
      { team_id: 't1', type: 'training', starts_at: '2026-08-13T14:00:00.000Z', series_id: 's1' },
    ]
    const saved = rows.map((row, i) => ({ ...row, id: `e${i}` }))
    const { builder, calls } = createQueryBuilder({ data: saved })
    supabase.from.mockReturnValue(builder)

    const result = await insertEvents(rows)

    expect(supabase.from).toHaveBeenCalledWith('events')
    // ONE call carrying the array — not one call per row. A loop of inserts
    // is exactly what this function exists to avoid.
    expect(builder.insert).toHaveBeenCalledTimes(1)
    expect(calls.insert[0][0]).toEqual(rows)
    expect(builder.select).toHaveBeenCalled()
    expect(result).toEqual(saved)
  })

  it('does not query at all for an empty or missing list', async () => {
    expect(await insertEvents([])).toEqual([])
    expect(await insertEvents(undefined)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('violates check constraint') })
    supabase.from.mockReturnValue(builder)

    await expect(insertEvents([{ team_id: 't1' }])).rejects.toThrow('violates check constraint')
  })

  it('throws when fewer rows come back than were sent (an RLS refusal)', async () => {
    // RLS filters rows out of RETURNING individually, so a short result is a
    // refusal even though PostgREST reports no error. Two sent, one back.
    const { builder } = createQueryBuilder({ data: [{ id: 'e0' }] })
    supabase.from.mockReturnValue(builder)

    await expect(insertEvents([{ team_id: 't1' }, { team_id: 'not-mine' }])).rejects.toThrow(
      /permission|not allowed|couldn.t save/i,
    )
  })

  it('throws when nothing comes back at all', async () => {
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(insertEvents([{ team_id: 't1' }])).rejects.toThrow(
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

// --- countSeriesFrom / deleteSeriesFrom -----------------------------------
//
// "Delete this and all later sessions" (Jay's ruling, 8 Aug 2026: FUTURE
// ONLY). The two halves are tested together because the pair is the feature:
// the count is what the confirm button promises, the delete is what actually
// happened, and the whole point is that the caller compares them.

describe('countSeriesFrom', () => {
  it('counts the series from this occurrence forward, without downloading the rows', async () => {
    const { builder, calls } = createQueryBuilder({ count: 13 })
    supabase.from.mockReturnValue(builder)

    const total = await countSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')

    expect(supabase.from).toHaveBeenCalledWith('events')
    // head:true — a COUNT, not a fetch of every row in the term.
    expect(calls.select[0]).toEqual(['id', { count: 'exact', head: true }])
    expect(calls.eq[0]).toEqual(['series_id', 's-1'])
    // ⚠️ gte, not gt: the occurrence being looked at goes too, which is what
    // the button says. And gte on starts_at, not on anything else — a filter
    // on the wrong column would count the whole series, past included.
    expect(calls.gte[0]).toEqual(['starts_at', '2026-08-11T14:00:00.000Z'])
    expect(total).toBe(13)
  })

  it('reports zero rather than null when the count comes back empty', async () => {
    const { builder } = createQueryBuilder({ count: null })
    supabase.from.mockReturnValue(builder)

    expect(await countSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')).toBe(0)
  })

  it('does not query at all without both a series and a start', async () => {
    expect(await countSeriesFrom(null, '2026-08-11T14:00:00.000Z')).toBe(0)
    expect(await countSeriesFrom('s-1', null)).toBe(0)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(countSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')).rejects.toThrow('network down')
  })
})

describe('deleteSeriesFrom', () => {
  it('deletes this occurrence and every later one in the series', async () => {
    const deleted = [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }]
    const { builder, calls } = createQueryBuilder({ data: deleted })
    supabase.from.mockReturnValue(builder)

    const rows = await deleteSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(builder.delete).toHaveBeenCalledTimes(1)
    expect(calls.eq[0]).toEqual(['series_id', 's-1'])
    expect(calls.gte[0]).toEqual(['starts_at', '2026-08-11T14:00:00.000Z'])
    // ⚠️ .select() is not decoration: without it PostgREST returns no rows
    // and the caller cannot tell a full delete from a partial one.
    expect(builder.select).toHaveBeenCalled()
    expect(rows).toEqual(deleted)
  })

  it('never filters on group_id — the multi-squad delete was deferred', async () => {
    // Jay deferred deleting across squads on 8 Aug 2026. A group_id filter
    // creeping in here would silently widen the blast radius from one
    // squad's term to every squad that shared the session.
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'e-1' }] })
    supabase.from.mockReturnValue(builder)

    await deleteSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')

    expect(calls.eq.map(([column]) => column)).toEqual(['series_id'])
  })

  it('hands back the rows it actually deleted, not a boolean', async () => {
    // The caller counts them against what it told the user it would delete.
    // RLS filters refused rows out of the statement without raising, so a
    // short result is the only evidence a partial delete ever leaves.
    const { builder } = createQueryBuilder({ data: [{ id: 'e-1' }, { id: 'e-2' }] })
    supabase.from.mockReturnValue(builder)

    const rows = await deleteSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')
    expect(rows).toHaveLength(2)
  })

  it('throws the Supabase error rather than returning a tuple', async () => {
    const { builder } = createQueryBuilder({ error: new Error('network down') })
    supabase.from.mockReturnValue(builder)

    await expect(deleteSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')).rejects.toThrow('network down')
  })

  it('throws when nothing was deleted at all (a flat RLS refusal)', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(deleteSeriesFrom('s-1', '2026-08-11T14:00:00.000Z')).rejects.toThrow(
      /permission|not allowed|couldn.t delete/i,
    )
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

  // ⚠️ THE WIRING, not the helper. tests/limits.test.js proves unwrapCapped
  // behaves; these prove listPlayers/listEvents actually GO THROUGH it. Both
  // could pass there while these two functions still returned a silently
  // truncated list — which is the only failure that would matter.
  describe('the row cap', () => {
    // ⚠️ PLAYERS NO LONGER CAPS - IT PAGES. Changed 12 Aug 2026, exactly as
    // listEvents did on 10 Aug and for the same reason. This test used to
    // assert `.limit(MAX_ROWS + 1)`. The flat cap was right in principle - a
    // short list that looks complete is worse than an error - and wrong in
    // practice: Accounts, AdminClub and InviteForm all call listPlayers() with
    // NO teamIds on purpose, so they ask for every player in the club, and
    // "too many players" is not something a person can act on.
    // The guarantee is unchanged: everything, or a throw, never some of it.
    it('pages players rather than capping them', async () => {
      const { builder, calls } = createQueryBuilder({ data: [] })
      supabase.from.mockReturnValue(builder)

      await listPlayers()

      expect(calls.limit).toEqual([])
      expect(calls.range).toEqual([[0, MAX_ROWS - 1]])
    })

    // ⚠️ `id` IS THE TIEBREAK AND IT IS LOAD-BEARING, NOT TIDINESS. `.range()`
    // is OFFSET/LIMIT and `full_name` is NOT unique - two players called Sam
    // Ahmed is ordinary, and this club deliberately holds no squad numbers to
    // tell them apart. Under-specify the sort and Postgres may order those rows
    // differently between two pages: one player returned twice, another dropped,
    // no error anywhere. The same trap listEvents documents for two fixtures
    // sharing a kick-off time.
    it('⚠️ pages by a sort that ENDS IN A UNIQUE COLUMN', async () => {
      const { builder, calls } = createQueryBuilder({ data: [] })
      supabase.from.mockReturnValue(builder)

      await listPlayers()

      expect(calls.order).toEqual([
        ['full_name', { ascending: true }],
        ['id', { ascending: true }],
      ])
    })

    it('FAULT: throws rather than handing back a truncated roster', async () => {
      // One row over the cap: the server had more players than we asked for,
      // so this list is not the whole club. A child missing from a roster that
      // looks complete is the thing being prevented.
      const tooMany = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: `p${i}` }))
      const { builder } = createQueryBuilder({ data: tooMany })
      supabase.from.mockReturnValue(builder)

      await expect(listPlayers()).rejects.toThrow(/too many players/i)
    })

    // ⚠️ AN EXACTLY-FULL PAGE IS AMBIGUOUS AND COSTS ONE MORE REQUEST. This
    // stub returns a full page EVERY time, which is what an endless list looks
    // like from inside fetchAllPages - so what is really being pinned here is
    // that the backstop exists and the loop terminates. It used to assert the
    // opposite (that exactly MAX_ROWS resolved), which was correct for a cap
    // and is meaningless for a pager.
    it('⚠️ does not loop forever on a page that is always full', async () => {
      const fullPage = Array.from({ length: MAX_ROWS }, (_, i) => ({ id: `p${i}` }))
      const { builder } = createQueryBuilder({ data: fullPage })
      supabase.from.mockReturnValue(builder)

      await expect(listPlayers()).rejects.toThrow(/too many players/i)
    })

    // ⚠️ EVENTS NO LONGER CAPS — IT PAGES. Changed 10 Aug 2026. This test used
    // to assert that listEvents THREW above MAX_ROWS. That refusal was right in
    // principle (a short list that looks complete is worse than an error) and
    // wrong in practice: an admin viewing all fifteen squads over the default
    // 18-month window is ~1,690 rows, so the cap turned Schedule into an error
    // screen with no action that fixed it. The guarantee is unchanged —
    // everything, or a throw, never some of it.
    it('⚠️ pages events instead of refusing, and the loop still terminates', async () => {
      // A stub that NEVER runs out: every page comes back full, which is what
      // an infinite loop looks like from inside fetchAllPages. The backstop is
      // the only thing that ends this, so this test is really about the
      // backstop existing at all.
      const fullPage = Array.from({ length: MAX_ROWS }, (_, i) => ({ id: `e${i}` }))
      const { builder, calls } = createQueryBuilder({ data: fullPage })
      supabase.from.mockReturnValue(builder)

      await expect(listEvents()).rejects.toThrow(/too many events/i)
      // It really did page rather than giving up after one request, and it
      // stopped at the ceiling rather than running away.
      expect(calls.range.length).toBeGreaterThan(1)
      expect(calls.range.length).toBeLessThanOrEqual(Math.ceil(MAX_TOTAL_ROWS / MAX_ROWS) + 1)
      expect(calls.limit).toEqual([])
    })

    it('does not refuse a list that would have tripped the old 900 cap', async () => {
      // The regression that motivated the change: 901 rows used to be an error
      // screen. A short second page ends the loop.
      let call = 0
      const { builder } = createQueryBuilder({ data: [] })
      builder.range = vi.fn(() => {
        call += 1
        const data = call === 1 ? Array.from({ length: MAX_ROWS }, (_, i) => ({ id: `e${i}` })) : [{ id: 'e900' }]
        return { then: (resolve) => Promise.resolve({ data, error: null }).then(resolve) }
      })
      supabase.from.mockReturnValue(builder)

      await expect(listEvents()).resolves.toHaveLength(MAX_ROWS + 1)
    })
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

  // ⚠️ UNTIL 16 Aug 2026 THE PHOTO WAS SIMPLY LEFT BEHIND, so a deleted child's
  // photograph outlived their record indefinitely in a private bucket with
  // nothing pointing at it. A storage object cannot be a cascade — SQL is
  // refused outright by `protect_delete` — so the client has to do it.
  it('deletes the photo object too', async () => {
    const { builder } = createQueryBuilder({
      data: [{ id: 'p-1', photo_path: 'p-1/1699999999999.jpg' }],
    })
    supabase.from.mockReturnValue(builder)

    await deletePlayer('p-1')

    expect(deletePlayerPhotoMock).toHaveBeenCalledWith('p-1/1699999999999.jpg')
  })

  // ⚠️ THE KEY COMES FROM THE DELETED ROW, WHICH IS THE ONLY PLACE IT CAN. Once
  // the row is gone there is nothing left to look it up from — this is why the
  // delete carries `.select()` rather than being fire-and-forget.
  it('takes the key from the row it just deleted', async () => {
    const { builder, calls } = createQueryBuilder({
      data: [{ id: 'p-1', photo_path: 'p-1/1.jpg' }],
    })
    supabase.from.mockReturnValue(builder)

    await deletePlayer('p-1')

    expect(builder.select).toHaveBeenCalled()
    expect(calls.eq[0]).toEqual(['id', 'p-1'])
    expect(deletePlayerPhotoMock).toHaveBeenCalledWith('p-1/1.jpg')
  })

  it('does not call storage for a player with no photo', async () => {
    const { builder } = createQueryBuilder({ data: [{ id: 'p-1', photo_path: null }] })
    supabase.from.mockReturnValue(builder)

    await deletePlayer('p-1')

    expect(deletePlayerPhotoMock).not.toHaveBeenCalled()
  })

  // ⚠️ THE ROW GOES FIRST AND THE OBJECT SECOND. On a refusal there is nothing
  // to clean up and the photo must SURVIVE — deleting it after a refused row
  // delete would destroy a photograph belonging to a player who is still on the
  // roster, which is the worst outcome available here.
  it('leaves the photo alone when the row delete is refused', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(deletePlayer('p-1')).rejects.toThrow()
    expect(deletePlayerPhotoMock).not.toHaveBeenCalled()
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
  it('embeds the profile columns the Edit person sheet edits, plus teams and players', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listClubMembers()

    expect(supabase.from).toHaveBeenCalledWith('memberships')
    // ⚠️ first_name, last_name and phone added 9 Aug 2026. They were already
    // WRITABLE by an admin — the column grants from 8 Aug list them — but the
    // screen had no way to READ them, so it edited the legacy `full_name` and
    // had no phone control at all. A regression to the old embed leaves the
    // sheet's fields blank and, worse, saving then writes those blanks back.
    expect(builder.select).toHaveBeenCalledWith(
      '*, profiles(full_name, first_name, last_name, email, phone), teams(name), players(full_name)',
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

  it('refuses a role outside the set the database allows', async () => {
    await expect(
      // Was 'manager' until 5 Aug 2026, when 'manager' became a REAL role
      // (Team Manager) and this anchor rotted — the call started succeeding
      // and the test failed for the wrong reason. Repointed at a value that
      // is not a role and is not going to become one.
      updateMembershipRole({ membershipId: 'm-1', role: 'chairman', teamId: 't-12' }),
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

    // ⚠️ `playerId` ADDED 14 Aug 2026, AND IT IS INCIDENTAL TO WHAT THIS TEST
    // IS ABOUT. A `parent` row must now name a player — the database enforces
    // it via memberships_family_role_needs_player — so the old call is refused
    // before it ever reaches an insert. The assertion below is unchanged and
    // still about the `id` column; the player is here only to make the call
    // legal. The rule itself is tested in the grantMembership block further
    // down and in db/tests/family-role-needs-player.sql.
    await grantMembership({
      profileId: 'pr-new',
      clubId: 'c-1',
      role: 'parent',
      teamId: 't-12',
      playerId: 'p-1',
    })

    expect(calls.insert[0][0]).not.toHaveProperty('id')
  })

  // ⚠️ THE RULE ITSELF, AT THE DATA LAYER. Jay, 14 Aug 2026: "nobody outside
  // staff should be able to create an account without a player". The database
  // is what enforces it; this exists so an admin reads a sentence rather than a
  // raw 23514 naming a constraint.
  it.each([
    ['parent', /child this parent is responsible for/i],
    ['player', /player this account belongs to/i],
  ])('refuses a %s row with no player, in words', async (role, expected) => {
    const { builder } = createQueryBuilder({ data: { id: 'm-new' } })
    supabase.from.mockReturnValue(builder)

    await expect(
      grantMembership({ profileId: 'pr-new', clubId: 'c-1', role, teamId: 't-12' }),
    ).rejects.toThrow(expected)
    // Refused before any request goes out — a round trip to be told what we
    // already knew is a round trip on a pitch-side connection.
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it.each(['coach', 'manager', 'medic'])('still allows a %s row with no player', async (role) => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'm-new' } })
    supabase.from.mockReturnValue(builder)

    // A coach is not anybody's parent. Naming every staff role rather than
    // saying "not parent" is what would catch a future role being added to the
    // wrong side of the rule.
    await grantMembership({ profileId: 'pr-new', clubId: 'c-1', role, teamId: 't-12' })
    expect(calls.insert[0][0].player_id).toBeNull()
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

  it('refuses a role outside the set the database allows', async () => {
    await expect(
      // See the note on updateMembershipRole above: 'manager' is a real role
      // as of 5 Aug 2026, so this anchor was repointed rather than removed.
      grantMembership({ profileId: 'pr-new', clubId: 'c-1', role: 'chairman', teamId: 't-12' }),
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

// The multi-access grant (claude/specs/2026-08-03-multi-access-design.md).
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
      grantMemberships([{ profileId: 'pr-1', clubId: 'c-1', role: 'chairman', teamId: 't-u14' }]),
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

  // The rule that used to be the `invites_team_required_unless_admin` CHECK
  // constraint. That constraint is gone; accept_invite raises on this shape
  // instead, but only when the INVITEE clicks the link — far too late for
  // anyone to fix it. So the data layer refuses it up front, as a backstop
  // behind InviteForm's own (better-worded) refusal.
  it('refuses a non-admin invite with no team and no targets before creating anything', async () => {
    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'coach@example.com',
        role: 'coach',
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(/no age group|age group/i)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('still allows an admin invite with no team and no targets', async () => {
    const { builder } = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    supabase.from.mockReturnValue(builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'newadmin@example.com',
        role: 'admin',
        createdBy: 'user-1',
      }),
    ).resolves.toMatchObject({ id: 'inv-1' })
  })

  it('still allows a targetless invite that carries a legacy team id', async () => {
    const { builder } = createQueryBuilder({ data: { id: 'inv-1', token: 'tok' } })
    supabase.from.mockReturnValue(builder)

    await expect(
      createInvite({
        clubId: 'club-1',
        email: 'coach@example.com',
        role: 'coach',
        teamId: 't-u10',
        createdBy: 'user-1',
      }),
    ).resolves.toMatchObject({ id: 'inv-1' })
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

// --- registerMyPlayer -------------------------------------------------
//
// Parent self-registration (8 Aug 2026, spec
// claude/decisions/2026-08-08-parent-self-registration.md). This is the one
// function in this module that turns a Postgres error into a sentence rather
// than re-throwing it, so its tests are about the MAPPING as much as the
// query.

describe('registerMyPlayer', () => {
  it('calls the RPC with exactly the six parameters it takes, and returns the pending row', async () => {
    const membership = {
      id: 'mm-1',
      profile_id: 'user-1',
      team_id: 't-u13',
      role: 'parent',
      status: 'pending',
    }
    supabase.rpc.mockResolvedValue({ data: membership, error: null })

    const result = await registerMyPlayer('Sam Muir', 't-u13')

    // ⚠️ FOUR ARGUMENTS, AND THE ABSENT ONES ARE STILL THE POINT. There is
    // no club id (it is derived from the team server-side, so a caller cannot
    // point the membership at a different club from the player) and no email
    // (it is read from auth.users, so a typed address is never evidence).
    // Asserting the exact object is what stops either being added later
    // without somebody having to justify it.
    //
    // p_gender arrived 9 Aug 2026 and is NULL here on purpose: the caller
    // passed none, and the function requires one only when the SQUAD is
    // single-gender. Sending undefined instead would drop the key and change
    // which Postgres overload PostgREST resolves.
    //
    // p_self_register arrived 11 Aug 2026 and is FALSE here for the same
    // reason: the caller passed none, and false is what every pre-existing
    // caller meant. ⚠️ It must be sent as a real boolean rather than omitted —
    // the squad, not this flag, decides whether it is permitted, and the
    // function refuses a true it is not entitled to.
    //
    // p_confirm_duplicate / p_confirm_self_name arrived 14 Aug 2026 and are
    // FALSE here for the same reason again: the caller passed no overrides, and
    // false is what every pre-existing caller meant. ⚠️ THEY ARE TWO KEYS AND
    // MUST STAY TWO. A single "confirmed" flag would mean that agreeing "this
    // is a different child who happens to share the name" also waved through
    // "I am registering myself as my own child" — different mistakes, different
    // sentences, and a tick may only forgive the one it was shown.
    expect(supabase.rpc).toHaveBeenCalledWith('register_my_player', {
      p_full_name: 'Sam Muir',
      p_team_id: 't-u13',
      p_gender: null,
      p_self_register: false,
      p_confirm_duplicate: false,
      p_confirm_self_name: false,
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(result).toEqual(membership)
  })

  // ⚠️ THE MAPPING IS KEYED ON error.code, NEVER ON MESSAGE TEXT. Each case
  // below therefore ships a DELIBERATELY WRONG message alongside the right
  // code: if anything ever starts matching on prose, these fail, because the
  // prose here says nothing the mapping could match on.
  const CASES = [
    ['42501', 'unconfirmed email', /confirm your email/i],
    ['22023', 'blank name, over-long name, or unknown team', /name is filled in|age group/i],
    ['42901', 'five already pending', /waiting to be approved/i],
  ]

  it.each(CASES)('maps %s (%s) to a human sentence', async (code, _why, expected) => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'raw postgres text nobody should be matching on' },
    })

    await expect(registerMyPlayer('Sam Muir', 't-u13')).rejects.toThrow(expected)
  })

  it('keeps the code on the thrown error, so a caller can branch without reading words', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42901', message: 'too many' } })

    await expect(registerMyPlayer('Sam Muir', 't-u13')).rejects.toMatchObject({ code: '42901' })
  })

  // A code the mapping has never heard of — a constraint violation, a
  // connection reset, a future raise. Falling back to Postgres's own message
  // is better than a generic apology: it is at least true, and it is what
  // gets pasted into a support message.
  it('falls back to the database message for an unmapped code', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    await expect(registerMyPlayer('Sam Muir', 't-u13')).rejects.toThrow(/duplicate key/i)
  })

  // ⚠️ 42710 AND 42809 ARE DELIBERATELY UNMAPPED TOO — 14 Aug 2026, the
  // duplicate guards. Same reasoning as 22004 below: the server's sentence
  // names the squad and tells the person what to do instead ("choose 'I am the
  // player'"), and a generic entry in REGISTER_MESSAGES would replace exactly
  // the part that makes the refusal actionable. The CODE still has to survive,
  // because PlayerRegistrationForm branches on it to decide WHICH tick to
  // offer — a duplicate and a self-name mistake get different wording.
  it.each([
    ['42710', 'Someone with that name is already registered in U18B Contact.'],
    ['42809', 'That is your own name, but you have said you are registering a child.'],
  ])('passes the %s guard message through verbatim, and keeps the code', async (code, message) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code, message } })

    await expect(registerMyPlayer('Sam Muir', 't-u13')).rejects.toMatchObject({
      code,
      message,
    })
  })

  // ⚠️ 22004 IS DELIBERATELY UNMAPPED, AND THIS IS THE TEST THAT SAYS SO.
  //
  // The gender-required guard raises its own code precisely so its server
  // message — which NAMES THE SQUAD — falls through to the database text above
  // and reaches the parent intact. Lumping it in with 22023 would replace it
  // with a generic sentence about names and age groups, throwing away the only
  // part that explains why a field they ignored a moment ago now matters.
  it('passes the single-gender message through verbatim, squad name and all', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '22004',
        message: "U16G Contact is a single-gender squad, so the player's gender has to be recorded.",
      },
    })

    await expect(registerMyPlayer('Sam Muir', 't-u16g', null)).rejects.toThrow(
      /U16G Contact is a single-gender squad/i,
    )
  })

  it('sends the gender when one is given', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'mm-1', status: 'pending' }, error: null })

    await registerMyPlayer('Amara Bello', 't-u16g', 'female')

    expect(supabase.rpc).toHaveBeenCalledWith('register_my_player', {
      p_full_name: 'Amara Bello',
      p_team_id: 't-u16g',
      p_gender: 'female',
      p_self_register: false,
      p_confirm_duplicate: false,
      p_confirm_self_name: false,
    })
  })

  // ⚠️ THE FLAG IS COERCED, NOT FORWARDED. PostgREST resolves the overload from
  // the JSON types it is sent, so a truthy string like 'yes' arriving here from
  // a careless caller must still leave as a boolean. `selfRegister === true` in
  // members.js is what does it, and this is the test that would notice if
  // somebody simplified it to a bare pass-through.
  it.each([
    ['a real true', true, true],
    ['a truthy string', 'yes', false],
    ['undefined', undefined, false],
  ])('sends p_self_register as a boolean for %s', async (_why, given, expected) => {
    supabase.rpc.mockResolvedValue({ data: { id: 'mm-1', status: 'pending' }, error: null })

    await registerMyPlayer('Sam Reid', 't-u18b', 'male', given)

    expect(supabase.rpc).toHaveBeenCalledWith(
      'register_my_player',
      expect.objectContaining({ p_self_register: expected }),
    )
  })

  // ⚠️ 0A000 IS DELIBERATELY ABSENT FROM REGISTER_MESSAGES, exactly like 22004.
  // The function's own sentence names the squad ("Players in U10 Mixed Contact
  // cannot register themselves…"), and it only reaches the person because no
  // entry here replaces it. If someone adds a 0A000 entry to the map, this
  // fails — which is the point.
  it('passes the self-registration refusal through verbatim, naming the squad', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '0A000',
        message: 'Players in U10 Mixed Contact cannot register themselves — a parent or carer has to do it.',
      },
    })

    await expect(registerMyPlayer('Kid Name', 't-u10', null, true)).rejects.toThrow(
      /U10 Mixed Contact cannot register themselves/,
    )
  })
})

// --- approveMembership ------------------------------------------------

describe('approveMembership', () => {
  // ⚠️ AN RPC SINCE 9 Aug 2026, NOT A TABLE UPDATE. Jay asked for coaches and
  // team managers to approve for their own age groups. The obvious way is to
  // widen the `memb manage` policy — but it is `FOR ALL`, and RLS grants ROWS
  // NOT COLUMNS, so that would also hand every coach role changes (including
  // to admin), squad reassignment and revocation. public.approve_membership is
  // SECURITY DEFINER with `status` as a literal in its SET list, so there is no
  // parameter through which anything else can be written.
  it('calls the RPC with the membership id and nothing else', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'mm-1', status: 'active' }, error: null })

    const result = await approveMembership('mm-1')

    expect(supabase.rpc).toHaveBeenCalledWith('approve_membership', {
      p_membership_id: 'mm-1',
    })
    // ⚠️ NEVER THE TABLE. If this ever goes red because someone "simplified"
    // it back to .from('memberships').update(...), the approval works only for
    // admins again — silently, because a coach's UPDATE matches zero rows and
    // PostgREST reports that as a success.
    expect(supabase.from).not.toHaveBeenCalled()
    expect(result).toEqual({ id: 'mm-1', status: 'active' })
  })

  // The RPC RAISES on refusal rather than matching zero rows, and its sentence
  // is written for the person reading it, so it is passed through untouched.
  it('passes the database refusal through verbatim', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'You can only approve players for your own age groups.' },
    })

    await expect(approveMembership('mm-1')).rejects.toThrow(/your own age groups/i)
  })

  it('keeps the code on the thrown error', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '42704', message: 'That registration no longer exists.' },
    })

    await expect(approveMembership('mm-1')).rejects.toMatchObject({ code: '42704' })
  })

  it('refuses to call at all without a membership id', async () => {
    await expect(approveMembership(undefined)).rejects.toThrow(/needs a membershipId/i)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
