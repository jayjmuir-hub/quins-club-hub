import { describe, it, expect, vi, beforeEach } from 'vitest'

// The pitch-request data layer.
//
// ⚠️ WHAT THESE GUARD IS THE ORDER AND THE BLAST RADIUS OF THE WRITES, not the
// permissions. Who may ask and who may answer is enforced by RLS and proved
// against the live database in db/tests/rls-pitch-requests.sql; nothing here
// could catch a widened policy.

const calls = vi.hoisted(() => ({ log: [], results: {} }))

vi.mock('../src/lib/supabase.js', () => {
  function builder(table) {
    const state = { table, op: null, fields: null, filters: {} }
    const self = {
      insert: (f) => { state.op = 'insert'; state.fields = f; return self },
      update: (f) => { state.op = 'update'; state.fields = f; return self },
      delete: () => { state.op = 'delete'; return self },
      select: () => self,
      eq: (col, val) => { state.filters[col] = val; return self },
      order: () => self,
      maybeSingle: () => {
        calls.log.push({ ...state })
        const key = `${state.table}.${state.op}`
        return Promise.resolve(calls.results[key] ?? { data: { id: 'ok' }, error: null })
      },
      then: (resolve, reject) => {
        calls.log.push({ ...state })
        const key = `${state.table}.${state.op}`
        return Promise.resolve(calls.results[key] ?? { data: [{ id: 'ok' }], error: null }).then(resolve, reject)
      },
    }
    return self
  }
  return {
    supabase: {
      from: (table) => builder(table),
      // ⚠️ The identity now comes from the client library at write time, not
      // from a prop or a React context — RLS checks auth.uid() against the
      // token the request is sent with, so that is the only id that can be
      // right. See currentProfileId in the module under test.
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me' } }, error: null }) },
    },
  }
})

const { requestPitch, allocatePitch, declinePitch, withdrawRequest, isOpen } = await import(
  '../src/data/pitchRequests.js'
)

beforeEach(() => {
  calls.log = []
  calls.results = {}
})

describe('requestPitch', () => {
  it('files against the fixture, in the caller own name', async () => {
    await requestPitch({ eventId: 'e1', needsReferee: true, note: ' early KO ' })
    const [insert] = calls.log
    expect(insert.table).toBe('pitch_requests')
    expect(insert.fields).toEqual({
      event_id: 'e1',
      requested_by: 'me',
      needs_referee: true,
      note: 'early KO',
    })
  })

  it('sends null rather than an empty note', async () => {
    await requestPitch({ eventId: 'e1', note: '   ' })
    expect(calls.log[0].fields.note).toBeNull()
  })

  it('⚠️ treats no row back as a refusal', async () => {
    // RLS filters a refused insert to nothing and PostgREST answers 200.
    calls.results['pitch_requests.insert'] = { data: null, error: null }
    await expect(requestPitch({ eventId: 'e1' })).rejects.toThrow(/may not be staff/i)
  })
})

describe('allocatePitch', () => {
  it('⚠️ WRITES THE FIXTURE FIRST, THEN CLOSES THE REQUEST', async () => {
    // The order is the whole safety property. Closing the request first and
    // then failing to write the fixture would tell the coach they have a pitch
    // while the schedule still says Pitch TBD.
    await allocatePitch({ requestId: 'r1', eventId: 'e1', pitch: 'A1' })

    expect(calls.log.map((c) => `${c.table}.${c.op}`)).toEqual([
      'events.update',
      'pitch_requests.update',
    ])
    expect(calls.log[0].fields).toEqual({ pitch: 'A1' })
    expect(calls.log[1].fields).toMatchObject({ status: 'allocated', decided_by: 'me' })
  })

  it('⚠️ leaves the request OPEN when the fixture write is refused', async () => {
    // A job still to do, rather than a lie.
    calls.results['events.update'] = { data: null, error: null }
    await expect(
      allocatePitch({ requestId: 'r1', eventId: 'e1', pitch: 'A1' }),
    ).rejects.toThrow(/only an admin/i)

    expect(calls.log.map((c) => `${c.table}.${c.op}`)).toEqual(['events.update'])
  })

  it('stamps who decided and when', async () => {
    await allocatePitch({ requestId: 'r1', eventId: 'e1', pitch: 'C3' })
    expect(calls.log[1].fields.decided_at).toBeTruthy()
  })
})

describe('declinePitch', () => {
  it('⚠️ DOES NOT TOUCH THE FIXTURE', async () => {
    // Jay's ruling: a decline is visible only in the request list. The fixture
    // keeps Pitch TBD. Writing anything to `events` here would invent a
    // fixture state nobody asked for.
    await declinePitch({ requestId: 'r1', reason: 'nothing free' })

    expect(calls.log.map((c) => c.table)).toEqual(['pitch_requests'])
    expect(calls.log[0].fields).toMatchObject({ status: 'declined', decision_note: 'nothing free' })
  })

  it('keeps the reason, trimmed, and nulls an empty one', async () => {
    await declinePitch({ requestId: 'r1', reason: '   ' })
    expect(calls.log[0].fields.decision_note).toBeNull()
  })
})

describe('withdrawRequest', () => {
  it('⚠️ treats zero rows as "already answered", not as success', async () => {
    // The DELETE policy carries status = 'submitted', so once it has been
    // answered this silently affects nothing — which without the check would
    // look exactly like a successful withdrawal.
    calls.results['pitch_requests.delete'] = { data: [], error: null }
    await expect(withdrawRequest('r1')).rejects.toThrow(/already been answered/i)
  })

  it('returns the withdrawn row', async () => {
    await expect(withdrawRequest('r1')).resolves.toMatchObject({ id: 'ok' })
  })
})

describe('isOpen', () => {
  it('is true only for a request nobody has answered', () => {
    expect(isOpen({ status: 'submitted' })).toBe(true)
    for (const status of ['allocated', 'declined', 'cancelled']) {
      expect(isOpen({ status })).toBe(false)
    }
    expect(isOpen(null)).toBe(false)
  })
})
