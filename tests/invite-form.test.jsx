import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/InviteForm.jsx (Task 18): the admin-only invite
// creation UI, opened in the shared Sheet. useAuth, useMemberships and both
// data modules it touches (createInvite, listPlayers) are mocked, so this
// exercises only the form's own validation/submission behaviour — never a
// real network call.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const createInviteMock = vi.fn()
const listPlayersMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  createInvite: (...args) => createInviteMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

// Imported after vi.mock so this binds to the mocked modules.
import InviteForm from '../src/screens/InviteForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAMS = [TEAM_U14, TEAM_U12] // deliberately unsorted

const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]

function renderForm({ memberships = ADMIN, teams = TEAMS, ...rest } = {}) {
  useAuthMock.mockReturnValue({ user: { id: 'user-1', email: 'admin@example.com' } })
  useMembershipsMock.mockReturnValue({ memberships, teams, loading: false, error: null, reload: vi.fn() })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const utils = render(<InviteForm onClose={onClose} onSaved={onSaved} {...rest} />)
  return { ...utils, onClose, onSaved }
}

beforeEach(() => {
  useAuthMock.mockReset()
  useMembershipsMock.mockReset()
  createInviteMock.mockReset()
  listPlayersMock.mockReset()
  listPlayersMock.mockResolvedValue([])
  createInviteMock.mockImplementation(async (fields) => ({
    id: 'inv-1',
    token: 'tok-abc-123',
    ...fields,
  }))
})

describe('InviteForm — shape', () => {
  it('opens as a sheet titled for inviting a member', () => {
    renderForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /invite a member/i })).toBeInTheDocument()
  })

  it('offers every role', () => {
    renderForm()
    const select = screen.getByLabelText('Role')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(expect.arrayContaining(['admin', 'coach', 'parent', 'player']))
  })

  it('shows the age-group field for a non-admin role', () => {
    renderForm()
    expect(screen.getByLabelText('Age group')).toBeInTheDocument()
  })

  it('hides the age-group field when the role is admin', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Role'), 'admin')

    expect(screen.queryByLabelText('Age group')).not.toBeInTheDocument()
  })

  it('gives an admin every team in sort order', () => {
    renderForm()
    const select = screen.getByLabelText('Age group')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['Choose an age group', 'U12', 'U14'])
  })
})

describe('InviteForm — validation', () => {
  it('blocks submit and explains why when the email is blank', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/highlighted|fill in|valid email/i)
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('blocks submit and marks the field invalid when the email is not a valid address', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('requires a team for a coach invite', async () => {
    const user = userEvent.setup()
    renderForm({ teams: [] })

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'coach')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('does not require a team for an admin invite', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'newadmin@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'admin')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({ role: 'admin', teamId: null })
  })
})

describe('InviteForm — creating an invite', () => {
  it('creates a coach invite with the club id, email, role, team and no player', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), '  coach@example.com  ')
    await user.selectOptions(screen.getByLabelText('Role'), 'coach')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toEqual({
      clubId: CLUB_ID,
      email: 'coach@example.com',
      role: 'coach',
      teamId: 't-u14',
      playerId: null,
      createdBy: 'user-1',
    })
  })

  it('lists players scoped to the chosen team once a parent invite has a team', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', full_name: 'Tom Fletcher', team_id: 't-u12' },
    ])
    renderForm()

    await user.selectOptions(screen.getByLabelText('Role'), 'parent')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u12')

    await waitFor(() => expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['t-u12'] }))
    expect(await screen.findByText('Tom Fletcher')).toBeInTheDocument()
  })

  it('sends the chosen player id when linking a parent to their child', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', full_name: 'Tom Fletcher', team_id: 't-u12' },
    ])
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'parent@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'parent')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u12')
    await screen.findByText('Tom Fletcher')
    await user.selectOptions(screen.getByLabelText('Player (optional)'), 'p-1')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({ playerId: 'p-1' })
  })

  it('shows the accept link on success rather than closing the sheet', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'coach')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    const link = await screen.findByDisplayValue(/\/accept-invite\/tok-abc-123$/)
    expect(link).toBeInTheDocument()
  })

  it('surfaces a creation failure in an alert region', async () => {
    const user = userEvent.setup()
    createInviteMock.mockRejectedValue(new Error("We couldn't send that invite."))
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'coach')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send that invite.")
  })

  it('has no jersey number anywhere in the player picker', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([
      { id: 'p-1', full_name: 'Tom Fletcher', team_id: 't-u12', jersey_num: 7 },
    ])
    renderForm()

    await user.selectOptions(screen.getByLabelText('Role'), 'parent')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u12')
    await screen.findByText('Tom Fletcher')

    expect(screen.queryByText(/jersey/i)).not.toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})
