import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for src/data/messages.js (squad chat, phase 1). The supabase
// client is mocked; this proves the SHAPE of each call — what is sent, what
// is deliberately NOT sent, and how the two-query stream is stitched. The
// policies that decide who may do any of it are db/tests/squad-chat.sql.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  getChannelSettings,
  listMessages,
  markMessagesRead,
  messageReadStats,
  postMessage,
  removeMessage,
  replyToMessage,
  setAnnounceOnly,
  subscribeMessages,
} from '../src/data/messages.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['select', 'is', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'single', 'maybeSingle']) {
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
  supabase.channel.mockReset()
})

describe('listMessages', () => {
  it('reads the last N posts for a squad, then their replies, and returns oldest-first with replies attached', async () => {
    const heads = builder({
      data: [
        { id: 'p2', created_at: '2026-08-23T09:00:00Z' },
        { id: 'p1', created_at: '2026-08-23T08:00:00Z' },
      ],
      error: null,
    })
    const replies = builder({
      data: [
        { id: 'r1', parent_id: 'p1', created_at: '2026-08-23T08:10:00Z' },
        { id: 'r2', parent_id: 'p1', created_at: '2026-08-23T08:20:00Z' },
      ],
      error: null,
    })
    supabase.from.mockReturnValueOnce(heads.b).mockReturnValueOnce(replies.b)

    const rows = await listMessages('team-a', { limit: 20 })

    expect(heads.calls.is[0]).toEqual(['parent_id', null])
    expect(heads.calls.eq[0]).toEqual(['team_id', 'team-a'])
    expect(heads.calls.order[0]).toEqual(['created_at', { ascending: false }])
    expect(heads.calls.limit[0]).toEqual([20])
    expect(replies.calls.in[0]).toEqual(['parent_id', ['p2', 'p1']])

    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2'])
    expect(rows[0].replies.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(rows[1].replies).toEqual([])
  })

  it('reads the club-wide channel with team_id IS NULL, not eq', async () => {
    const heads = builder({ data: [], error: null })
    supabase.from.mockReturnValueOnce(heads.b)

    await listMessages(null)

    expect(heads.calls.is).toEqual([['parent_id', null], ['team_id', null]])
    expect(heads.calls.eq).toBeUndefined()
  })

  it('skips the reply query when there are no posts', async () => {
    supabase.from.mockReturnValueOnce(builder({ data: [], error: null }).b)
    expect(await listMessages('team-a')).toEqual([])
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

describe('writes', () => {
  // ⚠️ THE LOAD-BEARING ASSERTION. club_id and author_id are stamped by a
  // trigger; a client that sent them would be a client that LOOKS like it can
  // set them. author_role/author_title likewise.
  it('postMessage sends team_id and body only', async () => {
    const { b, calls } = builder({ data: { id: 'p1' }, error: null })
    supabase.from.mockReturnValue(b)

    await postMessage('team-a', '  Training moves to pitch 3.  ')

    expect(calls.insert[0]).toEqual([{ team_id: 'team-a', body: 'Training moves to pitch 3.' }])
  })

  it('postMessage to the club sends team_id null', async () => {
    const { b, calls } = builder({ data: { id: 'p1' }, error: null })
    supabase.from.mockReturnValue(b)
    await postMessage(null, 'Hello club')
    expect(calls.insert[0][0]).toEqual({ team_id: null, body: 'Hello club' })
  })

  it('replyToMessage sends parent_id and body only — team_id is inherited by the trigger', async () => {
    const { b, calls } = builder({ data: { id: 'r1' }, error: null })
    supabase.from.mockReturnValue(b)
    await replyToMessage('p1', 'Is there a bus?')
    expect(calls.insert[0]).toEqual([{ parent_id: 'p1', body: 'Is there a bus?' }])
  })

  it('refuses an empty body before touching the network', async () => {
    await expect(postMessage('team-a', '   ')).rejects.toThrow(/write something/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('removeMessage is a soft delete: an UPDATE setting deleted_at, never a DELETE', async () => {
    const { b, calls } = builder({ data: null, error: null })
    supabase.from.mockReturnValue(b)
    await removeMessage('p1')
    expect(calls.update[0][0]).toEqual({ deleted_at: expect.any(String) })
    expect(calls.eq[0]).toEqual(['id', 'p1'])
    expect(b.delete).toBeUndefined()
  })

  it('surfaces the database error', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: { message: 'new row violates row-level security policy' } }).b)
    await expect(postMessage('team-a', 'x')).rejects.toMatchObject({ message: /row-level security/ })
  })
})

describe('channel settings', () => {
  it('treats an absent row as announce-only ON', async () => {
    supabase.from.mockReturnValue(builder({ data: null, error: null }).b)
    expect(await getChannelSettings('team-a')).toMatchObject({ team_id: 'team-a', announce_only: true })
  })

  it('returns the row when there is one', async () => {
    supabase.from.mockReturnValue(builder({ data: { team_id: 'team-a', announce_only: false }, error: null }).b)
    expect(await getChannelSettings('team-a')).toMatchObject({ announce_only: false })
  })

  it('the club channel is always announce-only and never queried', async () => {
    expect(await getChannelSettings(null)).toMatchObject({ announce_only: true })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('setAnnounceOnly upserts on team_id with the caller as updated_by', async () => {
    const { b, calls } = builder({ data: null, error: null })
    supabase.from.mockReturnValue(b)
    await setAnnounceOnly('team-a', 'club-1', 'coach-1', false)
    expect(calls.upsert[0][0]).toMatchObject({ team_id: 'team-a', club_id: 'club-1', announce_only: false, updated_by: 'coach-1' })
    expect(calls.upsert[0][1]).toEqual({ onConflict: 'team_id' })
  })
})

describe('read receipts', () => {
  it('markMessagesRead upserts ignoring duplicates and never throws', async () => {
    const { b, calls } = builder({ data: null, error: { message: 'boom' } })
    supabase.from.mockReturnValue(b)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(markMessagesRead('me', ['p1', 'p2'])).resolves.toBeUndefined()

    expect(calls.upsert[0][0]).toEqual([
      { message_id: 'p1', profile_id: 'me' },
      { message_id: 'p2', profile_id: 'me' },
    ])
    expect(calls.upsert[0][1]).toEqual({ onConflict: 'message_id,profile_id', ignoreDuplicates: true })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('messageReadStats calls the RPC and maps rows, coercing bigint strings', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ message_id: 'p1', reads: '18', audience: '27' }], error: null })
    const stats = await messageReadStats('team-a')
    expect(supabase.rpc).toHaveBeenCalledWith('message_read_stats', { _team: 'team-a' })
    expect(stats.get('p1')).toEqual({ reads: 18, audience: 27 })
  })

  it('messageReadStats for the club channel returns empty without a call', async () => {
    expect((await messageReadStats(null)).size).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('subscribeMessages', () => {
  function channel() {
    return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  }

  it('subscribes to postgres_changes on messages with NO filter, and coalesces a burst', () => {
    vi.useFakeTimers()
    try {
      const ch = channel()
      supabase.channel.mockReturnValue(ch)
      const cb = vi.fn()

      const unsubscribe = subscribeMessages(cb, { debounceMs: 400 })
      const [event, config, onChange] = ch.on.mock.calls[0]
      expect(event).toBe('postgres_changes')
      expect(config).toEqual({ event: '*', schema: 'public', table: 'messages' })
      expect(config).not.toHaveProperty('filter')

      onChange({})
      onChange({})
      vi.advanceTimersByTime(400)
      expect(cb).toHaveBeenCalledTimes(1)

      unsubscribe()
      expect(supabase.removeChannel).toHaveBeenCalledWith(ch)
    } finally {
      vi.useRealTimers()
    }
  })
})
