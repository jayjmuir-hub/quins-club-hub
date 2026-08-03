import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/InviteForm.jsx: the admin-only invite creation
// UI, opened in the shared Sheet. useAuth, useMemberships and both data
// modules it touches (createInvite, listPlayers) are mocked, so this exercises
// only the form's own validation/submission behaviour — never a real network
// call. AccessBuilder/PlayerPicker are NOT mocked: the whole point of this
// screen now is that one invite can carry several targets, and that only
// holds if the real picker feeds the real submit handler.

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

const TOM = { id: 'p-1', full_name: 'Tom Fletcher', team_id: 't-u12' }
const ELLA = { id: 'p-2', full_name: 'Ella Fletcher', team_id: 't-u14' }

const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]

const ROLE = 'Role for the new member'
const SEND = /send invite/i

function renderForm({ memberships = ADMIN, teams = TEAMS, ...rest } = {}) {
  useAuthMock.mockReturnValue({ user: { id: 'user-1', email: 'admin@example.com' } })
  useMembershipsMock.mockReturnValue({ memberships, teams, loading: false, error: null, reload: vi.fn() })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const utils = render(<InviteForm onClose={onClose} onSaved={onSaved} {...rest} />)
  return { ...utils, onClose, onSaved }
}

/** Ticks an age group in AccessBuilder's checkbox group. */
async function pickAgeGroup(user, name) {
  const group = await screen.findByTestId('age-group-picker')
  await user.click(within(group).getByLabelText(name))
}

/** Ticks a player in PlayerPicker's result list. */
async function pickPlayer(user, name) {
  const picker = await screen.findByTestId('player-picker')
  await user.click(await within(picker).findByLabelText(new RegExp(name, 'i')))
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
    const select = screen.getByLabelText(ROLE)
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(expect.arrayContaining(['admin', 'coach', 'parent', 'player']))
  })

  it('shows the age-group picker for a coach role', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')

    expect(await screen.findByTestId('age-group-picker')).toBeInTheDocument()
  })

  it('hides the target picker entirely when the role is admin', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'admin')

    expect(screen.queryByTestId('age-group-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('player-picker')).not.toBeInTheDocument()
  })

  it('gives an admin every team in sort order', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')

    const group = await screen.findByTestId('age-group-picker')
    const names = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label').textContent.trim())
    expect(names).toEqual(['U12', 'U14'])
  })

  it('loads the whole roster, not one team, once a parent invite needs children', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([TOM, ELLA])
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')

    await waitFor(() => expect(listPlayersMock).toHaveBeenCalledWith())
    expect(await screen.findByText('Tom Fletcher')).toBeInTheDocument()
    expect(screen.getByText('Ella Fletcher')).toBeInTheDocument()
  })
})

describe('InviteForm — validation', () => {
  it('blocks submit and explains why when the email is blank', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('blocks submit and marks the field invalid when the email is not a valid address', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('requires a role before anything can be sent', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.click(screen.getByRole('button', { name: SEND }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a role/i)
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  // The invite equivalent of the dropped `invites_team_required_unless_admin`
  // CHECK constraint. Nothing in the database stops a non-admin invite with no
  // team and no targets any more — accept_invite only raises when the invitee
  // clicks the link, by which point the admin has already sent something
  // broken. This is the refusal that keeps such a link from existing.
  it('refuses an incomplete invite: a non-admin role with no age group chosen', async () => {
    const user = userEvent.setup()
    renderForm({ teams: [] })

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await user.click(screen.getByRole('button', { name: SEND }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one age group/i)
    expect(createInviteMock).not.toHaveBeenCalled()
  })

  it('does not require a team for an admin invite', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'newadmin@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'admin')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({ role: 'admin', teamId: null })
  })
})

describe('InviteForm — creating an invite', () => {
  it('creates a coach invite with the club id, email, role, one target and the legacy team id', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), '  coach@example.com  ')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toEqual({
      clubId: CLUB_ID,
      email: 'coach@example.com',
      role: 'coach',
      teamId: 't-u14',
      playerId: null,
      targets: [{ teamId: 't-u14', playerId: null }],
      createdBy: 'user-1',
    })
  })

  // The request this whole change exists for.
  it('gives a parent of two children in different age groups ONE invite with two targets', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([TOM, ELLA])
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'parent@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')
    await pickPlayer(user, 'Tom Fletcher')
    await pickPlayer(user, 'Ella Fletcher')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    const fields = createInviteMock.mock.calls[0][0]
    expect(fields.role).toBe('parent')
    // Each child's age group comes from that child, not from a separate
    // control that could contradict them.
    expect(fields.targets).toEqual([
      { teamId: 't-u12', playerId: 'p-1' },
      { teamId: 't-u14', playerId: 'p-2' },
    ])
    // With several targets the legacy columns stay null — any single value
    // would misdescribe the invite if the targets insert were rolled back.
    expect(fields.teamId).toBeNull()
    expect(fields.playerId).toBeNull()
  })

  it('gives a coach of two age groups one invite with two targets and no player', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U12')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'coach',
      teamId: null,
      targets: [
        { teamId: 't-u12', playerId: null },
        { teamId: 't-u14', playerId: null },
      ],
    })
  })

  it('gives an admin invite zero targets', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'newadmin@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'admin')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'admin',
      teamId: null,
      playerId: null,
      targets: [],
    })
  })

  it('sends a single-child parent invite as one target plus the legacy columns', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([TOM, ELLA])
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'parent@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')
    await pickPlayer(user, 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'parent',
      teamId: 't-u12',
      playerId: 'p-1',
      targets: [{ teamId: 't-u12', playerId: 'p-1' }],
    })
  })

  // Jay's explicit fallback: a parent whose children aren't imported yet.
  it('falls back to age groups for a parent whose children are not on the roster', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'parent@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')
    await user.click(screen.getByLabelText(/aren.t on the roster yet/i))
    await pickAgeGroup(user, 'U12')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'parent',
      targets: [{ teamId: 't-u12', playerId: null }],
    })
  })

  it('shows the accept link on success rather than closing the sheet', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    const link = await screen.findByDisplayValue(/\/accept-invite\/tok-abc-123$/)
    expect(link).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('surfaces a creation failure in an alert region', async () => {
    const user = userEvent.setup()
    createInviteMock.mockRejectedValue(new Error("We couldn't send that invite."))
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'coach')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: SEND }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send that invite.")
  })

  it('has no jersey number anywhere in the player picker', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([{ ...TOM, jersey_num: 7 }])
    renderForm()

    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')
    await screen.findByText('Tom Fletcher')

    expect(screen.queryByText(/jersey/i)).not.toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})
