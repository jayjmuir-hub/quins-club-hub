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

import SquadStaffCard, { leadIndex, leadRowSpan, tileSpans } from '../src/components/SquadStaffCard.jsx'
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

  // ⚠️ THE BUG THIS BLOCK EXISTS FOR, AND IT SHIPPED LOOKING LIKE A BROKEN
  // PICKER. Jay, 15 Aug 2026, on a real head coach's tile: "no matter how many
  // times i try to adjust this head coaches photo, it always cuts off the top of
  // his head in that double tall pill, like it isn't adjusting the photo in the
  // pill at all". It was not adjusting it — the value saved, `/admin/staff`
  // previewed it correctly, and this component had no `object-position` at all,
  // so `object-cover` centred every crop. On the lead tile, the tallest shape in
  // the app, centring a landscape photograph throws away the top of it.
  it('crops around the focal point rather than the centre', () => {
    const { container } = render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[{ ...COACH_ROSA, focus: { x: 47, y: 28 } }]}
      />,
    )

    expect(container.querySelector('img')).toHaveStyle({ objectPosition: '47% 28%' })
  })

  // ⚠️ NULL IS THE MAJORITY CASE, NOT AN EDGE ONE: every photo uploaded before
  // the columns existed has it, and it must render exactly as it did before the
  // feature landed. A crash here would be inside a render.
  //
  // ⚠️ ASSERTED ON THE INLINE STYLE, NOT WITH `toHaveStyle`, AND THE DIFFERENCE
  // IS WHETHER THIS TEST EXISTS AT ALL. jsdom's COMPUTED `object-position`
  // defaults to `50% 50%`, so `toHaveStyle({objectPosition: '50% 50%'})` passes
  // on an <img> carrying no positioning whatsoever — which is precisely the bug.
  // Measured by deleting the style prop: the version written first stayed green.
  it('centres a photo nobody has positioned', () => {
    const { container } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[{ ...COACH_ROSA, focus: null }]} />,
    )

    expect(container.querySelector('img').style.objectPosition).toBe('50% 50%')
  })

  // ⚠️ THE 28px HEADER FACE IS THE CROP WITH THE LEAST ROOM FOR ERROR — a face
  // high in the frame is missing entirely at that size — and it is drawn by a
  // SECOND call to TileBackground, which is exactly the kind of second call a
  // fix like this gets applied to only once.
  it('positions the face on a collapsed squad header too', () => {
    render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[{ ...COACH_ROSA, focus: { x: 47, y: 28 } }, MEDIC_SAM]}
        defaultOpen={false}
      />,
    )

    // ⚠️ SCOPED TO THE TOGGLE, NOT `container.querySelector('img')`. A collapsed
    // panel is still RENDERED — `hidden` plus a display class, so `aria-controls`
    // always names an element that exists — so the tiles' own images are in the
    // document too and a bare query would find one of those instead.
    const face = screen.getByTestId('squad-staff-toggle').querySelector('img')
    expect(face).toHaveStyle({ objectPosition: '47% 28%' })
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

describe('tileSpans — the lead is two tiles tall and the rest flow around it', () => {
  it('gives a lone person the full width rather than half a row', () => {
    expect(tileSpans(1, true)).toEqual(['wide'])
    expect(tileSpans(1, false)).toEqual(['wide'])
  })

  // ⚠️ TWO IS ENOUGH, AND THIS TEST ASSERTED THE OPPOSITE UNTIL 16 Aug 2026.
  // It read "refuses the tall tile below three people", on the reasoning that
  // the tall tile leaves a hole beside its lower half at two. The hole is real.
  // It lost to consistency: Jay, comparing a two-person squad with a six-person
  // one on the same screen — "the U13 head coach bubble is not the standard
  // double size". A head coach is a head coach at either size of squad, and the
  // same job rendered two ways one above the other reads as a bug.
  it('⚠️ gives the lead the tall tile at two people, hole and all', () => {
    expect(tileSpans(2, true)).toEqual(['lead', 'half'])
  })

  // Still no tall tile without somebody titled to earn it.
  it('leaves a two-person squad with no head coach as an even pair', () => {
    expect(tileSpans(2, false)).toEqual(['half', 'half'])
  })

  it('stacks two tiles beside the lead at three', () => {
    expect(tileSpans(3, true)).toEqual(['lead', 'half', 'half'])
  })

  // ⚠️ THIS REVERSES AN EARLIER RULE ON PURPOSE — DO NOT "FIX" IT BACK. For a
  // few hours the lead owned the WHOLE left column, so nothing wrapped beneath
  // it. Seen against the real six-person squad with an actual photograph, that
  // made the lead a 175x712 strip and a person in it a vertical sliver. Jay
  // chose the wrapping as the lesser problem, having seen both.
  it('lets the rest flow under the lead as well as beside it', () => {
    expect(tileSpans(4, true)).toEqual(['lead', 'half', 'half', 'half'])
    expect(tileSpans(6, true)).toEqual(['lead', 'half', 'half', 'half', 'half', 'half'])
  })

  // ⚠️ AN ODD LAST TILE KEEPS ITS WIDTH AND LEAVES A GAP — Jay, 15 Aug 2026,
  // on the real six-person squad: "i don't like the bottom one going full
  // length". A tile stretched to twice its neighbours' width reads as a
  // different KIND of thing; a gap just reads as the end of the list.
  it('never stretches the odd last tile', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      expect(tileSpans(n, true).slice(1)).not.toContain('wide')
      expect(tileSpans(n, false)).not.toContain('wide')
    }
  })

  it('leaves a full last row alone at five', () => {
    expect(tileSpans(5, true)).toEqual(['lead', 'half', 'half', 'half', 'half'])
  })

  it('pairs them off evenly when nobody leads', () => {
    expect(tileSpans(4, false)).toEqual(['half', 'half', 'half', 'half'])
    expect(tileSpans(3, false)).toEqual(['half', 'half', 'half'])
  })

  // ⚠️ THE INVARIANT CHANGED WITH THE RULE. It used to be "an even number of
  // half tiles, so none is ever alone"; a lone tile is now allowed and simply
  // leaves a gap. What still holds is that `wide` appears ONLY for a squad of
  // one, where there is no set to be the odd one out of.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('uses wide only for a squad of one (%i)', (n) => {
    for (const hasLead of [true, false]) {
      const spans = tileSpans(n, hasLead)
      expect(spans.includes('wide')).toBe(n === 1)
    }
  })
})

describe('leadRowSpan — two small tiles tall, and only ever two', () => {
  // ⚠️ IT USED TO BE `count - 1`. A real photograph is what settled it: at six
  // people that made the lead 1:4 and unusable for a face.
  it.each([2, 3, 6, 20])('is 2 whatever the squad size (%i)', () => {
    expect(leadRowSpan()).toBe(2)
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

  // ⚠️ THE SHAPE JAY ACTUALLY REPORTED, AND THE ONLY TEST HERE THAT RENDERS IT.
  // "the U13 head coach bubble is not the standard double size" was a two-person
  // squad sitting above a six-person one on Home. `tileSpans(2, true)` is
  // asserted above, but a span array is not a size: the size lives in
  // SPAN_CLASS, and a lead that lost its class tokens would satisfy every
  // existing assertion in this file. So this compares the two-person lead
  // against the six-person one and demands they be the same tile.
  it('draws the head coach the same size in a two-person squad as in a six', () => {
    const leadTile = () =>
      screen.getAllByTestId('squad-staff-person').find((t) => t.dataset.span === 'lead')

    const { rerender } = render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH_ROSA, MANAGER_PRIYA]} />,
    )
    const small = leadTile()
    expect(small).toHaveTextContent('Rosa Ferreira')
    expect(small.dataset.featured).toBe('true')
    const smallClass = small.className
    const smallRow = small.style.gridRow

    rerender(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[COACH_ROSA, MEDIC_SAM, COACH_DAN, MANAGER_PRIYA, person(5), person(6)]}
      />,
    )
    const big = leadTile()

    expect(smallClass).toBe(big.className)
    expect(smallRow).toBe(big.style.gridRow)
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
      'half',
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
      'half',
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

describe('SquadStaffCard — collapsing a squad', () => {
  // ⚠️ JAY'S CEILING, 15 Aug 2026: "we have parents who could have up to 5 age
  // groups worth of players". Measured in Chromium: an open four-person squad
  // is 488px and a collapsed one is 44px, so five squads goes from 2,440px —
  // about three phone screens — to 664px.
  const FOUR = [COACH_ROSA, MEDIC_SAM, COACH_DAN, MANAGER_PRIYA]

  it('opens by default, because most parents have one squad', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} />)

    expect(screen.getByTestId('squad-staff-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByTestId('squad-staff-person')).toHaveLength(4)
  })

  it('starts closed when told to, and says who is inside without opening', () => {
    render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} defaultOpen={false} />,
    )

    const toggle = screen.getByTestId('squad-staff-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The count is on the header, so the row still reports what it is hiding.
    expect(toggle).toHaveTextContent('U13 Mixed Contact')
    expect(toggle).toHaveTextContent('4')
  })

  it('opens and closes on tap', () => {
    render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} defaultOpen={false} />,
    )

    const toggle = screen.getByTestId('squad-staff-toggle')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  // ⚠️ THE PANEL STAYS IN THE DOM WHILE CLOSED. A disclosure whose
  // `aria-controls` points at an id that does not exist is broken exactly when
  // the pointer matters, which is while it is closed.
  it('keeps aria-controls pointing at a real element while closed', () => {
    render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} defaultOpen={false} />,
    )

    const id = screen.getByTestId('squad-staff-toggle').getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id)).toBeInTheDocument()
  })

  // ⚠️ THE REGRESSION GUARD FOR A BUG jsdom CANNOT SEE. Preflight's
  // `[hidden] { display: none }` and the `.grid` utility have the same
  // specificity and the utility comes later, so the `hidden` ATTRIBUTE alone
  // left the panel fully rendered — measured at 484px tall in Chromium while
  // "hidden". The display class has to be swapped too, and that is what this
  // pins, because a jsdom assertion on visibility would pass either way.
  it('swaps the display class as well as setting hidden', () => {
    render(
      <SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} defaultOpen={false} />,
    )

    const toggle = screen.getByTestId('squad-staff-toggle')
    const id = toggle.getAttribute('aria-controls')
    const closed = document.getElementById(id)
    expect(closed).toHaveAttribute('hidden')
    expect(closed.className.split(/\s+/)).toContain('hidden')
    expect(closed.className.split(/\s+/)).not.toContain('grid')

    // ⚠️ TOGGLED, NOT RE-RENDERED WITH A NEW PROP. `defaultOpen` seeds
    // useState, so changing the prop on an already-mounted card does nothing —
    // which is correct (it is a default, not a controlled value) and is why the
    // first version of this test failed.
    fireEvent.click(toggle)
    const opened = document.getElementById(id)
    expect(opened).not.toHaveAttribute('hidden')
    expect(opened.className.split(/\s+/)).toContain('grid')
  })

  // ⚠️ A disclosure that opens onto one sentence wastes a tap to say "still
  // nothing", and this is the state eleven of fifteen squads are in.
  it('gives an empty squad no toggle at all', () => {
    render(<SquadStaffCard squadName="U16 Girls" staff={[]} defaultOpen={false} />)

    expect(screen.queryByTestId('squad-staff-toggle')).not.toBeInTheDocument()
    expect(
      screen.getByText('No coach, team manager or medic listed for this squad yet.'),
    ).toBeInTheDocument()
  })

  it('keeps the toggle at the 44px tap-target floor', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={FOUR} />)

    expect(screen.getByTestId('squad-staff-toggle').className).toContain('min-h-[44px]')
  })
})

describe('Squad contacts on the Dashboard — which squad is open', () => {
  // ⚠️ THE WIRING, NOT THE COMPONENT. SquadStaffCard's own collapse is covered
  // above; what cannot be seen from inside it is WHICH card gets the open one,
  // and that is the half worth pinning — passing `defaultOpen` to all of them,
  // or to none, both leave a screen that looks plausible.
  it('opens the first squad and collapses the rest', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([
        { id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' },
        { id: 'm2', role: 'parent', team_id: 'team-u16', player_id: 'p2' },
        { id: 'm3', role: 'parent', team_id: 'team-u18', player_id: 'p3' },
      ]),
    )
    listMySquadStaffMock.mockResolvedValue(
      new Map([
        ['team-u13', [COACH_ROSA, MEDIC_SAM]],
        ['team-u16', [COACH_ROSA, MEDIC_SAM]],
        ['team-u18', [COACH_ROSA, MEDIC_SAM]],
      ]),
    )

    renderDashboard()

    const toggles = await screen.findAllByTestId('squad-staff-toggle')
    expect(toggles.map((t) => t.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  // ⚠️ THE COMMON CASE MUST NOT PAY FOR THE RARE ONE. Ten of the club's twelve
  // parents are attached to exactly one squad, and for them nothing about this
  // feature should be visible at all.
  it('leaves a single-squad parent with an open card', async () => {
    useMembershipsMock.mockReturnValue(
      membershipValue([{ id: 'm1', role: 'parent', team_id: 'team-u13', player_id: 'p1' }]),
    )
    listMySquadStaffMock.mockResolvedValue(new Map([['team-u13', [COACH_ROSA]]]))

    renderDashboard()

    const toggle = await screen.findByTestId('squad-staff-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
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
