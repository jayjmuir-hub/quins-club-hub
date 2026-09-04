import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const del = vi.fn()
const insert = vi.fn()
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({
      delete: () => ({ eq: (...a) => del(...a) }),
      insert: (rows) => ({ select: () => insert(rows) }),
    }),
  },
}))

import { seasonStats, seasonStatsGaps } from '../src/data/seasonStats.js'
import { saveMatchSheetScores } from '../src/data/matchSheets.js'

beforeEach(() => {
  vi.clearAllMocks()
  del.mockResolvedValue({ error: null })
  insert.mockImplementation(async (rows) => ({ data: rows, error: null }))
})

describe('seasonStats', () => {
  it('calls the function with the squad and season, and returns its rows', async () => {
    rpc.mockResolvedValue({ data: [{ player_id: 'p1', games: 3 }], error: null })
    const rows = await seasonStats('t-men1', '2026-27')
    expect(rpc).toHaveBeenCalledWith('senior_season_stats', { _team: 't-men1', _season: '2026-27' })
    expect(rows).toEqual([{ player_id: 'p1', games: 3 }])
  })
  it('returns [] when the database refuses (no rows)', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await seasonStats('t-u10', '2026-27')).toEqual([])
  })
})

describe('seasonStatsGaps', () => {
  it('unwraps the single row', async () => {
    rpc.mockResolvedValue({ data: [{ played: 7, unnamed: 2 }], error: null })
    expect(await seasonStatsGaps('t-men1', '2026-27')).toEqual({ played: 7, unnamed: 2 })
    expect(rpc).toHaveBeenCalledWith('senior_season_stats_gaps', { _team: 't-men1', _season: '2026-27' })
  })
  it('is zeros when the database returns nothing', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await seasonStatsGaps('t-u10', '2026-27')).toEqual({ played: 0, unnamed: 0 })
  })
})

describe('saveMatchSheetScores', () => {
  it('replaces the sheet’s rows, dropping rows with no kind or no slot, and defaulting qty to 1', async () => {
    const rows = await saveMatchSheetScores('ms-1', [
      { kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 },
      { kind: '', slot: 3, full_name: 'Nobody', qty: 1 },
      { kind: 'conversions', slot: '', full_name: '', qty: '' },
      { kind: 'penalties', slot: 15, full_name: 'Harness Full Back', qty: '' },
    ])
    expect(del).toHaveBeenCalledWith('match_sheet_id', 'ms-1')
    expect(insert).toHaveBeenCalledWith([
      { match_sheet_id: 'ms-1', kind: 'tries', slot: 10, full_name: 'Harness Fly Half', qty: 2 },
      { match_sheet_id: 'ms-1', kind: 'penalties', slot: 15, full_name: 'Harness Full Back', qty: 1 },
    ])
    expect(rows).toHaveLength(2)
  })
  it('refuses without a sheet id', async () => {
    await expect(saveMatchSheetScores(null, [])).rejects.toThrow()
  })
})
