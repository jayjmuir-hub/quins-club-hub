import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import { countAdminWaiting } from '../src/data/members.js'

// The sidebar badge must say what the Accounts screen shows. On 23 Aug 2026
// it said 23 while the list showed 2, because it counted access_requests rows
// still 'pending' — a status nothing ever leaves, since granted access is the
// existence of a memberships row, not a status on the request.
function tables({ profiles, memberships, dismissed }) {
  supabase.from.mockImplementation((table) => {
    // feedback / feedback_messages (4 Sep 2026) read empty here; the report
    // half has its own test, tests/reports-waiting.test.js.
    const data = { profiles, memberships, access_requests: dismissed, feedback: [], feedback_messages: [] }[table]
    const result = Promise.resolve({ data, error: null })
    return { select: () => Object.assign(result, { eq: () => result, in: () => result, order: () => result }) }
  })
}

describe('countAdminWaiting', () => {
  beforeEach(() => supabase.from.mockReset())

  it('ignores pending requests from people who already have access', async () => {
    tables({
      profiles: [{ id: 'me' }, { id: 'granted' }, { id: 'stranger' }, { id: 'waved' }],
      // 'granted' asked, was given a role, and their request row is still
      // 'pending' in the database — it must not be counted.
      memberships: [
        { profile_id: 'me', status: 'active' },
        { profile_id: 'granted', status: 'active' },
      ],
      dismissed: [{ profile_id: 'waved' }],
    })
    // Only 'stranger' is waiting: not me, no membership, not dismissed.
    expect(await countAdminWaiting('me')).toBe(1)
  })

  it('adds the pending-approval rows, counted by row like the screen does', async () => {
    tables({
      profiles: [{ id: 'me' }, { id: 'parent' }],
      memberships: [
        { profile_id: 'me', status: 'active' },
        { profile_id: 'parent', status: 'pending' },
        { profile_id: 'parent', status: 'pending' },
      ],
      dismissed: [],
    })
    // The parent holds pending rows so is NOT in "waiting"; their two
    // children are two approval cards.
    expect(await countAdminWaiting('me')).toBe(2)
  })

  it('throws when a read fails rather than inventing a number', async () => {
    supabase.from.mockImplementation(() => {
      const result = Promise.resolve({ data: null, error: new Error('nope') })
      return { select: () => Object.assign(result, { eq: () => result, in: () => result, order: () => result }) }
    })
    await expect(countAdminWaiting('me')).rejects.toThrow('nope')
  })
})
