import { describe, it, expect, vi, beforeEach } from 'vitest'

// The series EDIT pair in src/data/events.js.
//
// ⚠️ WHAT THESE GUARD is the shape of the write, not the database's answer.
// The filters (`series_id = x AND starts_at >= this occurrence`) are the whole
// feature: get the `>=` wrong and a coach moving the rest of a term either
// misses the session they were looking at, or rewrites sessions that have
// already been played and carry results and attendance.
//
// The RPC's own arithmetic — per-occurrence dates, preserved duration — is
// proved against the live database in db/migrations/20260810_update_series_from.sql's
// harness run, not here: jsdom has no Postgres and a mock that reimplemented
// the SQL would only be testing itself.

// ⚠️ `gt` IS MOCKED EVEN THOUGH NOTHING CALLS IT, DELIBERATELY. The first
// version of this file omitted it, so swapping `.gte` for `.gt` in the source
// failed with "gt is not a function" — the test went red, but by CRASHING
// rather than by its assertion. A crash proves the line was touched; it does
// not prove the test knows what the line should say. With `gt` supported, the
// same swap now fails on `expect(from.gte).toEqual([...])`, which is the thing
// actually being guarded.
const from = vi.hoisted(() => ({ eq: null, gte: null, gt: null, update: null, rpc: null, select: null }))

vi.mock('../src/lib/supabase.js', () => {
  const chain = {
    update: (fields) => {
      from.update = fields
      return chain
    },
    eq: (col, val) => {
      from.eq = [col, val]
      return chain
    },
    gte: (col, val) => {
      from.gte = [col, val]
      return chain
    },
    gt: (col, val) => {
      from.gt = [col, val]
      return chain
    },
    select: () => Promise.resolve({ data: from.select, error: null }),
  }
  return {
    supabase: {
      from: () => chain,
      rpc: (name, args) => {
        from.rpc = [name, args]
        return Promise.resolve({ data: from.select, error: null })
      },
    },
  }
})

const { updateSeriesFrom, setSeriesTimeFrom, SERIES_EDITABLE_FIELDS } = await import(
  '../src/data/events.js'
)

beforeEach(() => {
  from.eq = null
  from.gte = null
  from.gt = null
  from.update = null
  from.rpc = null
  from.select = [{ id: 'a' }, { id: 'b' }]
})

describe('updateSeriesFrom', () => {
  it('⚠️ filters on the series and on FUTURE ONLY, inclusive of this occurrence', () => {
    return updateSeriesFrom('series-1', '2026-09-08T14:00:00Z', { venue: 'Zayed' }).then(() => {
      expect(from.eq).toEqual(['series_id', 'series-1'])
      // `gte`, not `gt`: the occurrence being edited moves too, which is what
      // "this and every later session" says on screen. An exclusive filter
      // would leave the session the coach is looking at behind — the one edit
      // they are certain to check afterwards.
      expect(from.gte).toEqual(['starts_at', '2026-09-08T14:00:00Z'])
      expect(from.gt, 'an exclusive filter skips the occurrence being edited').toBeNull()
    })
  })

  it('⚠️ never writes a per-occurrence column, however hard it is asked', async () => {
    // The failure this prevents is a term collapsing onto one date.
    await updateSeriesFrom('series-1', '2026-09-08T14:00:00Z', {
      venue: 'Zayed',
      starts_at: '2026-12-25T09:00:00Z',
      ends_at: '2026-12-25T11:00:00Z',
      result_us: 40,
      result_them: 3,
      team_id: 'some-other-squad',
      series_id: 'a-different-series',
    })

    expect(from.update).toEqual({ venue: 'Zayed' })
    for (const forbidden of ['starts_at', 'ends_at', 'result_us', 'result_them', 'team_id', 'series_id']) {
      expect(Object.keys(from.update), `${forbidden} must never be written series-wide`).not.toContain(
        forbidden,
      )
    }
  })

  it('writes nothing at all when the patch has no series-wide fields', async () => {
    // Changing only the time is a legitimate edit; it goes through the RPC,
    // and this must not fire an UPDATE with an empty body.
    const rows = await updateSeriesFrom('series-1', '2026-09-08T14:00:00Z', {
      starts_at: '2026-12-25T09:00:00Z',
    })
    expect(rows).toEqual([])
    expect(from.update).toBeNull()
  })

  it('⚠️ treats zero rows back as a refusal rather than a success', async () => {
    // RLS filters rows out of a statement instead of raising, and PostgREST
    // answers 200 with whatever survived. A write that reports no error has
    // not thereby reported success.
    from.select = []
    await expect(
      updateSeriesFrom('series-1', '2026-09-08T14:00:00Z', { venue: 'Zayed' }),
    ).rejects.toThrow(/permission|couldn't save/i)
  })

  it('the editable field list is opt-in, and excludes everything dated or scored', () => {
    expect(SERIES_EDITABLE_FIELDS).toEqual([
      'type',
      'title',
      'opponent',
      'home',
      'venue',
      'competition',
      'pitch',
      'notes',
    ])
  })
})

describe('setSeriesTimeFrom', () => {
  it('calls the RPC with club wall-clock hours and minutes', async () => {
    await setSeriesTimeFrom('series-1', '2026-09-08T14:00:00Z', 18, 30)
    const [name, args] = from.rpc
    expect(name).toBe('set_series_time_from')
    expect(args).toEqual({
      _series: 'series-1',
      _from: '2026-09-08T14:00:00Z',
      _hh: 18,
      _mm: 30,
    })
  })

  it('⚠️ treats zero rows back as a refusal', async () => {
    from.select = []
    await expect(setSeriesTimeFrom('series-1', '2026-09-08T14:00:00Z', 18, 30)).rejects.toThrow()
  })
})
