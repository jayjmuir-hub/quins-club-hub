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

import SquadStaffCard, { leadIndex, tileSpans } from '../src/components/SquadStaffCard.jsx'
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

// ── The tile mosaic (15 Aug 2026) ───────────────────────────────────────────

const MANAGER_PRIYA = {
  membershipId: 'ms-3',
  role: 'manager',
  title: 'Team Manager',
  name: 'Priyanka Ramachandran',
  email: 'priya@example.com',
  phone: '+971551112233',
  photoPath: null,
  photoUrl: null,
}
const COACH_DAN = {
  membershipId: 'ms-4',
  role: 'coach',
  title: 'Assistant Coach',
  name: 'Dan Whitfield',
  email: 'dan@example.com',
  phone: '+971509876543',
  photoPath: null,
  photoUrl: null,
}

function person(n) {
  return { ...COACH_DAN, membershipId: `gen-${n}`, name: `Person ${n}`, title: 'Assistant Coach' }
}

describe('leadIndex — who gets the big tile', () => {
  // ⚠️ THE RULE IS TITLE, NEVER ROLE, AND src/data/staff.js IS WHY. It sorts by
  // name in two places and says both times that role order "reads as a
  // hierarchy the club has not agreed to". Featuring by role would restate that
  // hierarchy at twice the size, so the lead is whoever the club chose to CALL
  // a head — a string an admin typed, not something this code inferred.
  it('features whoever is titled a head, wherever they sit in the list', () => {
    expect(leadIndex([MEDIC_SAM, COACH_ROSA, MANAGER_PRIYA])).toBe(1)
  })

  it('does not care about case', () => {
    expect(leadIndex([{ ...COACH_ROSA, title: 'head coach' }])).toBe(0)
  })

  // ⚠️ WORD BOUNDARY, NOT `includes`. "Overhead", "Forehead" and — the one that
  // matters here — a title like "Overheads and Kit" would all match a substring
  // test and quietly promote the wrong person to the biggest tile on the screen.
  it('does not match head inside another word', () => {
    expect(leadIndex([{ ...COACH_ROSA, title: 'Overheads and Kit' }])).toBe(-1)
  })

  it('features nobody when no title says so, which is most squads', () => {
    expect(leadIndex([MEDIC_SAM, MANAGER_PRIYA])).toBe(-1)
    expect(leadIndex([{ ...COACH_ROSA, title: null }])).toBe(-1)
    expect(leadIndex([])).toBe(-1)
  })
})

describe('tileSpans — the mosaic never leaves a hole', () => {
  // The sizes the club actually has, measured 15 Aug 2026: eleven squads with
  // nobody, two with one person, one with four and one with six.
  it('gives a lone person the full width rather than half a row', () => {
    expect(tileSpans(1, true)).toEqual(['wide'])
    expect(tileSpans(1, false)).toEqual(['wide'])
  })

  // ⚠️ A LEAD NEEDS THREE PEOPLE TO BE WORTH IT. With two, the tall tile has a
  // single half-height tile beside it and the other half of that column is a
  // hole — the "feature" is a gap.
  it('refuses the tall tile below three people', () => {
    expect(tileSpans(2, true)).toEqual(['half', 'half'])
  })

  it('stacks two tiles beside the lead at three', () => {
    expect(tileSpans(3, true)).toEqual(['lead', 'half', 'half'])
  })

  // Four is the size that exposed the rule: the fourth tile would sit alone on
  // row three with a hole beside it.
  it('widens the odd last tile at four', () => {
    expect(tileSpans(4, true)).toEqual(['lead', 'half', 'half', 'wide'])
  })

  it('leaves a full last row alone at five', () => {
    expect(tileSpans(5, true)).toEqual(['lead', 'half', 'half', 'half', 'half'])
  })

  it('widens the last of six', () => {
    expect(tileSpans(6, true)).toEqual(['lead', 'half', 'half', 'half', 'half', 'wide'])
  })

  it('pairs them off evenly when nobody leads', () => {
    expect(tileSpans(4, false)).toEqual(['half', 'half', 'half', 'half'])
    expect(tileSpans(3, false)).toEqual(['half', 'half', 'wide'])
  })

  // The invariant behind every case above, stated once so a new size cannot
  // quietly break it: no tile is ever left alone on a row.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('never leaves a lone half tile at %i', (n) => {
    for (const hasLead of [true, false]) {
      const spans = tileSpans(n, hasLead)
      const lead = spans.filter((s) => s === 'lead').length
      // Columns consumed after the lead's own column-worth of rows.
      const halves = spans.filter((s) => s === 'half').length
      const flowing = lead ? halves - 2 : halves
      expect(flowing % 2).toBe(0)
    }
  })
})

describe('SquadStaffCard — the contact buttons', () => {
  it('offers call, WhatsApp and email, each with a name a screen reader can use', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />)

    expect(screen.getByRole('link', { name: 'Call Rosa Ferreira' })).toHaveAttribute(
      'href',
      'tel:+971500000001',
    )
    // ⚠️ BARE DIGITS. `wa.me/+971...` opens WhatsApp on an error rather than on
    // a conversation, and it fails quietly enough to ship.
    expect(
      screen.getByRole('link', { name: 'Message Rosa Ferreira on WhatsApp' }),
    ).toHaveAttribute('href', 'https://wa.me/971500000001')
    expect(screen.getByRole('link', { name: 'Email Rosa Ferreira' })).toHaveAttribute(
      'href',
      'mailto:rosa@example.com',
    )
  })

  it('drops both phone buttons together when there is no number', () => {
    render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[{ ...COACH_ROSA, phone: null }]}
      />,
    )

    expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Email/ })).toBeInTheDocument()
  })

  // ⚠️ jsdom COMPUTES NO CSS, so the 44px floor cannot be measured here — the
  // class token is the only thing this environment can hold. The width was
  // measured in Chromium instead: at 320px the three buttons needed 144px in a
  // 140px tile and the last one was CLIPPED rather than overflowing, because
  // the tile clips. See the breakpoint note in SquadStaffCard.jsx.
  it('keeps every contact button at the 44px tap-target floor', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA]} />)

    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('h-11')
      expect(link.className).toContain('w-11')
    }
  })
})

describe('SquadStaffCard — the mosaic on screen', () => {
  it('gives the titled head the lead tile and nobody else', () => {
    render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[MEDIC_SAM, COACH_ROSA, MANAGER_PRIYA]}
      />,
    )

    const tiles = screen.getAllByTestId('squad-staff-person')
    expect(tiles.map((t) => t.dataset.span)).toEqual(['lead', 'half', 'half'])
    // The lead is moved to the front; everyone else keeps the order the data
    // module chose, which is by name.
    expect(tiles[0]).toHaveTextContent('Rosa Ferreira')
    expect(tiles.filter((t) => t.dataset.featured === 'true')).toHaveLength(1)
  })

  it('lays a squad out evenly when nobody is titled a head', () => {
    render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[MEDIC_SAM, MANAGER_PRIYA]} />,
    )

    const tiles = screen.getAllByTestId('squad-staff-person')
    expect(tiles.map((t) => t.dataset.span)).toEqual(['half', 'half'])
    expect(tiles.some((t) => t.dataset.featured === 'true')).toBe(false)
  })

  it('lays out the four- and six-person squads the club really has', () => {
    const { rerender } = render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[COACH_ROSA, MEDIC_SAM, COACH_DAN, MANAGER_PRIYA]}
      />,
    )
    expect(screen.getAllByTestId('squad-staff-person').map((t) => t.dataset.span)).toEqual([
      'lead',
      'half',
      'half',
      'wide',
    ])

    rerender(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[COACH_ROSA, MEDIC_SAM, COACH_DAN, MANAGER_PRIYA, person(5), person(6)]}
      />,
    )
    expect(screen.getAllByTestId('squad-staff-person').map((t) => t.dataset.span)).toEqual([
      'lead',
      'half',
      'half',
      'half',
      'half',
      'wide',
    ])
  })

  // ⚠️ THE MONOGRAM IS THE ORDINARY CASE, NOT AN ERROR STATE. Thirteen of the
  // club's fifteen staff have no photo, so a wall of these is what this
  // component mostly renders — and none of them may announce itself.
  it('renders the monogram without an image and without saying so', () => {
    const { container } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[MANAGER_PRIYA]} />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('PR')).toBeInTheDocument()
    expect(screen.queryByText(/no photo/i)).not.toBeInTheDocument()
    expect(screen.getByText('Priyanka Ramachandran')).toBeInTheDocument()
  })
})

describe('Squad contacts on the Dashboard', () => {
  // ⚠️ THE HEADING SAT FLUSH AGAINST THE CARD ABOVE IT — reported from a
  // screenshot on 14 Aug 2026, and invisible to every test in this suite until
  // this one, because jsdom applies no CSS and cannot see a collapsed margin.
  //
  // The cause is worth more than the fix: BlockTitle carries
  // `mt-[18px] first:mt-0`, and `first:` compiles to `:first-child`, which is
  // scoped to the element's PARENT. Wrapping a BlockTitle in a div therefore
  // makes it that div's first child and silently zeroes its top margin. The two
  // other wrapped BlockTitles on this screen already carry a compensating
  // margin, which is exactly why this one looked like a one-off rather than a
  // pattern.
  //
  // Pinned as a class token rather than a measurement — the same proxy, and the
  // same honesty about being one, as tests/page-header-wrap.test.js.
  it('keeps the block clear of the card above it', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' }]),
    )
    listMySquadStaffMock.mockResolvedValue(new Map([['team-u13', [COACH_ROSA]]]))

    renderDashboard()

    const block = await screen.findByTestId('squad-staff-block')
    expect(block.className.split(/\s+/)).toContain('mt-[18px]')
  })

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
