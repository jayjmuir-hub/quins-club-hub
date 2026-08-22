import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The coach's view of the desktop roster — Jay, 14 Aug 2026, looking at U16B:
// "i added multiple position and a tier grade for Tyler, but none of that is
// visible in the roster overview, despite this being a single gender age group
// i still see male/female in multiple places which is pointless, i also see the
// age group column which is also pointless in this view".
//
// Four separate complaints and they are tested separately below, because three
// of them are about what is ABSENT and an absence is the easiest thing in a UI
// to break by accident later.
//
// ⚠️ NAMES INVENTED THROUGHOUT. CLAUDE.md rule 9 — this repo is public and the
// club's members are children. The shapes are real; the people are not.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listPlayerGradesMock = vi.fn()
const listPlayerPositionsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: vi.fn().mockResolvedValue(null),
  signPhotoUrls: vi.fn(async () => ({})),
}))

vi.mock('../src/data/players.js', () => ({
  // ⚠️ The roster reads birthdays for staff since 17 Aug 2026 to show an age.
  // An omitted export is undefined and throws from inside an effect.
  listPlayerPrivate: () => Promise.resolve([]),
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerContact: vi.fn().mockResolvedValue(null),
  upsertPlayer: vi.fn(async (p) => ({ ...p })),
}))

vi.mock('../src/data/playerTiers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listPlayerGrades: (...a) => listPlayerGradesMock(...a),
  listPlayerPositions: (...a) => listPlayerPositionsMock(...a),
}))

import Roster from '../src/screens/Roster.jsx'

const U16B = { id: 'team-u16b', name: 'U16B Contact', sort_order: 3 }
const U14A = { id: 'team-u14a', name: 'U14A Contact', sort_order: 2 }

const COACH = [{ id: 'm1', role: 'coach', team_id: 'team-u16b' }]
const PARENT = [{ id: 'm2', role: 'parent', team_id: 'team-u16b' }]

// One squad, one gender recorded on all of them — Jay's case exactly.
const SQUAD = [
  { id: 'p1', team_id: 'team-u16b', full_name: 'Tyrone Bexley', position: 'Prop', unit: 'forward', gender: 'male', is_captain: true },
  { id: 'p2', team_id: 'team-u16b', full_name: 'Ade Kwarteng', position: 'Wing', unit: 'back', gender: 'male', is_captain: false },
  { id: 'p3', team_id: 'team-u16b', full_name: 'Milo Ravensworth', position: 'Lock', unit: 'forward', gender: 'male', is_captain: false },
  { id: 'p4', team_id: 'team-u16b', full_name: 'Sefton Idowu', position: null, unit: null, gender: 'male', is_captain: false },
]

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

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop(true)
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [U16B] })
  listPlayersMock.mockResolvedValue(SQUAD)
  listPlayerGradesMock.mockResolvedValue(new Map([
    ['p1', { player_id: 'p1', tier: 'A', note: null }],
    ['p2', { player_id: 'p2', tier: 'A', note: null }],
    ['p3', { player_id: 'p3', tier: 'B', note: null }],
  ]))
  listPlayerPositionsMock.mockResolvedValue(new Map([
    ['p1', ['Prop', 'Hooker']],
  ]))
})

const header = (name) => screen.queryByRole('columnheader', { name })

describe('columns that repeat themselves are dropped', () => {
  it('hides Gender when every player on screen has the same one', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(header(/gender/i)).not.toBeInTheDocument()
  })

  it('hides Age group when the roster is showing one squad', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(header(/age group/i)).not.toBeInTheDocument()
  })

  it('⚠️ KEEPS Gender the moment one player differs', async () => {
    // The rule is "constant", not "single-gender squad". A mixed squad — or one
    // player whose gender nobody has answered for — has to keep the column, and
    // that is the case the coach most needs to see.
    listPlayersMock.mockResolvedValue([...SQUAD.slice(0, 3), { ...SQUAD[3], gender: null }])
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(header(/gender/i)).toBeInTheDocument()
  })

  it('keeps Age group when more than one squad is in view', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'admin', status: 'active', team_id: null }],
      teams: [U14A, U16B],
    })
    listPlayersMock.mockResolvedValue([
      ...SQUAD,
      { id: 'p9', team_id: 'team-u14a', full_name: 'Ozzy Marchetti', position: 'Centre', unit: 'back', gender: 'male', is_captain: false },
    ])
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(header(/age group/i)).toBeInTheDocument()
  })
})

describe('tier and the other positions become visible', () => {
  it('shows a Tier column with each graded player’s letter', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(header('Tier')).toBeInTheDocument()

    const row = (await screen.findByText('Tyrone Bexley')).closest('tr')
    await waitFor(() => expect(within(row).getByText('A')).toBeInTheDocument())
  })

  it('⚠️ shows a player’s OTHER positions, not a duplicate of the primary', async () => {
    // p1 is Prop (the primary, in the inline select) and also Hooker. Repeating
    // "Prop" as a chip directly under a select already reading Prop is noise.
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    // ⚠️ BY TESTID, NOT BY TEXT. The inline position editor is a <select> whose
    // options list every position, so a by-text query for "Hooker" matches the
    // chip AND an off-screen option in the same row.
    const row = (await screen.findByText('Tyrone Bexley')).closest('tr')
    await waitFor(() =>
      expect(within(row).getAllByTestId('other-position').map((c) => c.textContent))
        .toEqual(['Hooker']))
  })

  it('⚠️ never asks for grades as a parent, and shows no Tier column', async () => {
    // RLS refuses player_grades to a parent, but a refused request is still a
    // request. The screen does not make it, and the column does not exist in
    // their DOM to be inspected.
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [U16B] })
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    expect(listPlayerGradesMock).not.toHaveBeenCalled()
    expect(header('Tier')).not.toBeInTheDocument()
  })
})

describe('grouping by tier, then forwards and backs', () => {
  it('⚠️ IS ON BY DEFAULT for a coach — Jay, 15 Aug 2026', async () => {
    // "i want it to land default on Tier, then forwards and backs view instead
    // of nothing view". It shipped defaulting to 'none' and that was reversed on
    // his instruction; this test is the thing that stops it drifting back.
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.getByLabelText('Group by')).toHaveValue('tier')
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /tier a/i })).toBeInTheDocument())
  })

  it('can still be turned off', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /tier a/i })).toBeInTheDocument())

    await userEvent.selectOptions(screen.getByLabelText('Group by'), 'none')
    expect(screen.queryByRole('columnheader', { name: /tier a/i })).not.toBeInTheDocument()
  })

  it('nests forwards and backs under each tier heading', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    // ⚠️ Wait for the grades to land first: grouping by tier before they arrive
    // groups by what is known then, which is nothing.
    await screen.findByRole('columnheader', { name: 'Tier' })
    await waitFor(() => expect(screen.getAllByText('A').length).toBeGreaterThan(0))
    await userEvent.selectOptions(screen.getByLabelText('Group by'), 'tier')

    // colgroup headings, not column headings — one spans the table per group.
    const headings = screen
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
      // ⚠️ `Tier A`, not `Tier` — the plain "Tier" column header would otherwise
      // match this filter and come first.
      .filter((text) => /Tier [ABC]|Not graded|Forwards|Backs/.test(text))

    expect(headings[0]).toContain('Tier A')
    expect(headings.slice(1, 3)).toEqual(['Forwards', 'Backs'])
    expect(headings.some((text) => text.includes('Not graded'))).toBe(true)
  })

  it('⚠️ shows the ungraded player rather than dropping them', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await userEvent.selectOptions(screen.getByLabelText('Group by'), 'tier')

    // p4 has no grade at all. The point of grading is partly to notice who has
    // not been graded, so they must still be on screen.
    expect(screen.getByText('Sefton Idowu')).toBeInTheDocument()
  })

  it('offers no grouping control to a parent', async () => {
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [U16B] })
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.queryByLabelText('Group by')).not.toBeInTheDocument()
  })

  it('⚠️ NEVER GROUPS A PARENT’S ROSTER, however the default is set', async () => {
    // The regression the default-on change would otherwise have caused: a parent
    // has no grades, so grouping by tier would put ONE heading reading "Not
    // graded" over every child on the roster — a statement about the club's
    // record-keeping, made to the one audience who cannot act on it.
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [U16B] })
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const headings = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headings.some((text) => /Not graded|Tier [ABC]/.test(text))).toBe(false)
    // ...and every player is still on screen.
    expect(screen.getAllByTestId('table-player-name')).toHaveLength(4)
  })
})

describe('the gender gap nudges, and the nudge is clickable', () => {
  beforeEach(() => {
    listPlayersMock.mockResolvedValue([...SQUAD.slice(0, 3), { ...SQUAD[3], gender: null }])
  })

  it('says how many players have no gender recorded', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /1 player has no gender recorded/i }))
      .toBeInTheDocument()
  })

  it('⚠️ CLICKING IT SHOWS EXACTLY THOSE PLAYERS — Jay’s explicit ask', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    const nudge = await screen.findByRole('button', { name: /no gender recorded/i })
    await userEvent.click(nudge)

    const shown = screen.getAllByTestId('table-player-name').map((n) => n.textContent)
    expect(shown).toEqual(['Sefton Idowu'])
  })

  it('can be cleared again', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /no gender recorded/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getAllByTestId('table-player-name')).toHaveLength(4)
  })

  it('stays quiet when every player has a gender', async () => {
    listPlayersMock.mockResolvedValue(SQUAD)
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.queryByRole('button', { name: /no gender recorded/i })).not.toBeInTheDocument()
  })
})
