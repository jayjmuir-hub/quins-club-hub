// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch) => {
        updateMock(patch)
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => updateMock.result,
            }),
          }),
        }
      },
    }),
  },
}))

import { setTeamDefaultFormat } from '../src/data/teams.js'

beforeEach(() => {
  vi.clearAllMocks()
  updateMock.result = { data: { id: 't1', default_format: 7 }, error: null }
})

describe('setTeamDefaultFormat', () => {
  it('writes the format as a number, and null to clear it', async () => {
    await setTeamDefaultFormat('t1', 7)
    expect(updateMock).toHaveBeenCalledWith({ default_format: 7 })
    await setTeamDefaultFormat('t1', null)
    expect(updateMock).toHaveBeenCalledWith({ default_format: null })
  })

  it('refuses a value the database would refuse, before the request goes out', async () => {
    await expect(setTeamDefaultFormat('t1', 9)).rejects.toThrow(/7s, 10s, 12s or 15s/)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when RLS filters the write to zero rows', async () => {
    // CONTROL of the shape: data null AND error null is what a refused write
    // looks like through supabase-js — a perfectly successful nothing.
    updateMock.result = { data: null, error: null }
    await expect(setTeamDefaultFormat('t1', 12)).rejects.toThrow(/club admin/)
  })
})
