import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Club Diary phase 1, task 9 — claude/plans/2026-08-31-club-diary.md.
//
// ⚠️ THIS FILE ASSERTS A DELIBERATE NON-CHANGE, and that is its whole reason to
// exist. Schedule EXCLUDES Club Diary entries from its Socials pill; this screen
// INCLUDES them, on purpose. A parent filtering the schedule to Socials does not
// want a kit collection; the media team does — the club's own "3 week look
// ahead" poster, which is what prompted the whole feature, lists one.
//
// The two screens therefore disagree, correctly. Without a test saying so, the
// difference reads as an oversight and the next person "fixes" it.
//
// ⚠️ THIS IS ALSO THE FIRST TEST THIS SCREEN HAS EVER HAD. It was uncovered
// before today (measured, with a control: nothing under tests/ referenced
// SocialWhatsOn or its whats-on-row testid).
//
// ⚠️ EVERY EVENT BELOW IS INVENTED. This repo is PUBLIC.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
}))

import SocialWhatsOn from '../src/screens/SocialWhatsOn.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }

// An admin holding the `media` right — what gates this screen.
const MEDIA_ADMIN = [
  { id: 'm-media', role: 'admin', status: 'active', team_id: null, admin_rights: ['media'] },
]

// Far enough ahead to land in "Coming up" whenever this test runs, and inside
// the screen's own 6-months-forward window.
const soon = () => new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()

const PARTY = {
  id: 'e-party',
  club_id: CLUB_ID,
  team_id: 't-u16',
  type: 'social',
  title: 'Welcome back party',
  info_only: false,
  starts_at: soon(),
  opponent: null,
  home: null,
  venue: 'The clubhouse',
}

const KIT = { ...PARTY, id: 'e-kit', title: 'Kit collection', info_only: true }

beforeEach(() => {
  useMembershipsMock.mockReset()
  listEventsMock.mockReset()
  useMembershipsMock.mockReturnValue({
    memberships: MEDIA_ADMIN,
    teams: [TEAM_U16],
    loading: false,
    error: null,
  })
  listEventsMock.mockResolvedValue([PARTY, KIT])
})

describe('SocialWhatsOn and Club Diary entries', () => {
  it('lists an information-only event alongside ordinary socials', async () => {
    render(<SocialWhatsOn />)
    const rows = await screen.findAllByTestId('whats-on-row')
    expect(rows).toHaveLength(2)
  })

  it('⚠️ KEEPS diary entries under the Socials filter — unlike Schedule', async () => {
    const user = userEvent.setup()
    render(<SocialWhatsOn />)
    await screen.findAllByTestId('whats-on-row')

    await user.click(screen.getByRole('button', { name: 'Socials' }))

    // BOTH survive. Schedule deliberately does the opposite; if somebody makes
    // the two screens agree, one of them gets worse.
    expect(screen.getAllByTestId('whats-on-row')).toHaveLength(2)
    expect(screen.getByText('diary')).toBeInTheDocument()
    expect(screen.getByText('social')).toBeInTheDocument()
  })

  it('labels the diary entry as a diary, not as a second social', async () => {
    // Including it in the filter and CALLING it a social are different
    // questions. The chip goes through eventChipKind.
    render(<SocialWhatsOn />)
    await screen.findAllByTestId('whats-on-row')

    expect(screen.getByText('diary')).toBeInTheDocument()
    expect(screen.queryAllByText('social')).toHaveLength(1)
  })
})
