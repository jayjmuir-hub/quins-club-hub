import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit test for clearAvailability in src/data/availability.js. The supabase
// client is mocked; this proves the SHAPE of the delete call, not the RLS that
// governs it (that is db/tests/rls-availability-equivalence.sql).
vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '../src/lib/supabase.js'
import { clearAvailability } from '../src/data/availability.js'

// A chainable builder that records calls and resolves via `.then`, matching the
// pattern in tests/messages-data.test.js.
function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['delete', 'eq', 'select']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => supabase.from.mockReset())

describe('clearAvailability', () => {
  it('deletes the (event, player) row and returns the removed rows', async () => {
    const { b, calls } = builder({ data: [{ id: 'a1' }], error: null })
    supabase.from.mockReturnValue(b)

    const out = await clearAvailability('e-1', 'p-ana')

    expect(supabase.from).toHaveBeenCalledWith('availability')
    expect(calls.delete).toHaveLength(1)
    expect(calls.eq).toEqual([['event_id', 'e-1'], ['player_id', 'p-ana']])
    expect(out).toEqual([{ id: 'a1' }])
  })

  it('returns [] when the delete matched nothing (RLS refused or already gone)', async () => {
    const { b } = builder({ data: [], error: null })
    supabase.from.mockReturnValue(b)
    expect(await clearAvailability('e-1', 'p-ana')).toEqual([])
  })

  it('throws on a real PostgREST error', async () => {
    const { b } = builder({ data: null, error: new Error('boom') })
    supabase.from.mockReturnValue(b)
    await expect(clearAvailability('e-1', 'p-ana')).rejects.toThrow('boom')
  })

  it('throws without both ids, before touching supabase', async () => {
    await expect(clearAvailability('', 'p')).rejects.toThrow(/both an event id and a player id/)
    await expect(clearAvailability('e', '')).rejects.toThrow(/both an event id and a player id/)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
