import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Phase 4 — the tournament container's detail screen and its add-game form.
// The data layer is mocked; this proves the screen, not the query.

const listTournamentGamesMock = vi.fn()
const deleteEventMock = vi.fn()
const setTournamentPlacingMock = vi.fn()
const upsertEventMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listTournamentGames: (...a) => listTournamentGamesMock(...a),
  deleteEvent: (...a) => deleteEventMock(...a),
  setTournamentPlacing: (...a) => setTournamentPlacingMock(...a),
  upsertEvent: (...a) => upsertEventMock(...a),
}))

import TournamentDetail, { isTournamentEvent } from '../src/screens/TournamentDetail.jsx'
import AddGameForm from '../src/screens/AddGameForm.jsx'

const TOURNAMENT = {
  id: 'trn-1',
  club_id: 'club-1',
  team_id: 'u14',
  type: 'match',
  competition_type: 'tournament',
  tournament_id: null,
  competition: 'Al Ain Tournament',
  venue: 'Al Ain RFC',
  tier: 'A',
  // 09:00 Abu Dhabi (05:00Z + 4h).
  starts_at: '2026-09-12T05:00:00.000Z',
  placing: null,
}

const GAMES = [
  { id: 'g-1', opponent: 'Exiles', stage: 'Pool A', starts_at: '2026-09-12T05:00:00.000Z', result_us: 12, result_them: 5 },
  { id: 'g-2', opponent: 'Dragons', stage: null, starts_at: '2026-09-12T06:20:00.000Z', result_us: null, result_them: null },
]

beforeEach(() => {
  listTournamentGamesMock.mockReset().mockResolvedValue(GAMES)
  deleteEventMock.mockReset().mockResolvedValue(undefined)
  setTournamentPlacingMock.mockReset().mockResolvedValue({ id: 'trn-1' })
  upsertEventMock.mockReset().mockResolvedValue({ id: 'g-new' })
})

describe('isTournamentEvent', () => {
  it('is true only for a container: a match, competition tournament, no parent', () => {
    expect(isTournamentEvent(TOURNAMENT)).toBe(true)
    // A game inside a tournament (has a parent) is NOT a container.
    expect(isTournamentEvent({ ...TOURNAMENT, tournament_id: 'trn-1' })).toBe(false)
    // A league match is not a tournament.
    expect(isTournamentEvent({ ...TOURNAMENT, competition_type: 'league' })).toBe(false)
    // Training is never a tournament.
    expect(isTournamentEvent({ type: 'training' })).toBe(false)
  })
})

describe('TournamentDetail', () => {
  function renderDetail(props = {}) {
    return render(
      <TournamentDetail event={TOURNAMENT} team={{ id: 'u14', name: 'U14 Mixed' }} canEdit {...props} />,
    )
  }

  it('shows the tournament and lists its games with scores', async () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: 'Al Ain Tournament' })).toBeInTheDocument()
    expect(await screen.findByText('Quins vs Exiles')).toBeInTheDocument()
    expect(screen.getByText('12–5')).toBeInTheDocument()
    // A game with no score shows a dash, not a fabricated result.
    expect(screen.getByText('Quins vs Dragons')).toBeInTheDocument()
    expect(screen.getByText('2 played')).toBeInTheDocument()
  })

  it('opens the add-game form from the Add game button', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Quins vs Exiles')

    await user.click(screen.getByRole('button', { name: /add game/i }))
    expect(await screen.findByRole('heading', { name: 'Add game' })).toBeInTheDocument()
  })

  it('records a placing', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.selectOptions(screen.getByLabelText('Placing'), 'Runners-up')
    await waitFor(() => expect(setTournamentPlacingMock).toHaveBeenCalledWith('trn-1', 'Runners-up'))
  })

  it('deletes only on the second, confirming tap, and names the game count', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn()
    renderDetail({ onDeleted })
    await screen.findByText('Quins vs Exiles')

    await user.click(screen.getByRole('button', { name: 'Delete tournament' }))
    expect(deleteEventMock).not.toHaveBeenCalled()
    // The armed button names what goes with it.
    const confirm = screen.getByRole('button', { name: /delete the tournament and all 2 games/i })

    await user.click(confirm)
    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith('trn-1'))
    expect(onDeleted).toHaveBeenCalled()
  })

  it('offers no edit controls to a viewer who cannot edit', async () => {
    renderDetail({ canEdit: false })
    await screen.findByText('Quins vs Exiles')
    expect(screen.queryByRole('button', { name: /add game/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete tournament/i })).not.toBeInTheDocument()
  })
})

describe('AddGameForm', () => {
  it('saves a game that inherits the tournament, with its own opponent and kick-off', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<AddGameForm tournament={TOURNAMENT} onSaved={onSaved} onClose={onClose} />)

    await user.type(screen.getByLabelText('Opponent'), 'Exiles')
    await user.type(screen.getByLabelText('Kick-off'), '10:20')
    await user.type(screen.getByLabelText('Quins score'), '12')
    await user.type(screen.getByLabelText('Opponent score'), '5')
    await user.click(screen.getByRole('button', { name: /add game/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    expect(written).toMatchObject({
      tournament_id: 'trn-1',
      team_id: 'u14',
      club_id: 'club-1',
      type: 'match',
      competition_type: 'tournament',
      competition: 'Al Ain Tournament',
      tier: 'A',
      venue: 'Al Ain RFC',
      opponent: 'Exiles',
      result_us: 12,
      result_them: 5,
    })
    // 10:20 Abu Dhabi is 06:20Z; home and ends_at are null on a game.
    expect(written.starts_at).toBe('2026-09-12T06:20:00.000Z')
    expect(written.home).toBeNull()
    expect(written.ends_at).toBeNull()
    expect(onSaved).toHaveBeenCalled()
  })

  it('refuses a half score — both or neither', async () => {
    const user = userEvent.setup()
    render(<AddGameForm tournament={TOURNAMENT} onSaved={() => {}} onClose={() => {}} />)

    await user.type(screen.getByLabelText('Opponent'), 'Exiles')
    await user.type(screen.getByLabelText('Kick-off'), '10:20')
    await user.type(screen.getByLabelText('Quins score'), '12')
    await user.click(screen.getByRole('button', { name: /add game/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/both scores, or leave both blank/i)
  })
})
