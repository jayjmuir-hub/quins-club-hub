import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Roster.jsx + src/screens/PlayerDetail.jsx
// (Task 12). useMemberships and src/data/players.js are mocked, so this
// exercises only the screens' own behaviour — scoping the query to the
// user's visible teams, the age-group vs position grouping rule, the search
// filter, the player detail sheet, and the loading/empty/error contract. No
// network is ever reachable from this file.
//
// The contact assertions are the safeguarding ones and matter most: a
// parent's getPlayerContact() legitimately resolves null (RLS hides the row),
// which must render *nothing at all* — not an error, and not a "contact
// details are hidden" message that would leak the existence of data this
// user may not see.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const getPlayerContactMock = vi.fn()

const listParentsMock = vi.fn()

vi.mock('../src/data/parents.js', () => ({
  listParents: (...args) => listParentsMock(...args),
}))

// The photo bucket is private, so PlayerAvatar signs a URL on mount. Mocked
// to null here: these tests are about details and contacts, and an unmocked
// signing call would put a real network request in a unit test.
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: () => Promise.resolve(null),
  signPhotoUrls: () => Promise.resolve({}),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  getPlayerContact: (...args) => getPlayerContactMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Roster from '../src/screens/Roster.jsx'

// ⚠️ U12, AND IT WAS U10 UNTIL 15 Aug 2026. It has to be a band that is BOTH
// above the minis threshold and below the own-contact one: U10 and under no
// longer group by forwards and backs at all (src/lib/minis.js — no positions in
// tag rugby), which silently turned four grouping tests in this file into
// assertions about the minis rule, and U13 and over would break the
// own-contact boundary this file also covers further down. U12 is the only band
// that satisfies both. The minis behaviour has its own file: tests/minis.test.js
// and tests/minis-screens.test.jsx.
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U12] // deliberately unsorted; visibleTeams sorts

const ADMIN = [{ id: 'm1', role: 'admin', team_id: null }]
const COACH_ONE_TEAM = [{ id: 'm2', role: 'coach', team_id: 'team-u12' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u12', player_id: 'p-flanker' }]
// A membership pointing at a team that isn't in the teams list — visibleTeams
// resolves it to zero teams. See the "no visible teams" test for why that
// case is asserted rather than assumed away.
const UNRESOLVED_TEAM = [{ id: 'm4', role: 'parent', team_id: 'team-gone', player_id: 'p-x' }]

// Positions chosen to hit all three position groups: Flanker/Prop/Hooker/Lock
// => Forwards, Fly-half => Backs, Utility => Other. The club does not use
// jersey numbers, so players carry no jersey_num at all and groups sort by
// name; ALL_PLAYERS is deliberately NOT in name order so that sort has to be
// done by the screen rather than inherited from the fixture order.
const FLANKER = {
  id: 'p-flanker',
  team_id: 'team-u12',
  full_name: 'Tom Fletcher',
  position: 'Flanker',
  is_captain: true,
}
const FLY_HALF = {
  id: 'p-fly-half',
  team_id: 'team-u12',
  full_name: 'Ali Hassan',
  position: 'Fly-half',
  is_captain: false,
}
const PROP = {
  id: 'p-prop',
  team_id: 'team-u12',
  full_name: 'Ben Okafor',
  position: 'Prop',
  is_captain: false,
}
const UTILITY = {
  id: 'p-utility',
  team_id: 'team-u12',
  full_name: 'Sami Rahman',
  position: 'Utility',
  is_captain: false,
}
// Two more Forwards, so the name sort is asserted inside a group holding
// several players rather than one. Their names sort before and after the
// other forwards, so a group that merely kept fixture order would fail.
const HOOKER = {
  id: 'p-hooker',
  team_id: 'team-u12',
  full_name: 'Zaid Noor',
  position: 'Hooker',
  is_captain: false,
}
const LOCK = {
  id: 'p-lock',
  team_id: 'team-u12',
  full_name: 'Adam Price',
  position: 'Lock',
  is_captain: false,
}
const SENIOR = {
  id: 'p-fullback',
  team_id: 'team-1xv',
  full_name: 'Craig Muir',
  position: 'Fullback',
  is_captain: false,
}

const ALL_PLAYERS = [FLY_HALF, PROP, SENIOR, FLANKER, UTILITY, HOOKER, LOCK]
const U12_PLAYERS = [FLY_HALF, PROP, FLANKER, UTILITY, HOOKER, LOCK]

// jsdom applies no CSS at all — no Tailwind, and no UA stylesheet layout
// either — so asserting on the literal class token is the only way to make a
// statement about how something will actually be laid out. Same helper, same
// reasoning as tests/schedule.test.jsx and tests/components.test.jsx.
function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

function memberships(rows, teams = TEAMS) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

const groupLabels = () => screen.getAllByTestId('group-label').map((node) => node.textContent)
const playerNames = () => screen.getAllByTestId('player-name').map((node) => node.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  listPlayersMock.mockResolvedValue(ALL_PLAYERS)
  getPlayerContactMock.mockResolvedValue(null)
  listParentsMock.mockResolvedValue([])
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Roster />)
  return { user, ...utils }
}

describe('Roster — loading, empty and error states', () => {
  it('shows a loading state while the players query is in flight', () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    setup()

    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
  })

  it('shows an empty state when the club has no players in view', async () => {
    listPlayersMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no players yet/i)).toBeInTheDocument()
  })

  it('renders a failed players query in an alert region, with a retry', async () => {
    listPlayersMock.mockRejectedValue(new Error('Network unreachable'))

    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listPlayersMock.mockResolvedValue(ALL_PLAYERS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Tom Fletcher')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Roster — scoping the query', () => {
  it('queries only the team a coach can see', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u12'] })
  })

  it('passes every visible team, in display order, for an admin', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u12', 'team-1xv'] })
  })

  // The deliberate zero-teams decision: an empty teamIds array means "no
  // teams, show nothing" (src/data/players.js), never "no filter, show
  // everything". Asking for [] and rendering the empty state is the only
  // safe reading — the alternative would show a user with no resolvable
  // squad every player in the club.
  it('asks for no teams, and shows nothing, when no team resolves', async () => {
    useMembershipsMock.mockReturnValue(memberships(UNRESOLVED_TEAM))
    listPlayersMock.mockResolvedValue([])

    setup()

    expect(await screen.findByText(/no players yet/i)).toBeInTheDocument()
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: [] })
  })
})

describe('Roster — grouping', () => {
  it('groups by age group, in team display order, when several teams are visible', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['U12', 'Senior Men 1st XV'])
  })

  it('omits an age group with no players in it', async () => {
    listPlayersMock.mockResolvedValue([SENIOR])

    setup()

    await screen.findByText('Craig Muir')
    expect(groupLabels()).toEqual(['Senior Men 1st XV'])
  })

  it('groups by position when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U12_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['Forwards', 'Backs', 'Other'])
  })

  it('switches to position grouping when an admin picks a single team', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    expect(groupLabels()).toEqual(['U12', 'Senior Men 1st XV'])

    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'team-u12')

    expect(groupLabels()).toEqual(['Forwards', 'Backs', 'Other'])
    expect(screen.queryByText('Craig Muir')).not.toBeInTheDocument()
  })

  it('sorts a position group by name', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U12_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    // Forwards, by name: Adam, Ben, Tom, Zaid. Backs: Ali. Other: Sami.
    expect(playerNames()).toEqual([
      'Adam Price',
      'Ben Okafor',
      'Tom Fletcher',
      'Zaid Noor',
      'Ali Hassan',
      'Sami Rahman',
    ])
  })

  it('shows each group’s player count', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))
    listPlayersMock.mockResolvedValue(U12_PLAYERS)

    setup()

    await screen.findByText('Tom Fletcher')
    const counts = screen.getAllByTestId('group-count').map((node) => node.textContent)
    expect(counts).toEqual(['4', '1', '1'])
  })

  it('hides the team filter when the user can only see one team', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.queryByRole('button', { name: /^All/ })).not.toBeInTheDocument()
  })
})

describe('Roster — team filter pill counts', () => {
  // The counts answer "how many matches are in each squad", which is a
  // question about the search, not about whichever pill is selected. Deriving
  // them from the already-team-filtered list made every unselected pill read
  // "· 0" the moment any pill was clicked — the row then asserted the rest of
  // the club was empty, and "All" misstated what clicking it would show.
  it('counts every squad, not just the selected one', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.getByRole('option', { name: 'All age groups · 7' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U12 · 6' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Senior Men 1st XV · 1' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'team-u12')

    // Selecting U12 must not zero out the squads it hides, nor shrink "All"
    // to the size of the current selection.
    expect(screen.getByRole('option', { name: 'Senior Men 1st XV · 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All age groups · 7' })).toBeInTheDocument()
  })

  it('narrows the counts to the search', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'craig')

    expect(screen.getByRole('option', { name: 'All age groups · 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U12 · 0' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Senior Men 1st XV · 1' })).toBeInTheDocument()
  })
})

describe('Roster — a team filter that outlives its team', () => {
  // Memberships can reload and shrink a user's scope while a pill is
  // selected; the stored filter then names a squad that is gone. The worst
  // sub-case is a shrink to ONE team, because the pill row hides itself below
  // two teams — so there is no "All" pill left to click, and without this
  // reconciliation the list would stay empty until the user navigated away.
  it('falls back to all squads when the selected team leaves the scope', async () => {
    const { user, rerender } = setup()

    await screen.findByText('Tom Fletcher')
    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'team-u12')
    expect(screen.queryByText('Craig Muir')).not.toBeInTheDocument()

    useMembershipsMock.mockReturnValue(memberships([{ id: 'm5', role: 'coach', team_id: 'team-1xv' }]))
    listPlayersMock.mockResolvedValue([SENIOR])
    rerender(<Roster />)

    expect(await screen.findByText('Craig Muir')).toBeInTheDocument()
    expect(screen.queryByText(/no players/i)).not.toBeInTheDocument()
  })
})

describe('Roster — search', () => {
  it('filters by name, case-insensitively', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'fletch')

    expect(playerNames()).toEqual(['Tom Fletcher'])
  })

  it('filters by position', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'fullback')

    expect(playerNames()).toEqual(['Craig Muir'])
  })

  it('filters by age group name', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'senior men')

    expect(playerNames()).toEqual(['Craig Muir'])
  })

  it('drops a group entirely when nothing in it matches', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'craig')

    expect(groupLabels()).toEqual(['Senior Men 1st XV'])
  })

  it('shows a no-matches message rather than the empty roster message', async () => {
    const { user } = setup()

    await screen.findByText('Tom Fletcher')
    await user.type(screen.getByRole('searchbox'), 'zzz')

    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
    expect(screen.queryByText(/no players yet/i)).not.toBeInTheDocument()
  })
})

describe('Roster — player rows', () => {
  it('shows the initials, position and age group on each row', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const row = screen.getByRole('button', { name: /Tom Fletcher/ })
    expect(within(row).getByText('TF')).toBeInTheDocument()
    expect(within(row).getByText('Flanker · U12')).toBeInTheDocument()
  })

  // The initials tile is decoration: it restates the name that is already in
  // the row, so repeating it to a screen reader would just make every row
  // announce "T F Tom Fletcher".
  it('does not repeat the initials to a screen reader', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const row = screen.getByRole('button', { name: /Tom Fletcher/ })
    expect(within(row).getByText('TF')).toHaveAttribute('aria-hidden', 'true')
    expect(row).not.toHaveAccessibleName(/TF/)
  })

  it('marks the captain', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const row = screen.getByRole('button', { name: /Tom Fletcher/ })
    expect(within(row).getByText('Capt')).toBeInTheDocument()
  })

  // A <button> used as a layout box inherits Chromium's UA content-centring,
  // which jsdom neither applies nor computes. The testable invariant is that
  // the row sets its own layout explicitly instead of relying on defaults.
  it('lays the row out explicitly rather than relying on button defaults', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const rows = screen.getAllByTestId('player-row')
    expect(rows.length).toBeGreaterThan(0)
    ;['flex', 'w-full', 'items-center', 'text-left'].forEach((token) => {
      expect(rows.every((row) => hasClassToken(row, token))).toBe(true)
    })
  })
})

describe('Roster — contrast', () => {
  // --muted (#77726e) is specified against a card, where it clears AA. The
  // group headers and the section-head sub-line sit on --paper (#f5f4f3),
  // where that pair measures 4.329:1 and fails. jsdom applies no CSS, so the
  // class token is the only thing that can be asserted here; the ratio itself
  // was computed separately (see the note in Roster.jsx).
  it('darkens muted text that sits on the page background, not on a card', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    const header = screen.getAllByTestId('group-label')[0].parentElement
    expect(hasClassToken(header, 'text-ink-muted')).toBe(true)
    expect(hasClassToken(header, 'text-ink-faint')).toBe(false)
  })
})

describe('Roster — no scope banner', () => {
  it('shows no scope or read-only banner to a coach', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_ONE_TEAM))

    setup()

    await screen.findByText('Tom Fletcher')
      // The scope banner was removed on 4 Aug 2026 (Jay's call): being scoped
      // to your own squads is expected behaviour for every role, not an
      // exception worth a banner on every screen. Asserted as an ABSENCE so
      // it cannot quietly come back.
    expect(screen.queryByText(/you're seeing/i)).toBeNull()
    expect(screen.queryByText(/read-only/i)).toBeNull()
  })

  it('shows no scope or read-only banner to a parent either', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.queryByText(/read-only/i)).toBeNull()
    expect(screen.queryByText(/every other age group is hidden/i)).toBeNull()
  })

  it('shows no scope note to an admin', async () => {
    setup()

    await screen.findByText('Tom Fletcher')
    expect(screen.queryByText(/you're seeing/i)).not.toBeInTheDocument()
  })
})

describe('PlayerDetail — opening a player', () => {
  async function openTom(user) {
    await screen.findByText('Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /Tom Fletcher/ }))
    return screen.getByRole('dialog')
  }

  it('opens a dialog with the player’s details', async () => {
    const { user } = setup()

    const dialog = await openTom(user)

    expect(within(dialog).getByRole('heading', { name: 'Tom Fletcher' })).toBeInTheDocument()
    expect(within(dialog).getByText('Flanker')).toBeInTheDocument()
    expect(within(dialog).getByText('U12')).toBeInTheDocument()
    expect(within(dialog).getByText('Captain')).toBeInTheDocument()
    // Tom is U12. A player's OWN contact details are a U13+ feature, so the
    // block is not rendered and — the part that matters — the query is never
    // issued for an under-13 in the first place.
    expect(getPlayerContactMock).not.toHaveBeenCalled()
    // The club does not use jersey numbers, so the sheet must not offer a
    // row for one — an empty "Jersey number / Not set" row on every player
    // would be pure noise.
    expect(within(dialog).queryByText(/jersey/i)).not.toBeInTheDocument()
  })

  // The hero tile replaced the jersey number with initials. Asserting only
  // the absence of the jersey row would leave an empty tile undetected.
  it('shows the player’s initials in the hero tile', async () => {
    const { user } = setup()

    const dialog = await openTom(user)
    const hero = within(dialog).getByText('TF')

    expect(hero).toBeInTheDocument()
    // Decoration: the name is already the dialog's heading right beside it.
    expect(hero).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes on the close button', async () => {
    const { user } = setup()

    const dialog = await openTom(user)
    await user.click(within(dialog).getByRole('button', { name: /close/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('PlayerDetail — contact details', () => {
  // Craig Muir (Senior Men 1st XV), NOT Tom Fletcher (U12). A player's own
  // phone and email are shown only from U13 up, so the whole of this suite
  // needs a player old enough to have them. The U13 boundary itself is
  // asserted in its own suite below.
  async function openTom(user) {
    await screen.findByText('Craig Muir')
    await user.click(screen.getByRole('button', { name: /Craig Muir/ }))
    return screen.getByRole('dialog')
  }

  it('shows phone and email as links when the contact row comes back', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-fullback',
      phone: '+971 50 200 1000',
      email: 'tom.fletcher@example.com',
    })

    const { user } = setup()
    await openTom(user)

    expect(await screen.findByRole('link', { name: '+971 50 200 1000' })).toHaveAttribute(
      'href',
      'tel:+971502001000',
    )
    expect(screen.getByRole('link', { name: 'tom.fletcher@example.com' })).toHaveAttribute(
      'href',
      'mailto:tom.fletcher@example.com',
    )
  })

  // The safeguarding case. RLS returns no row for a parent, which is normal,
  // not an error — and the UI must not hint that a hidden row exists.
  it('renders no contact block, and no explanation, when RLS returns no row', async () => {
    getPlayerContactMock.mockResolvedValue(null)

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByRole('heading', { name: 'Craig Muir' })).toBeInTheDocument()
    expect(within(dialog).queryByText(/contact/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/hidden/i)).not.toBeInTheDocument()
    // The Call/Email row lives inside the contact block, so it must go with
    // it — offering to phone a player whose contact row RLS withheld would be
    // the leak this screen exists to prevent.
    expect(within(dialog).queryByRole('link', { name: 'Call' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Email' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/phone/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/email/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows only the fields the contact row actually has', async () => {
    getPlayerContactMock.mockResolvedValue({ player_id: 'p-fullback', phone: null, email: 'a@example.com' })

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByRole('link', { name: 'a@example.com' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Phone')).not.toBeInTheDocument()
  })

  // While the query is in flight the block must render NOTHING. A spinner
  // here drew a box exactly where contact details go and then collapsed on a
  // null row, and Spinner is role="status" in an aria-live region — so a
  // parent heard "Loading contact details…" and then silence.
  it('renders nothing at all while the contact query is in flight', async () => {
    getPlayerContactMock.mockReturnValue(new Promise(() => {}))

    const { user } = setup()
    const dialog = await openTom(user)

    // The rest of the sheet is already on screen...
    expect(within(dialog).getByRole('heading', { name: 'Craig Muir' })).toBeInTheDocument()
    // ...but the contact block announces nothing while it waits.
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/contact/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('offers Call and Email actions for the values that exist', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-fullback',
      phone: '+971 50 200 1000',
      email: 'tom.fletcher@example.com',
    })

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByRole('link', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:+971502001000',
    )
    expect(within(dialog).getByRole('link', { name: 'Email' })).toHaveAttribute(
      'href',
      'mailto:tom.fletcher@example.com',
    )
  })

  it('omits the Call action when there is no phone number', async () => {
    getPlayerContactMock.mockResolvedValue({ player_id: 'p-fullback', phone: null, email: 'a@example.com' })

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByRole('link', { name: 'Email' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Call' })).not.toBeInTheDocument()
  })

  it('reports a failed contact query in an alert', async () => {
    getPlayerContactMock.mockRejectedValue(new Error('Contact lookup failed'))

    const { user } = setup()
    const dialog = await openTom(user)

    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText(/contact lookup failed/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------
// Parents block + the U13 own-contact boundary (3 Aug 2026)
// ---------------------------------------------------------------------

describe('PlayerDetail — parents', () => {
  async function openTom(user) {
    await screen.findByText('Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /Tom Fletcher/ }))
    return screen.getByRole('dialog')
  }

  it('lists each parent with their relationship and contact links', async () => {
    listParentsMock.mockResolvedValue([
      {
        id: 'pp-1',
        player_id: 'p-flanker',
        full_name: 'Sara Fletcher',
        relationship: 'Mother',
        phone: '+971502001000',
        email: 'sara@example.com',
        is_primary: true,
      },
      {
        id: 'pp-2',
        player_id: 'p-flanker',
        full_name: 'Mark Fletcher',
        relationship: 'Father',
        phone: null,
        email: 'mark@example.com',
        is_primary: false,
      },
    ])

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByText('Sara Fletcher')).toBeInTheDocument()
    expect(within(dialog).getByText(/Mother/)).toBeInTheDocument()
    expect(within(dialog).getByText('Mark Fletcher')).toBeInTheDocument()
    // Stored E.164 is displayed in readable international form.
    expect(within(dialog).getByRole('link', { name: '+971 50 200 1000' })).toHaveAttribute(
      'href',
      'tel:+971502001000',
    )
    expect(within(dialog).getByRole('link', { name: 'mark@example.com' })).toHaveAttribute(
      'href',
      'mailto:mark@example.com',
    )
  })

  it('marks the main contact', async () => {
    listParentsMock.mockResolvedValue([
      {
        id: 'pp-1',
        player_id: 'p-flanker',
        full_name: 'Sara Fletcher',
        relationship: 'Mother',
        is_primary: true,
      },
    ])

    const { user } = setup()
    const dialog = await openTom(user)

    expect(await within(dialog).findByText(/main contact/i)).toBeInTheDocument()
  })

  // The safeguarding case, identical in spirit to the contact-row one: an
  // empty result is normal for a parent viewing a team-mate, and the screen
  // must not hint that withheld rows exist.
  it('renders nothing, and no explanation, when RLS returns no parent rows', async () => {
    listParentsMock.mockResolvedValue([])

    const { user } = setup()
    const dialog = await openTom(user)

    await within(dialog).findByRole('heading', { name: 'Tom Fletcher' })
    expect(within(dialog).queryByText(/^parents?$/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/hidden/i)).not.toBeInTheDocument()
  })
})

describe('PlayerDetail — the U13 own-contact boundary', () => {
  it('does not query or show a U12 player’s own contact details', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-flanker',
      phone: '+971502001000',
      email: 'tom@example.com',
    })

    const { user } = setup()
    await screen.findByText('Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /Tom Fletcher/ }))
    const dialog = screen.getByRole('dialog')

    await within(dialog).findByRole('heading', { name: 'Tom Fletcher' })
    // Even with a contact row available, an under-13 gets no player contact
    // block — and the query is never issued.
    expect(getPlayerContactMock).not.toHaveBeenCalled()
    expect(within(dialog).queryByText(/player contact/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('tom@example.com')).not.toBeInTheDocument()
  })

  it('shows a senior player’s own contact details', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-fullback',
      phone: '+971502001000',
      email: 'craig@example.com',
    })

    const { user } = setup()
    await screen.findByText('Craig Muir')
    await user.click(screen.getByRole('button', { name: /Craig Muir/ }))
    const dialog = screen.getByRole('dialog')

    expect(await within(dialog).findByText(/player contact/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'craig@example.com' })).toBeInTheDocument()
  })
})
