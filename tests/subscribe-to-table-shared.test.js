import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import { resetSharedChannelsForTests, subscribeToTable } from '../src/data/subscribeToTable.js'
import { messageMatcher, subscribeMessages } from '../src/data/messages.js'

// One realtime channel per table, shared by every subscriber (5 Sep 2026).
// Before this a tab could hold six channels on `messages` alone, and the
// server evaluated every change once per channel per client. These tests pin
// the contract that makes sharing safe: one socket topic, every listener
// still hears every change, each keeps its own debounce and its own filter,
// and the channel goes away with the LAST subscriber — not the first.

function createChannel() {
  return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
}

beforeEach(() => {
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  resetSharedChannelsForTests()
})

describe('subscribeToTable — one channel per table', () => {
  it('a second subscriber to the same table reuses the channel and still hears every change', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const a = vi.fn()
    const b = vi.fn()

    subscribeToTable('events', a)
    subscribeToTable('events', b)

    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(channel.subscribe).toHaveBeenCalledTimes(1)

    const [, , fanOut] = channel.on.mock.calls[0]
    fanOut({ eventType: 'INSERT', new: { id: 'e1' }, old: {} })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('⚠️ the channel is removed by the LAST subscriber out, not the first', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const a = vi.fn()
    const b = vi.fn()

    const offA = subscribeToTable('events', a)
    const offB = subscribeToTable('events', b)
    const [, , fanOut] = channel.on.mock.calls[0]

    offA()
    // A is gone; the channel must still be up for B.
    expect(supabase.removeChannel).not.toHaveBeenCalled()
    fanOut({ eventType: 'UPDATE', new: { id: 'e1' }, old: {} })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)

    offB()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('after the last subscriber leaves, the next one opens a fresh channel', () => {
    const first = createChannel()
    const second = createChannel()
    supabase.channel.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const off = subscribeToTable('events', vi.fn())
    off()
    subscribeToTable('events', vi.fn())

    expect(supabase.channel).toHaveBeenCalledTimes(2)
    const [topicA] = supabase.channel.mock.calls[0]
    const [topicB] = supabase.channel.mock.calls[1]
    // A channel torn down and re-opened in the same tick must not collide
    // with the one still being removed.
    expect(topicA).not.toEqual(topicB)
  })

  it('a different filter is a different channel — availability per event', () => {
    supabase.channel.mockReturnValueOnce(createChannel()).mockReturnValueOnce(createChannel())

    subscribeToTable('availability', vi.fn(), { filter: 'event_id=eq.e-1', channelKey: 'e-1' })
    subscribeToTable('availability', vi.fn(), { filter: 'event_id=eq.e-2', channelKey: 'e-2' })

    expect(supabase.channel).toHaveBeenCalledTimes(2)
  })

  it('each subscriber keeps its own `match`: a filtered listener ignores what the shared channel hears', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const everything = vi.fn()
    const onlyMine = vi.fn()

    subscribeToTable('messages', everything)
    subscribeToTable('messages', onlyMine, { match: (p) => p.new?.conversation_id === 'c1' })
    const [, , fanOut] = channel.on.mock.calls[0]

    fanOut({ eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c2' }, old: {} })
    fanOut({ eventType: 'INSERT', new: { id: 'm2', conversation_id: 'c1' }, old: {} })

    expect(everything).toHaveBeenCalledTimes(2)
    expect(onlyMine).toHaveBeenCalledTimes(1)
  })

  it('each subscriber keeps its own debounce', () => {
    vi.useFakeTimers()
    try {
      const channel = createChannel()
      supabase.channel.mockReturnValue(channel)
      const immediate = vi.fn()
      const settled = vi.fn()

      subscribeToTable('messages', immediate)
      subscribeToTable('messages', settled, { debounceMs: 400 })
      const [, , fanOut] = channel.on.mock.calls[0]

      fanOut({})
      fanOut({})
      expect(immediate).toHaveBeenCalledTimes(2)
      expect(settled).not.toHaveBeenCalled()
      vi.advanceTimersByTime(400)
      expect(settled).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a listener that unsubscribes mid-fan-out does not break the others', () => {
    const channel = createChannel()
    supabase.channel.mockReturnValue(channel)
    const b = vi.fn()
    let offA
    offA = subscribeToTable('events', () => offA())
    subscribeToTable('events', b)
    const [, , fanOut] = channel.on.mock.calls[0]

    expect(() => fanOut({})).not.toThrow()
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe('messageMatcher — the thread filter fails OPEN', () => {
  const mine = messageMatcher((row) => row.conversation_id === 'c1')

  it('judges an INSERT or UPDATE by the row it carries', () => {
    expect(mine({ eventType: 'INSERT', new: { id: 'm', conversation_id: 'c1' }, old: {} })).toBe(true)
    expect(mine({ eventType: 'UPDATE', new: { id: 'm', conversation_id: 'c9' }, old: {} })).toBe(false)
  })

  it('⚠️ a DELETE carries no row and must trigger a re-read, or a removed message stays on screen', () => {
    expect(mine({ eventType: 'DELETE', new: {}, old: { id: 'm' } })).toBe(true)
    expect(mine({})).toBe(true)
    expect(mine(undefined)).toBe(true)
  })

  it('subscribeMessages threads `where` through as the matcher', () => {
    vi.useFakeTimers()
    try {
      const channel = createChannel()
      supabase.channel.mockReturnValue(channel)
      const cb = vi.fn()
      subscribeMessages(cb, { debounceMs: 0, where: (row) => row.team_id === 't1' })
      const [, , fanOut] = channel.on.mock.calls[0]
      fanOut({ eventType: 'INSERT', new: { id: 'm1', team_id: 't2' } })
      expect(cb).not.toHaveBeenCalled()
      fanOut({ eventType: 'INSERT', new: { id: 'm2', team_id: 't1' } })
      expect(cb).toHaveBeenCalledTimes(1)
      fanOut({ eventType: 'DELETE', new: {}, old: { id: 'm2' } })
      expect(cb).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
