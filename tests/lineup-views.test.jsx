import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The three views over one lineup —
// claude/plans/2026-08-25-roster-builder-three-views.md. Quick view's contract
// lives in tests/lineup.test.jsx and tests/lineup-eligibility.test.jsx and is
// deliberately untouched; this file covers what 25 Aug added: the toggle, the
// slots, the pitch, and the slot-shaped save.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9: this repo is public
// and its members are mostly children.
//
// ⚠️ DRAG IS TESTED AT THE MATHS (tests/drag-reorder.test.js), NOT HERE. jsdom
// has no layout, so getBoundingClientRect is all zeros and a synthetic pointer
// sequence would "pass" without measuring anything — the same blindness the
// tier-warning layout guard documents. What this file CAN honestly assert is
// structural: the handle exists, and only on filled rows.

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
vi.mock('../src/lib/shareImage.js', () => ({ shareElementAsImage: vi.fn() }))
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: vi.fn(async () => new Map()),
  // #419 (positions staff-only) made Lineup decorate players from this map;
  // without it in the mock the load effect throws and the whole screen shows
  // the error card — every query below then fails with "unable to find".
  listPlayerPositions: vi.fn(async () => new Map()),
}))

import Lineup from '../src/screens/Lineup.jsx'

const TEAM = { id: 't-u10', club_id: 'c-1', name: 'U10 Storm' }
const EVENT = { id: 'e-1', team_id: TEAM.id, type: 'match', opponent: 'Sharjah Wanderers', starts_at: '2026-10-10T04:00:00.000Z' }
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]

const PLAYERS = [
  { id: 'p-1', full_name: 'Juno Kellaway', team_id: TEAM.id },
  { id: 'p-2', full_name: 'Wilf Standeven', team_id: TEAM.id },
  { id: 'p-3', full_name: 'Pax Mereweather', team_id: TEAM.id },
]

function renderScreen({ lineups = [] } = {}) {
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [TEAM], loading: false, error: null })
  getEventMock.mockResolvedValue(EVENT)
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityMock.mockResolvedValue([
    { player_id: 'p-1', status: 'in' },
    { player_id: 'p-2', status: 'in' },
    { player_id: 'p-3', status: 'in' },
  ])
  listLineupsMock.mockResolvedValue(lineups)
  render(<Lineup />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  createLineupMock.mockResolvedValue({ id: 'l-1' })
  saveLineupPlayersMock.mockResolvedValue([])
  updateLineupMock.mockResolvedValue({ id: 'l-1' })
})

async function loaded() {
  await screen.findByRole('tab', { name: 'Quick' })
}

async function chooseSevens(user) {
  await user.selectOptions(screen.getByLabelText(/players per side/i), '7')
}

describe('the view toggle', () => {
  it('starts on Quick — the view with no prerequisites', async () => {
    renderScreen()
    await loaded()
    expect(screen.getByRole('tab', { name: 'Quick' })).toHaveAttribute('aria-selected', 'true')
  })

  it('remembers the last view for the next visit', async () => {
    const user = renderScreen()
    await loaded()
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    expect(window.localStorage.getItem('lineup-view')).toBe('slots')
  })

  it('falls back to Quick when the stored value is junk', async () => {
    window.localStorage.setItem('lineup-view', 'sideways')
    renderScreen()
    await loaded()
    expect(screen.getByRole('tab', { name: 'Quick' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('the slots view', () => {
  it('shows one numbered shirt per player-per-side, with position names', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    expect(screen.getByText(/shirts — 0 of 7/i)).toBeInTheDocument()
    // 7s preset: slot 5 is Fly-half. The label is a GUIDE (rosterFormats.js).
    expect(screen.getAllByText(/tap to fill/i)).toHaveLength(7)
    expect(screen.getByText(/tap to fill · fly-half/i)).toBeInTheDocument()
  })

  it('asks for a format before drawing shirts', async () => {
    const user = renderScreen()
    await loaded()
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    expect(screen.getByText(/choose players per side above/i)).toBeInTheDocument()
  })

  it('fills the exact tapped shirt, not the first free one', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    // Tap shirt 5 (Fly-half), then a player: they must land at 5, leaving 1–4 empty.
    await user.click(screen.getByRole('button', { name: /tap to fill · fly-half/i }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 5 to Juno Kellaway' }))
    const handle = screen.getByLabelText('Drag to move Juno Kellaway')
    expect(handle).toBeInTheDocument()
    expect(screen.getAllByText(/tap to fill/i)).toHaveLength(6)
    expect(screen.getByText(/shirts — 1 of 7/i)).toBeInTheDocument()
  })

  it('puts a drag handle on filled rows only', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    expect(screen.queryAllByLabelText(/drag to move/i)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /tap to fill · scrum-half/i }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 4 to Juno Kellaway' }))
    expect(screen.getAllByLabelText(/drag to move/i)).toHaveLength(1)
  })
})

describe('the pitch view', () => {
  it('lays out one circle per shirt for the chosen format', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Pitch' }))
    const circles = screen.getAllByRole('button', { name: /^shirt \d+:/i })
    expect(circles).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Shirt 7: empty' })).toBeInTheDocument()
  })

  it('fills a tapped circle from the pool, by shirt', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Pitch' }))
    await user.click(screen.getByRole('button', { name: 'Shirt 7: empty' }))
    expect(screen.getByText(/shirt 7 — wing: tap a player below/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Give shirt 7 to Juno Kellaway' }))
    expect(
      screen.getByRole('button', { name: 'Shirt 7: Juno Kellaway' }),
    ).toBeInTheDocument()
  })

  it('swaps two filled circles on a second tap', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Pitch' }))
    await user.click(screen.getByRole('button', { name: 'Shirt 1: empty' }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 1 to Juno Kellaway' }))
    await user.click(screen.getByRole('button', { name: 'Shirt 2: empty' }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 2 to Wilf Standeven' }))
    // Juno is at 1, Wilf at 2. Tap 1, tap 2 — they swap.
    await user.click(screen.getByRole('button', { name: 'Shirt 1: Juno Kellaway' }))
    await user.click(screen.getByRole('button', { name: 'Shirt 2: Wilf Standeven' }))
    expect(screen.getByRole('button', { name: 'Shirt 1: Wilf Standeven' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shirt 2: Juno Kellaway' })).toBeInTheDocument()
  })
})

describe('the sheet style (phase 2)', () => {
  it('offers the toggle only when a format is chosen', async () => {
    const user = renderScreen()
    await loaded()
    expect(screen.queryByRole('group', { name: 'Sheet style' })).toBeNull()
    await chooseSevens(user)
    expect(screen.getByRole('group', { name: 'Sheet style' })).toBeInTheDocument()
  })

  it('puts the pitch drawing in the share facsimile — above the lists, never instead', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    await user.click(screen.getByRole('button', { name: /tap to fill · fly-half/i }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 5 to Juno Kellaway' }))

    const facsimile = () => document.querySelector('.force-light')
    expect(facsimile().querySelector('svg')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Pitch', pressed: false }))
    expect(facsimile().querySelector('svg')).not.toBeNull()
    // ⚠️ THE 14 AUG FULL-NAMES RULING: the pitch graphic abbreviates for
    // space, so the facsimile must STILL carry the full name in its list.
    expect(facsimile().textContent).toContain('Juno Kellaway')
    expect(window.localStorage.getItem('lineup-sheet-style')).toBe('pitch')
  })

  it('remembers pitch style across a reload', async () => {
    window.localStorage.setItem('lineup-sheet-style', 'pitch')
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    expect(
      screen.getByRole('group', { name: 'Sheet style' }).querySelector('[aria-pressed="true"]'),
    ).toHaveTextContent('Pitch')
  })
})

describe('the slot-shaped save', () => {
  it('writes sort_order as the SLOT and the position from the preset, holes kept', async () => {
    const user = renderScreen()
    await loaded()
    await chooseSevens(user)
    await user.click(screen.getByRole('tab', { name: 'Slots' }))
    // Fill only shirt 5 (Fly-half) and add one replacement.
    await user.click(screen.getByRole('button', { name: /tap to fill · fly-half/i }))
    await user.click(screen.getByRole('button', { name: 'Give shirt 5 to Juno Kellaway' }))
    const pool = screen.getByText('Still to pick').parentElement
    await user.click(within(pool).getAllByRole('button', { name: 'Bench' })[0])
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveLineupPlayersMock).toHaveBeenCalledTimes(1))
    const rows = saveLineupPlayersMock.mock.calls[0][1]
    expect(rows).toEqual([
      { player_id: 'p-1', role: 'starter', position: 'Fly-half', sort_order: 4 },
      // p-3 (Pax Mereweather): the pool is alphabetical and Pax sorts before Wilf.
      { player_id: 'p-3', role: 'replacement', position: null, sort_order: 7 },
    ])
  })

  it('reloads a slotted lineup with its holes intact', async () => {
    const user = renderScreen({
      lineups: [
        {
          id: 'l-9',
          players_per_side: 7,
          squad_size: null,
          notes: '',
          lineup_players: [
            { player_id: 'p-1', role: 'starter', position: 'Fly-half', sort_order: 4 },
          ],
        },
      ],
    })
    await loaded()
    await user.click(screen.getByRole('tab', { name: 'Pitch' }))
    expect(screen.getByRole('button', { name: 'Shirt 5: Juno Kellaway' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shirt 1: empty' })).toBeInTheDocument()
  })
})
