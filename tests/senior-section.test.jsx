import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The senior section overview — claude/plans/2026-09-03-senior-section.md.
// What comes back is RLS's decision; these tests pin what the screen does
// with it: the switch, this weekend's counts, the pool with its second-squad
// tags, the season record, and the fixtures-only rendering of a foreign
// section.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const standingsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ listEvents: (...a) => listEventsMock(...a) }))
vi.mock('../src/data/players.js', () => ({ listPlayers: (...a) => listPlayersMock(...a) }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: (...a) => listAvailabilityMock(...a) }))
vi.mock('../src/data/leagueTeams.js', () => ({ listAllLeagueTeams: async () => LEAGUE_TEAMS }))
vi.mock('../src/data/competitions.js', () => ({ standings: (...a) => standingsMock(...a) }))
vi.mock('../src/data/seasonStats.js', () => ({
  seasonStats: async () => [],
  seasonStatsGaps: async () => ({ played: 0, unnamed: 0 }),
}))

import SeniorSection, { shortSquadName } from '../src/screens/SeniorSection.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 'men1', club_id: CLUB, name: 'Senior Men - 1st XV', section: 'senior_men', sort_order: 16, is_senior: true },
  { id: 'men2', club_id: CLUB, name: 'Senior Men - 2nd XV', section: 'senior_men', sort_order: 17, is_senior: true },
  { id: 'women', club_id: CLUB, name: 'Senior Women', section: 'senior_women', sort_order: 19, is_senior: true },
  { id: 'u10', club_id: CLUB, name: 'U10 Mixed', section: null, sort_order: 3, is_senior: false },
]
const LEAGUE_TEAMS = [
  { id: 'lt-wap', team_id: 'men1', rcm_name: 'ADH', division: 'WAP', is_active: true, competition_id: 'c-wap' },
  { id: 'lt-d1', team_id: 'men2', rcm_name: 'ADH', division: 'D1', is_active: true, competition_id: null },
]
// Two matches next Saturday (far future so "this weekend" is stable), one later.
const SAT = '2099-10-10T20:00:00Z' // Sat 11 Oct 2099 00:00 Dubai
const EVENTS = [
  { id: 'e1', team_id: 'men1', type: 'match', starts_at: SAT, time_tbd: true, opponent: 'Tusskers', home: true, round: 2, competition_type: 'league', league_team_id: 'lt-wap' },
  { id: 'e2', team_id: 'men2', type: 'match', starts_at: SAT, time_tbd: true, opponent: 'Tusskers', home: true, round: 2, competition_type: 'league', league_team_id: 'lt-d1' },
  { id: 'e3', team_id: 'men1', type: 'match', starts_at: '2099-10-17T20:00:00Z', time_tbd: true, opponent: 'Shaheen', home: false, round: 3, competition_type: 'league', league_team_id: 'lt-wap' },
  { id: 'e4', team_id: 'men1', type: 'training', starts_at: '2099-10-13T15:00:00Z', time_tbd: false },
]
const PLAYERS = [
  { id: 'p1', team_id: 'men1', full_name: 'Tariq Benali', jersey_num: 9, guest_of: null },
  { id: 'p2', team_id: 'men1', full_name: 'Callum Reidsworth', jersey_num: 10, guest_of: null },
  { id: 'p3', team_id: 'men2', full_name: 'Dev Kaurava', jersey_num: 7, guest_of: null },
  // The 1st XV's 9 also listed under the 2nd XV through his second membership.
  { id: 'p1', team_id: 'men2', full_name: 'Tariq Benali', jersey_num: 12, guest_of: 'men1' },
]
const AVAIL = [
  { event_id: 'e1', player_id: 'p1', status: 'in' },
  { event_id: 'e1', player_id: 'p2', status: 'out' },
  { event_id: 'e2', player_id: 'p3', status: 'in' },
]
const TABLE = [
  { pos: 3, side_id: 's-us', side: 'Abu Dhabi Harlequins', is_ours: true, played: 4, won: 2, drawn: 1, lost: 1, points_for: 90, points_against: 60, difference: 30, bonus: 1, points: 11 },
]

function renderAs(memberships, { url = '/seniors' } = {}) {
  useMembershipsMock.mockReturnValue({ memberships, teams: TEAMS, loading: false, error: null, reload: vi.fn() })
  render(
    <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SeniorSection />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const MEN2_PLAYER = [{ id: 'm1', role: 'player', status: 'active', team_id: 'men2', club_id: CLUB }]
const WOMEN_PLAYER = [{ id: 'm2', role: 'player', status: 'active', team_id: 'women', club_id: CLUB }]
const ADMIN = [{ id: 'm3', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null, club_id: CLUB }]

beforeEach(() => {
  vi.clearAllMocks()
  listEventsMock.mockResolvedValue(EVENTS)
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityMock.mockResolvedValue(AVAIL)
  standingsMock.mockResolvedValue(TABLE)
})

describe('shortSquadName', () => {
  it('drops the section prefix and keeps a plain name whole', () => {
    expect(shortSquadName('Senior Men - 1st XV')).toBe('1st XV')
    expect(shortSquadName('Senior Women')).toBe('Senior Women')
  })
})

describe('the senior section — a 2nd XV player', () => {
  it('opens on his own section, with every men’s squad and the switch to the women’s fixtures', async () => {
    renderAs(MEN2_PLAYER)
    expect(await screen.findByRole('heading', { name: 'Senior men' })).toBeInTheDocument()
    const switcher = screen.getByRole('group', { name: 'Section' })
    expect(within(switcher).getByRole('button', { name: 'Men' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(switcher).getByRole('button', { name: 'Women' })).toHaveAttribute('aria-pressed', 'false')
    // Asked for the whole section in one call, never a junior squad.
    expect(listEventsMock.mock.calls[0][0].teamIds).toEqual(['men1', 'men2'])
    expect(listPlayersMock.mock.calls[0][0]).toEqual({ teamIds: ['men1', 'men2'] })
    // ⚠️ ISO strings, never Date objects: a Date reached Postgres as
    // "GMT+0400 (Gulf Standard Time)" and the page errored on its first
    // opening (3 Sep 2026).
    expect(typeof listEventsMock.mock.calls[0][0].from).toBe('string')
    expect(listEventsMock.mock.calls[0][0].from).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('this weekend: each squad’s match with in, out and not-answered counts', async () => {
    renderAs(MEN2_PLAYER)
    const rows = await screen.findAllByTestId('weekend-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('1st XV · Quins vs Tusskers')
    expect(rows[0]).toHaveTextContent('ADH · Premiership · Round 2 · Home · Time TBD')
    // 1st XV has two players: one in, one out, nobody unanswered.
    expect(rows[0]).toHaveTextContent('1 in')
    expect(rows[0]).toHaveTextContent('1 out')
    expect(rows[0]).toHaveTextContent('0 not answered')
    // 2nd XV has two on its list (one a guest): one in, one unanswered.
    expect(rows[1]).toHaveTextContent('1 in')
    expect(rows[1]).toHaveTextContent('1 not answered')
    // Training is not a match and is not on the weekend card.
    expect(screen.queryByText(/training/i)).not.toBeInTheDocument()
  })

  it('the pool: grouped by home squad, numbers first, a second squad tagged', async () => {
    renderAs(MEN2_PLAYER)
    const squads = await screen.findAllByTestId('pool-squad')
    expect(squads).toHaveLength(2)
    expect(squads[0]).toHaveTextContent('1st XV · 2')
    expect(within(squads[0]).getAllByRole('listitem')[0]).toHaveTextContent('9Tariq Benali')
    expect(squads[1]).toHaveTextContent('2nd XV · 2')
    expect(within(squads[1]).getByText('home 1st XV')).toBeInTheDocument()
    expect(screen.getByText('The pool · 4 players')).toBeInTheDocument()
  })

  it('the season record reads our row off the league table, and says so when there is none', async () => {
    renderAs(MEN2_PLAYER)
    const cards = await screen.findAllByTestId('record-card')
    expect(cards[0]).toHaveTextContent('2-1-1')
    expect(cards[0]).toHaveTextContent('Premiership · 3rd · 11 pts')
    expect(within(cards[0]).getByRole('link', { name: 'Table' })).toHaveAttribute('href', '/standings/c-wap')
    expect(cards[1]).toHaveTextContent('No league table yet.')
    expect(standingsMock).toHaveBeenCalledTimes(1)
  })

  it('puts an All matches W–D–L row above the league table cards', async () => {
    const at = Date.parse('2026-10-15T08:00:00Z')
    const spy = vi.spyOn(Date, 'now').mockReturnValue(at)
    listEventsMock.mockResolvedValue([
      ...EVENTS,
      {
        id: 'played',
        team_id: 'men1',
        type: 'match',
        starts_at: '2026-10-03T13:00:00Z',
        opponent: 'Harts',
        competition_type: 'league',
        result_us: 31,
        result_them: 17,
      },
      {
        id: 'friendly',
        team_id: 'men1',
        type: 'match',
        starts_at: '2026-10-05T13:00:00Z',
        opponent: 'Exiles',
        competition_type: null,
        result_us: 14,
        result_them: 14,
      },
    ])
    try {
      renderAs(MEN2_PLAYER)
      const all = await screen.findByTestId('all-matches-record')
      const league = screen.getByTestId('season-record')
      expect(all.compareDocumentPosition(league) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(all).toHaveTextContent(/all matches/i)
      expect(all).toHaveTextContent(/league · tournaments · friendlies/)
      const cards = within(all).getAllByTestId('season-record-card')
      expect(cards[0]).toHaveTextContent('1st XV')
      expect(within(cards[0]).getByTestId('season-record-wdl')).toHaveTextContent('1–1–0')
      expect(cards[0]).toHaveTextContent('from scores on Hub · 2026-27')
      expect(within(league).getAllByTestId('record-card')[0]).toHaveTextContent('2-1-1')
    } finally {
      spy.mockRestore()
    }
  })

  it('widens the events fetch to the club season so past scores are not dropped', async () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-15T08:00:00Z'))
    try {
      renderAs(MEN2_PLAYER)
      await screen.findByTestId('season-record')
      const { from } = listEventsMock.mock.calls[0][0]
      expect(Date.parse(from)).toBeLessThanOrEqual(Date.parse('2026-08-31T20:00:00.000Z'))
    } finally {
      spy.mockRestore()
    }
  })

  it('⚠️ the women’s section is fixtures only for him: no pool, no counts, and it says why', async () => {
    const user = renderAs(MEN2_PLAYER)
    await screen.findByRole('heading', { name: 'Senior men' })
    await user.click(screen.getByRole('button', { name: 'Women' }))
    expect(await screen.findByRole('heading', { name: 'Senior women' })).toBeInTheDocument()
    expect(screen.getByTestId('foreign-section-note')).toHaveTextContent(/fixtures and results only/i)
    expect(screen.queryByTestId('pool')).not.toBeInTheDocument()
    // Players and availability were never even asked for.
    expect(listPlayersMock).toHaveBeenCalledTimes(1)
    expect(listAvailabilityMock).toHaveBeenCalledTimes(1)
  })
})

describe('the senior section — others', () => {
  it('a women’s player opens on her own section', async () => {
    renderAs(WOMEN_PLAYER)
    expect(await screen.findByRole('heading', { name: 'Senior women' })).toBeInTheDocument()
    expect(listEventsMock.mock.calls[0][0].teamIds).toEqual(['women'])
    expect(screen.queryByTestId('foreign-section-note')).not.toBeInTheDocument()
  })

  it('an admin sees both sections in full and lands on the first', async () => {
    renderAs(ADMIN, { url: '/seniors?section=senior_women' })
    expect(await screen.findByRole('heading', { name: 'Senior women' })).toBeInTheDocument()
    expect(screen.queryByTestId('foreign-section-note')).not.toBeInTheDocument()
    expect(await screen.findByTestId('pool')).toBeInTheDocument()
  })

  it('CONTROL: with no section set anywhere, says so rather than drawing an empty page', () => {
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [TEAMS[3]], loading: false, error: null, reload: vi.fn() })
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SeniorSection />
      </MemoryRouter>,
    )
    expect(screen.getByText(/no senior section is set up yet/i)).toBeInTheDocument()
    expect(listEventsMock).not.toHaveBeenCalled()
  })
})
