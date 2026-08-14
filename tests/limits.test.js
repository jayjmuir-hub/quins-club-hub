// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, vi } from 'vitest'
import {
  MAX_ROWS,
  MAX_IN_LIST,
  withCap,
  unwrapCapped,
  fetchAllPages,
  fetchByIds,
} from '../src/data/limits.js'

// Tests for the row caps on the unbounded list reads.
//
// ⚠️ WHAT IS BEING GUARDED AGAINST is not slowness. PostgREST applies a
// `db-max-rows` ceiling and returns the first N rows with HTTP 200 and no
// indication that anything was left out — a roster missing a child, or a
// schedule missing a fixture, that looks exactly like a complete one.
//
// The same silence this codebase has already been bitten by twice: the zero-row
// 200 when the bearer downgraded to the anon key, and an empty search result
// read as proof of absence (CLAUDE.md rule 6).

describe('the cap', () => {
  it('asks for one row MORE than it is willing to accept', () => {
    // ⚠️ THE LOAD-BEARING DETAIL. Detection works by seeing whether the extra
    // row arrives. A plain .limit(MAX_ROWS) cannot tell "exactly at the cap"
    // from "more than the cap" — it returns 900 rows in both cases.
    const limit = vi.fn(() => 'capped-query')
    expect(withCap({ limit })).toBe('capped-query')
    expect(limit).toHaveBeenCalledWith(MAX_ROWS + 1)
  })

  it('stays below PostgREST’s documented default ceiling', () => {
    // If the request (MAX_ROWS + 1) ever reached or passed `db-max-rows`,
    // PostgREST would trim the response first, the sentinel row would never
    // arrive, and the detector would report "complete" on a truncated list —
    // green precisely when it should fire. Supabase's documented default is
    // 1000.
    expect(MAX_ROWS + 1).toBeLessThanOrEqual(1000)
  })
})

describe('unwrapCapped', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))

  it('returns the list untouched when it is under the cap', () => {
    const list = rows(3)
    expect(unwrapCapped(list, 'players', 'hint')).toEqual(list)
  })

  it('returns the list when it is EXACTLY at the cap', () => {
    // The boundary that matters. 900 rows means 900 rows — the sentinel did
    // not arrive, so nothing was left out and this must not throw.
    expect(unwrapCapped(rows(MAX_ROWS), 'players', 'hint')).toHaveLength(MAX_ROWS)
  })

  it('FAULT: throws as soon as the sentinel row arrives', () => {
    // One row over. This is the whole point: the answer is incomplete, and it
    // must not reach a screen looking complete.
    expect(() => unwrapCapped(rows(MAX_ROWS + 1), 'players', 'hint')).toThrow(/too many players/i)
  })

  it('says what to do about it, not just that it happened', () => {
    expect(() => unwrapCapped(rows(MAX_ROWS + 1), 'events', 'Narrow the date range.')).toThrow(
      /narrow the date range/i,
    )
  })

  it('says it is a deliberate limit, so it is not debugged as a database fault', () => {
    // Without this the message reads as an outage, and the first hour goes on
    // RLS and connection pools.
    expect(() => unwrapCapped(rows(MAX_ROWS + 1), 'players', 'hint')).toThrow(/deliberate limit/i)
  })

  it('treats null as an empty list rather than throwing on .length', () => {
    expect(unwrapCapped(null, 'players', 'hint')).toEqual([])
  })

  it('honours a caller-supplied limit', () => {
    expect(() => unwrapCapped(rows(3), 'players', 'hint', 2)).toThrow(/more than 2/i)
    expect(unwrapCapped(rows(2), 'players', 'hint', 2)).toHaveLength(2)
  })
})

// ── fetchAllPages ────────────────────────────────────────────────────────
//
// The paged read that replaced the flat 900-row cap on listEvents. What it
// guarantees is unchanged from unwrapCapped's: EVERYTHING, OR A THROW. Never
// some of it, quietly.

describe('fetchAllPages', () => {
  // A fake PostgREST builder. Records the sort it was given and hands back a
  // slice of `all` for whatever range it is asked for — which is the only way
  // to catch the off-by-one that would drop or repeat a row at every page
  // boundary.
  function fakeTable(all) {
    const ranges = []
    const orders = []
    const build = () => {
      const query = {
        order: (column, options) => {
          orders.push([column, options])
          return query
        },
        range: (start, end) => {
          ranges.push([start, end])
          return Promise.resolve({ data: all.slice(start, end + 1), error: null })
        },
      }
      return query
    }
    return { build, ranges, orders }
  }

  const row = (i) => ({ id: `r${i}` })

  it('returns a single short page without asking for a second', async () => {
    const { build, ranges } = fakeTable([row(0), row(1)])
    const out = await fetchAllPages(build, [['id', { ascending: true }]], 'events', 'hint', { page: 10 })
    expect(out).toHaveLength(2)
    expect(ranges).toEqual([[0, 9]])
  })

  it('⚠️ stitches multiple pages together with no row dropped or repeated', async () => {
    // 25 rows at 10 a page: the boundaries are where an off-by-one in
    // `range(offset, offset + page - 1)` would show up, and it would show up
    // as a schedule quietly missing every tenth fixture.
    const all = Array.from({ length: 25 }, (_, i) => row(i))
    const { build, ranges } = fakeTable(all)

    const out = await fetchAllPages(build, [['id', { ascending: true }]], 'events', 'hint', { page: 10 })

    expect(out.map((r) => r.id)).toEqual(all.map((r) => r.id))
    expect(ranges).toEqual([[0, 9], [10, 19], [20, 29]])
  })

  it('⚠️ costs one extra request when the total is an exact multiple of the page', async () => {
    // 20 rows at 10 a page. The second page is full, so "are there more?" is
    // genuinely unanswered and the only honest move is to ask. Guessing "that
    // was the end" is how the tail goes missing.
    const all = Array.from({ length: 20 }, (_, i) => row(i))
    const { build, ranges } = fakeTable(all)

    const out = await fetchAllPages(build, [['id', { ascending: true }]], 'events', 'hint', { page: 10 })

    expect(out).toHaveLength(20)
    expect(ranges).toHaveLength(3)
  })

  it('⚠️ applies every sort key, in order, on every page', async () => {
    // .range() is OFFSET/LIMIT. An under-specified sort lets Postgres order
    // tied rows differently between requests, so a row arrives on two pages
    // and another on none — with no error anywhere. The last key must be
    // unique; this proves both are actually sent, and re-sent per page.
    const all = Array.from({ length: 15 }, (_, i) => row(i))
    const { build, orders } = fakeTable(all)

    await fetchAllPages(
      build,
      [['starts_at', { ascending: true }], ['id', { ascending: true }]],
      'events',
      'hint',
      { page: 10 },
    )

    expect(orders).toEqual([
      ['starts_at', { ascending: true }],
      ['id', { ascending: true }],
      ['starts_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  it('⚠️ terminates on a source that never runs out', async () => {
    // Every page comes back full for ever — the shape of an infinite loop.
    // The ceiling is the only thing that ends it.
    const build = () => {
      const query = {
        order: () => query,
        range: (start, end) =>
          Promise.resolve({ data: Array.from({ length: end - start + 1 }, (_, i) => row(start + i)), error: null }),
      }
      return query
    }

    await expect(
      fetchAllPages(build, [['id', { ascending: true }]], 'events', 'Filter to one squad.', {
        page: 10,
        max: 35,
      }),
    ).rejects.toThrow(/too many events .*more than 35/i)
  })

  it('names the way out, and says the limit is deliberate', async () => {
    const build = () => {
      const query = {
        order: () => query,
        range: (start, end) =>
          Promise.resolve({ data: Array.from({ length: end - start + 1 }, (_, i) => row(start + i)), error: null }),
      }
      return query
    }

    await expect(
      fetchAllPages(build, [['id', { ascending: true }]], 'events', 'Filter to one squad.', {
        page: 10,
        max: 20,
      }),
    ).rejects.toThrow(/filter to one squad.*deliberate limit/is)
  })

  it('throws the database error rather than swallowing it into an empty list', async () => {
    const build = () => {
      const query = {
        order: () => query,
        range: () => Promise.resolve({ data: null, error: new Error('permission denied') }),
      }
      return query
    }

    await expect(
      fetchAllPages(build, [['id', { ascending: true }]], 'events', 'hint'),
    ).rejects.toThrow('permission denied')
  })
})

describe('fetchByIds — the URL-length limit, which bites before the row limit', () => {
  // ⚠️ THIS IS NOT A ROW LIMIT. PostgREST takes `.in()` as a query STRING, so a
  // uuid costs ~37 bytes of URL and a club-wide read builds a request the
  // gateway refuses before Postgres ever sees it. MAX_ROWS does nothing about
  // it: the request never gets far enough to return a row.
  //
  // ✅ MEASURED against the live project 12 Aug 2026, with real uuids:
  //   300 ids -> 11,196-byte URL -> 200 OK
  //   400 ids -> 14,896-byte URL -> the fetch THREW
  //   900 ids -> 33,396-byte URL -> 400 Bad Request
  //
  // ⚠️ AND THE 400-ID FAILURE IS THE DANGEROUS ONE — a connection failure, not
  // a status, so it reads as a bad network rather than a request built wrong.

  it('stays well under the smallest measured failure', () => {
    // The club lands ON this cliff: fifteen squads at ~25 players is ~375,
    // between the last size measured working and the first measured failing.
    expect(MAX_IN_LIST).toBeLessThanOrEqual(300)
    expect(MAX_IN_LIST).toBeGreaterThan(0)
  })

  it('issues ONE query per chunk and concatenates every row', async () => {
    const ids = Array.from({ length: MAX_IN_LIST * 2 + 5 }, (unused, i) => `id-${i}`)
    const seen = []
    const rows = await fetchByIds(ids, async (chunk) => {
      seen.push(chunk.length)
      return chunk.map((id) => ({ id }))
    })

    expect(seen).toEqual([MAX_IN_LIST, MAX_IN_LIST, 5])
    expect(rows).toHaveLength(ids.length)
  })

  it('does not query at all for an empty list', async () => {
    // Matching the teamIds convention everywhere else in src/data: an empty
    // input means "nothing to ask about", and must NEVER be read as "no
    // filter, return everything".
    const run = vi.fn()
    await expect(fetchByIds([], run)).resolves.toEqual([])
    await expect(fetchByIds(undefined, run)).resolves.toEqual([])
    expect(run).not.toHaveBeenCalled()
  })

  it('⚠️ dedupes, because the callers build their lists from other queries', async () => {
    const run = vi.fn(async (chunk) => chunk.map((id) => ({ id })))
    const rows = await fetchByIds(['a', 'b', 'a', null, 'b', undefined], run)

    expect(run).toHaveBeenCalledWith(['a', 'b'])
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('⚠️ THROWS rather than returning some of it, exactly like fetchAllPages', async () => {
    // The guarantee that matters. A partial contact list would make players
    // look like they have no parent on file, which is a safeguarding-adjacent
    // number somebody would act on.
    const ids = Array.from({ length: MAX_IN_LIST + 1 }, (unused, i) => `id-${i}`)
    let call = 0
    await expect(
      fetchByIds(ids, async (chunk) => {
        call += 1
        if (call === 2) throw new Error('second chunk failed')
        return chunk.map((id) => ({ id }))
      }),
    ).rejects.toThrow(/second chunk failed/)
  })
})
