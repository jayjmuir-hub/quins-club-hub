import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Picking a team — phase 1 of claude/plans/2026-08-14-match-lineups.md.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9: this repo is public
// and its members are mostly children. The SHAPES are what matter — a squad with
// players in each availability state — and made-up names reproduce those exactly.

const useMembershipsMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const listLineupsMock = vi.fn()
const createLineupMock = vi.fn()
const updateLineupMock = vi.fn()
const saveLineupPlayersMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams: () => ({ eventId: 'e-1' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ getEvent: (...a) => getEventMock(...a) }))
vi.mock('../src/data/players.js', () => ({ listPlayers: (...a) => listPlayersMock(...a) }))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...a) => listAvailabilityMock(...a),
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
  createLineup: (...a) => createLineupMock(...a),
  updateLineup: (...a) => updateLineupMock(...a),
  saveLineupPlayers: (...a) => saveLineupPlayersMock(...a),
  deleteLineup: vi.fn(),
}))
// html2canvas is lazily imported by the share path and never reached here.
vi.mock('../src/lib/shareImage.js', () => ({ shareElementAsImage: vi.fn() }))
// ⚠️ MOCKED TO KEEP THIS FILE HERMETIC, NOT BECAUSE ANYTHING HERE READS A GRADE.
// The eligibility warning made Lineup import playerTiers, and the screen swallows
// that read's failure by design — so without this mock the suite still PASSED
// while making a real Supabase request per test and paying for the timeout. Grades
// themselves are tested in tests/lineup-eligibility.test.jsx.
vi.mock('../src/data/playerTiers.js', () => ({ listPlayerGrades: vi.fn(async () => new Map()), listPlayerPositions: vi.fn(async () => new Map()) }))

import Lineup from '../src/screens/Lineup.jsx'

const TEAM = { id: 't-u16b', club_id: 'c-1', name: 'U16B Contact' }
const EVENT = { id: 'e-1', team_id: TEAM.id, type: 'match', opponent: 'Dubai Exiles', starts_at: '2026-10-10T04:00:00.000Z' }
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]
const PARENT = [{ id: 'm-2', role: 'parent', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]

const PLAYERS = [
  { id: 'p-in', full_name: 'Rory Aldenbrook', team_id: TEAM.id },
  { id: 'p-maybe', full_name: 'Callum Whitstead', team_id: TEAM.id },
  { id: 'p-none', full_name: 'Ewan Marchetti', team_id: TEAM.id },
  { id: 'p-out', full_name: 'Tomas Bergqvist', team_id: TEAM.id },
]

function renderScreen({ memberships = COACH, lineups = [], players = PLAYERS } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [TEAM], loading: false, error: null })
  getEventMock.mockResolvedValue(EVENT)
  listPlayersMock.mockResolvedValue(players)
  listAvailabilityMock.mockResolvedValue([
    { player_id: 'p-in', status: 'in' },
    { player_id: 'p-maybe', status: 'maybe' },
    { player_id: 'p-out', status: 'out' },
    // p-none deliberately has NO row — "no response" is derived, never stored.
  ])
  listLineupsMock.mockResolvedValue(lineups)
  render(<Lineup />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  createLineupMock.mockResolvedValue({ id: 'l-1' })
  saveLineupPlayersMock.mockResolvedValue([])
  updateLineupMock.mockResolvedValue({ id: 'l-1' })
})

describe('the squad pool', () => {
  it('groups by availability, with no-response derived from a missing row', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText(/Available — 1/)).toBeInTheDocument())
    expect(screen.getByText(/Maybe — 1/)).toBeInTheDocument()
    // ⚠️ p-none has no availability row at all. "No response" must be DERIVED by
    // diffing the roster against the rows that exist — the same rule the
    // Availability sheet follows, because the database deliberately stores no
    // row for "nothing happened yet".
    expect(screen.getByText(/No response — 1/)).toBeInTheDocument()
  })

  it('collapses players who said no behind a button, rather than hiding them', async () => {
    // ⚠️ JAY ASKED FOR THIS DIRECTLY: the coach must be able to pick somebody who
    // has not marked themselves available. Hiding them outright would be the app
    // overruling the coach; showing them first would make it the easy accident.
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText(/Available — 1/)).toBeInTheDocument())

    expect(screen.queryByText('Tomas Bergqvist')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show 1 who said no/ }))
    expect(screen.getByText('Tomas Bergqvist')).toBeInTheDocument()
  })
})

describe('junior play-up consent', () => {
  it('a pending guest cannot be started or benched, and the row says Consent pending', async () => {
    renderScreen({
      players: [
        ...PLAYERS,
        {
          id: 'p-playup',
          full_name: 'Harness Playup Alderton',
          team_id: 't-u14',
          guest_of: TEAM.id,
          playup_consent: 'pending',
        },
      ],
    })
    await waitFor(() => expect(screen.getByText('Harness Playup Alderton')).toBeInTheDocument())
    const row = screen.getByText('Harness Playup Alderton').closest('li')
    expect(within(row).queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Bench' })).not.toBeInTheDocument()
    expect(within(row).getByText(/consent pending/i)).toBeInTheDocument()
  })

  it('an approved guest can be started', async () => {
    const user = renderScreen({
      players: [
        ...PLAYERS,
        {
          id: 'p-playup',
          full_name: 'Harness Playup Alderton',
          team_id: 't-u14',
          guest_of: TEAM.id,
          playup_consent: 'approved',
        },
      ],
    })
    await waitFor(() => expect(screen.getByText('Harness Playup Alderton')).toBeInTheDocument())
    const row = screen.getByText('Harness Playup Alderton').closest('li')
    await user.click(within(row).getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('button', { name: 'Remove Harness Playup Alderton' })).toBeInTheDocument()
  })
})

describe('picking', () => {
  it('moves a player out of the pool and into the starting list', async () => {
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())

    const poolRow = screen.getByText('Rory Aldenbrook').closest('li')
    await user.click(within(poolRow).getByRole('button', { name: 'Start' }))

    expect(screen.getByText(/Starting — 1/)).toBeInTheDocument()
    // Gone from the pool: Available is now empty and its heading disappears.
    expect(screen.queryByText(/Available — 1/)).not.toBeInTheDocument()
  })

  it('flags a picked player who did NOT say they were available', async () => {
    // ⚠️ THE WARNING IS ON THE PICKED ROW, not only in the pool. Once somebody is
    // in the team the pool has scrolled away, and "did I pick anyone who said
    // no?" is exactly the question asked at the end.
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText(/Available — 1/)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Show 1 who said no/ }))

    const poolRow = screen.getByText('Tomas Bergqvist').closest('li')
    await user.click(within(poolRow).getByRole('button', { name: 'Start' }))

    // ⚠️ FOUND BY ITS REMOVE BUTTON, NOT BY THE NAME. Once a player is picked
    // the name appears TWICE in the document — once in the picked list and once
    // in the off-screen card that html2canvas photographs — so `getByText` finds
    // two and throws. That duplication is correct and load-bearing (the card IS
    // the shared image), so the test has to be specific rather than the screen
    // being changed. The aria-label is unique per player and is already there
    // for screen-reader users.
    const pickedRow = screen
      .getByRole('button', { name: 'Remove Tomas Bergqvist' })
      .closest('li')
    expect(within(pickedRow).getByText('Said no')).toBeInTheDocument()
  })

  it('moves a starter to the bench and back', async () => {
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())
    await user.click(
      within(screen.getByText('Rory Aldenbrook').closest('li')).getByRole('button', { name: 'Start' }),
    )
    await user.click(screen.getByRole('button', { name: '→ Bench' }))
    expect(screen.getByText(/Replacements — 1/)).toBeInTheDocument()
    expect(screen.getByText(/Starting — 0/)).toBeInTheDocument()
  })
})

describe('players per side', () => {
  it('counts against the chosen size and warns when over, without blocking', async () => {
    // ⚠️ A GUIDE, NOT A GATE (see the migration's comment). Coaches over-pick and
    // then cut; a form that refuses the extra player gets worked around.
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText(/Players per side/i), '7')
    expect(screen.getByText(/Starting — 0 of 7/)).toBeInTheDocument()

    // Pick two against a side of 1 to prove the warning appears and the pick
    // still lands.
    await user.selectOptions(screen.getByLabelText(/Players per side/i), '7')
    for (const name of ['Rory Aldenbrook', 'Callum Whitstead']) {
      await user.click(
        within(screen.getByText(name).closest('li')).getByRole('button', { name: 'Start' }),
      )
    }
    expect(screen.getByText(/Starting — 2 of 7/)).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('does NOT create a lineup row merely because the screen was opened', async () => {
    // ⚠️ THE POINT: creating on mount would write a lineup for every fixture a
    // coach merely looked at, and "has anyone picked a team?" would stop being
    // an answerable question.
    renderScreen()
    await waitFor(() => expect(screen.getByText(/Available — 1/)).toBeInTheDocument())
    expect(createLineupMock).not.toHaveBeenCalled()
  })

  it('creates on first save, then updates on the next', async () => {
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())
    await user.click(
      within(screen.getByText('Rory Aldenbrook').closest('li')).getByRole('button', { name: 'Start' }),
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createLineupMock).toHaveBeenCalledTimes(1))
    expect(saveLineupPlayersMock).toHaveBeenCalledWith('l-1', [
      expect.objectContaining({ player_id: 'p-in', role: 'starter', sort_order: 0 }),
    ])

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateLineupMock).toHaveBeenCalledTimes(1))
    // Still only ever created once.
    expect(createLineupMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a refused save rather than claiming success', async () => {
    // RLS refuses by matching zero rows, which PostgREST reports as SUCCESS. The
    // data layer turns that into a throw; this screen must show it.
    saveLineupPlayersMock.mockRejectedValue(new Error('It may now be empty.'))
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())
    await user.click(
      within(screen.getByText('Rory Aldenbrook').closest('li')).getByRole('button', { name: 'Start' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/may now be empty/i)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('who may pick', () => {
  it('refuses somebody who cannot edit the squad', async () => {
    // Defensive only — `lineup manage` RLS is the real boundary — but the route
    // is linkable and somebody will paste the URL.
    renderScreen({ memberships: PARENT })
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't pick the team/i)
  })
})

describe('an existing lineup', () => {
  it('loads its players back in their saved order', async () => {
    renderScreen({
      lineups: [
        {
          id: 'l-9',
          players_per_side: 10,
          notes: 'Meet at the gate.',
          lineup_players: [
            { id: 'lp-2', player_id: 'p-maybe', role: 'replacement', position: null, sort_order: 1 },
            { id: 'lp-1', player_id: 'p-in', role: 'starter', position: null, sort_order: 0 },
          ],
        },
      ],
    })
    await waitFor(() => expect(screen.getByText(/Starting — 1 of 10/)).toBeInTheDocument())
    expect(screen.getByText(/Replacements — 1/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Meet at the gate.')).toBeInTheDocument()
  })
})

describe('the "still to pick" list', () => {
  it('says everyone is picked rather than leaving an empty card', async () => {
    // ⚠️ REPORTED BY JAY, 14 Aug 2026, from the live app: he picked all four
    // U16B players and asked what the empty section was. A heading over an empty
    // card reads as broken — and the heading itself said "Squad", which sounds
    // like the whole roster rather than "the ones you have not picked".
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Show 1 who said no/ }))

    for (const name of ['Rory Aldenbrook', 'Callum Whitstead', 'Ewan Marchetti', 'Tomas Bergqvist']) {
      await user.click(
        within(screen.getByText(name).closest('li')).getByRole('button', { name: 'Start' }),
      )
    }

    expect(screen.getByText(/Everyone in this squad is in the team/)).toBeInTheDocument()
    expect(screen.getByText(/Still to pick/)).toBeInTheDocument()
  })

  it('distinguishes an EMPTY SQUAD from everyone being picked', async () => {
    // ⚠️ TWO DIFFERENT EMPTINESSES. "Everyone is picked" is success; "no players
    // in this squad" is a roster gap for an admin. Saying the first when the
    // second is true sends somebody hunting a bug that is really missing data.
    listPlayersMock.mockResolvedValue([])
    useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [TEAM], loading: false, error: null })
    getEventMock.mockResolvedValue(EVENT)
    listAvailabilityMock.mockResolvedValue([])
    listLineupsMock.mockResolvedValue([])
    render(<Lineup />)

    expect(await screen.findByText(/no players in U16B Contact yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/Everyone in this squad/)).not.toBeInTheDocument()
  })
})

describe('total in the squad', () => {
  it('counts every picked player against the total, and warns when over', async () => {
    // Jay, 14 Aug 2026: "need an option below players per side to select total
    // number in squad".
    // ⚠️ COUNTS ALL PICKED, NOT THE BENCH. The number means starters PLUS
    // replacements, so counting only replacements against it would be wrong in
    // exactly the case a coach checks it.
    // ⚠️ AND IT NEVER BLOCKS — same guide-not-gate rule as players-per-side.
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())

    await user.clear(screen.getByLabelText(/Total in the squad/i))
    await user.type(screen.getByLabelText(/Total in the squad/i), '1')

    await user.click(
      within(screen.getByText('Rory Aldenbrook').closest('li')).getByRole('button', { name: 'Start' }),
    )
    expect(screen.getByText(/1 of 1 in the squad/)).toBeInTheDocument()

    // The second pick is allowed, and reported as over.
    await user.click(
      within(screen.getByText('Callum Whitstead').closest('li')).getByRole('button', { name: 'Bench' }),
    )
    expect(screen.getByText(/2 of 1 in the squad — 1 over/)).toBeInTheDocument()
    expect(screen.getByText(/Replacements — 1/)).toBeInTheDocument()
  })

  it('saves the total alongside players per side', async () => {
    const user = renderScreen()
    await waitFor(() => expect(screen.getByText('Rory Aldenbrook')).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/Players per side/i), '15')
    await user.clear(screen.getByLabelText(/Total in the squad/i))
    await user.type(screen.getByLabelText(/Total in the squad/i), '22')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createLineupMock).toHaveBeenCalled())
    expect(createLineupMock).toHaveBeenCalledWith(
      expect.objectContaining({ playersPerSide: 15, squadSize: 22 }),
    )
  })
})
