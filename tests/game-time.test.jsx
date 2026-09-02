import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// "Who hasn't had a chance to play?" — phase 1 of
// claude/plans/2026-08-14-tiers-and-game-time.md.
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9: this repo is public and its
// members are mostly children.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAppearancesMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/players.js', () => ({ listPlayers: (...a) => listPlayersMock(...a) }))
vi.mock('../src/data/appearances.js', () => ({ listAppearances: (...a) => listAppearancesMock(...a) }))

import GameTime from '../src/screens/GameTime.jsx'

const TEAM = { id: 't-u16b', club_id: 'c-1', name: 'U16B Contact', sort_order: 1 }
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]
const PARENT = [{ id: 'm-2', role: 'parent', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]

const PLAYERS = [
  { id: 'p-1', full_name: 'Aled Fenwicke', team_id: TEAM.id },
  { id: 'p-2', full_name: 'Bruno Castellani', team_id: TEAM.id },
  { id: 'p-3', full_name: 'Caspar Nyholm', team_id: TEAM.id },
]

function renderScreen({ memberships = COACH, appearances = new Map() } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams: [TEAM], loading: false, error: null })
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAppearancesMock.mockResolvedValue(appearances)
  render(<GameTime />)
}

beforeEach(() => vi.clearAllMocks())

describe('Game time', () => {
  it('puts the player with fewest appearances FIRST', async () => {
    // ⚠️ THE WHOLE FEATURE. Alphabetical order answers "who is in this squad",
    // which the Roster already does. This screen exists to answer "who am I
    // overlooking", and that answer has to be at the top rather than found by
    // reading to the bottom.
    renderScreen({
      appearances: new Map([
        ['p-1', { starts: 3, bench: 1, total: 4 }],
        ['p-2', { starts: 0, bench: 1, total: 1 }],
        // p-3 has no entry at all — never picked.
      ]),
    })

    await waitFor(() => expect(screen.getByText('Caspar Nyholm')).toBeInTheDocument())
    const names = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(names[0]).toMatch(/Caspar Nyholm/)   // 0 appearances
    expect(names[1]).toMatch(/Bruno Castellani/) // 1
    expect(names[2]).toMatch(/Aled Fenwicke/)    // 4
  })

  it('counts a player with NO row as zero rather than dropping them', async () => {
    // ⚠️ THE PLAYER WITH NO APPEARANCES IS THE ONE THE SCREEN IS FOR. An inner
    // join would omit exactly the person a coach opened this to find.
    renderScreen({ appearances: new Map([['p-1', { starts: 1, bench: 0, total: 1 }]]) })
    await waitFor(() => expect(screen.getByText('Caspar Nyholm')).toBeInTheDocument())
    expect(screen.getByText(/2 players have not been picked at all/)).toBeInTheDocument()
  })

  it('separates starts from bench, so "always a replacement" is visible', async () => {
    // A total alone hides the player who is picked every week and never starts.
    renderScreen({ appearances: new Map([['p-1', { starts: 0, bench: 5, total: 5 }]]) })
    await waitFor(() => expect(screen.getByText(/0 starts · 5 bench/)).toBeInTheDocument())
  })

  it('says the history only goes back to when team sheets started', async () => {
    // ⚠️ NOT A DISCLAIMER FOR ITS OWN SAKE. Team sheets are days old, so a 0
    // means "not picked since then", NOT "has never played for the club". A
    // coach acting on the bare number would be acting on nothing.
    renderScreen()
    await waitFor(() => expect(screen.getByText(/only goes back to/i)).toBeInTheDocument())
  })

  it('offers nothing to somebody who cannot pick a team', async () => {
    // Defensive — `lineup_players` RLS returns zero rows to a parent anyway, so
    // without this they would see every player on nought and read it as fact.
    renderScreen({ memberships: PARENT })
    expect(await screen.findByRole('alert')).toHaveTextContent(/don't have a squad you can pick/i)
  })

  it('loads and tags a leaver, but never tags a current player', async () => {
    // A past appearance must still name the child who has since left. Spec §4.
    useMembershipsMock.mockReturnValue({ memberships: COACH, teams: [TEAM], loading: false, error: null })
    listPlayersMock.mockResolvedValue([
      ...PLAYERS,
      { id: 'p-4', full_name: 'Delphine Okonkwo-Reyes', team_id: TEAM.id, left_at: '2026-09-02T08:00:00Z' },
    ])
    listAppearancesMock.mockResolvedValue(new Map([['p-4', { starts: 2, bench: 0, total: 2 }]]))
    render(<GameTime />)

    expect(listPlayersMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: [TEAM.id], includeLeft: true }),
    )
    expect(await screen.findByText('Delphine Okonkwo-Reyes · Left')).toBeInTheDocument()
    expect(screen.getByText('Aled Fenwicke')).toBeInTheDocument()
    expect(screen.queryByText('Aled Fenwicke · Left')).not.toBeInTheDocument()
  })
})
