import { describe, it, expect, vi } from 'vitest'

// countAdminWaiting's report half (4 Sep 2026). Jay: "no notification number
// appeared on the icon so i had not known it was submitted." A report waits
// on the Admin badge while it is `new`, and again whenever the reporter has
// the last word on an in-progress thread.

vi.mock('../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../src/data/contacts', () => ({ fetchContacts: vi.fn(), NO_CONTACT: {} }))

import { countReportsWaiting } from '../src/data/members.js'

const reports = [
  { id: 'a', status: 'new', submitted_by: 'p1' },
  { id: 'b', status: 'in-progress', submitted_by: 'p2' },
  { id: 'c', status: 'in-progress', submitted_by: 'p3' },
]

describe('countReportsWaiting', () => {
  it('counts every new report, with or without a thread', () => {
    expect(countReportsWaiting(reports.slice(0, 1), [])).toBe(1)
  })

  it('counts an in-progress report only when the reporter spoke last', () => {
    const messages = [
      { feedback_id: 'b', author_id: 'admin', created_at: '2026-09-04T10:00:00Z' },
      { feedback_id: 'b', author_id: 'p2', created_at: '2026-09-04T11:00:00Z' },
      { feedback_id: 'c', author_id: 'p3', created_at: '2026-09-04T10:00:00Z' },
      { feedback_id: 'c', author_id: 'admin', created_at: '2026-09-04T11:00:00Z' },
    ]
    // a (new) + b (reporter last) = 2; c has the admin's answer last.
    expect(countReportsWaiting(reports, messages)).toBe(2)
  })

  it('an in-progress report with no thread at all is not waiting', () => {
    expect(countReportsWaiting(reports, [])).toBe(1)
  })
})
