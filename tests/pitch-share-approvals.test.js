// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { shareKey } from '../src/data/pitchShareApprovals.js'

// shareKey is the stable identity of a share — the key an approval is filed
// under, and the same one findPitchClashes' cohort produces. Its whole job is
// to be order-independent, so approving a share and looking it up later agree
// however the events happen to be ordered.

describe('shareKey', () => {
  it('is the event ids, sorted and comma-joined', () => {
    expect(shareKey([{ id: 'b' }, { id: 'a' }, { id: 'c' }])).toBe('a,b,c')
  })

  it('is order-independent — the same set always keys the same', () => {
    expect(shareKey([{ id: 'x' }, { id: 'y' }])).toBe(shareKey([{ id: 'y' }, { id: 'x' }]))
  })

  it('changes the moment the set does, so a new booking re-flags', () => {
    const before = shareKey([{ id: 'a' }, { id: 'b' }])
    const after = shareKey([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(after).not.toBe(before)
  })

  it('survives an empty or missing list', () => {
    expect(shareKey([])).toBe('')
    expect(shareKey(null)).toBe('')
    expect(shareKey(undefined)).toBe('')
  })
})
