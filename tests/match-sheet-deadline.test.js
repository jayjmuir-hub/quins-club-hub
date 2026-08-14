// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  matchSheetDeadline,
  deadlineLabel,
  isOverdue,
  HOURS_AFTER,
  HOURS_BEFORE,
} from '../src/lib/matchSheetDeadline.js'

// The RCM form carries two deadlines on opposite sides of the match:
//   U11-U16  within 24 hours of completion of the game
//   U18      1 hour in advance of kick off
//
// ⚠️ Jay ruled on 12 Aug 2026 that ONE editor serves every age group. That
// ruling is about the EDITOR. This module still reports what RCM actually
// requires, because not offering a pre-match flow is a different thing from
// telling a U18 coach a false deadline.

const KICK_OFF = new Date('2026-09-12T09:00:00.000Z')
const hours = (n) => n * 60 * 60 * 1000

describe('matchSheetDeadline', () => {
  it('⚠️ returns NULL for a squad it cannot place, and null means NO DEADLINE', () => {
    // The rule this module exists to get right. ageBandFromTeamName returns
    // null for a senior side AND for anything unparseable, and this cannot tell
    // them apart — so it refuses to guess. That module's null already caused a
    // real incident: allowsOwnContact read it as "a senior side: adults" and
    // offered a twelve-year-old girls' squad the child's own contact fields.
    // A confidently wrong deadline is the same mistake in a quieter register.
    expect(matchSheetDeadline('Senior Men 1st XV', KICK_OFF)).toBeNull()
    expect(matchSheetDeadline('', KICK_OFF)).toBeNull()
    expect(matchSheetDeadline(null, KICK_OFF)).toBeNull()
    expect(matchSheetDeadline(undefined, KICK_OFF)).toBeNull()
    expect(matchSheetDeadline('Development squad', KICK_OFF)).toBeNull()
  })

  it('⚠️ returns null for an unusable kick-off rather than an Invalid Date', () => {
    expect(matchSheetDeadline('U14B Contact', 'not a date')).toBeNull()
    expect(matchSheetDeadline('U14B Contact', undefined)).toBeNull()
  })

  it('gives U11-U16 twenty-four hours AFTER the game', () => {
    for (const name of ['U11 Contact', 'U12G QR', 'U14B Contact', 'U16B Contact']) {
      const due = matchSheetDeadline(name, KICK_OFF)
      expect(due.side).toBe('after')
      expect(due.at.getTime()).toBe(KICK_OFF.getTime() + hours(HOURS_AFTER))
    }
  })

  it('⚠️ gives U18 one hour BEFORE kick-off — the other side of the match', () => {
    // Both U18B Contact and U18G Contact exist in this club, so this is not a
    // hypothetical branch.
    for (const name of ['U18B Contact', 'U18G Contact', 'U18 Colts']) {
      const due = matchSheetDeadline(name, KICK_OFF)
      expect(due.side).toBe('before')
      expect(due.at.getTime()).toBe(KICK_OFF.getTime() - hours(HOURS_BEFORE))
    }
  })

  it('⚠️ the flip is at 18, not somewhere near it', () => {
    expect(matchSheetDeadline('U16B Contact', KICK_OFF).side).toBe('after')
    expect(matchSheetDeadline('U17 Contact', KICK_OFF).side).toBe('after')
    expect(matchSheetDeadline('U18B Contact', KICK_OFF).side).toBe('before')
    expect(matchSheetDeadline('U19 Contact', KICK_OFF).side).toBe('before')
  })

  it('carries the band, so a screen can explain itself', () => {
    expect(matchSheetDeadline('U14B Contact', KICK_OFF).band).toBe(14)
  })
})

describe('deadlineLabel', () => {
  it('says which side of the match it falls on', () => {
    expect(deadlineLabel(matchSheetDeadline('U14B Contact', KICK_OFF))).toMatch(/final whistle/i)
    expect(deadlineLabel(matchSheetDeadline('U18B Contact', KICK_OFF))).toMatch(/before kick-off/i)
  })

  it('⚠️ renders nothing at all for no deadline, not "null"', () => {
    expect(deadlineLabel(null)).toBe('')
    expect(deadlineLabel(matchSheetDeadline('Senior Men 1st XV', KICK_OFF))).toBe('')
  })
})

describe('isOverdue', () => {
  const u14 = matchSheetDeadline('U14B Contact', KICK_OFF)

  it('is true only once the deadline has passed', () => {
    expect(isOverdue(u14, new Date(KICK_OFF.getTime() + hours(23)))).toBe(false)
    expect(isOverdue(u14, new Date(KICK_OFF.getTime() + hours(25)))).toBe(true)
  })

  it('⚠️ NO DEADLINE IS NEVER OVERDUE', () => {
    // The null default again, in the place somebody is most likely to write
    // `deadline.at < now` without checking. A senior fixture flagged late for
    // a form that does not apply to it is a bug that erodes every other flag.
    expect(isOverdue(null, new Date('2030-01-01T00:00:00.000Z'))).toBe(false)
  })

  it('an unusable "now" is not overdue either', () => {
    expect(isOverdue(u14, 'whenever')).toBe(false)
  })

  it('⚠️ a U18 sheet is overdue from an hour before kick-off, not a day after', () => {
    const u18 = matchSheetDeadline('U18B Contact', KICK_OFF)
    // Half an hour before kick-off: already late by RCM's rule.
    expect(isOverdue(u18, new Date(KICK_OFF.getTime() - hours(0.5)))).toBe(true)
    expect(isOverdue(u18, new Date(KICK_OFF.getTime() - hours(2)))).toBe(false)
  })
})
