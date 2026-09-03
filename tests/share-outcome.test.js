import { describe, it, expect } from 'vitest'
import { shareOutcomeNote } from '../src/lib/shareOutcome.js'

// 2 Sep 2026 UX review, Low: a download and a cancel used to be silent, and
// on a desktop the download is the normal route, so it must not read as an
// error.
describe('shareOutcomeNote', () => {
  it('words each outcome, and says nothing for an unknown one', () => {
    expect(shareOutcomeNote('shared')).toBe('Shared.')
    expect(shareOutcomeNote('downloaded')).toMatch(/Downloads folder/)
    expect(shareOutcomeNote('downloaded')).not.toMatch(/fail|wrong|error/i)
    expect(shareOutcomeNote('cancelled')).toMatch(/Nothing was sent/)
    expect(shareOutcomeNote(undefined)).toBeNull()
  })
})
