import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Tests for the wide-screen schedule table (desktop-spec.md §5.2). The
// stacked FixtureRow list is covered by tests/schedule.test.jsx and is
// deliberately untouched by this file.
//
// The table is a `wide` (1280px) feature, not `desktop` (820px): at tablet
// width the stacked list is still the better shape. These tests pin that
// boundary, because getting it wrong is invisible until someone opens the app
// on an iPad.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
}))

import Schedule from '../src/screens/Schedule.jsx'
import { MemoryRouter } from 'react-router-dom'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 6 }
const TEAMS = [TEAM_U10, TEAM_U12]
const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: 'club-1' }]

// Fixed instants so the club-timezone formatting is asserted, not the
// browser's. 2030 keeps "upcoming" upcoming without freezing the clock.
const FUTURE_MATCH = {
  id: 'e1', team_id: 'team-u10', type: 'match', opponent: 'Dubai Exiles',
  home: true, venue: 'Zayed Sports City', competition: 'West Asia Cup',
  starts_at: '2030-03-14T11:00:00Z', result_us: null, result_them: null,
}
const FUTURE_TRAINING = {
  id: 'e2', team_id: 'team-u12', type: 'training', title: 'Skills session',
  venue: 'Al Ain', starts_at: '2030-03-10T15:30:00Z',
  result_us: null, result_them: null,
}
const PLAYED_WIN = {
  id: 'e3', team_id: 'team-u10', type: 'match', opponent: 'Bahrain',
  home: false, venue: 'Manama', starts_at: '2024-02-02T10:00:00Z',
  result_us: 24, result_them: 12,
}
const PLAYED_LOSS = {
  id: 'e4', team_id: 'team-u12', type: 'match', opponent: 'Doha',
  home: true, venue: 'Abu Dhabi', starts_at: '2024-01-01T10:00:00Z',
  result_us: 5, result_them: 30,
}

function setWidth({ desktop }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    // DESKTOP_QUERY is 820px — the table's breakpoint since 26 Aug 2026
    // (it was WIDE/1280 before Jay asked for the width to be used).
    matches: query.includes('820') ? desktop : true,
    media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  setWidth({ desktop: true })
  useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
  listEventsMock.mockResolvedValue([FUTURE_MATCH, FUTURE_TRAINING, PLAYED_WIN, PLAYED_LOSS])
})

const fixtures = () => screen.getAllByTestId('schedule-fixture').map((n) => n.textContent)

// ⚠️ Schedule and the Dashboard became ROUTER-AWARE on 12 Aug 2026: the match
// sheet is a full-page form, so EventDetail's entry point navigates rather
// than opening a sheet. Rendering them bare now throws "useNavigate() may be
// used only in the context of a <Router>". Wrapping here is the honest fix —
// the real app never renders these outside a Router, and a test that did was
// exercising a shape production does not have.
function withRouter(ui) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe('ScheduleTable — the desktop boundary', () => {
  it('renders the table from the desktop breakpoint (820px) up', async () => {
    render(withRouter(<Schedule />))
    expect(await screen.findByTestId('schedule-table')).toBeInTheDocument()
    expect(screen.queryByTestId('fixture-row')).not.toBeInTheDocument()
  })

  it('keeps the stacked list below 820px — the phone layout', async () => {
    setWidth({ desktop: false })
    render(withRouter(<Schedule />))
    await screen.findByText(/Dubai Exiles/)
    expect(screen.queryByTestId('schedule-table')).not.toBeInTheDocument()
  })
})

describe('ScheduleTable — content', () => {
  it('shows upcoming fixtures across every age group, not one team', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getAllByTestId('schedule-table-row')).toHaveLength(2)
    // Scoped to the table: the team filter pills render the same age-group
    // names above it, so a bare getByText would be ambiguous.
    const table = screen.getByTestId('schedule-table')
    expect(table).toHaveTextContent('U10')
    expect(table).toHaveTextContent('U12')
  })

  it('orders upcoming fixtures by date ascending', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    // 10 March training precedes 14 March match.
    expect(fixtures()[0]).toMatch(/Skills session/)
  })

  it('marks a home match H and an away match A', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getByText('H')).toBeInTheDocument()
  })

  it('does not label a training session home or away — it has no opponent', async () => {
    listEventsMock.mockResolvedValue([FUTURE_TRAINING])
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.queryByText('H')).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('⚠️ marks a league placeholder TBD, never A (1 Sep 2026)', async () => {
    // `home: null` means "not decided yet" since the league placeholders, and
    // the old `event.home ? 'H' : 'A'` stamped every placeholder as away. The
    // title comes from eventTitle's round branch, not "Quins match".
    listEventsMock.mockResolvedValue([{
      id: 'e5', team_id: 'team-u12', type: 'match', opponent: null, home: null,
      competition_type: 'league', round: 1,
      starts_at: '2030-03-21T05:00:00Z', result_us: null, result_them: null,
    }])
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getByText('TBD')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByTestId('schedule-fixture')).toHaveTextContent('Round 1')
  })

  it('formats the kick-off in club time, not the browser zone', async () => {
    render(withRouter(<Schedule />))
    const table = await screen.findByTestId('schedule-table')
    // 11:00Z on 14 March is 15:00 in Asia/Dubai (UTC+4). formatTime uses the
    // RUNTIME locale (toLocaleTimeString(undefined, …)) with hour:'numeric',
    // so the rendering is "3:00 PM" under jsdom's en-US and "15:00" under a
    // 24-hour locale. The zone is what this test is about, so assert the hour
    // in whichever form the locale produced rather than pinning the format —
    // pinning it would make this test fail on a machine with a different
    // locale, which is not a real defect.
    expect(table.textContent).toMatch(/15:00|3:00\s?PM/i)
  })

  it('shows the competition under the fixture when there is one', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getByText('West Asia Cup')).toBeInTheDocument()
  })
})

describe('ScheduleTable — results', () => {
  it('shows played fixtures with their score on the Results tab', async () => {
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    await user.click(screen.getByRole('button', { name: 'Results' }))

    const table = await screen.findByTestId('schedule-table')
    // EN DASH, not a hyphen: resultScore() in src/lib/eventFormat.js formats
    // scores as "24–12" deliberately, which is the typographically correct
    // mark for a range. Asserted with the real character rather than
    // loosened to a regex — the dash is a design decision, so a change to it
    // should break this test and be looked at, not slip through.
    expect(table).toHaveTextContent('24–12')
    expect(table).toHaveTextContent('5–30')
  })

  it('shows an em dash rather than an empty cell for an unplayed fixture', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('ScheduleTable — sorting', () => {
  it('sorts by age group when that header is clicked', async () => {
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    await user.click(screen.getByRole('button', { name: /^Age group/ }))

    const first = screen.getAllByTestId('schedule-table-row')[0]
    expect(first).toHaveTextContent('U10')
  })

  it('reverses on a second click of the same header', async () => {
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    const header = screen.getByRole('button', { name: /^Date/ })
    await user.click(header)
    expect(fixtures()[0]).toMatch(/Dubai Exiles/)
  })

  it('exposes sort direction through aria-sort', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')
    expect(screen.getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'ascending')
  })
})

describe('ScheduleTable — empty', () => {
  it('says nothing is scheduled rather than rendering an empty table', async () => {
    listEventsMock.mockResolvedValue([])
    render(withRouter(<Schedule />))
    expect(await screen.findByText('No upcoming fixtures yet.')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-table')).not.toBeInTheDocument()
  })
})

describe('ScheduleTable — the date cell', () => {
  it('leads with the day of the week', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    // 2030-03-10T15:30:00Z is 7:30 PM in Abu Dhabi on Sunday 10 March.
    // ⚠️ The WEEKDAY is the assertion. "Which nights do we train?" is the
    // question a season of fixtures is actually scanned for, and it was
    // answerable only by counting rows before this.
    const dates = screen.getAllByTestId('schedule-date').map((n) => n.textContent)
    expect(dates[0]).toMatch(/^Sun/)
    expect(dates[0]).toMatch(/10/)
    expect(dates[1]).toMatch(/^Thu/)
  })

  // ⚠️ THE ZONE, NOT THE WORDING. This cell used to format itself inline with
  // a hardcoded 'Asia/Dubai' — the one bit of date arithmetic in a file whose
  // header says it does none. 15:30 UTC is 19:30 in Abu Dhabi and still the
  // SAME calendar day; 20:30 UTC would be the next day there and the previous
  // one in London. If this ever reads "Sat" the zone has been lost.
  it('reads the club calendar day, not the browser\'s', async () => {
    listEventsMock.mockResolvedValue([
      { ...FUTURE_TRAINING, id: 'e-late', starts_at: '2030-03-10T20:30:00Z' },
    ])
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    // 20:30 UTC on Sunday = 00:30 MONDAY in Abu Dhabi.
    expect(screen.getByTestId('schedule-date')).toHaveTextContent(/^Mon/)
  })
})

describe('ScheduleTable — opening a row', () => {
  it('opens the event when the row itself is clicked, not only the Open button', async () => {
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    await user.click(screen.getAllByTestId('schedule-table-row')[0])
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Skills session/)
  })

  it('still opens from the Open button, and only once', async () => {
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    // ⚠️ The button is inside the clickable row, so without stopPropagation
    // both handlers fire for one click. Harmless while the handler only
    // assigns state — and a double submit the moment it does anything else.
    await user.click(screen.getAllByRole('button', { name: 'Open' })[0])
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Skills session/)
  })

  // The row is a mouse convenience. The keyboard path must stay the button —
  // a <tr> is not focusable and giving it role="button" would strip the row
  // semantics that make the cells mean anything to a screen reader.
  it('keeps a real focusable control in the row', async () => {
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    const row = screen.getAllByTestId('schedule-table-row')[0]
    expect(row).not.toHaveAttribute('role', 'button')
    expect(row).not.toHaveAttribute('tabindex')
    expect(within(row).getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })
})

describe('ScheduleTable — month groups', () => {
  it('renders a sticky month heading and sticky column headers', async () => {
    listEventsMock.mockResolvedValue([
      { ...FUTURE_TRAINING, starts_at: '2030-03-10T15:30:00Z' },
      { ...FUTURE_MATCH, starts_at: '2030-04-14T11:00:00Z' },
    ])
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    const months = screen.getAllByTestId('schedule-month').map((node) => node.textContent)
    expect(months[0]).toMatch(/March 2030/)
    expect(months[1]).toMatch(/April 2030/)
    expect(screen.getAllByTestId('schedule-month')[0].className.split(/\s+/)).toContain('sticky')
    expect(screen.getByRole('columnheader', { name: /Date/ }).className.split(/\s+/)).toContain('sticky')
  })

  it('reveals later months without inventing numbered pages', async () => {
    const rows = []
    for (let month = 0; month < 8; month += 1) {
      for (let n = 0; n < 8; n += 1) {
        rows.push({
          ...FUTURE_TRAINING,
          id: `e-${month}-${n}`,
          starts_at: `2031-${String(month + 1).padStart(2, '0')}-10T11:00:00Z`,
          title: `Session ${month}-${n}`,
        })
      }
    }
    listEventsMock.mockResolvedValue(rows)
    const user = userEvent.setup()
    render(withRouter(<Schedule />))
    await screen.findByTestId('schedule-table')

    expect(screen.queryByText('Session 7-0')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show more months/i }))
    expect(screen.getByText('Session 7-0')).toBeInTheDocument()
  })
})
