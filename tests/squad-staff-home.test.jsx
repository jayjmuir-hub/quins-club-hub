import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The member-facing Squad contacts block — phase 3 of
// claude/plans/2026-08-13-squad-staff-on-home.md.
//
// Two things are under test and they fail in different ways, so they are
// asserted separately:
//
//   1. SquadStaffCard itself — does it draw a person, and does an unstaffed
//      squad say something honest?
//   2. THE WIRING on Dashboard — which squads get a card at all. This is the
//      half that cannot be seen by looking at the component, and it is where
//      the interesting mistakes are: an admin would otherwise get fifteen
//      cards, and "view as" would be ignored.
//
// Precedent for splitting them: tests/error-boundary.test.jsx proves the
// component catches, tests/error-boundary-wiring.test.jsx proves something
// renders it, and removing the wiring turns only the second red.

const useMembershipsMock = vi.fn()
const listMySquadStaffMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jay@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ id: 'profile-1', first_name: 'Jay' }),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: vi.fn().mockResolvedValue([]),
  subscribeEvents: () => () => {},
  upsertEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

vi.mock('../src/data/staff.js', () => ({
  listMySquadStaff: (...args) => listMySquadStaffMock(...args),
}))

import SquadStaffCard from '../src/components/SquadStaffCard.jsx'
import Dashboard from '../src/screens/Dashboard.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const TEAM_U13 = { id: 'team-u13', name: 'U13 Mixed Contact', sort_order: 3 }
const TEAM_U16 = { id: 'team-u16', name: 'U16B Contact', sort_order: 6 }
const TEAM_U18 = { id: 'team-u18', name: 'U18B Contact', sort_order: 9 }
const TEAMS = [TEAM_U18, TEAM_U13, TEAM_U16]

const COACH_ROSA = {
  membershipId: 'ms-1',
  role: 'coach',
  title: 'Head Coach',
  name: 'Rosa Ferreira',
  email: 'rosa@example.com',
  phone: '+971500000001',
  photoPath: 'p1/1.jpg',
  photoUrl: 'https://example.invalid/signed/rosa.jpg',
}
const MEDIC_SAM = {
  membershipId: 'ms-2',
  role: 'medic',
  title: null,
  name: 'Sam Okonkwo',
  email: null,
  phone: null,
  photoPath: null,
  photoUrl: null,
}

function membershipValue(memberships, teams = TEAMS) {
  return {
    memberships,
    realMemberships: memberships,
    viewAs: null,
    setViewAs: vi.fn(),
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

let nowSpy
beforeEach(() => {
  clearMyProfileCache()
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-13T05:00:00Z'))
  useMembershipsMock.mockReset()
  listMySquadStaffMock.mockReset()
  listMySquadStaffMock.mockResolvedValue(new Map())
})

afterEach(() => {
  nowSpy.mockRestore()
})

describe('SquadStaffCard', () => {
  it('draws a person with their title instead of their role label', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />)

    expect(screen.getByText('Rosa Ferreira')).toBeInTheDocument()
    expect(screen.getByText('Head Coach')).toBeInTheDocument()
    // ⚠️ "Head Coach" beside a "Coach" chip is the same word twice. The title
    // REPLACES the role label rather than joining it, so a bare "Coach" must
    // not also be on screen for this person.
    expect(screen.queryByText('Coach')).not.toBeInTheDocument()
  })

  it('falls back to the role label when nobody has set a title', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[MEDIC_SAM]} />)

    // Today this is EVERY squad — measured live 13 Aug 2026, zero of the
    // club's staff memberships had a title set. If this case broke, the
    // feature would ship with an unlabelled list of names.
    expect(screen.getByText('Medic')).toBeInTheDocument()
  })

  it('makes the phone and email real tel:/mailto: links', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />)

    // The reason the card exists is to CONTACT the person. A number rendered
    // as plain text is a number a parent has to retype, which is a number they
    // will not use.
    expect(screen.getByRole('link', { name: /Call Rosa Ferreira/ })).toHaveAttribute(
      'href',
      'tel:+971500000001',
    )
    expect(screen.getByRole('link', { name: /Email Rosa Ferreira/ })).toHaveAttribute(
      'href',
      'mailto:rosa@example.com',
    )
  })

  it('omits the contact row entirely when there is nothing to show', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[MEDIC_SAM]} />)

    // Measured 13 Aug 2026: three of the club's eight staff had no phone
    // number. An empty `tel:` link is a tappable control that does nothing.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Sam Okonkwo')).toBeInTheDocument()
  })

  it('draws the face when there is one, with an empty alt', () => {
    const { container } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />,
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.invalid/signed/rosa.jpg')
    // ⚠️ EMPTY alt ON PURPOSE. The name is rendered immediately beside it, so
    // "Photo of Rosa Ferreira" would make a screen reader say the name twice.
    expect(img).toHaveAttribute('alt', '')
  })

  it('falls back to initials when there is no photo, and says nothing about it', () => {
    const { container } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[MEDIC_SAM]} />,
    )

    // ⚠️ THE NORMAL CASE, NOT AN ERROR STATE — nobody in the club had a photo
    // on the day this shipped. "No photo", "could not sign" and "the image
    // 404s" must render identically and none may announce itself.
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('SO')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to initials when a signed URL 404s mid-view', async () => {
    const { container } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />,
    )

    const img = container.querySelector('img')
    // A signed URL expires. Firing the image's own error must not leave a
    // broken-image frame where a volunteer's face should be.
    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('RF')).toBeInTheDocument()
  })

  it('says the staff are not LISTED, never that the squad has none', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[]} />)

    // ⚠️ THIS IS THE MAJORITY CASE — twelve of fifteen squads on the day this
    // shipped. The wording matters: every one of those squads has real adults
    // running it, and what is missing is the data. Telling a parent their
    // child has no coach would be false as well as alarming.
    expect(screen.getByText(/listed for this squad yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/has no coach/i)).not.toBeInTheDocument()
    // The card is still drawn — the squad name must not vanish.
    expect(screen.getByText('U13 Mixed Contact')).toBeInTheDocument()
  })
})

describe('Squad contacts on the Dashboard', () => {
  it('shows one card per squad a parent is attached to, in club order', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([
        { id: 'm1', role: 'parent', team_id: 'team-u16', player_id: 'p1' },
        { id: 'm2', role: 'parent', team_id: 'team-u13', player_id: 'p2' },
      ]),
    )
    listMySquadStaffMock.mockResolvedValue(
      new Map([
        ['team-u13', [COACH_ROSA]],
        ['team-u16', [MEDIC_SAM]],
      ]),
    )

    renderDashboard()

    const cards = await screen.findAllByTestId('squad-staff-card')
    expect(cards).toHaveLength(2)
    // A parent of two children in two squads gets both — the multi-squad case
    // is in the design from the start rather than retrofitted.
    expect(within(cards[0]).getByText('U13 Mixed Contact')).toBeInTheDocument()
    expect(within(cards[1]).getByText('U16B Contact')).toBeInTheDocument()
  })

  it('draws a card for an attached squad that has nobody attached to it', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' }]),
    )
    // The RPC returns nothing for this squad — the normal state for twelve of
    // fifteen squads.
    listMySquadStaffMock.mockResolvedValue(new Map())

    renderDashboard()

    const card = await screen.findByTestId('squad-staff-card')
    expect(within(card).getByText('U13 Mixed Contact')).toBeInTheDocument()
    expect(within(card).getByText(/listed for this squad yet/i)).toBeInTheDocument()
  })

  it('shows no block at all for an admin attached to no squad', async () => {
    // ⚠️ THE CASE THAT WOULD OTHERWISE PUT FIFTEEN CARDS ON JAY'S HOME SCREEN.
    // visibleTeams() hands an admin every squad in the club, and
    // private.can_see_team returns true for an admin on all of them — so the
    // RPC genuinely returns the whole club here. The block is built from the
    // person's OWN membership rows, not from what they can see.
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm0', role: 'admin', team_id: null }]),
    )
    listMySquadStaffMock.mockResolvedValue(
      new Map([
        ['team-u13', [COACH_ROSA]],
        ['team-u16', [MEDIC_SAM]],
        ['team-u18', [COACH_ROSA]],
      ]),
    )

    renderDashboard()

    // Waited for rather than asserted immediately: the block appears only
    // after the staff read settles, so a bare queryBy would pass before the
    // promise resolved and would prove nothing.
    await screen.findByTestId('upcoming-list')
    expect(screen.queryByTestId('squad-staff-block')).not.toBeInTheDocument()
  })

  it('narrows to the previewed squad when an admin is viewing as a parent', async () => {
    // The RPC runs against the admin's REAL auth.uid() and returns the whole
    // club whatever the preview says — memberships.jsx: "RLS still returns
    // club-wide rows; the app simply declines to display them." This assertion
    // is that declining actually happens.
    useMembershipsMock.mockReturnValue({
      ...membershipValue([{ id: 'view-as', role: 'parent', team_id: 'team-u16', player_id: null }]),
      realMemberships: [{ id: 'm0', role: 'admin', team_id: null }],
      viewAs: { role: 'parent', teamId: 'team-u16' },
    })
    listMySquadStaffMock.mockResolvedValue(
      new Map([
        ['team-u13', [COACH_ROSA]],
        ['team-u16', [MEDIC_SAM]],
        ['team-u18', [COACH_ROSA]],
      ]),
    )

    renderDashboard()

    const cards = await screen.findAllByTestId('squad-staff-card')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]).getByText('U16B Contact')).toBeInTheDocument()
    expect(screen.queryByText('U13 Mixed Contact')).not.toBeInTheDocument()
  })

  it('says the read failed rather than showing an empty squad', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' }]),
    )
    listMySquadStaffMock.mockRejectedValue(new Error('network down'))

    renderDashboard()

    // ⚠️ THE DISCRIMINATING ASSERTION. A failed read and an unstaffed squad
    // are indistinguishable from the render side, and the difference matters:
    // one is a bug, the other is the normal state of most of the club.
    // Falling back to the empty state on an error would tell a parent their
    // child's squad has no coach because the network blipped.
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load your squad contacts/i)
    expect(screen.queryByText(/listed for this squad yet/i)).not.toBeInTheDocument()
  })

  it('does not refetch the staff when a realtime event fires', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' }]),
    )
    listMySquadStaffMock.mockResolvedValue(new Map([['team-u13', [COACH_ROSA]]]))

    renderDashboard()
    await screen.findByTestId('squad-staff-card')

    // No change to a FIXTURE can change who coaches a squad. The events
    // subscription bumps a reload token on every insert/update/delete anywhere
    // in scope; keying the staff read on that token would issue a round trip
    // per fixture edit, club-wide, for a result that cannot have moved.
    expect(listMySquadStaffMock).toHaveBeenCalledTimes(1)
  })
})
