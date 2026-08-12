import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// RCM match sheets — Project 2. The editor and the Club Youth Manager's list.
//
// PROCESS ZONE. America/New_York, like the other fixture-writing suites: the
// deadline rule and the rendered kick-off are both time-of-day facts, and a
// zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const getEventMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
const setStatusMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
  upsertEvent: async () => ({}),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: async () => [],
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    SLOT_COUNT: actual.SLOT_COUNT,
    getMatchSheet: (...a) => getMatchSheetMock(...a),
    listMatchSheetsFor: (...a) => listMatchSheetsForMock(...a),
    saveMatchSheet: (...a) => saveMatchSheetMock(...a),
    saveMatchSheetSlots: (...a) => saveSlotsMock(...a),
    saveMatchSheetCards: (...a) => saveCardsMock(...a),
    setMatchSheetStatus: (...a) => setStatusMock(...a),
  }
})

import MatchSheet from '../src/screens/MatchSheet.jsx'
import YouthDashboard from '../src/screens/YouthDashboard.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }
const U18B = { id: 't-u18b', club_id: CLUB, name: 'U18B Contact', sort_order: 13 }

const MATCH = {
  id: 'e-1',
  club_id: CLUB,
  team_id: 't-u14b',
  type: 'match',
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City, Abu Dhabi',
  starts_at: '2026-09-12T05:00:00.000Z',
  ends_at: '2026-09-12T06:30:00.000Z',
  round: 4,
  league_team_id: 'lt-2',
  league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  team: U14B,
}

const COACH = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u14b' }]
const PARENT = [{ id: 'm-p', role: 'parent', status: 'active', team_id: 't-u14b', player_id: 'p1' }]
const ADMIN_YOUTH = [
  { id: 'm-a', role: 'admin', status: 'active', team_id: null, club_id: CLUB, admin_rights: ['youth'] },
]

function mount(ui, { memberships = COACH, teams = [U14B, U18B], path = '/match-sheet/e-1' } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={ui} />
        <Route path="/admin/youth" element={ui} />
        <Route path="/schedule" element={<div>Schedule marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  getEventMock.mockResolvedValue(MATCH)
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 't-u14b', full_name: 'Zara Ali' },
    { id: 'p2', team_id: 't-u14b', full_name: 'Tom Fletcher' },
  ])
  getMatchSheetMock.mockResolvedValue(null)
  listMatchSheetsForMock.mockResolvedValue(new Map())
  saveMatchSheetMock.mockResolvedValue({ id: 'ms-1', status: 'draft' })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
  listEventsMock.mockResolvedValue([MATCH])
})

describe('MatchSheet — the form', () => {
  it('auto-populates the fixture block from the event', async () => {
    mount(<MatchSheet />)
    expect(await screen.findByRole('heading', { name: /official match result sheet/i })).toBeInTheDocument()
    // ⚠️ CLUB IS THE CLUB; HOME TEAM IS THE LEAGUE TEAM. Taken from the real
    // form Jay supplied: its filled example reads CLUB: AD Harlequins and
    // HOME TEAM: ADHQ2. An earlier guess had the club name in both, which is
    // not what RCM asks for — the league team is what identifies the side.
    expect(screen.getAllByText(/AD Harlequins/)).toHaveLength(1)
    // TEAM: is the LEAGUE team, which is the whole reason Project 1 blocked this.
    // It appears twice: the TEAM: line and the HOME TEAM cell.
    expect(screen.getAllByText('ADHQ2')).toHaveLength(2)
    expect(screen.getByText('Dubai Exiles')).toBeInTheDocument()
    expect(screen.getByText('Zayed Sports City, Abu Dhabi')).toBeInTheDocument()
  })

  it('⚠️ puts OUR score on the right when we played AWAY', async () => {
    // The form's two score pairs are POSITIONAL — home on the left, away on the
    // right — while the database stores us/them. An away fixture is where the
    // two disagree, and it is the case a naive mapping gets wrong.
    getEventMock.mockResolvedValue({ ...MATCH, home: false })
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })

    await user.type(screen.getByLabelText('Away final score'), '31')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
    // We were away, so the AWAY box is ours.
    expect(saveMatchSheetMock.mock.calls[0][0]).toMatchObject({ score_us: 31 })
  })

  it('reproduces the discipline grid the form actually has', async () => {
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(screen.getByText(/DISCIPLINE – RED OR YELLOW CARDS/i)).toBeInTheDocument()
    for (const heading of ['HALF', 'TIME', 'R/Y', 'NO', 'FULL NAME', 'REASON']) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
    // ⚠️ R/Y is a SELECT: the colour CHECK constraint accepts only 'yellow' or
    // 'red', so a typed "yel" would fail the save on a field somebody thought
    // they had filled in correctly.
    expect(screen.getByLabelText('Card 1 colour').tagName).toBe('SELECT')
  })

  it('⚠️ offers 22 slots, because the form has 22 and a short squad is normal', async () => {
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    for (const slot of [1, 15, 16, 22]) {
      expect(screen.getByLabelText(`Player ${slot}`)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Player 23')).not.toBeInTheDocument()
  })

  it('⚠️ every slot carries an FR tick — it is a SAFETY declaration', async () => {
    // The FR column tells the referee which replacements can cover the front
    // row. It is not decoration and must not be dropped as clutter.
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(screen.getByLabelText('Front row cover for player 16')).toBeInTheDocument()
  })

  it('⚠️ offers the SQUAD\'S roster, not the club\'s', async () => {
    // A club-wide roster here would let a coach file a player from another age
    // group — which the governing body receives as a wrong team sheet.
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['t-u14b'] })
  })

  it('links a typed name back to the roster when it matches exactly', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.type(screen.getByLabelText('Player 1'), 'Zara Ali')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveSlotsMock).toHaveBeenCalled())
    const written = saveSlotsMock.mock.calls[0][1].find((row) => row.slot === 1)
    expect(written).toMatchObject({ full_name: 'Zara Ali', player_id: 'p1' })
  })

  it('⚠️ accepts a name that is NOT on the roster, with a null player_id', async () => {
    // There is deliberately no roster import, so a coach must be able to write
    // somebody who has not been onboarded yet. The name is what gets filed.
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.type(screen.getByLabelText('Player 2'), 'Not On The Roster')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveSlotsMock).toHaveBeenCalled())
    const written = saveSlotsMock.mock.calls[0][1].find((row) => row.slot === 2)
    expect(written).toMatchObject({ full_name: 'Not On The Roster', player_id: null })
  })

  it('⚠️ stamps the league team from the FIXTURE, never from a typed field', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
    expect(saveMatchSheetMock.mock.calls[0][0]).toMatchObject({
      event_id: 'e-1',
      league_team_id: 'lt-2',
    })
  })

  it('submits by marking the sheet complete', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith('ms-1', 'complete'))
  })

  it('⚠️ says READY TO SEND, never "sent" — the app cannot know RCM received it', async () => {
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1', event_id: 'e-1', status: 'complete', slots: [], cards: [],
    })
    mount(<MatchSheet />)
    expect(await screen.findByText(/ready to send/i)).toBeInTheDocument()
    expect(screen.getByText(/the app cannot send it for you/i)).toBeInTheDocument()
    expect(screen.queryByText(/\bsent to RCM\b/i)).not.toBeInTheDocument()
  })

  it('⚠️ shows the TRUE deadline for U18 — an hour BEFORE kick-off', async () => {
    // One editor serves every age group (Jay, 12 Aug), but the app must not
    // tell a U18 coach a deadline that is a day and a bit wrong.
    getEventMock.mockResolvedValue({ ...MATCH, team_id: 't-u18b', team: U18B })
    mount(<MatchSheet />, {
      memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u18b' }],
    })
    expect(await screen.findByText(/due 1 hour before kick-off/i)).toBeInTheDocument()
  })

  it('refuses a parent, and offers no form', async () => {
    mount(<MatchSheet />, { memberships: PARENT })
    expect(await screen.findByRole('alert')).toHaveTextContent(/coaches and team managers/i)
    expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
  })

  it('surfaces a refused save rather than reporting success', async () => {
    saveMatchSheetMock.mockRejectedValue(new Error('you may not have permission'))
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i)
  })
})

describe('YouthDashboard — the Club Youth Manager list', () => {
  const asYouth = { memberships: ADMIN_YOUTH, path: '/admin/youth' }

  it('⚠️ is titled by the JOB, not by a person', async () => {
    // Nobody holds this job in the app yet; a screen named after somebody who
    // cannot sign in reads as broken.
    mount(<YouthDashboard />, { memberships: [{ role: 'admin', status: 'active', admin_rights: [] }], path: '/admin/youth' })
    // ⚠️ BY ROLE, not by text. Since 12 Aug the label appears TWICE on this
    // card — as the heading and inside the sentence below it — so a bare
    // findByText matches both and throws. Asserting the heading is also the
    // stronger claim: it is the title being tested, not the prose.
    expect(await screen.findByRole('heading', { name: /Club Youth Manager/i })).toBeInTheDocument()
    expect(screen.getByText(/Club Youth Manager hasn't been added to your account/i)).toBeInTheDocument()
  })

  it('lists matches with their sheet status', async () => {
    mount(<YouthDashboard />, asYouth)
    const row = await screen.findByTestId('youth-match-row')
    expect(within(row).getByText(/ADHQ2/)).toBeInTheDocument()
    expect(within(row).getByText(/not started/i)).toBeInTheDocument()
  })

  it('⚠️ asks for every sheet in ONE query, not one per fixture', async () => {
    // Built for a loaded club: a season across fifteen squads would otherwise
    // be hundreds of round trips on the screen whose job is the glance.
    mount(<YouthDashboard />, asYouth)
    await screen.findByTestId('youth-match-row')
    expect(listMatchSheetsForMock).toHaveBeenCalledTimes(1)
    expect(listMatchSheetsForMock).toHaveBeenCalledWith(['e-1'])
  })

  it('shows a submitted sheet as ready to send', async () => {
    listMatchSheetsForMock.mockResolvedValue(
      new Map([['e-1', { id: 'ms-1', event_id: 'e-1', status: 'complete' }]]),
    )
    mount(<YouthDashboard />, asYouth)
    // The default filter hides completed sheets, so switch to All.
    const { getByRole } = screen
    await screen.findByRole('button', { name: /all matches/i })
    await userEvent.setup().click(getByRole('button', { name: /all matches/i }))
    const row = await screen.findByTestId('youth-match-row')
    expect(within(row).getByText(/ready to send/i)).toBeInTheDocument()
  })

  it('⚠️ only lists MATCHES — training has no RCM sheet', async () => {
    listEventsMock.mockResolvedValue([
      MATCH,
      { ...MATCH, id: 'e-2', type: 'training', title: 'Tuesday session' },
    ])
    mount(<YouthDashboard />, asYouth)
    await screen.findByTestId('youth-match-row')
    expect(screen.getAllByTestId('youth-match-row')).toHaveLength(1)
  })
})
