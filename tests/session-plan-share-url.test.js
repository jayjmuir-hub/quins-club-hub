import { describe, it, expect } from 'vitest'
import { sessionPlanShareCopy, sessionPlanShareUrl } from '../src/lib/sessionPlanShare.js'

// Pure helpers for the session-plan Share sheet. Spec:
// claude/specs/2026-08-27-session-plan-share.md
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9.

const EVENT = {
  id: 'e-train-1',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2026-08-25T14:00:00.000Z',
}

describe('sessionPlanShareUrl', () => {
  it('is the existing Schedule deep link that opens that hour', () => {
    expect(sessionPlanShareUrl('e-train-1', 'https://adhquins-clubhub.com')).toBe(
      'https://adhquins-clubhub.com/schedule?event=e-train-1',
    )
  })
})

describe('sessionPlanShareCopy', () => {
  it('is a short title plus the deep link, not a dump of blocks', () => {
    const copy = sessionPlanShareCopy(EVENT, 'https://adhquins-clubhub.com')
    expect(copy.url).toBe('https://adhquins-clubhub.com/schedule?event=e-train-1')
    expect(copy.title).toBe('Tuesday training')
    expect(copy.text).toMatch(/^Tuesday training · /)
    expect(copy.text).toContain('https://adhquins-clubhub.com/schedule?event=e-train-1')
    expect(copy.text).not.toMatch(/Grid passing|minutes|warm.?up/i)
    expect(copy.filename).toBe('session-plan-e-train-1.png')
  })
})
