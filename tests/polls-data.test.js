import { describe, it, expect, vi, beforeEach } from 'vitest'

// Poll data layer (src/data/polls.js): the SHAPE of each call and the mapping
// listPollsFor builds. Who may do any of it is the database's job, proved in
// db/tests/chat-polls.sql. The supabase client is mocked here.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import { createPoll, listPollsFor, setPollVote, subscribePollVotes } from '../src/data/polls.js'
import { resetSharedChannelsForTests } from '../src/data/subscribeToTable.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['select', 'eq', 'in', 'insert', 'delete', 'match']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => {
  resetSharedChannelsForTests()
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  supabase.channel.mockReset()
})

describe('createPoll', () => {
  it('calls the create_poll RPC with the target and options, and returns the message id', async () => {
    supabase.rpc.mockResolvedValue({ data: 'msg-9', error: null })
    const id = await createPoll({
      teamId: 't1', channel: 'squad', eventId: null,
      question: 'Which weekend?', options: ['Sat', 'Sun'], allowMultiple: true,
    })
    expect(id).toBe('msg-9')
    expect(supabase.rpc).toHaveBeenCalledWith('create_poll', {
      _team: 't1', _channel: 'squad', _conversation: null, _event: null,
      _question: 'Which weekend?', _options: ['Sat', 'Sun'], _allow_multiple: true,
    })
  })

  it('passes a conversation for a DM/group poll', async () => {
    supabase.rpc.mockResolvedValue({ data: 'msg-10', error: null })
    await createPoll({ conversationId: 'c1', question: 'Q', options: ['A', 'B'] })
    const args = supabase.rpc.mock.calls[0][1]
    expect(args._conversation).toBe('c1')
    expect(args._team).toBeNull()
    expect(args._allow_multiple).toBe(false)
  })

  it('throws when the RPC errors', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(createPoll({ question: 'Q', options: ['A', 'B'] })).rejects.toBeTruthy()
  })
})

describe('listPollsFor', () => {
  it('returns an empty map and makes no call for no ids', async () => {
    const map = await listPollsFor([])
    expect(map.size).toBe(0)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shapes rows into options-by-position with voters and a distinct voter total', async () => {
    const rows = [
      {
        message_id: 'm1',
        allow_multiple: true,
        options: [
          // deliberately out of order to prove the sort
          { id: 'o2', position: 1, label: 'Sun', votes: [{ voter: { id: 'p1', full_name: 'Ana Ker' } }] },
          {
            id: 'o1', position: 0, label: 'Sat',
            votes: [
              { voter: { id: 'p1', full_name: 'Ana Ker' } },
              { voter: { id: 'p2', full_name: 'Bo Lund' } },
            ],
          },
        ],
      },
    ]
    const b = builder({ data: rows, error: null })
    supabase.from.mockReturnValue(b.b)

    const map = await listPollsFor(['m1', 'm1', null])
    expect(supabase.from).toHaveBeenCalledWith('polls')
    expect(b.calls.in[0]).toEqual(['message_id', ['m1']]) // de-duped, nulls dropped

    const poll = map.get('m1')
    expect(poll.allowMultiple).toBe(true)
    expect(poll.options.map((o) => o.label)).toEqual(['Sat', 'Sun']) // sorted by position
    expect(poll.options[0].voters.map((v) => v.name)).toEqual(['Ana Ker', 'Bo Lund'])
    // p1 voted both options; distinct voters = {p1, p2}
    expect(poll.totalVoters).toBe(2)
  })
})

describe('setPollVote', () => {
  it('inserts only the option id when voting on (the trigger stamps the rest)', async () => {
    const b = builder({ error: null })
    supabase.from.mockReturnValue(b.b)
    await setPollVote('o1', 'me', true)
    expect(supabase.from).toHaveBeenCalledWith('poll_votes')
    expect(b.calls.insert[0][0]).toEqual({ option_id: 'o1' })
  })

  it('swallows a racing duplicate (23505) on insert', async () => {
    const b = builder({ error: { code: '23505' } })
    supabase.from.mockReturnValue(b.b)
    await expect(setPollVote('o1', 'me', true)).resolves.toBeUndefined()
  })

  it('deletes my own row when voting off', async () => {
    const b = builder({ error: null })
    supabase.from.mockReturnValue(b.b)
    await setPollVote('o1', 'me', false)
    expect(b.calls.delete).toHaveLength(1)
    expect(b.calls.match[0][0]).toEqual({ option_id: 'o1', voter_id: 'me' })
  })
})

describe('subscribePollVotes', () => {
  it('subscribes to the poll_votes table and returns an unsubscribe', () => {
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    supabase.channel.mockReturnValue(channel)
    const off = subscribePollVotes(() => {})
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'poll_votes' },
      expect.any(Function),
    )
    off()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })
})
