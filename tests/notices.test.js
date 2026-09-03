// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, afterAll } from 'vitest'

// ⚠️ PROCESS ZONE, AND IT IS THE DIFFERENCE BETWEEN A CHECK AND A DECORATION.
// `postedLabel` formats its absolute date in Asia/Dubai on purpose. Without this
// line the suite runs in the MACHINE's zone — and this app is built in Abu
// Dhabi, where local time already IS club time, so the assertion passed
// identically with the `timeZone` option deleted. Measured 16 Aug 2026 by
// deleting it: 31 passed. A test that cannot fail is not a test.
//
// New York because it is a long way the other side of UTC, so a date that
// straddles midnight in Dubai lands on a different day here and the two cannot
// be confused. Same reasoning, and the same spelling, as the fixture suites.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})
import {
  audienceLabel,
  scopeNotices,
  authorLine,
  canPostNotice,
  collapseGroups,
  noticeRowIds,
  postedLabel,
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
  const admin = [{ role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]
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

describe('postedLabel', () => {
  const NOW = new Date('2026-08-16T12:00:00.000Z').getTime()
  const ago = (ms) => new Date(NOW - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('reads as a person posting, not as a timestamp', () => {
    expect(postedLabel(ago(10 * 1000), NOW)).toBe('Just now')
    expect(postedLabel(ago(20 * MIN), NOW)).toBe('20 min ago')
    expect(postedLabel(ago(3 * HOUR), NOW)).toBe('3 hours ago')
    expect(postedLabel(ago(DAY), NOW)).toBe('Yesterday')
    expect(postedLabel(ago(3 * DAY), NOW)).toBe('3 days ago')
  })

  it('singularises one hour', () => {
    expect(postedLabel(ago(HOUR), NOW)).toBe('1 hour ago')
  })

  // ⚠️ THE POINT OF THE CUT. "37 days ago" is arithmetic the reader has to
  // undo; a date is the answer. A week is the horizon a club notice lives on.
  it('⚠️ switches to an absolute date after a week', () => {
    expect(postedLabel(ago(8 * DAY), NOW)).toBe('8 Aug')
    expect(postedLabel(ago(40 * DAY), NOW)).toBe('7 Jul')
  })

  // ⚠️ CLUB TIME. Dubai is UTC+4, so 20:30Z on the 5th is 00:30 on the 6th at
  // the club — they posted it on the 6th, and that is what a parent must read
  // wherever they happen to be. A UTC formatter prints "5 Aug".
  //
  // ⚠️ AND IT HAS TO BE MORE THAN A WEEK OLD TO TEST THIS AT ALL. The first
  // version of this case used a date four days back and asserted "12 Aug"; it
  // failed with "4 days ago", which was the FUNCTION being right and the test
  // being wrong. Inside the week there is no absolute date to check the zone of.
  it('⚠️ formats the absolute date in club time, not in whatever zone reads it', () => {
    expect(postedLabel('2026-08-05T20:30:00.000Z', NOW)).toBe('6 Aug')
  })

  // Clock skew between a phone and the database is real and small; "in -3
  // minutes" is never the honest rendering of it.
  it('⚠️ a future timestamp reads as Just now, never as negative time', () => {
    expect(postedLabel(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('Just now')
  })

  it('is empty rather than "Invalid Date" for missing or junk input', () => {
    expect(postedLabel(null, NOW)).toBe('')
    expect(postedLabel(undefined, NOW)).toBe('')
    expect(postedLabel('not a date', NOW)).toBe('')
  })
})

// ⚠️ THE FAN-OUT COLLAPSE, ADDED 21 Aug 2026 WITH MULTI-SQUAD NOTICES.
// A notice sent to three squads is three ROWS and one MESSAGE, because
// `team_id` is the security boundary and the squads cannot share a row. Anybody
// who can read more than one of them — an admin, a coach of two squads — sees
// the board, so this is what stops the same words appearing three times.
describe('collapseGroups', () => {
  const row = (id, team, group) => ({ id, team_id: team, group_id: group ?? null, title: 't' })

  it('leaves ordinary notices completely alone', () => {
    const rows = [row('a', 't1'), row('b', null), row('c', 't2')]
    expect(collapseGroups(rows)).toEqual(rows)
  })

  it('folds a fan-out into one entry carrying every squad', () => {
    const out = collapseGroups([row('a', 't1', 'g'), row('b', 't2', 'g'), row('c', 't3', 'g')])
    expect(out).toHaveLength(1)
    expect(out[0].teamIds).toEqual(['t1', 't2', 't3'])
    expect(out[0].groupIds).toEqual(['a', 'b', 'c'])
  })

  // ⚠️ ORDER IS THE POINT. The board is sorted newest-first by the caller, and
  // keeping the FIRST row of a group means the collapse cannot reorder it.
  it('keeps the first row of the group, so ordering survives', () => {
    const out = collapseGroups([row('new', 't1'), row('a', 't2', 'g'), row('b', 't3', 'g')])
    expect(out.map((n) => n.id)).toEqual(['new', 'a'])
  })

  it('never groups two different messages together', () => {
    const out = collapseGroups([row('a', 't1', 'g1'), row('b', 't2', 'g2')])
    expect(out).toHaveLength(2)
  })

  it('survives an empty or missing list', () => {
    expect(collapseGroups([])).toEqual([])
    expect(collapseGroups(undefined)).toEqual([])
  })

  // ⚠️ WHAT MARKING A CARD READ HAS TO COVER. Marking only the row the card is
  // keyed on leaves the unread dot coming back on the next load.
  it('hands back every row id behind a card', () => {
    const [folded] = collapseGroups([row('a', 't1', 'g'), row('b', 't2', 'g')])
    expect(noticeRowIds(folded)).toEqual(['a', 'b'])
    expect(noticeRowIds(row('solo', 't1'))).toEqual(['solo'])
  })
})

describe('audienceLabel across a group', () => {
  const teamsById = new Map([
    ['t1', { id: 't1', name: 'U10 Reds' }],
    ['t2', { id: 't2', name: 'U12 Blues' }],
  ])

  it('names every squad the message reached', () => {
    const folded = { team_id: 't1', teamIds: ['t1', 't2'] }
    expect(audienceLabel(folded, teamsById)).toBe('U10 Reds, U12 Blues')
  })

  // A squad the reader cannot see is dropped rather than rendered blank.
  it('skips a squad this reader cannot resolve', () => {
    const folded = { team_id: 't1', teamIds: ['t1', 'unknown'] }
    expect(audienceLabel(folded, teamsById)).toBe('U10 Reds')
  })
})

// ⚠️ "VIEW AS" IS A BROWSER FILTER, AND UNTIL 21 Aug 2026 IT DID NOT COVER
// NOTICES. Jay previewed as a U7 parent and saw a U18B manager's notice with a
// "Your squad" badge. RLS was never wrong — a real U7 parent is not sent it —
// but the admin's own session fetches every notice and nothing narrowed them
// to the squad being previewed. This is the filter every other Home block
// already had through visibleTeams().
describe('scopeNotices', () => {
  const teams = [
    { id: 'u7', name: 'U7 Tag', sort_order: 1 },
    { id: 'u18', name: 'U18B', sort_order: 9 },
  ]
  const rows = [
    notice({ id: 'club', team_id: null }),
    notice({ id: 'seven', team_id: 'u7' }),
    notice({ id: 'eighteen', team_id: 'u18' }),
  ]
  const parentOfU7 = [{ role: 'parent', status: 'active', team_id: 'u7' }]
  const admin = [{ role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

  it('shows a U7 parent the club notice and the U7 one, never the U18B one', () => {
    expect(scopeNotices(rows, parentOfU7, teams).map((n) => n.id)).toEqual(['club', 'seven'])
  })

  it('shows an admin everything', () => {
    expect(scopeNotices(rows, admin, teams).map((n) => n.id)).toEqual(['club', 'seven', 'eighteen'])
  })

  it('keeps a collapsed multi-squad notice if ANY of its squads is yours', () => {
    const multi = notice({ id: 'multi', team_id: 'u18', teamIds: ['u18', 'u7'] })
    expect(scopeNotices([multi], parentOfU7, teams).map((n) => n.id)).toEqual(['multi'])
  })
})

