// The 24 Aug feedback round's composer behaviour (src/lib/chatComposer.js)
// and the absolute message stamp (stampLabel in src/lib/notices.js).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { composerKeyDown, enterSends, setEnterSends } from '../src/lib/chatComposer.js'
import { stampLabel } from '../src/lib/notices.js'

beforeEach(() => localStorage.clear())

describe('stampLabel', () => {
  // Fixed instants, club time (Asia/Dubai = UTC+4).
  const NOW = new Date('2026-08-24T12:00:00+04:00')
  it('same day is just the clock', () => {
    expect(stampLabel('2026-08-24T08:32:00+04:00', NOW)).toBe('08:32')
  })
  it('an older day carries the date', () => {
    expect(stampLabel('2026-08-18T22:05:00+04:00', NOW)).toBe('18 Aug, 22:05')
  })
  it('midnight UTC vs Dubai day boundary is decided in club time', () => {
    // 23:30 UTC on the 23rd is 03:30 on the 24th in Dubai — "today".
    expect(stampLabel('2026-08-23T23:30:00Z', NOW)).toBe('03:30')
  })
  it('garbage renders as nothing, never NaN', () => {
    expect(stampLabel(null, NOW)).toBe('')
    expect(stampLabel('not a date', NOW)).toBe('')
  })
})

describe('enter sends', () => {
  function keyEvent(overrides = {}) {
    const requestSubmit = vi.fn()
    return {
      key: 'Enter',
      shiftKey: false,
      preventDefault: vi.fn(),
      currentTarget: { form: { requestSubmit } },
      requestSubmit,
      ...overrides,
    }
  }

  it('is off by default: Enter makes a new line', () => {
    expect(enterSends()).toBe(false)
    const e = keyEvent()
    composerKeyDown(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('submits the form when switched on', () => {
    setEnterSends(true)
    const e = keyEvent()
    composerKeyDown(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.currentTarget.form.requestSubmit).toHaveBeenCalled()
  })

  it('Shift+Enter always makes a new line, even switched on', () => {
    setEnterSends(true)
    const e = keyEvent({ shiftKey: true })
    composerKeyDown(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
