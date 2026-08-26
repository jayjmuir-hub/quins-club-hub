// The client half of "Last active" — one fire-and-forget touch per day
// (claude/plans/2026-08-26-last-active-and-presence-dots.md). The server has
// its own 12h floor; this throttle only keeps the app from asking at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../src/lib/supabase.js', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))

import { touchLastSeenOncePerDay, TOUCH_KEY } from '../src/data/activity.js'

describe('touchLastSeenOncePerDay', () => {
  beforeEach(() => {
    rpc.mockReset()
    localStorage.clear()
  })

  it('touches once, then not again the same day', async () => {
    rpc.mockResolvedValue({ error: null })
    await touchLastSeenOncePerDay()
    await touchLastSeenOncePerDay()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('touch_last_seen')
  })

  it('touches again on a different day', async () => {
    rpc.mockResolvedValue({ error: null })
    localStorage.setItem(TOUCH_KEY, '2001-01-01')
    await touchLastSeenOncePerDay()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('⚠️ a failure neither throws nor writes the stamp — tomorrow retries', async () => {
    rpc.mockRejectedValue(new Error('offline at the pitch'))
    await expect(touchLastSeenOncePerDay()).resolves.toBeUndefined()
    expect(localStorage.getItem(TOUCH_KEY)).toBeNull()
  })
})
