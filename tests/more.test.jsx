import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/More.jsx (admin-dashboard plan, 2026-08-05).
// useMemberships is mocked so this exercises only the screen's own
// rendering. No network is reachable from this file — and that is itself
// part of the contract: More makes no query at all, everything it shows is
// already in the membership provider.
//
// This file replaces tests/admin.test.jsx. /more used to render the
// admin-only Admin overview, so three of the four roles got a "not
// authorised" card on their own tab; the whole point of the rewrite is that
// /more is now for everyone.

const useMembershipsMock = vi.fn()
const getMyProfileMock = vi.fn()
const updateMyProfileMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const listParentsForPlayersMock = vi.fn()
const registerMyPlayerMock = vi.fn()
const updateProfileNamesMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ THE "NO NETWORK FROM THIS SCREEN" CONTRACT CHANGED ON 6 AUG 2026.
// More now shows the person's own details and their linked players, so it
// reads the profile row, the players, their contacts and their parent rows.
// The header comment above is kept as history; these mocks are the new
// reality. Everything is still deterministic and nothing leaves the process.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jay@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...a) => getMyProfileMock(...a),
  // The You card's writer (8 Aug 2026). Mocked, like every other data
  // function in this file — nothing here reaches a Supabase client.
  updateMyProfile: (...a) => updateMyProfileMock(...a),
  // ⚠️ ADDED 13 Aug 2026, AND ITS ABSENCE WOULD NOT HAVE FAILED LOUDLY. The
  // add-a-player sheet on this screen calls it, and a vi.mock factory replaces
  // the WHOLE module — so an omitted export is `undefined` at import time and
  // only explodes when a test actually submits the form. That is the exact trap
  // the note above the players mock describes, one module over.
  registerMyPlayer: (...a) => registerMyPlayerMock(...a),
  // Same trap as registerMyPlayer above — the add-a-player form writes the
  // registrant's own name before it writes any child (13 Aug 2026).
  updateProfileNames: (...a) => updateProfileNamesMock(...a),
}))

// ⚠️ THESE MODULES NOW HAVE A SECOND CONSUMER. Since 9 Aug the "view or
// change these details" button opens MyPlayerForm in place rather than
// navigating to /roster, and that form loads its OWN contact and parent rows
// on mount. A vi.mock factory replaces the whole module, so any export it
// omits is undefined — which surfaces as "listParents is not a function"
// thrown inside a passive effect, not as a missing mock.
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: (...a) => listContactsForPlayersMock(...a),
  getPlayerContact: async () => null,
  upsertContact: async () => ({}),
  setOwnPlayerGender: async () => ({}),
}))

vi.mock('../src/data/parents.js', () => ({
  listParentsForPlayers: (...a) => listParentsForPlayersMock(...a),
  listParents: async () => [],
  saveParents: async () => [],
}))

vi.mock('../src/data/photos.js', () => ({
  PHOTO_BUCKET: 'player-photos',
  playerPhotoUrl: async () => null,
  uploadPlayerPhoto: async () => 'path',
  setOwnPlayerPhoto: async () => ({}),
  deletePlayerPhoto: async () => {},
  forgetPhotoUrl: () => {},
}))

// The calendar card is a shared component with its own suite
// (tests/calendar-subscribe.test.jsx); stubbed so its network is not this
// file's problem.
vi.mock('../src/data/calendar.js', () => ({
  calendarFeedUrl: () => 'https://example.test/calendar.ics?token=t',
  calendarWebcalUrl: () => 'webcal://example.test/calendar.ics?token=t',
  myCalendarToken: vi.fn().mockResolvedValue('t'),
  resetMyCalendarToken: vi.fn(),
}))

// Import after vi.mock so this binds to the mocked module.
import More from '../src/screens/More.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

function renderMore() {
  return render(
    <MemoryRouter initialEntries={['/more']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <More />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Module-level cache — see the note in tests/dashboard.test.jsx.
  clearMyProfileCache()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  // Default: nothing linked. Individual tests opt in to players.
  //
  // ⚠️ ARRAYS, NOT MAPS, BECAUSE THAT IS WHAT THE REAL FUNCTIONS RETURN.
  // The first version of these mocks returned `{}` keyed by player id —
  // the shape the component's author assumed. Every test passed and the
  // panel shipped blank to production, because on a real array
  // `contacts[playerId]` is undefined. A mock that encodes the assumption
  // instead of the contract tests nothing.
  listPlayersMock.mockResolvedValue([])
  listContactsForPlayersMock.mockResolvedValue([])
  listParentsForPlayersMock.mockResolvedValue([])
  // The profile row the You card fills itself in from. `phone` has been on
  // this row since 8 Aug 2026; null is the normal case — nobody has one yet.
  getMyProfileMock.mockResolvedValue({
    id: 'user-1',
    first_name: 'Jay',
    last_name: 'Muir',
    email: 'jay@example.com',
    phone: null,
    // ⚠️ ADDED 13 Aug 2026 AND IT IS NOT DECORATION. The add-a-player form asks
    // for the registrant's OWN name whenever `name_confirmed_at` is null, so a
    // fixture without it is a person the form must interrogate before it will
    // save anything. Somebody on /more with a membership has almost always
    // answered already — the unconfirmed case has its own test below.
    name_confirmed_at: '2026-08-01T00:00:00Z',
  })
  updateProfileNamesMock.mockResolvedValue({
    id: 'user-1',
    first_name: 'Jay',
    last_name: 'Muir',
    name_confirmed_at: '2026-08-13T00:00:00Z',
  })
  updateMyProfileMock.mockImplementation(async (fields) => ({
    id: 'user-1',
    first_name: fields.firstName,
    last_name: fields.lastName,
    phone: fields.phone,
  }))
  registerMyPlayerMock.mockResolvedValue({ id: 'mm-new', status: 'pending' })
})

// Added 6 Aug 2026 (Jay): "they should be able to see their info and any
// related player info too."
describe('More — your own details', () => {
  it('shows the name and email the club holds', async () => {
    // ⚠️ The name used to be a read-only row with data-testid="your-name".
    // It is two inputs since 8 Aug 2026 (see the You-card suite at the foot of
    // this file for why), so the same fact is now asserted on their values.
    // The email is still text, and must stay text.
    renderMore()
    // ⚠️ findByDisplayValue, not findByLabelText: the inputs exist on the
    // first render and are filled in when the profile row resolves, so
    // querying by label alone returns them EMPTY and asserts nothing.
    expect(await screen.findByDisplayValue('Jay')).toBe(screen.getByLabelText('First name'))
    expect(screen.getByLabelText('Family name')).toHaveValue('Muir')
    expect(screen.getByTestId('your-email')).toHaveTextContent('jay@example.com')
  })
})

describe('More — your players', () => {
  const PLAYER = {
    id: 'p1',
    full_name: 'Tom Muir',
    team_id: 'team-u10',
    position: 'Flanker',
    photo_path: null,
  }

  it('lists the player this account is attached to', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()

    const card = await screen.findByTestId('your-player')
    expect(within(card).getByText('Tom Muir')).toBeInTheDocument()
    expect(within(card).getByText(/U10 · Flanker/)).toBeInTheDocument()
  })

  it('shows the contact and parent rows the club holds', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])
    // Exactly the row shapes the real queries return — player_id on each row,
    // and NO phone/email on a parent row, because listParentsForPlayers
    // selects id, player_id, full_name, relationship, is_primary and nothing
    // else.
    listContactsForPlayersMock.mockResolvedValue([
      { player_id: 'p1', phone: '+971501234567', email: 'tom@example.com' },
    ])
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pa1', player_id: 'p1', full_name: 'Jay Muir', relationship: 'Father', is_primary: true },
    ])

    renderMore()
    const card = await screen.findByTestId('your-player')
    expect(within(card).getByText('tom@example.com')).toBeInTheDocument()
    expect(within(card).getByText('Jay Muir')).toBeInTheDocument()
    expect(within(card).getByText('Father')).toBeInTheDocument()
    // The phone is formatted, not printed raw.
    expect(within(card).getByText('+971 50 123 4567')).toBeInTheDocument()
  })

  it('groups rows by player when two children are linked', async () => {
    // ⚠️ The regression test for the shipped bug: with an ARRAY of rows
    // covering two players, each card must get its own. The broken version
    // rendered neither.
    useMembershipsMock.mockReturnValue(
      memberships([
        { id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' },
        { id: 'm4', role: 'parent', team_id: 'team-u10', player_id: 'p2' },
      ]),
    )
    listPlayersMock.mockResolvedValue([
      PLAYER,
      { id: 'p2', full_name: 'Sam Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])
    listContactsForPlayersMock.mockResolvedValue([
      { player_id: 'p1', phone: null, email: 'tom@example.com' },
      { player_id: 'p2', phone: null, email: 'sam@example.com' },
    ])

    renderMore()
    const cards = await screen.findAllByTestId('your-player')
    expect(cards).toHaveLength(2)

    const tom = cards.find((c) => within(c).queryByText('Tom Muir'))
    const sam = cards.find((c) => within(c).queryByText('Sam Muir'))
    expect(within(tom).getByText('tom@example.com')).toBeInTheDocument()
    expect(within(tom).queryByText('sam@example.com')).toBeNull()
    expect(within(sam).getByText('sam@example.com')).toBeInTheDocument()
  })

  it('says NOTHING when the contact row is withheld', async () => {
    // ⚠️ SAFEGUARDING, and the same rule PlayerDetail already follows.
    // player_contacts is a separate table precisely so RLS can withhold it.
    // A "contact details are hidden" note would confirm to someone who
    // cannot see the data that there IS data to see. So: no row, no note,
    // no lock icon.
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])
    listContactsForPlayersMock.mockResolvedValue([])

    renderMore()
    const card = await screen.findByTestId('your-player')
    expect(within(card).queryByText(/hidden|restricted|not available|no contact/i)).toBeNull()
    expect(within(card).queryByText('Phone')).toBeNull()
  })

  it('shows no players card at all for a coach with no child at the club', async () => {
    // An empty "Your players" heading implies something is missing.
    useMembershipsMock.mockReturnValue(memberships(COACH))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    await screen.findByDisplayValue('Jay')

    expect(screen.queryByTestId('your-player')).not.toBeInTheDocument()
    expect(screen.queryByText(/your player/i)).not.toBeInTheDocument()
  })

  it('does not offer edit controls of its own', async () => {
    // ⚠️ Editing lives in the existing self-service flow, which the database
    // restricts to photo, contact and parent rows. A second implementation
    // here could drift from that and offer a write RLS refuses. The button
    // below opens THAT form; it does not reimplement it.
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    const card = await screen.findByTestId('your-player')

    expect(within(card).queryByRole('textbox')).toBeNull()
    expect(within(card).getByRole('button', { name: /view or change/i })).toBeInTheDocument()
  })

  // ⚠️ CHANGED 9 Aug 2026 (Jay). This used to be a <Link to="/roster">, which
  // dropped a parent on the squad list with no player id and no state — they
  // then had to find their own child and click through two more steps to reach
  // the form they had already asked for.
  it('opens the player form in place instead of navigating to the roster', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    const card = await screen.findByTestId('your-player')

    // No href to follow. The old failure was silent: the link "worked", it
    // just landed somewhere else.
    expect(within(card).queryByRole('link', { name: /view or change/i })).toBeNull()

    await user.click(within(card).getByRole('button', { name: /view or change/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Tom Muir/i)
  })

  it('opens the form for the player whose card was clicked', async () => {
    // With two children the id has to travel with the click. A single shared
    // sheet that always opened the first player would pass every test above.
    const user = userEvent.setup()
    const sibling = { ...PLAYER, id: 'p-2', full_name: 'Ruby Muir' }
    useMembershipsMock.mockReturnValue(
      memberships([
        ...PARENT,
        { id: 'm-p2', role: 'parent', team_id: PLAYER.team_id, player_id: 'p-2', club_id: 'club-1' },
      ]),
    )
    listPlayersMock.mockResolvedValue([PLAYER, sibling])

    renderMore()
    const cards = await screen.findAllByTestId('your-player')
    expect(cards).toHaveLength(2)

    await user.click(within(cards[1]).getByRole('button', { name: /view or change/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Ruby/i)
  })
})

describe('More — for every role', () => {
  it('renders a real More screen for a parent, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('renders a real More screen for a coach, not a not-authorised card', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByText(/not authorised/i)).not.toBeInTheDocument()
  })

  it('shows the role label and the squads the person can see', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Parent')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10')
    // A parent of a U10 player must not be told they can see the 1st XV.
    expect(screen.getByTestId('your-squads')).not.toHaveTextContent('Senior Men 1st XV')
  })

  it('shows every squad for an admin, in sort order', () => {
    renderMore()

    expect(screen.getByTestId('your-role')).toHaveTextContent('Admin')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10 · Senior Men 1st XV')
  })

  it('says so plainly when the person can see no squads yet', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH, []))

    renderMore()

    expect(screen.getByTestId('your-squads')).toHaveTextContent(/no squads yet/i)
  })
})

describe('More — the Admin link', () => {
  it('offers an Admin link to an admin, pointing at /admin', () => {
    renderMore()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('does not offer an Admin link to a coach', () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('does not offer an Admin link to a parent', () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})

describe('More — what it deliberately does NOT do', () => {
  // The duplication this plan exists to remove: /more used to list every
  // club member read-only while /accounts listed the same rows with write
  // controls. The Accounts tab is now the only place club members appear.
  it('does not list club members', () => {
    renderMore()

    expect(screen.queryAllByTestId('member-row')).toHaveLength(0)
    expect(screen.queryByText(/club members/i)).not.toBeInTheDocument()
  })

  // ⚠️ Sign-out is rendered by AppShell on this route, not by this screen.
  // If it ever moves in here, the guard in tests/app.test.jsx (a parent
  // signing out through the real App) is what keeps it working; this only
  // pins the current division of labour.
  it('does not render its own sign-out control', () => {
    renderMore()

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})

// ⚠️ REPORTED BY A REAL PARENT, 8 Aug 2026: "I can't change anything about
// myself." She was right. /more showed Name, Email, Role and Squads, all
// read-only, with no phone field at all, and the only self-service form in the
// app (MyPlayerForm) is reached THROUGH a linked player — so a membership
// granted by hand by an admin, which carries `player_id = null`, left that
// person with no editable field anywhere in the product.
//
// Jay's rulings, which these tests exist to hold: the phone is a fact about
// the PERSON so it lives on public.profiles, not on the child's contact row;
// and the editable scope is NAME AND PHONE, nothing else.
describe('More — the You card is editable', () => {
  const user = () => userEvent.setup()

  // ⚠️ THE CARD IS READ-ONLY UNTIL "Edit" IS PRESSED (Jay, 9 Aug 2026): "could
  // get messed up with some errant screen taps even though they would need to
  // hit save". Every test below that edits anything opens the editor first.
  async function startEditing(u) {
    await u.click(await screen.findByRole('button', { name: 'Edit' }))
  }

  it('fills itself in from the profile row', async () => {
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: 'Janice',
      last_name: 'Bell',
      email: 'janice@example.com',
      phone: '+971501234567',
    })

    renderMore()

    expect(await screen.findByDisplayValue('Janice')).toBe(screen.getByLabelText('First name'))
    expect(screen.getByLabelText('Family name')).toHaveValue('Bell')
  })

  it('round-trips a stored E.164 number through the country/number split', async () => {
    // ⚠️ THE STORED SHAPE IS E.164 AND THE EDITED SHAPE IS TWO FIELDS. This is
    // the seam splitPhone/joinPhone exist for (src/lib/phone.js) and the one
    // place a copy-paste of this card could silently get it wrong — writing
    // "501234567" with the country dropped, or "+971+971501234567".
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: 'Janice',
      last_name: 'Bell',
      phone: '+971501234567',
    })

    const u = user()
    renderMore()

    // In: the split. AE from the +971, digits in the box without it.
    expect(await screen.findByDisplayValue('501234567')).toBe(screen.getByLabelText('Phone'))
    expect(screen.getByLabelText('Phone country')).toHaveValue('AE')

    // ⚠️ Out via an edit to a DIFFERENT field. Saving an untouched row is no
    // longer possible — Save only appears once something has changed — so the
    // property is asserted the way it actually matters: the phone survives an
    // edit to something else, rather than being re-derived and mangled.
    await startEditing(u)
    const first = screen.getByLabelText('First name')
    await u.clear(first)
    await u.type(first, 'Janet')
    await u.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateMyProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+971501234567' }),
    )
  })

  it('saves the name and phone the person typed, and says so', async () => {
    const u = user()
    renderMore()

    await startEditing(u)
    const first = await screen.findByDisplayValue('Jay')
    await user().clear(first)
    await user().type(first, 'Janice')
    await user().clear(screen.getByLabelText('Family name'))
    await user().type(screen.getByLabelText('Family name'), 'Bell')
    await user().type(screen.getByLabelText('Phone'), '501234567')

    await user().click(screen.getByRole('button', { name: 'Save' }))

    expect(updateMyProfileMock).toHaveBeenCalledTimes(1)
    expect(updateMyProfileMock).toHaveBeenCalledWith({
      profileId: 'user-1',
      firstName: 'Janice',
      lastName: 'Bell',
      // Typed as national digits on the default UAE country, stored as E.164.
      phone: '+971501234567',
    })
    // The whole feedback a person gets that it landed.
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('clears the phone to null rather than to an empty string', async () => {
    // An empty string is a value: it sorts, it compares, and it makes
    // "has a phone number" true. Null is the honest absence.
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: 'Janice',
      last_name: 'Bell',
      phone: '+971501234567',
    })

    const u = user()
    renderMore()
    await startEditing(u)
    await user().clear(await screen.findByDisplayValue('501234567'))
    await user().click(screen.getByRole('button', { name: 'Save' }))

    expect(updateMyProfileMock).toHaveBeenCalledWith(expect.objectContaining({ phone: null }))
  })

  it('shows what went wrong when the save is refused', async () => {
    updateMyProfileMock.mockRejectedValue(new Error("We couldn't save your details. Try again."))

    const u = user()
    renderMore()
    await startEditing(u)
    // Save only exists once something has changed, so there is something to
    // change. Any field will do; the assertion is about the failure, not this.
    await u.type(await screen.findByDisplayValue('Jay'), 'ne')
    await u.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save your details/i)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    // ⚠️ AND IT STAYS IN EDIT MODE. Dropping back to read-only on a FAILED
    // save would hide the values the person typed behind an Edit button, and
    // they would have to retype them to try again.
    expect(screen.getByLabelText('First name')).not.toBeDisabled()
  })

  it('does NOT let anyone edit their email', async () => {
    // ⚠️ THIS IS A SECURITY TEST, NOT A LAYOUT ONE. RLS grants rows, not
    // columns, so the own-row update policy on profiles once let a person
    // rewrite profiles.email and desync it from the address they actually sign
    // in with — which is the address an admin reads on the Accounts screen when
    // deciding whether to approve a stranger. `authenticated` now holds column
    // privileges on full_name, first_name, last_name, name_confirmed_at and
    // phone only, so an email input here would be a field that always fails to
    // save. It stays text.
    renderMore()

    await screen.findByDisplayValue('Jay')

    expect(screen.getByTestId('your-email')).toHaveTextContent('jay@example.com')
    expect(screen.queryByLabelText(/email/i)).toBeNull()
    expect(document.querySelector('input[type="email"]')).toBeNull()
    // Belt and braces: no control anywhere on the screen is holding the
    // address as an editable value, whatever it happens to be labelled.
    const editable = screen.queryAllByRole('textbox')
    expect(editable.map((el) => el.value)).not.toContain('jay@example.com')
  })

  it('does NOT let anyone edit their role or their squads', async () => {
    // Both are decided by membership rows, which this caller cannot write at
    // all — `memb manage` is is_admin(club_id). An input for either would be a
    // control the database refuses.
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    renderMore()
    await screen.findByDisplayValue('Jay')

    expect(screen.getByTestId('your-role')).toHaveTextContent('Parent')
    expect(screen.getByTestId('your-squads')).toHaveTextContent('U10')
    expect(screen.queryByLabelText(/role/i)).toBeNull()
    expect(screen.queryByLabelText(/squad/i)).toBeNull()
    expect(screen.queryByRole('combobox', { name: /role|squad/i })).toBeNull()
  })

  it('sends nothing but the name and phone', async () => {
    // The allow-list, restated as a test. Any extra key here is a column the
    // client has no privilege on, and the whole update would fail — so an
    // over-eager `...profile` spread must not creep into the submit handler.
    const u = user()
    renderMore()
    await startEditing(u)
    await u.type(await screen.findByDisplayValue('Jay'), 'ne')
    await u.click(screen.getByRole('button', { name: 'Save' }))

    const [fields] = updateMyProfileMock.mock.calls[0]
    expect(Object.keys(fields).sort()).toEqual(['firstName', 'lastName', 'phone', 'profileId'])
  })
})

// ── The approvals entry point (Jay, 9 Aug 2026) ────────────────────────
//
// ⚠️ THIS IS A COACH'S ONLY ROUTE TO THE QUEUE FROM A PHONE. The Admin pill in
// the tab bar is admin-only AND desktop-only ("hidden desktop:flex"), so
// without this link a coach standing on a pitch has no way in at all. That is
// the failure this block exists to catch, and it is invisible in a browser at
// laptop width.
describe('More — the approvals link', () => {
  const COACH_U10 = [{ id: 'm-c', role: 'coach', team_id: 'team-u10', club_id: 'club-1' }]
  const MANAGER_U10 = [{ id: 'm-m', role: 'manager', team_id: 'team-u10', club_id: 'club-1' }]
  const MEDIC_U10 = [{ id: 'm-md', role: 'medic', team_id: 'team-u10', club_id: 'club-1' }]

  const approvalsLink = () => screen.queryByRole('link', { name: /waiting to be approved/i })

  it('offers it to a coach', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_U10))
    renderMore()
    await screen.findByDisplayValue('Jay')
    expect(approvalsLink()).toHaveAttribute('href', '/approvals')
  })

  it('offers it to a team manager', async () => {
    useMembershipsMock.mockReturnValue(memberships(MANAGER_U10))
    renderMore()
    await screen.findByDisplayValue('Jay')
    expect(approvalsLink()).toHaveAttribute('href', '/approvals')
  })

  // Medic is a squad staff role and may EDIT this squad's players. Approval is
  // deliberately a shorter list — Jay, 9 Aug 2026.
  it('does not offer it to a medic', async () => {
    useMembershipsMock.mockReturnValue(memberships(MEDIC_U10))
    renderMore()
    await screen.findByDisplayValue('Jay')
    expect(approvalsLink()).toBeNull()
  })

  it('does not offer it to a parent', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    renderMore()
    await screen.findByDisplayValue('Jay')
    expect(approvalsLink()).toBeNull()
  })

  // An admin already has the Admin pill in the nav. A second door to the same
  // screen is clutter, not access.
  it('does not duplicate it for an admin, who has the Admin pill', async () => {
    useMembershipsMock.mockReturnValue(memberships(ADMIN))
    renderMore()
    await screen.findByDisplayValue('Jay')
    expect(approvalsLink()).toBeNull()
  })
})

// ── The You card is read-only until you say otherwise ──────────────────
//
// Jay, 9 Aug 2026: "right now they can just instantly edit the info, could get
// messed up with some errant screen taps even though they would need to hit
// save, should be an edit button then save would appear if they make any edits".
//
// ⚠️ THE REASON IS SPECIFIC TO THIS SCREEN. /more is opened for the sign-out
// button, the privacy policy and the calendar link — the reasons people come
// here are mostly NOT editing. Live inputs at the top of it put three focusable
// boxes holding someone's real name under a thumb on every visit, for a task
// they are usually not doing.
describe('More — the You card is read-only until Edit', () => {
  const user = () => userEvent.setup()

  it('disables every field and offers no Save until Edit is pressed', async () => {
    renderMore()

    expect(await screen.findByLabelText('First name')).toBeDisabled()
    expect(screen.getByLabelText('Family name')).toBeDisabled()
    expect(screen.getByLabelText('Phone')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('still SHOWS the values, rather than hiding them behind the button', async () => {
    // Read-only must not mean invisible: "what does the club hold about me?"
    // is the question this card exists to answer.
    renderMore()
    expect(await screen.findByDisplayValue('Jay')).toBeInTheDocument()
  })

  it('makes the fields editable when Edit is pressed', async () => {
    const u = user()
    renderMore()
    await u.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('First name')).not.toBeDisabled()
    expect(screen.getByLabelText('Phone')).not.toBeDisabled()
  })

  // ⚠️ JAY'S EXACT ASK: "save would appear if they make any edits". A Save
  // button that is present but does nothing teaches people that pressing Save
  // is meaningless — a habit you do not want carried to the screens where it
  // isn't.
  it('shows no Save until something has actually changed', async () => {
    const u = user()
    renderMore()
    await u.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    await u.type(screen.getByLabelText('First name'), 'ne')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  // Compared against the SAVED row, not a snapshot taken when Edit was pressed:
  // typing a change and undoing it by hand leaves the person where they
  // started, and offering to save that is offering to write what is already
  // there.
  it('withdraws Save again when the change is typed back out', async () => {
    const u = user()
    renderMore()
    await u.click(await screen.findByRole('button', { name: 'Edit' }))

    const first = screen.getByLabelText('First name')
    await u.type(first, 'ne')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    await u.clear(first)
    await u.type(first, 'Jay')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('puts the stored values back when Cancel is pressed', async () => {
    const u = user()
    renderMore()
    await u.click(await screen.findByRole('button', { name: 'Edit' }))

    const first = screen.getByLabelText('First name')
    await u.clear(first)
    await u.type(first, 'Nonsense')
    await u.click(screen.getByRole('button', { name: 'Cancel' }))

    // Cancel means cancel — not "stop editing and keep the half-typed text".
    expect(screen.getByLabelText('First name')).toHaveValue('Jay')
    expect(screen.getByLabelText('First name')).toBeDisabled()
    expect(updateMyProfileMock).not.toHaveBeenCalled()
  })

  it('returns to read-only after a successful save', async () => {
    const u = user()
    renderMore()
    await u.click(await screen.findByRole('button', { name: 'Edit' }))
    await u.type(screen.getByLabelText('First name'), 'ne')
    await u.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Saved')
    // Leaving the fields live would put the person straight back into the
    // state this whole change exists to avoid.
    expect(screen.getByLabelText('First name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})

// ── "Your players" must mean YOUR players ──────────────────────────────
//
// Jay, 9 Aug 2026, signed in as admin: "it is showing two of the test players
// in my account? because i am admin? will this show like that also for coaches
// and managers? seems like a bug".
//
// It was. loadMyMemberships() selected from `memberships` with NO filter and a
// comment claiming RLS scoped it to the caller. `memb read` is
// (profile_id = auth.uid() OR is_admin(club_id)) — for an ADMIN the second
// clause matches every row in the club, so the provider handed every screen
// the whole club's memberships as though they were the signed-in person's own.
//
// ⚠️ These tests pass membership arrays directly, so they pin the CONSUMER's
// contract: a row belongs to you only if it carries your player_id. The
// query-level fix is asserted in tests/scope.test.js. Both halves are needed —
// the query one alone would not have caught a screen that widened the rule.
describe('More — whose players are "Your players"', () => {
  // Its own fixture: the PLAYER above is scoped to another describe block.
  const A_PLAYER = {
    id: 'p1',
    full_name: 'Tom Muir',
    team_id: 'team-u10',
    position: 'Flanker',
    photo_path: null,
  }
  const A_PARENT = [
    { id: 'm-p', role: 'parent', team_id: 'team-u10', player_id: 'p1', club_id: 'club-1' },
  ]

  it('shows nothing for an admin with no children at the club', async () => {
    // The exact shape of Jay's account: admin, no team, no linked player.
    useMembershipsMock.mockReturnValue(
      memberships([{ id: 'm-a', role: 'admin', team_id: null, player_id: null, club_id: 'club-1' }]),
    )
    listPlayersMock.mockResolvedValue([A_PLAYER])

    renderMore()
    await screen.findByDisplayValue('Jay')

    expect(screen.queryByTestId('your-player')).not.toBeInTheDocument()
    expect(screen.queryByText(/your players?/i)).not.toBeInTheDocument()
  })

  it('shows nothing for a coach who has no child at the club', async () => {
    useMembershipsMock.mockReturnValue(
      memberships([
        { id: 'm-c', role: 'coach', team_id: 'team-u10', player_id: null, club_id: 'club-1' },
      ]),
    )
    listPlayersMock.mockResolvedValue([A_PLAYER])

    renderMore()
    await screen.findByDisplayValue('Jay')

    // A coach can SEE thirty children on the roster and none of them are
    // theirs. Only a row carrying a player_id makes a player yours.
    expect(screen.queryByTestId('your-player')).not.toBeInTheDocument()
  })

  // ⚠️ WHERE THE CROSS-PERSON PROTECTION ACTUALLY LIVES, stated here because
  // the obvious test to write at this level is a lie.
  //
  // Jay asked whether coaches would see the same thing he did. Since the
  // squad-approval policy landed earlier the same day, a coach CAN read other
  // people's pending membership rows for their squads — and those rows carry a
  // player_id. This component cannot defend against that: handed a parent row,
  // it has no way to tell whose it is, and adding a role filter would not help
  // because the rows in question ARE parent rows.
  //
  // What makes it safe is that the array never contains them: loadMyMemberships
  // now filters `.eq('profile_id', …)` rather than trusting RLS to scope a read
  // that, for an admin, matches the whole club. That is asserted in
  // tests/scope.test.js — "scopes the query to ONE profile, which RLS alone
  // does not do". If that test is ever deleted, this panel is the screen where
  // the consequence shows up first.
  // (No test here on purpose. `expect(true).toBe(true)` would be decoration —
  // a green mark that can never go red. The comment is the artefact.)

  it('still shows a parent their own child', async () => {
    // The rule is "a row carrying MY player_id", not "no rows ever" — this is
    // the case the panel exists for.
    useMembershipsMock.mockReturnValue(memberships(A_PARENT))
    listPlayersMock.mockResolvedValue([A_PLAYER])

    renderMore()

    expect(await screen.findByTestId('your-player')).toBeInTheDocument()
  })
})

// ── Adding a second child (13 Aug 2026) ──────────────────────────────────
//
// ⚠️ THE GAP THIS CLOSES WAS INVISIBLE FROM THE DATABASE SIDE, which is why it
// survived from 8 to 13 Aug. `register_my_player` has always allowed an
// approved parent to register another child — its rate limit counts PENDING
// rows precisely so that "an approved parent adding a second child later is
// normal and must not be blocked by their own history". The FORM was the
// restriction: AppShell renders AddYourPlayer only while
// `memberships.length === 0`, so it vanished the moment the first child landed
// and the only remaining route was an admin on the desktop Accounts screen.
//
// These tests drive the parent-facing route. The multi-row form itself is
// covered in tests/parent-self-registration.test.jsx, where the sign-up screen
// lives; what is asserted here is that this screen offers it, to the right
// people, and feeds the result back into the provider.
describe('More — adding another child', () => {
  const PLAYER = {
    id: 'p1',
    full_name: 'Tom Muir',
    team_id: 'team-u10',
    position: 'Flanker',
    photo_path: null,
  }
  const PARENT_OF_ONE = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

  it('offers a parent the route to add another child', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_ONE))
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()

    expect(await screen.findByTestId('add-another-player')).toHaveTextContent(/add another player/i)
  })

  // ⚠️ THE REPORTED BUG, AND THE REASON THE GATE IS THE ROLE RATHER THAN THE
  // LIST. More.jsx already records it: "a membership granted by hand by an
  // admin has player_id = null, so YourPlayers renders nothing for that person
  // and there was no editable field anywhere in the app for them". Put the add
  // button inside the list and it stays hidden from exactly that parent.
  it('offers it to a parent whose membership carries no linked player at all', async () => {
    useMembershipsMock.mockReturnValue(
      memberships([{ id: 'm9', role: 'parent', team_id: 'team-u10', player_id: null }]),
    )
    listPlayersMock.mockResolvedValue([])

    renderMore()

    expect(await screen.findByTestId('add-another-player')).toBeInTheDocument()
    // And it words itself for somebody with nobody yet, rather than saying
    // "another" to a person who has none.
    expect(screen.getByTestId('add-another-player')).toHaveTextContent(/add your player/i)
  })

  it('does not offer it to a coach with no child at the club', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    renderMore()
    await screen.findByDisplayValue('Jay')

    expect(screen.queryByTestId('add-another-player')).not.toBeInTheDocument()
  })

  it('registers the child and reloads the provider so the new row arrives', async () => {
    const u = userEvent.setup()
    const reload = vi.fn()
    useMembershipsMock.mockReturnValue({ ...memberships(PARENT_OF_ONE), reload })
    listPlayersMock.mockResolvedValue([PLAYER])

    renderMore()
    await u.click(await screen.findByTestId('add-another-player'))

    await u.type(await screen.findByLabelText(/player's full name/i), 'Rory Muir')
    await u.selectOptions(screen.getByLabelText(/age group/i), 'team-u10')
    await u.click(screen.getByRole('button', { name: /add this player/i }))

    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenCalledWith('Rory Muir', 'team-u10', null, false),
    )
    // ⚠️ THE HALF THAT IS INVISIBLE WHEN IT BREAKS, exactly as at sign-up. The
    // membership exists server-side either way; without the reload the parent
    // closes the sheet onto a list that still shows one child, which reads as
    // "it didn't work" — and the obvious response is to add them again.
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  // ⚠️ PER CHILD, NOT PER ACCOUNT — and the big banner cannot do this job.
  // AppShell's is driven by isPendingOnly, which is `every`, so a parent with
  // one approved child and one waiting gets no banner at all (see the test in
  // tests/parent-self-registration.test.jsx that pins that deliberately). This
  // chip is the only thing that answers "did my second child go through?".
  it('marks the child who is still waiting, and only that child', async () => {
    useMembershipsMock.mockReturnValue(
      memberships([
        { id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1', status: 'active' },
        { id: 'm4', role: 'parent', team_id: 'team-u10', player_id: 'p2', status: 'pending' },
      ]),
    )
    listPlayersMock.mockResolvedValue([
      PLAYER,
      { id: 'p2', full_name: 'Rory Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])

    renderMore()

    const cards = await screen.findAllByTestId('your-player')
    const tom = cards.find((c) => within(c).queryByText('Tom Muir'))
    const rory = cards.find((c) => within(c).queryByText('Rory Muir'))

    expect(within(rory).getByTestId('player-pending')).toHaveTextContent(/waiting for approval/i)
    // The negative is the half that matters: a chip on every card would say
    // nothing at all.
    expect(within(tom).queryByTestId('player-pending')).not.toBeInTheDocument()
  })
})

// ── The registrant's own name (13 Aug 2026) ───────────────────────────────
//
// ⚠️ THE RACE THIS CLOSES WAS MEASURED ON THE LIVE DATABASE, not reasoned
// about. A real registration on 13 Aug: membership created 08:35:50, name
// confirmed 08:38:33 — 2m 43s during which an admin's approval queue showed a
// row it could not name. The cause is an ordering nobody chose: `NamePrompt`
// only mounts inside AppShell's `ready` branch (`memberships.length > 0`), and
// the membership is ALSO what creates the queue row, so the row could not help
// but exist first. And NamePrompt is skippable, so the gap does not always
// close on its own.
describe('More — the registrant’s own name', () => {
  const PARENT_OF_ONE = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]

  it('does not ask again when the name is already confirmed', async () => {
    const u = userEvent.setup()
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_ONE))
    listPlayersMock.mockResolvedValue([
      { id: 'p1', full_name: 'Tom Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])

    renderMore()
    await u.click(await screen.findByTestId('add-another-player'))

    // A form that interrogates somebody about a fact it already holds.
    expect(screen.queryByLabelText(/your first name/i)).not.toBeInTheDocument()
  })

  it('asks, and writes the name BEFORE the child, when it has never been given', async () => {
    const u = userEvent.setup()
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: null,
      last_name: null,
      email: 'jay@example.com',
      phone: null,
      name_confirmed_at: null,
    })
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_ONE))
    listPlayersMock.mockResolvedValue([
      { id: 'p1', full_name: 'Tom Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])

    const order = []
    updateProfileNamesMock.mockImplementation(async () => {
      order.push('name')
      return { id: 'user-1', first_name: 'Jay', name_confirmed_at: '2026-08-13T00:00:00Z' }
    })
    registerMyPlayerMock.mockImplementation(async () => {
      order.push('child')
      return { id: 'mm-new', status: 'pending' }
    })

    renderMore()
    await u.click(await screen.findByTestId('add-another-player'))

    await u.type(await screen.findByLabelText(/your first name/i), 'Jay')
    await u.type(screen.getByLabelText(/your family name/i), 'Muir')
    await u.type(screen.getByLabelText(/player's full name/i), 'Rory Muir')
    await u.selectOptions(screen.getByLabelText(/age group/i), 'team-u10')
    await u.click(screen.getByRole('button', { name: /add this player/i }))

    await waitFor(() => expect(registerMyPlayerMock).toHaveBeenCalled())
    expect(updateProfileNamesMock).toHaveBeenCalledWith({
      profileId: 'user-1',
      firstName: 'Jay',
      lastName: 'Muir',
    })
    // ⚠️ THE ORDER IS THE WHOLE FIX. Writing the name after the child would
    // leave the race exactly where it was — the membership, and so the queue
    // row, would still land before the profile had a name.
    expect(order).toEqual(['name', 'child'])
  })

  it('will not create a child at all when the name is blank', async () => {
    const u = userEvent.setup()
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: null,
      last_name: null,
      email: 'jay@example.com',
      phone: null,
      name_confirmed_at: null,
    })
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_ONE))
    listPlayersMock.mockResolvedValue([
      { id: 'p1', full_name: 'Tom Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])

    renderMore()
    await u.click(await screen.findByTestId('add-another-player'))

    await u.type(await screen.findByLabelText(/player's full name/i), 'Rory Muir')
    await u.selectOptions(screen.getByLabelText(/age group/i), 'team-u10')
    await u.click(screen.getByRole('button', { name: /add this player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/your own first name/i)
    // ⚠️ NOTHING was created. A form that saved the child and then complained
    // about the name would have produced the exact nameless queue row this
    // field exists to prevent.
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
    expect(updateProfileNamesMock).not.toHaveBeenCalled()
  })

  // ⚠️ A REFUSED NAME MUST STOP EVERYTHING. updateProfileNames reads the row
  // back and throws rather than reporting a silent zero-row success, so a
  // refusal here is real — and carrying on past it would create the nameless
  // row anyway.
  it('creates no child when the name write is refused', async () => {
    const u = userEvent.setup()
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: null,
      last_name: null,
      email: 'jay@example.com',
      phone: null,
      name_confirmed_at: null,
    })
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_ONE))
    listPlayersMock.mockResolvedValue([
      { id: 'p1', full_name: 'Tom Muir', team_id: 'team-u10', position: null, photo_path: null },
    ])
    updateProfileNamesMock.mockRejectedValue(new Error("We couldn't save that name."))

    renderMore()
    await u.click(await screen.findByTestId('add-another-player'))

    await u.type(await screen.findByLabelText(/your first name/i), 'Jay')
    await u.type(screen.getByLabelText(/player's full name/i), 'Rory Muir')
    await u.selectOptions(screen.getByLabelText(/age group/i), 'team-u10')
    await u.click(screen.getByRole('button', { name: /add this player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save that name/i)
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })
})
