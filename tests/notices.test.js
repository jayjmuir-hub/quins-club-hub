// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  audienceLabel,
  authorLine,
  canPostNotice,
  currentNotices,
  isExpired,
  MAX_PINNED_ON_HOME,
  pinnedNotices,
  postableTeams,
  seenSummary,
  unreadCount,
} from '../src/lib/notices.js'

// The pure half of the noticeboard. db/tests/announcements.sql covers the
// database's half — these two files are testing different things and neither
// substitutes for the other: RLS decides who may READ a notice, this decides
// what a person is SHOWN and what they may be OFFERED.

const NOW = Date.parse('2026-08-14T12:00:00Z')
const hoursFromNow = (h) => new Date(NOW + h * 3600 * 1000).toISOString()

function notice(overrides = {}) {
  return {
    id: overrides.id ?? 'n1',
    team_id: null,
    title: 'A notice',
    body: 'Some words.',
    pinned: false,
    expires_at: null,
    created_at: hoursFromNow(-1),
    ...overrides,
  }
}

describe('isExpired', () => {
  // ⚠️ THE ONE THAT WOULD EMPTY THE WHOLE BOARD. `expires_at` is nullable and
  // null is the normal case; reading it as 0 hides every notice ever posted.
  it('treats a null expiry as forever', () => {
    expect(isExpired(notice({ expires_at: null }), NOW)).toBe(false)
  })

  it('is true once the moment has passed', () => {
    expect(isExpired(notice({ expires_at: hoursFromNow(-1) }), NOW)).toBe(true)
  })

  it('is false while it is still in the future', () => {
    expect(isExpired(notice({ expires_at: hoursFromNow(1) }), NOW)).toBe(false)
  })

  // Fails OPEN. A notice shown too long is a nuisance; one silently hidden by a
  // malformed timestamp is a message the club believes it sent.
  it('treats an unparseable expiry as no expiry', () => {
    expect(isExpired(notice({ expires_at: 'not a date' }), NOW)).toBe(false)
  })
})

describe('currentNotices', () => {
  it('drops expired ones and keeps the rest', () => {
    const rows = [
      notice({ id: 'live' }),
      notice({ id: 'dead', expires_at: hoursFromNow(-2) }),
    ]
    expect(currentNotices(rows, NOW).map((n) => n.id)).toEqual(['live'])
  })

  it('survives a null list', () => {
    expect(currentNotices(null, NOW)).toEqual([])
  })
})

describe('pinnedNotices', () => {
  it('takes only the pinned ones', () => {
    const rows = [notice({ id: 'a', pinned: true }), notice({ id: 'b' })]
    expect(pinnedNotices(rows, NOW).map((n) => n.id)).toEqual(['a'])
  })

  // A pinned notice that has expired is still expired. Pinning is about
  // PROMINENCE, never about exemption.
  it('still drops an expired pinned notice', () => {
    const rows = [notice({ id: 'a', pinned: true, expires_at: hoursFromNow(-1) })]
    expect(pinnedNotices(rows, NOW)).toEqual([])
  })

  it('caps what the home screen draws', () => {
    const rows = Array.from({ length: MAX_PINNED_ON_HOME + 2 }, (_, i) =>
      notice({ id: `n${i}`, pinned: true }),
    )
    expect(pinnedNotices(rows, NOW)).toHaveLength(MAX_PINNED_ON_HOME)
  })
})

describe('unreadCount', () => {
  it('counts only the unread current ones', () => {
    const rows = [
      notice({ id: 'read' }),
      notice({ id: 'unread' }),
      notice({ id: 'gone', expires_at: hoursFromNow(-1) }),
    ]
    expect(unreadCount(rows, new Set(['read']), NOW)).toBe(1)
  })

  // ⚠️ A badge that counts something the list will not display cannot be
  // cleared, and the person tapping it has no way to find out why.
  it('never counts an expired notice, however unread', () => {
    const rows = [notice({ id: 'gone', expires_at: hoursFromNow(-1) })]
    expect(unreadCount(rows, new Set(), NOW)).toBe(0)
  })
})

describe('audienceLabel', () => {
  const teamsById = new Map([['t1', { id: 't1', name: 'U16B Contact' }]])

  it('names the whole club when there is no team', () => {
    expect(audienceLabel(notice({ team_id: null }), teamsById)).toBe('Whole club')
  })

  it('names the squad', () => {
    expect(audienceLabel(notice({ team_id: 't1' }), teamsById)).toBe('U16B Contact')
  })

  // ⚠️ THE ONE THAT MATTERS. An unresolvable team id is a scope gap, and
  // labelling that squad message "Whole club" would tell the reader that thirty
  // other families have it when they do not.
  it('falls back to "Your squad", never to "Whole club"', () => {
    expect(audienceLabel(notice({ team_id: 'unknown' }), teamsById)).toBe('Your squad')
  })
})

describe('authorLine', () => {
  it('prefers the title over the bare name', () => {
    expect(authorLine({ author: { full_name: 'Sarah Nolan', title: 'Head Coach' } }))
      .toBe('Sarah Nolan · Head Coach')
  })

  it('carries the line on the name alone when there is no title', () => {
    expect(authorLine({ author: { full_name: 'Sarah Nolan' } })).toBe('Sarah Nolan')
  })

  // The profiles row is created by a trigger with an empty full_name, so this
  // is a real state and not a defensive branch.
  it('is null when the author has no name set', () => {
    expect(authorLine({ author: { full_name: '  ' } })).toBeNull()
    expect(authorLine({})).toBeNull()
  })
})

describe('who may post', () => {
  const teams = [
    { id: 't1', name: 'U16B Contact' },
    { id: 't2', name: 'U13 Mixed' },
  ]
  const coach = [{ role: 'coach', status: 'active', team_id: 't1' }]
  const admin = [{ role: 'admin', status: 'active', team_id: null }]
  const parent = [{ role: 'parent', status: 'active', team_id: 't1' }]
  const pendingCoach = [{ role: 'coach', status: 'pending', team_id: 't1' }]

  it('offers a coach their own squad and nothing else', () => {
    expect(canPostNotice(coach)).toBe(true)
    expect(postableTeams(coach, teams).map((t) => t.id)).toEqual(['t1'])
  })

  it('offers an admin every squad', () => {
    expect(postableTeams(admin, teams).map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('offers a parent nothing', () => {
    expect(canPostNotice(parent)).toBe(false)
    expect(postableTeams(parent, teams)).toEqual([])
  })

  // ⚠️ MIRRORS `private.can_edit_team`, WHICH WAS MADE STATUS-AWARE ON 11 Aug
  // 2026 precisely because a PENDING staff member could edit their squad's
  // events. If this goes green with a pending coach, the client is offering a
  // composer the database will refuse.
  it('offers a PENDING coach nothing', () => {
    expect(canPostNotice(pendingCoach)).toBe(false)
    expect(postableTeams(pendingCoach, teams)).toEqual([])
  })

  it('offers a medic their squad, because can_edit_team does', () => {
    const medic = [{ role: 'medic', status: 'active', team_id: 't2' }]
    expect(postableTeams(medic, teams).map((t) => t.id)).toEqual(['t2'])
  })

  // ⚠️ A TOMBSTONE. THIS IS THE BUG JAY HIT ON 16 Aug 2026, AND THE FIX IS NOT
  // HERE — do not loosen this to make a preview work.
  //
  // Every other case in this block passes an explicit `status`, which is
  // precisely why they all stayed green while the live app was broken: the one
  // shape never exercised was a row with NO status at all, and that is exactly
  // what syntheticMemberships() built for "view as". An admin previewing as a
  // coach therefore got no composer, silently, because a preview quietly
  // holding fewer rights has no error path to notice.
  //
  // Being strict here is CORRECT. The database check is `status = 'active'`, so
  // a client that guessed "no status means active" would offer a composer the
  // database refuses — somebody writes three paragraphs and then loses them.
  // The row is what was wrong, and src/lib/memberships.jsx now sets
  // `status: 'active'` on it.
  it('⚠️ offers a membership with NO status nothing — the fix belongs on the row', () => {
    const noStatus = [{ role: 'coach', team_id: 't1' }]
    expect(canPostNotice(noStatus)).toBe(false)
    expect(postableTeams(noStatus, teams)).toEqual([])
  })
})

describe('seenSummary', () => {
  it('reads as a fraction', () => {
    expect(seenSummary({ audience_count: 24, seen_count: 18 })).toBe('18 of 24 seen')
  })

  // A squad with no active members is a real state, and "0 of 0 seen" reads as
  // a broken counter rather than as an empty squad.
  it('says nothing at all when there is no audience', () => {
    expect(seenSummary({ audience_count: 0, seen_count: 0 })).toBeNull()
    expect(seenSummary(null)).toBeNull()
  })
})
