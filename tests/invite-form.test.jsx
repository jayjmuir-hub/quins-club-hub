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
const upsertPlayerMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  createInvite: (...args) => createInviteMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  // ⚠️ AccessBuilder CREATES THE CHILD for a parent whose child is not on the
  // roster (20 Aug 2026). Unmocked, the export is undefined and the click throws.
  upsertPlayer: (...args) => upsertPlayerMock(...args),
}))

// Imported after vi.mock so this binds to the mocked modules.
import InviteForm from '../src/screens/InviteForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAMS = [TEAM_U14, TEAM_U12] // deliberately unsorted

const TOM = { id: 'p-1', full_name: 'Tom Fletcher', team_id: 't-u12' }
const ELLA = { id: 'p-2', full_name: 'Ella Fletcher', team_id: 't-u14' }

const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

// The five-child family (Jay, 3 Aug 2026: some parents have three, four or
// five children at the club, in different age groups). Five age groups, and a
// roster of 45 — bigger than PlayerPicker's MAX_RESULTS = 25 — so the draw cap
// is active for the whole of the invite test below.
const TEAM_U8 = { id: 't-u8', club_id: CLUB_ID, name: 'U8', sort_order: 3 }
const TEAM_U10 = { id: 't-u10', club_id: CLUB_ID, name: 'U10', sort_order: 5 }
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
const BIG_TEAMS = [TEAM_U14, TEAM_U8, TEAM_U16, TEAM_U12, TEAM_U10]

// Siblings share a surname, so each is reached by a different search term
// (their first name) and each term matches exactly one row — which is what
// makes "does an earlier pick survive a query that no longer matches it?" a
// real question rather than an accident of the fixture.
const HADDADS = [
  { id: 'p-yusuf', full_name: 'Yusuf Haddad', team_id: 't-u8' },
  { id: 'p-layla', full_name: 'Layla Haddad', team_id: 't-u10' },
  { id: 'p-ibrahim', full_name: 'Ibrahim Haddad', team_id: 't-u12' },
  { id: 'p-noura', full_name: 'Noura Haddad', team_id: 't-u14' },
  { id: 'p-zaid', full_name: 'Zaid Haddad', team_id: 't-u16' },
]

const FILLER_FIRST = [
  'Adam', 'Ben', 'Callum', 'Daniel', 'Ethan', 'Farhan', 'George', 'Hamza',
  'Isaac', 'Jack', 'Kareem', 'Liam', 'Mohsin', 'Nathan', 'Oscar', 'Patrick',
  'Quentin', 'Rashid', 'Samir', 'Tariq',
]
const FILLER_TEAMS = ['t-u8', 't-u10', 't-u12', 't-u14', 't-u16']
// 40 players, none of whose names contain "haddad" or any Haddad first name.
const FILLER = ['Brown', 'Carter'].flatMap((last, lastIndex) =>
  FILLER_FIRST.map((first, firstIndex) => ({
    id: `p-filler-${lastIndex}-${firstIndex}`,
    full_name: `${first} ${last}`,
    team_id: FILLER_TEAMS[(lastIndex * FILLER_FIRST.length + firstIndex) % FILLER_TEAMS.length],
  })),
)

// The five children sit at indexes 3, 12, 26, 33 and 44 of 45 — two of them
// past the 25-row cap, so they are not drawn until they are searched for.
const BIG_ROSTER = [
  ...FILLER.slice(0, 3),
  HADDADS[0],
  ...FILLER.slice(3, 11),
  HADDADS[1],
  ...FILLER.slice(11, 24),
  HADDADS[2],
  ...FILLER.slice(24, 30),
  HADDADS[3],
  ...FILLER.slice(30, 40),
  HADDADS[4],
]

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
    // Under the field, and named as its description (2 Sep 2026 UX review).
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'invite-email-error')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/valid email/i)
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

  // The same request at its real size: one parent, FIVE children, five age
  // groups, one invite. Driven through the real PlayerPicker search — an admin
  // cannot see 45 players at once, so they must type, click, retype, click,
  // five times over, and the fifth click has to work exactly like the first.
  it('gives a parent of FIVE children in five age groups ONE invite with five targets', async () => {
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue(BIG_ROSTER)
    renderForm({ teams: BIG_TEAMS })

    await user.type(screen.getByLabelText('Email'), 'haddad@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')

    const picker = await screen.findByTestId('player-picker')
    await within(picker).findByLabelText(/Yusuf Haddad/i)
    const search = within(picker).getByLabelText(/search players/i)

    // The cap is real while this test runs: 25 of 45 drawn, and the two
    // children past the cap are unreachable until searched for.
    expect(within(picker).getAllByRole('checkbox')).toHaveLength(25)
    expect(within(picker).getByText(/Showing 25 of 45/)).toBeInTheDocument()
    expect(within(picker).queryByLabelText(/Noura Haddad/i)).toBeNull()
    expect(within(picker).queryByLabelText(/Zaid Haddad/i)).toBeNull()

    const chosen = []
    for (const [term, child] of [
      ['yusuf', 'Yusuf Haddad'],
      ['layla', 'Layla Haddad'],
      ['ibrahim', 'Ibrahim Haddad'],
      ['noura', 'Noura Haddad'],
      ['zaid', 'Zaid Haddad'],
    ]) {
      await user.clear(search)
      await user.type(search, term)

      const results = within(picker).getAllByRole('checkbox')
      expect(results).toHaveLength(1)
      expect(results[0]).toHaveAccessibleName(new RegExp(child))

      await user.click(results[0])
      chosen.push(child)

      // Selected children stay pinned above the results even though the
      // current query matches none of the earlier ones.
      const pinned = within(picker).getByTestId('player-picker-selected')
      expect(within(pinned).getAllByRole('button').map((chip) => chip.textContent)).toEqual(
        chosen.map((name) => `${name}×`),
      )
    }

    await user.clear(search)
    await user.type(search, 'zzzzz')
    expect(within(picker).queryAllByRole('checkbox')).toHaveLength(0)
    const pinned = within(picker).getByTestId('player-picker-selected')
    expect(within(pinned).getAllByRole('button')).toHaveLength(5)
    for (const child of HADDADS) {
      expect(within(pinned).getByRole('button', { name: `Remove ${child.full_name}` })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    const fields = createInviteMock.mock.calls[0][0]
    expect(fields.role).toBe('parent')
    // ONE invite, five targets, each age group taken from that child.
    expect(fields.targets).toEqual([
      { teamId: 't-u8', playerId: 'p-yusuf' },
      { teamId: 't-u10', playerId: 'p-layla' },
      { teamId: 't-u12', playerId: 'p-ibrahim' },
      { teamId: 't-u14', playerId: 'p-noura' },
      { teamId: 't-u16', playerId: 'p-zaid' },
    ])
    // The legacy single-target columns are mirrored only when there is exactly
    // one target; with five, any single value would misdescribe the invite.
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
  // ⚠️ THIS PINNED AN INVITE THAT COULD NEVER BE ACCEPTED — rewritten
  // 20 Aug 2026. It asserted a parent invite with targets of { playerId: null },
  // and accept_invite refuses exactly that: "This invite is incomplete — it does
  // not say which player it is for. Ask an admin to send a new one."
  //
  // ⚠️ AND THIS PATH WAS THE CRUELLER OF THE TWO. On the Accounts screen the
  // admin met the refusal immediately. Here the admin saw success, the invite
  // went out, and the FAMILY hit the wall days later on a link that looked
  // broken. The test was green throughout, because createInvite is mocked and
  // acceptance happens in the database.
  it('adds the child, so the invite it sends can actually be accepted', async () => {
    upsertPlayerMock.mockResolvedValue({ id: 'player-new', team_id: 't-u12' })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email'), 'parent@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'parent')
    await user.click(screen.getByLabelText(/on the roster yet/i))
    await user.type(screen.getByLabelText(/name of the new child/i), 'Rowan Adeyemi')
    await user.selectOptions(screen.getByLabelText(/age group for the new child/i), 't-u12')
    await user.click(screen.getByRole('button', { name: SEND }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalledTimes(1))
    expect(upsertPlayerMock).toHaveBeenCalled()
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'parent',
      targets: [{ teamId: 't-u12', playerId: 'player-new' }],
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
