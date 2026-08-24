import { describe, it, expect, vi, beforeEach } from 'vitest'

// Round 4 data layer (claude/plans/2026-08-24-chat-round-4.md): pinning
// through the RPC (never a table update — the grants.sql §4 trap), and the
// stars CRUD. Who may is the database's (db/tests/chat-round-4.sql).

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import { listMyStarredMessages, listMyStars, setPinned, toggleStar } from '../src/data/messages.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['select', 'is', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('setPinned', () => {
  it('goes through the RPC — never a table update', async () => {
    supabase.rpc.mockResolvedValue({ error: null })
    await setPinned('m1', true)
    expect(supabase.rpc).toHaveBeenCalledWith('set_message_pinned', { _message: 'm1', _pinned: true })
    // ⚠️ The whole point: a table update would ride the (body, pinned,
    // deleted_at) column grant. If this assertion ever fails, read
    // db/migrations/20260824_chat_round_4.sql before "fixing" it.
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('stars', () => {
  it('listMyStars returns a Set of message ids', async () => {
    const q = builder({ data: [{ message_id: 'm1' }, { message_id: 'm2' }], error: null })
    supabase.from.mockReturnValue(q.b)
    const stars = await listMyStars()
    expect(stars).toEqual(new Set(['m1', 'm2']))
  })

  it('toggleStar inserts with the owner and deletes by message', async () => {
    const ins = builder({ error: null })
    supabase.from.mockReturnValue(ins.b)
    await toggleStar('me-1', 'm1', true)
    expect(ins.calls.insert[0][0]).toEqual({ owner_id: 'me-1', message_id: 'm1' })

    const del = builder({ error: null })
    supabase.from.mockReturnValue(del.b)
    await toggleStar('me-1', 'm1', false)
    expect(del.calls.delete).toHaveLength(1)
    expect(del.calls.eq[0]).toEqual(['message_id', 'm1'])
  })

  it('listMyStarredMessages keeps star order and drops unreadable messages', async () => {
    const stars = builder({ data: [{ message_id: 'm2', created_at: '2' }, { message_id: 'm1', created_at: '1' }, { message_id: 'gone', created_at: '0' }], error: null })
    const msgs = builder({ data: [{ id: 'm1', body: 'first' }, { id: 'm2', body: 'second' }], error: null })
    supabase.from.mockReturnValueOnce(stars.b).mockReturnValueOnce(msgs.b)
    const rows = await listMyStarredMessages()
    expect(rows.map((r) => r.id)).toEqual(['m2', 'm1'])
  })
})
