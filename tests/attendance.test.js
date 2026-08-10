import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for src/data/attendance.js. supabase is mocked, so no network is
// reachable from this file.
//
// ⚠️ WHAT MATTERS HERE IS THE UPSERT AND THE REFUSAL. Everything else is
// plumbing:
//   - taking the register twice must CORRECT the first answer, not append a
//     second contradictory row for the same child;
//   - a write RLS refused comes back as a successful empty response, not an
//     error, so "no row returned" has to be turned into a visible failure.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listAttendance,
  listAttendanceForPlayer,
  setAttendance,
  clearAttendance,
  ATTENDANCE_STATUSES,
} from '../src/data/attendance.js'
import { MAX_ROWS } from '../src/data/limits.js'

function createBuilder({ data = null, error = null } = {}) {
  const calls = { select: [], eq: [], order: [], limit: [], upsert: [], delete: [] }
  const builder = {}
  const chain = (name) =>
    vi.fn((...args) => {
      calls[name].push(args)
      return builder
    })
  builder.select = chain('select')
  builder.eq = chain('eq')
  builder.order = chain('order')
  builder.limit = chain('limit')
  builder.upsert = chain('upsert')
  builder.delete = chain('delete')
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  builder.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject)
  return { builder, calls }
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('listAttendance', () => {
  it('does not query at all without an event id', async () => {
    expect(await listAttendance(null)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('scopes to the event and carries the row cap', async () => {
    const { builder, calls } = createBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listAttendance('e1')

    expect(supabase.from).toHaveBeenCalledWith('attendance')
    expect(calls.eq).toEqual([['event_id', 'e1']])
    expect(calls.limit).toEqual([[MAX_ROWS + 1]])
  })

  it('⚠️ returns one row without complaining — that is a parent, not a failure', async () => {
    // A parent legitimately reads a single row here, because `attendance read`
    // is can_edit_team OR is_own_player. A caller treating "fewer rows than
    // players" as an error would be wrong for every parent in the club.
    const { builder } = createBuilder({ data: [{ id: 'a1', player_id: 'p1', status: 'present' }] })
    supabase.from.mockReturnValue(builder)

    await expect(listAttendance('e1')).resolves.toHaveLength(1)
  })

  it('throws rather than returning a truncated register', async () => {
    const tooMany = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: `a${i}` }))
    const { builder } = createBuilder({ data: tooMany })
    supabase.from.mockReturnValue(builder)

    await expect(listAttendance('e1')).rejects.toThrow(/too many attendance records/i)
  })
})

describe('listAttendanceForPlayer', () => {
  it('scopes to the player and orders newest first', async () => {
    const { builder, calls } = createBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listAttendanceForPlayer('p1')

    expect(calls.eq).toEqual([['player_id', 'p1']])
    expect(calls.order).toEqual([['recorded_at', { ascending: false }]])
  })
})

describe('setAttendance', () => {
  it('⚠️ upserts on (event_id, player_id) so a second register CORRECTS the first', async () => {
    // Without onConflict this inserts a second, contradictory row for the same
    // child and nothing can say which is current. The unique constraint would
    // then surface as a 23505 the coach cannot act on.
    const { builder, calls } = createBuilder({ data: { id: 'a1' } })
    supabase.from.mockReturnValue(builder)

    await setAttendance('e1', 'p1', 'present')

    expect(calls.upsert).toEqual([
      [{ event_id: 'e1', player_id: 'p1', status: 'present' }, { onConflict: 'event_id,player_id' }],
    ])
  })

  it('FAULT: throws a message a coach can act on when RLS refuses', async () => {
    // The refusal shape: PostgREST reports success with no row, because the
    // policy filtered the write out. Silent success here would show "Saved"
    // over a register that was never written.
    const { builder } = createBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(setAttendance('e1', 'p1', 'present')).rejects.toThrow(/permission to record attendance/i)
  })

  it('rejects a status the CHECK constraint would reject, with a better message', async () => {
    await expect(setAttendance('e1', 'p1', 'late')).rejects.toThrow(/present, absent, excused/)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses to build a row with no event or player', async () => {
    await expect(setAttendance(null, 'p1', 'present')).rejects.toThrow(/needs an event and a player/)
    await expect(setAttendance('e1', null, 'present')).rejects.toThrow(/needs an event and a player/)
  })

  it('accepts exactly the three statuses the database allows', () => {
    // Pinned against the CHECK in db/migrations/20260810_attendance.sql. If one
    // is widened without the other, a coach gets either a Postgres 23514 or a
    // client-side refusal of something the database would have taken.
    expect(ATTENDANCE_STATUSES).toEqual(['present', 'absent', 'excused'])
  })
})

describe('clearAttendance', () => {
  it('deletes the one row for that player and event', async () => {
    const { builder, calls } = createBuilder({ data: [{ id: 'a1' }] })
    supabase.from.mockReturnValue(builder)

    await clearAttendance('e1', 'p1')

    expect(calls.delete).toHaveLength(1)
    expect(calls.eq).toEqual([['event_id', 'e1'], ['player_id', 'p1']])
  })

  it('does not throw when there was nothing to delete', async () => {
    // "Recorded by mistake" and "recorded as absent" are different facts, and
    // clearing something already clear is the desired state, not a refusal.
    const { builder } = createBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await expect(clearAttendance('e1', 'p1')).resolves.toEqual([])
  })
})
