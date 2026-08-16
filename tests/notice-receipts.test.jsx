import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ⚠️ THE RECEIPTS SHEET HAD NO TEST AT ALL until this file. It shipped on
// 14 Aug 2026 listing only the people who had NOT seen a notice — the number
// said "1 of 6 seen" and there was no way to find out which one. The data was
// there the whole time (`announcement_audience` returns `read_at` for every
// member of the audience); the sheet computed the seen COUNT and drew only the
// unseen NAMES. Found by Jay on the first real notice he posted.
vi.mock('../src/data/announcements.js', () => ({
  listNotices: vi.fn(),
  noticeStats: vi.fn(),
  noticeAudience: vi.fn(),
  createNotice: vi.fn(),
  deleteNotice: vi.fn(),
  listMyReads: vi.fn(),
  markNoticesRead: vi.fn(),
  // ⚠️ REALTIME (16 Aug 2026). An unmocked export is `undefined`, and this one
  // is called in an effect — so every case in this file died before rendering.
  // It must also return an unsubscribe FUNCTION: the effect returns whatever
  // this gives back, and React calls it on cleanup.
  subscribeNotices: () => () => {},
}))

vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))

import {
  listNotices,
  noticeStats,
  noticeAudience,
  listMyReads,
  markNoticesRead,
} from '../src/data/announcements.js'
import Notices from '../src/screens/Notices.jsx'

const TEAM = { id: 't16b', name: 'U16B Contact', sort_order: 16 }

// Hoisted by vi.mock above, so it must be declared with `var`-like timing —
// vi.mock factories run before the module body, and this is only READ inside
// the factory's returned function, which runs at render time.
function useMembershipsMock() {
  return {
    memberships: [{ team_id: TEAM.id, role: 'coach', status: 'active', club_id: 'c1' }],
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

const NOTICE = {
  id: 'n1',
  team_id: 't16b',
  title: 'Saturday moved',
  body: 'We are at Al Bateen this week.',
  pinned: true,
  expires_at: null,
  created_at: '2026-08-14T09:52:56.452855+00:00',
  author: { full_name: 'Jay Muir' },
}

// Two seen, three not — deliberately not a 1/1 split, so a component that
// rendered the same list twice would still be caught.
//
// ⚠️ INVENTED NAMES, AND THE FIRST DRAFT OF THIS FILE USED REAL ONES — lifted
// from a screenshot of the live U16B board, hours after CLAUDE.md rule 9 was
// written to forbid exactly that. `docs:check` caught ONE of them, and only
// because it happened to collide with the retired-names list; the other four
// would have sailed through. **A checker is not the gate here. The gate is
// inventing the data in the first place.**
const AUDIENCE = [
  { profile_id: 'p1', full_name: 'Hana Farouk', read_at: null },
  { profile_id: 'p2', full_name: 'Marta Nowak', read_at: null },
  { profile_id: 'p3', full_name: 'Owen Pryce', read_at: null },
  { profile_id: 'p4', full_name: 'Delia Cortez', read_at: '2026-08-14T09:54:22.688813+00:00' },
  { profile_id: 'p5', full_name: 'Rashid Al Bastaki', read_at: '2026-08-14T11:10:00.000000+00:00' },
]

function setup(audience = AUDIENCE) {
  const seen = audience.filter((row) => row.read_at).length
  listNotices.mockResolvedValue([NOTICE])
  // noticeStats resolves to a Map — the screen does `setStats(await noticeStats())`.
  noticeStats.mockResolvedValue(
    new Map([['n1', { audience_count: audience.length, seen_count: seen }]]),
  )
  listMyReads.mockResolvedValue(new Set())
  markNoticesRead.mockResolvedValue(undefined)
  noticeAudience.mockResolvedValue(audience)

  return render(
    <MemoryRouter>
      <Notices />
    </MemoryRouter>,
  )
}

async function openReceipts() {
  const user = userEvent.setup()
  await user.click(await screen.findByTestId('open-receipts'))
}

describe('Receipts — who has seen a notice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists the people who HAVE seen it, not only the ones who have not', async () => {
    setup()
    await openReceipts()

    const seen = await screen.findAllByTestId('receipt-seen')
    expect(seen.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Delia Cortez'),
        expect.stringContaining('Rashid Al Bastaki'),
      ]),
    )
    expect(seen).toHaveLength(2)
  })

  // ⚠️ THE CHASE LIST IS THE ONE A COACH ACTS ON, so it stays and stays first.
  // This test exists so that "add the seen list" cannot quietly become "replace
  // the unseen list with the seen list".
  it('still lists the people who have NOT seen it', async () => {
    setup()
    await openReceipts()

    const unread = await screen.findAllByTestId('receipt-unread')
    expect(unread).toHaveLength(3)
    expect(unread.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Hana Farouk'),
        expect.stringContaining('Marta Nowak'),
        expect.stringContaining('Owen Pryce'),
      ]),
    )
  })

  // The one number a coach reads at a glance. 2 of 5 here, and it must keep
  // agreeing with the two lists beneath it.
  it('the headline count agrees with the two lists', async () => {
    setup()
    await openReceipts()

    // ⚠️ SCOPED TO THE SHEET. The notice row itself carries the same summary as
    // the button that opens this, so an unscoped query matches twice and the
    // failure reads as a duplicate-render bug rather than a loose selector.
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText('2 of 5 seen')).toBeInTheDocument()
    expect(screen.getAllByTestId('receipt-seen')).toHaveLength(2)
    expect(screen.getAllByTestId('receipt-unread')).toHaveLength(3)
  })

  // ⚠️ NOT COSMETIC. "Did they see it before training?" is the actual question
  // behind a read receipt, and a bare name cannot answer it.
  it('says WHEN each person saw it', async () => {
    setup()
    await openReceipts()

    const delia = screen
      .getAllByTestId('receipt-seen')
      .find((row) => row.textContent.includes('Delia Cortez'))
    // Rendered in the club's zone, so the exact string depends on locale — the
    // assertion is that a time is shown at all, beside the right person.
    expect(delia.textContent).toMatch(/\d/)
  })

  it('says so plainly when nobody has seen it yet', async () => {
    setup(AUDIENCE.map((row) => ({ ...row, read_at: null })))
    await openReceipts()

    expect(await screen.findByText(/no one has seen this yet/i)).toBeInTheDocument()
    expect(screen.queryAllByTestId('receipt-seen')).toHaveLength(0)
  })

  it('still says everyone has seen it when nobody is outstanding', async () => {
    setup(AUDIENCE.map((row) => ({ ...row, read_at: '2026-08-14T09:54:22.688813+00:00' })))
    await openReceipts()

    expect(await screen.findByText(/everyone has seen this/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('receipt-seen')).toHaveLength(5)
  })
})
