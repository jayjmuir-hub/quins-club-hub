import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const seasonStatsMock = vi.fn()
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: (...a) => seasonStatsMock(...a),
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))

// ⚠️ Mirrors what src/screens/PlayerDetail.jsx actually imports from
// data/players.js (deletePlayer, getPlayerContact, getPlayerDob,
// markPlayerLeft, restorePlayer) — the brief's guessed names
// (getPlayerParents, getPlayerPrivate) do not exist on this module. Also
// consumed by useOwnContactGate.js internally, but that hook is mocked
// below so its own getPlayerDob call never happens.
vi.mock('../src/data/players.js', () => ({
  getPlayerContact: async () => null,
  getPlayerDob: async () => null,
  deletePlayer: async () => ({}),
  markPlayerLeft: async () => ({}),
  restorePlayer: async () => ({}),
}))

// ParentsBlock's data source (src/data/parents.js), not data/players.js as
// the brief guessed.
vi.mock('../src/data/parents.js', () => ({
  listParents: async () => [],
}))

vi.mock('../src/lib/useOwnContactGate.js', () => ({
  default: () => ({ allowed: false, settled: true }),
}))

import PlayerDetail from '../src/screens/PlayerDetail.jsx'

const MEN1 = { id: 't-men1', name: 'Senior Men - 1st XV', section: 'senior_men' }
const U12 = { id: 't-u12', name: 'U12 Mixed', section: null }
const PLAYER = { id: 'p1', full_name: 'Harness Fly Half', team_id: 't-men1' }

function mount(team) {
  render(
    <MemoryRouter>
      <PlayerDetail player={PLAYER} team={team} onClose={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seasonStatsMock.mockResolvedValue([
    { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 2, bench: 1, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 1, reds: 0 },
    { player_id: 'p2', full_name: 'Harness Hooker', games: 3, starts: 3, bench: 0, tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 0 },
  ])
})

describe('the player sheet — this season', () => {
  it('a senior player gets their own line for the squad the sheet was opened from', async () => {
    mount(MEN1)
    const block = await screen.findByTestId('season-block')
    expect(block).toHaveTextContent('Games3')
    expect(block).toHaveTextContent('Starts2')
    expect(block).toHaveTextContent('Bench1')
    expect(block).toHaveTextContent('Conversions4')
    expect(block).toHaveTextContent('Yellow cards1')
    expect(seasonStatsMock).toHaveBeenCalledWith('t-men1', expect.any(String))
  })
  it('says so when the player is on no sheet yet', async () => {
    seasonStatsMock.mockResolvedValue([])
    mount(MEN1)
    expect(await screen.findByText('No games on a sheet yet.')).toBeInTheDocument()
  })
  it('a junior squad has no block and asks nothing', async () => {
    mount(U12)
    await screen.findByRole('heading', { name: 'Harness Fly Half' })
    expect(screen.queryByTestId('season-block')).not.toBeInTheDocument()
    expect(seasonStatsMock).not.toHaveBeenCalled()
  })
})
