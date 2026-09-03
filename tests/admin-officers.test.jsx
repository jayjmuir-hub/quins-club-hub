import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// /admin/officers — the committee list, titles WITHOUT rights
// (claude/plans/2026-08-26-club-officers.md). What matters here: the
// super-only gate (the rights-log pattern), all eight titles rendered in
// dignity order, and appoint/remove moving rows — RLS is the database's
// half (db/tests/club-officers.sql).

const useMembershipsMock = vi.fn()
const m = { listClubOfficers: vi.fn(), addClubOfficer: vi.fn(), removeClubOfficer: vi.fn(), listClubMembers: vi.fn() }
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/officers.js', () => ({
  listClubOfficers: (...a) => m.listClubOfficers(...a),
  addClubOfficer: (...a) => m.addClubOfficer(...a),
  removeClubOfficer: (...a) => m.removeClubOfficer(...a),
}))
vi.mock('../src/data/members.js', () => ({ listClubMembers: (...a) => m.listClubMembers(...a) }))

import AdminOfficers from '../src/screens/AdminOfficers.jsx'
import { OFFICER_TITLES } from '../src/lib/identity.js'

// ⚠️ NAMES INVENTED — CLAUDE.md rule 9.
const SUPER = [{ id: 'm1', role: 'admin', team_id: null, club_id: 'club-1', status: 'active', is_super: true }]
const PLAIN = [{ id: 'm2', role: 'admin', team_id: null, club_id: 'club-1', status: 'active', is_super: false }]

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: SUPER, teams: [] })
  m.listClubOfficers.mockResolvedValue([
    { id: 'o1', club_id: 'club-1', profile_id: 'p1', title: 'Treasurer', profile: { full_name: 'Zz Counting Probe' } },
  ])
  m.listClubMembers.mockResolvedValue([
    { profile_id: 'p1', profiles: { full_name: 'Zz Counting Probe' } },
    { profile_id: 'p2', profiles: { full_name: 'Zz Presiding Probe' } },
  ])
  m.addClubOfficer.mockResolvedValue()
  m.removeClubOfficer.mockResolvedValue()
})

describe('AdminOfficers', () => {
  it('⚠️ a plain admin is told this is not their job', () => {
    useMembershipsMock.mockReturnValue({ memberships: PLAIN, teams: [] })
    render(<AdminOfficers />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not authorised')
    expect(m.listClubOfficers).not.toHaveBeenCalled()
  })

  it('renders every title in dignity order, holders under theirs', async () => {
    render(<AdminOfficers />)
    const blocks = await screen.findAllByTestId('officer-title')
    expect(blocks.map((b) => b.querySelector('h4').textContent)).toEqual(OFFICER_TITLES)
    const treasurer = blocks[OFFICER_TITLES.indexOf('Treasurer')]
    expect(within(treasurer).getByText('Zz Counting Probe')).toBeInTheDocument()
  })

  it('appointing picks a person and writes the row', async () => {
    const user = userEvent.setup()
    render(<AdminOfficers />)
    await screen.findAllByTestId('officer-title')
    await user.selectOptions(screen.getByLabelText('Appoint Club President'), 'p2')
    const presidentBlock = (await screen.findAllByTestId('officer-title'))[0]
    await user.click(within(presidentBlock).getByRole('button', { name: 'Appoint' }))
    await waitFor(() => expect(m.addClubOfficer).toHaveBeenCalledWith('club-1', 'p2', 'Club President'))
  })

  it('remove unappoints by row id', async () => {
    const user = userEvent.setup()
    render(<AdminOfficers />)
    await screen.findAllByTestId('officer-title')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(m.removeClubOfficer).toHaveBeenCalledWith('o1'))
  })
})
