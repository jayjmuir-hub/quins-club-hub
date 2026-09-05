import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import { countAdminWaiting } from '../src/data/members.js'

// The sidebar badge must say what the Accounts screen shows. On 23 Aug 2026
// it said 23 while the list showed 2, because it counted access_requests rows
// still 'pending' — a status nothing ever leaves. The rule that fixed it —
// waiting = no membership and not dismissed; pending = pending rows; reports
// = new, or in progress with the reporter last — moved into the database on
// 5 Sep 2026 (count_admin_waiting), because computing it here meant
// downloading every profile, membership and feedback message on every change.
// The rule itself is proved in db/tests/chat-and-admin-counts.sql; this file
// pins the client's half: one RPC, a number back, and an honest failure.

describe('countAdminWaiting', () => {
  beforeEach(() => {
    supabase.from.mockReset()
    supabase.rpc.mockReset()
  })

  it('asks the database once and returns its number', async () => {
    supabase.rpc.mockResolvedValue({ data: 3, error: null })
    expect(await countAdminWaiting('me')).toBe(3)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('count_admin_waiting')
    // ⚠️ No table reads at all — that is the whole point of the RPC.
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('reads 0 from an empty answer', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    expect(await countAdminWaiting('me')).toBe(0)
  })

  it('returns 0 without a query when nobody is signed in', async () => {
    expect(await countAdminWaiting(null)).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('throws when the read fails rather than inventing a number', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('nope') })
    await expect(countAdminWaiting('me')).rejects.toThrow('nope')
  })
})
