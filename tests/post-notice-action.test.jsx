import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// "Post a notice", wherever the person already is.
//
// ⚠️ THE BUG THIS FEATURE CAME OUT OF IS IN tests/notices.test.js AND
// tests/memberships.test.jsx, not here. Jay, previewing as a coach on 16 Aug
// 2026: "i don't see the ability to post a notice for comms, the link takes me
// to a page with nothing there". The missing button was a membership row with no
// `status`; the missing SCREEN was that posting lived behind a link. This file
// covers the second half.
//
// ⚠️ MOUNTED WITH A REAL useMemberships MOCK RATHER THAN A ROUTER, because the
// component's whole job is a permission decision plus a sheet. Nothing here
// touches the network: the composer's write is mocked at the data module.

const useMembershipsMock = vi.fn()
const createNoticeMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/announcements.js', () => ({
  createNotice: (...a) => createNoticeMock(...a),
  listNotices: async () => [],
  listMyReads: async () => new Set(),
  markNoticesRead: async () => {},
  noticeStats: async () => new Map(),
  noticeAudience: async () => [],
  deleteNotice: async () => {},
}))

import PostNoticeAction from '../src/components/PostNoticeAction.jsx'

const TEAMS = [
  { id: 't1', name: 'U14B Contact', sort_order: 9 },
  { id: 't2', name: 'U16 Girls', sort_order: 11 },
]

function ctx(memberships) {
  return { memberships, realMemberships: memberships, teams: TEAMS, loading: false, error: null, reload: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  createNoticeMock.mockResolvedValue({ id: 'n1' })
})

describe('PostNoticeAction', () => {
  it('offers a coach the button', () => {
    useMembershipsMock.mockReturnValue(ctx([{ role: 'coach', status: 'active', team_id: 't1' }]))
    render(<PostNoticeAction />)
    expect(screen.getByTestId('post-notice-action')).toBeInTheDocument()
  })

  // ⚠️ NOTHING, NOT A DISABLED BUTTON. A parent has no use for the concept, and
  // explaining a control they cannot use is worse than its absence.
  it('⚠️ renders nothing at all for a parent', () => {
    useMembershipsMock.mockReturnValue(ctx([{ role: 'parent', status: 'active', team_id: 't1' }]))
    const { container } = render(<PostNoticeAction />)
    expect(screen.queryByTestId('post-notice-action')).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })

  // ⚠️ THE REGRESSION GUARD FOR THE REPORTED BUG, at the level it was seen. A
  // preview builds ONE synthetic membership row; if it ever loses `status`
  // again, this is the test that says so in the language Jay used — the button
  // is not there.
  it('⚠️ offers the button while previewing as a coach', () => {
    useMembershipsMock.mockReturnValue(
      ctx([{ id: 'view-as', role: 'coach', team_id: 't1', player_id: null, club_id: 'c1', status: 'active' }]),
    )
    render(<PostNoticeAction />)
    expect(screen.getByTestId('post-notice-action')).toBeInTheDocument()
  })

  it('opens the composer in place, without navigating anywhere', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(ctx([{ role: 'coach', status: 'active', team_id: 't1' }]))
    render(<PostNoticeAction />)

    await user.click(screen.getByTestId('post-notice-action'))
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
  })

  // ⚠️ A COACH MUST NOT BE OFFERED SQUADS THEY DO NOT STAFF. The composer's
  // picker is filtered by postableTeams; this pins that the filtering actually
  // reaches it through this component rather than being lost in the props.
  it('⚠️ offers a coach only their own squad in the picker', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(ctx([{ role: 'coach', status: 'active', team_id: 't1' }]))
    render(<PostNoticeAction />)

    await user.click(screen.getByTestId('post-notice-action'))
    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.queryByText('U16 Girls')).toBeNull()
  })

  it('gives an admin every squad', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(ctx([{ role: 'admin', status: 'active', team_id: null }]))
    render(<PostNoticeAction />)

    await user.click(screen.getByTestId('post-notice-action'))
    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.getByText('U16 Girls')).toBeInTheDocument()
  })
})
