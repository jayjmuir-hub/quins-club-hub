import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// U10 AND BELOW, ON THE ROSTER AND THE PLAYER FORM — 15 Aug 2026.
//
// Grades and forwards/backs are the machinery of picking a competitive team,
// and these squads do not have one to pick: no league below U11 (confirmed by
// the club's youth section), and tag rugby has no positions to sort anybody
// into. A U8 roster grouped "by tier" put one heading reading "Not graded" over
// every child in it.
//
// ⚠️ EVERY TEST IS PAIRED WITH A U14 CONTROL, for the reason spelled out at the
// top of tests/minis-fixtures.test.jsx: a suite that only asserts absence
// cannot tell "hidden for the minis" from "deleted for everybody".
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
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerContact: vi.fn().mockResolvedValue(null),
  upsertPlayer: vi.fn(async (p) => ({ ...p })),
  upsertContact: vi.fn(async (c) => ({ ...c })),
  deletePlayer: vi.fn(async () => {}),
}))
vi.mock('../src/data/parents.js', () => ({
  listParentsFor: vi.fn(async () => []),
  savePlayerParents: vi.fn(async () => []),
}))
vi.mock('../src/data/playerTiers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listPlayerGrades: (...a) => listPlayerGradesMock(...a),
  listPlayerPositions: (...a) => listPlayerPositionsMock(...a),
  savePlayerPositions: vi.fn(async () => []),
  setPlayerGrade: vi.fn(async () => null),
}))

import Roster from '../src/screens/Roster.jsx'
import PlayerForm from '../src/screens/PlayerForm.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U8 = { id: 't-u8', club_id: CLUB, name: 'U8 Tag', sort_order: 3 }
const U10 = { id: 't-u10', club_id: CLUB, name: 'U10 Mixed Contact', sort_order: 5 }
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }

const coachOf = (team) => [{ id: 'm-c', role: 'coach', status: 'active', team_id: team.id }]
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null, club_id: CLUB }]

const squadOf = (team) => [
  { id: `${team.id}-1`, team_id: team.id, full_name: 'Ade Kwarteng', position: 'Prop', unit: 'forward' },
  { id: `${team.id}-2`, team_id: team.id, full_name: 'Milo Ravensworth', position: null, unit: null },
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
  listPlayerGradesMock.mockResolvedValue(new Map())
  listPlayerPositionsMock.mockResolvedValue(new Map())
  try {
    window.localStorage.clear()
  } catch {
    // The team filter persists to localStorage and a stale one would decide
    // which squad the next test is looking at. Same swallow the screen uses.
  }
})

function mountRoster(team, memberships = coachOf(team)) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams: [team],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  listPlayersMock.mockResolvedValue(squadOf(team))
  render(<Roster />)
  return userEvent.setup()
}

// ════════════════════════════════════════════════════════════════════════════
describe('Roster — grouping a minis squad', () => {
  const groupBy = () => screen.getByRole('combobox', { name: /group by/i })

  it('⚠️ offers no Tier and no forwards/backs grouping for a U8 squad', async () => {
    mountRoster(U8)
    await screen.findByText('Ade Kwarteng')

    const options = [...groupBy().options].map((option) => option.textContent)
    expect(options).toEqual(['Nothing', 'Age group'])
  })

  it('⚠️ DOES offer both for U14 — the control', async () => {
    mountRoster(U14B)
    await screen.findByText('Ade Kwarteng')

    const options = [...groupBy().options].map((option) => option.textContent)
    expect(options).toContain('Tier, then forwards and backs')
    expect(options).toContain('Forwards and backs')
  })

  it('⚠️ a remembered Tier choice reads as "Nothing", not as a blank box', async () => {
    // groupBy defaults to TIER and the state survives a squad change, so
    // without the reconciliation in Roster.jsx the select would hold a value
    // with no matching option — which a browser renders as an empty control.
    mountRoster(U8)
    await screen.findByText('Ade Kwarteng')

    expect(groupBy().value).toBe('none')
    expect(screen.queryByTestId('group-label')).not.toBeInTheDocument()
  })

  it('⚠️ shows no Tier column on a minis roster — two columns of dashes', async () => {
    mountRoster(U8)
    await screen.findByText('Ade Kwarteng')
    expect(screen.queryByRole('columnheader', { name: /tier/i })).not.toBeInTheDocument()
  })

  it('⚠️ DOES show the Tier column on U14 — the control', async () => {
    mountRoster(U14B)
    await screen.findByText('Ade Kwarteng')
    expect(screen.getByRole('columnheader', { name: /tier/i })).toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('PlayerForm — a minis player', () => {
  function open(teams, player = null) {
    useMembershipsMock.mockReturnValue({
      memberships: ADMIN,
      teams,
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    render(<PlayerForm player={player} onClose={vi.fn()} onSaved={vi.fn()} />)
    return userEvent.setup()
  }

  it('⚠️ has no grade, no forward-or-back and no positions at U8', () => {
    open([U8])

    expect(screen.queryByLabelText(/^tier$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/forward or back/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/positions they can play/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^position$/i)).not.toBeInTheDocument()
    // The fields that are NOT about picking a competitive team stay put.
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/age group/i)).toBeInTheDocument()
  })

  it('⚠️ HAS all four at U14 — the control', () => {
    open([U14B])

    expect(screen.getByLabelText(/^tier$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/forward or back/i)).toBeInTheDocument()
    expect(screen.getByText(/positions they can play/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^position$/i)).toBeInTheDocument()
  })

  it('⚠️ MOVES WITH THE AGE GROUP DROPDOWN, in the same sitting', async () => {
    // Keyed on the SELECTED squad, exactly like the U13 own-contact rule six
    // lines above it in the source. A coach moving a child up to U14 must get
    // the grade field there and then, not after a save and a reopen.
    const user = open([U8, U14B])
    expect(screen.queryByLabelText(/^tier$/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/age group/i), U14B.id)
    expect(screen.getByLabelText(/^tier$/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/age group/i), U8.id)
    expect(screen.queryByLabelText(/^tier$/i)).not.toBeInTheDocument()
  })

  it('⚠️ U10 is minis and U11 is not — the boundary, on the screen', async () => {
    const U11 = { id: 't-u11', club_id: CLUB, name: 'U11 Mixed Contact', sort_order: 6 }
    const user = open([U10, U11])
    expect(screen.queryByLabelText(/^tier$/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/age group/i), U11.id)
    expect(screen.getByLabelText(/^tier$/i)).toBeInTheDocument()
  })
})
