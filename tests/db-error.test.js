// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { wrapDbError } from '../src/lib/dbError.js'
import { friendlyMessage } from '../src/lib/friendlyError.js'

// The data-layer half of the friendly-error sweep (3 Sep 2026). The point is
// the round trip: what the data layer throws must let friendlyMessage() make
// the right call, which it could not while the code was dropped.

describe('wrapDbError', () => {
  it('keeps the message and carries the code across', () => {
    const err = wrapDbError({ message: 'not staff of this squad', code: '42501' }, 'fallback')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('not staff of this squad')
    expect(err.code).toBe('42501')
  })

  it('falls back only when the database said nothing, and then carries no code', () => {
    expect(wrapDbError({ message: '' }, 'We could not save that.').message).toBe('We could not save that.')
    expect(wrapDbError(null, 'We could not save that.').message).toBe('We could not save that.')
    expect(wrapDbError({ message: '   ', code: 'PGRST116' }, 'fb').code).toBe('PGRST116')
    expect('code' in wrapDbError({ message: 'x' }, 'fb')).toBe(false)
  })

  // ⚠️ THE ROUND TRIP THAT WAS BROKEN. A PostgREST failure with an untrusted
  // code used to reach the screen word for word because the wrap dropped the
  // code; a hand-written SECURITY DEFINER refusal must still come through.
  it('lets friendlyMessage hide PostgREST text and show a hand-written refusal', () => {
    const raw = wrapDbError(
      { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      'fb',
    )
    expect(friendlyMessage(raw, "We couldn't save that.")).toBe("We couldn't save that.")

    const refusal = wrapDbError({ message: 'Only a club admin can add a squad.', code: '42501' }, 'fb')
    expect(friendlyMessage(refusal, 'fb')).toBe('Only a club admin can add a squad.')

    // Control: the OLD shape (no code) shows the raw text — the bug this file exists for.
    const old = new Error('JSON object requested, multiple (or no) rows returned')
    expect(friendlyMessage(old, 'fb')).toBe('JSON object requested, multiple (or no) rows returned')
  })
})
