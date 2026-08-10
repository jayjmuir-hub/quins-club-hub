import { describe, it, expect, vi } from 'vitest'
import { MAX_ROWS, withCap, unwrapCapped } from '../src/data/limits.js'

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
