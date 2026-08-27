import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

// The sidebar's Roster deep-links: /roster?open=add-player opens the player
// form, /roster?open=import opens the importer (desktop only, like the
// button it stands in for) — both for squad staff only, both clearing the
// param once consumed. tests/roster.test.jsx owns the screen's ordinary
// behaviour; this file only proves the ?open= contract.

const useMembershipsMock = vi.fn()
const isDesktopMock = vi.fn(() => true)

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/useMediaQuery.js', () => ({
  useMediaQuery: () => isDesktopMock(),
  DESKTOP_QUERY: '(min-width: 1280px)',
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: vi.fn().mockResolvedValue([]),
  listPlayerPrivate: vi.fn().mockResolvedValue([]),
  getPlayerDob: vi.fn().mockResolvedValue(null),
  getPlayerContact: vi.fn().mockResolvedValue(null),
}))
vi.mock('../src/data/parents.js', () => ({
  listParents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: vi.fn().mockResolvedValue(null),
  signPhotoUrls: vi.fn().mockResolvedValue({}),
}))
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: vi.fn().mockResolvedValue(new Map()),
  listPlayerPositions: vi.fn().mockResolvedValue(new Map()),
  listPlayerUnits: vi.fn().mockResolvedValue(new Map()),
}))
// The sheets are their own suites' problem; here only "did the deep-link
// open the right one" matters.
vi.mock('../src/screens/PlayerForm.jsx', () => ({
  default: () => <div data-testid="player-form-stub">player form</div>,
}))
vi.mock('../src/screens/PlayerImport.jsx', () => ({
  default: () => <div data-testid="player-import-stub">importer</div>,
}))
vi.mock('../src/screens/PlayerDetail.jsx', () => ({
  default: () => <div data-testid="player-detail-stub">detail</div>,
}))
vi.mock('../src/screens/MyPlayerForm.jsx', () => ({
  default: () => <div data-testid="my-player-form-stub">own form</div>,
}))

import Roster from '../src/screens/Roster.jsx'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="search-probe">{location.search}</span>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Roster />
      <LocationProbe />
    </MemoryRouter>,
  )
}

const TEAMS = [{ id: 't-u12', name: 'U12 Mixed', sort_order: 3 }]
const COACH = [{ role: 'coach', team_id: 't-u12', status: 'active' }]
const PARENT = [{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }]

beforeEach(() => {
  vi.clearAllMocks()
  isDesktopMock.mockReturnValue(true)
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: TEAMS, loading: false })
})

describe('?open=add-player', () => {
  it('opens the player form for squad staff, then clears the param', async () => {
    renderAt('/roster?open=add-player')
    expect(await screen.findByTestId('player-form-stub')).toBeInTheDocument()
    expect(screen.getByTestId('search-probe').textContent).toBe('')
  })

  it('for a parent it opens nothing and still clears the param', async () => {
    useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: TEAMS, loading: false })
    renderAt('/roster?open=add-player')
    await vi.waitFor(() => {
      expect(screen.getByTestId('search-probe').textContent).toBe('')
    })
    expect(screen.queryByTestId('player-form-stub')).not.toBeInTheDocument()
  })
})

describe('?open=import', () => {
  it('opens the importer for squad staff on desktop, then clears the param', async () => {
    renderAt('/roster?open=import')
    expect(await screen.findByTestId('player-import-stub')).toBeInTheDocument()
    expect(screen.getByTestId('search-probe').textContent).toBe('')
  })

  it('on mobile it opens nothing — the importer is a paste target', async () => {
    isDesktopMock.mockReturnValue(false)
    renderAt('/roster?open=import')
    await vi.waitFor(() => {
      expect(screen.getByTestId('search-probe').textContent).toBe('')
    })
    expect(screen.queryByTestId('player-import-stub')).not.toBeInTheDocument()
  })
})
