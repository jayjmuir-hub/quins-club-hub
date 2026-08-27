import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '../src/lib/supabase.js'
import { setAvailabilityOverride } from '../src/data/events.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['update', 'eq', 'select', 'maybeSingle']) {
    b[name] = vi.fn((...args) => { ;(calls[name] ??= []).push(args); return b })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => supabase.from.mockReset())

describe('setAvailabilityOverride', () => {
  it('updates only availability_override on the event and returns the row', async () => {
    const { b, calls } = builder({ data: { id: 'e-1', availability_override: 'open' }, error: null })
    supabase.from.mockReturnValue(b)

    const out = await setAvailabilityOverride('e-1', 'open')

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(calls.update).toEqual([[{ availability_override: 'open' }]])
    expect(calls.eq).toEqual([['id', 'e-1']])
    expect(out).toEqual({ id: 'e-1', availability_override: 'open' })
  })

  it('throws when RLS refuses (no row back)', async () => {
    const { b } = builder({ data: null, error: null })
    supabase.from.mockReturnValue(b)
    await expect(setAvailabilityOverride('e-1', 'locked')).rejects.toThrow(/permission/i)
  })

  it('throws on a real error', async () => {
    const { b } = builder({ data: null, error: new Error('boom') })
    supabase.from.mockReturnValue(b)
    await expect(setAvailabilityOverride('e-1', 'auto')).rejects.toThrow('boom')
  })

  it('throws without an event id, before touching supabase', async () => {
    await expect(setAvailabilityOverride('', 'open')).rejects.toThrow(/event id/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
