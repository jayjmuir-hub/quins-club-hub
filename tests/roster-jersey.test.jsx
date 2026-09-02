import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Senior squads 2a, task 5 — the roster shows, sorts, searches and edits
// jersey numbers where a squad uses them, and marks a guest row for staff.
// Scaffolded from tests/roster.test.jsx: same mock shape, same helpers,
// narrowed to the jersey/guest behaviour that file does not cover (its own
// fixtures deliberately carry no jersey_num — the club-wide "no numbers"
// case already lives there).
//
// ⚠️ NAMES INVENTED. CLAUDE.md rule 9 — this repo is public and the club's
// members are mostly children.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listPlayerPrivateMock = vi.fn(() => Promise.resolve([]))
const getPlayerDobMock = vi.fn(() => Promise.resolve(null))
const getPlayerContactMock = vi.fn(() => Promise.resolve(null))
const listParentsMock = vi.fn(() => Promise.resolve([]))
const upsertPlayerMock = vi.fn(async (p) => ({ ...p }))
const setPlayerJerseyNumberMock = vi.fn()

vi.mock('../src/data/parents.js', () => ({
  listParents: (...args) => listParentsMock(...args),
}))

vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: () => Promise.resolve(null),
  signPhotoUrls: () => Promise.resolve({}),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  getPlayerDob: (...args) => getPlayerDobMock(...args),
  getPlayerContact: (...args) => getPlayerContactMock(...args),
  listPlayerPrivate: (...args) => listPlayerPrivateMock(...args),
  upsertPlayer: (...args) => upsertPlayerMock(...args),
  setPlayerJerseyNumber: (...args) => setPlayerJerseyNumberMock(...args),
}))

vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: vi.fn(async () => new Map()),
  listPlayerUnits: vi.fn(async () => new Map()),
  savePlayerPositions: vi.fn(async () => []),
  listPlayerPositions: vi.fn(async () => new Map()),
}))

import Roster from '../src/screens/Roster.jsx'

// The senior squad USES jersey numbers; U18B does not. Both carry
// sort_order so visibleTeams' ordering is stable and unrelated to this test.
const TEAM_1XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 1, uses_jersey_numbers: true }
const TEAM_U18B = { id: 'team-u18b', name: 'U18B', sort_order: 2, uses_jersey_numbers: false }

const COACH_1XV = [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-1xv' }]
const COACH_U18B = [{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u18b' }]
// A parent with children in BOTH squads — needed for the guest-mark CONTROL:
// visibleTeams() scopes a parent to the squads their OWN memberships name,
// and the mobile list's team grouping then drops any player whose team_id
// isn't among those squads (src/screens/Roster.jsx's `groups`). A one-squad
// parent would never see the U18B guest at all, which would make the
// control pass for the wrong reason — it has to actually see the row and
// still not see the mark.
const PARENT_BOTH_SQUADS = [
  { id: 'm3', role: 'parent', team_id: 'team-1xv', player_id: 'p-nine' },
  { id: 'm3b', role: 'parent', team_id: 'team-u18b', player_id: 'p-other' },
]
// ⚠️ ADMIN, FOR THE GUEST-MARK TESTS SPECIFICALLY — visibleTeams() scopes a
// coach to the squads their OWN memberships name (src/lib/scope.js), so a
// coach of only team-1xv never has U18B in `teamsById` and the mark would
// read "from No age group" regardless of whether the guest logic is right.
// An admin sees every team passed in, which is what actually exercises
// `teamsById.get(player.team_id)?.name` resolving to a real squad name.
const ADMIN = [{ id: 'm-admin', role: 'admin', status: 'active', admin_rights: ['clubadmin'], team_id: null }]

// jersey_num 9 — the numbered row.
const NUMBERED = {
  id: 'p-nine',
  team_id: 'team-1xv',
  full_name: 'Ben Okafor',
  position: 'Prop',
  jersey_num: 9,
  is_captain: false,
}
// CONTROL: same squad, no number — must still show initials.
const UNNUMBERED = {
  id: 'p-none',
  team_id: 'team-1xv',
  full_name: 'Ali Hassan',
  position: 'Fly-half',
  jersey_num: null,
  is_captain: false,
}
// A guest of the 1st XV, whose HOME squad is U18B — team_id stays the home
// squad; guest_of names the squad they're being shown as a guest in
// (src/data/players.js).
const GUEST = {
  id: 'p-guest',
  team_id: 'team-u18b',
  full_name: 'Sami Rahman',
  position: 'Wing',
  jersey_num: 5,
  guest_of: 'team-1xv',
  is_captain: false,
}

function setDesktop(isDesktop = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
}

function memberships(rows, teams) {
  return { memberships: rows, teams, loading: false, error: null, reload: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  setPlayerJerseyNumberMock.mockResolvedValue({ id: 'p1', team_id: 'team-1xv' })
  upsertPlayerMock.mockImplementation(async (p) => ({ ...p }))
})

const rows = () => screen.getAllByTestId('roster-table-row')
const names = () => screen.getAllByTestId('table-player-name').map((n) => n.textContent)

// ═══════════════════════════════════════════════════════════════════════
//  MOBILE TILE — the number replaces the initials when the squad uses them
// ═══════════════════════════════════════════════════════════════════════
describe('Roster — mobile tile', () => {
  beforeEach(() => {
    setDesktop(false)
    useMembershipsMock.mockReturnValue(memberships(COACH_1XV, [TEAM_1XV]))
    listPlayersMock.mockResolvedValue([NUMBERED, UNNUMBERED])
  })

  it('shows the number on a numbered player’s tile, not their initials', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)

    const row = (await screen.findByText('Ben Okafor')).closest('[data-testid="player-row"]')
    expect(within(row).getByText('9')).toBeInTheDocument()
    expect(within(row).queryByText('BO')).not.toBeInTheDocument()
  })

  // CONTROL: same jersey-using squad, but this player has no number — the
  // fallback still has to be the initials, not a blank tile.
  it('CONTROL: still shows initials for a player with no number', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)

    const row = (await screen.findByText('Ali Hassan')).closest('[data-testid="player-row"]')
    expect(within(row).getByText('AH')).toBeInTheDocument()
  })

  // CONTROL: the flag gates everything — a squad that does NOT use numbers
  // renders initials even for a player who happens to carry one.
  it('CONTROL: a non-jersey squad shows initials even for a numbered player', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_U18B, [TEAM_U18B]))
    listPlayersMock.mockResolvedValue([{ ...NUMBERED, id: 'p-nine-u18b', team_id: 'team-u18b' }])

    render(<MemoryRouter><Roster /></MemoryRouter>)

    const row = (await screen.findByText('Ben Okafor')).closest('[data-testid="player-row"]')
    expect(within(row).getByText('BO')).toBeInTheDocument()
    expect(within(row).queryByText('9')).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════
//  SEARCH — the number is a searchable field, gated by the flag
// ═══════════════════════════════════════════════════════════════════════
describe('Roster — search by number', () => {
  beforeEach(() => {
    setDesktop(false)
    useMembershipsMock.mockReturnValue(memberships(COACH_1XV, [TEAM_1XV]))
    listPlayersMock.mockResolvedValue([NUMBERED, UNNUMBERED])
  })

  it('"9" keeps the numbered row and drops the rest', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByText('Ben Okafor')

    await user.type(screen.getByRole('searchbox'), '9')

    expect(screen.getByText('Ben Okafor')).toBeInTheDocument()
    expect(screen.queryByText('Ali Hassan')).not.toBeInTheDocument()
  })

  // CONTROL: same query, same players, but the squad does not use numbers —
  // "9" must match nothing, proving the number is not always in the
  // haystack.
  it('CONTROL: "9" matches nothing on a squad that does not use numbers', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_U18B, [TEAM_U18B]))
    listPlayersMock.mockResolvedValue([
      { ...NUMBERED, id: 'p-nine-u18b', team_id: 'team-u18b' },
      { ...UNNUMBERED, id: 'p-none-u18b', team_id: 'team-u18b' },
    ])
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByText('Ben Okafor')

    await user.type(screen.getByRole('searchbox'), '9')

    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════
//  THE COACH'S GROUPED VIEW — numbered players sort first, ascending
// ═══════════════════════════════════════════════════════════════════════
describe('RosterTable — sorted by jersey number when the squad uses them', () => {
  beforeEach(() => {
    setDesktop(true)
    useMembershipsMock.mockReturnValue(memberships(COACH_1XV, [TEAM_1XV]))
  })

  it('numbered players come first, ascending, ahead of the unnumbered', async () => {
    const LOW = { ...NUMBERED, id: 'p-low', full_name: 'Zaid Noor', jersey_num: 3 }
    listPlayersMock.mockResolvedValue([NUMBERED, UNNUMBERED, LOW])

    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    // Turn grouping off so the order is asserted end-to-end, the same move
    // tests/rosterTable.test.jsx makes for its own sort assertions.
    await user.selectOptions(screen.getByLabelText('Group by'), 'none')

    expect(names()).toEqual(['Zaid Noor', 'Ben Okafor', 'Ali Hassan'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
//  GUEST MARK — staff only
// ═══════════════════════════════════════════════════════════════════════
describe('Roster — guest mark', () => {
  it('shows "from U18B" to a coach, on the mobile row', async () => {
    setDesktop(false)
    useMembershipsMock.mockReturnValue(memberships(ADMIN, [TEAM_1XV, TEAM_U18B]))
    listPlayersMock.mockResolvedValue([GUEST])

    render(<MemoryRouter><Roster /></MemoryRouter>)

    const row = (await screen.findByText('Sami Rahman')).closest('[data-testid="player-row"]')
    expect(within(row).getByText(/from U18B/)).toBeInTheDocument()
  })

  it('shows "from U18B" to a coach, on the desktop table', async () => {
    setDesktop(true)
    useMembershipsMock.mockReturnValue(memberships(ADMIN, [TEAM_1XV, TEAM_U18B]))
    listPlayersMock.mockResolvedValue([GUEST])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const row = rows().find((r) => within(r).queryByText('Sami Rahman'))
    expect(within(row).getByText(/from U18B/)).toBeInTheDocument()
  })

  // CONTROL: a parent must never see the mark, whatever the row's guest_of.
  it('CONTROL: a parent never sees the mark', async () => {
    setDesktop(false)
    useMembershipsMock.mockReturnValue(memberships(PARENT_BOTH_SQUADS, [TEAM_1XV, TEAM_U18B]))
    listPlayersMock.mockResolvedValue([GUEST])

    render(<MemoryRouter><Roster /></MemoryRouter>)

    const row = (await screen.findByText('Sami Rahman')).closest('[data-testid="player-row"]')
    expect(within(row).queryByText(/from U18B/)).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════
//  INLINE EDIT — the "No." column, staff only
// ═══════════════════════════════════════════════════════════════════════
describe('RosterTable — inline jersey number edit', () => {
  beforeEach(() => {
    setDesktop(true)
    useMembershipsMock.mockReturnValue(memberships(COACH_1XV, [TEAM_1XV]))
    listPlayersMock.mockResolvedValue([NUMBERED, UNNUMBERED])
  })

  it('typing 10 and blurring calls setPlayerJerseyNumber with the id and the number', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const input = screen.getByLabelText('Jersey number for Ali Hassan')
    await user.clear(input)
    await user.type(input, '10')
    await user.tab()

    await waitFor(() =>
      expect(setPlayerJerseyNumberMock).toHaveBeenCalledWith('p-none', 10))
  })

  it('a clash refusal shows the sentence in the row', async () => {
    setPlayerJerseyNumberMock.mockRejectedValue(
      new Error('Number 9 is already worn by Ben Okafor in this squad. Clear theirs first, or pick another.'),
    )
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const input = screen.getByLabelText('Jersey number for Ali Hassan')
    await user.clear(input)
    await user.type(input, '9')
    await user.tab()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already worn by Ben Okafor/)
  })

  // The parser refuses out-of-range/garbage input BEFORE any request.
  it('refuses an invalid number before calling setPlayerJerseyNumber', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const input = screen.getByLabelText('Jersey number for Ali Hassan')
    await user.clear(input)
    await user.type(input, '100')
    await user.tab()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/1 to 99, or blank to clear it/)
    expect(setPlayerJerseyNumberMock).not.toHaveBeenCalled()
  })

  // CONTROL: the "No." column, and its input, do not exist at all on a squad
  // that does not use jersey numbers.
  it('CONTROL: no "No." column on a squad that does not use numbers', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH_U18B, [TEAM_U18B]))
    listPlayersMock.mockResolvedValue([
      { ...NUMBERED, id: 'p-nine-u18b', team_id: 'team-u18b' },
    ])
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    expect(screen.queryByLabelText(/Jersey number for/)).not.toBeInTheDocument()
  })
})
