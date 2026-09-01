import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Task 7 of claude/plans/2026-08-11-league-teams-implementation.md — the
// fixture's league identity where people actually look at fixtures.
//
// ⚠️ THE POINT OF ONE FORMATTER IS THAT THESE CANNOT DRIFT, so this file
// asserts the SAME two events against every consumer rather than giving each
// screen its own fixture. If one screen ever renders a bare squad name where
// another renders the league identity, one of these fails.
//
// ⚠️ EVERY CASE HERE HAS A CONTROL THAT MUST NOT CHANGE — the friendly. A test
// that only checks the league fixture would pass just as well against a screen
// that had started labelling everything as a league match.

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: async () => ({}),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => ({ memberships: [], teams: [], loading: false, error: null, reload: vi.fn() }),
}))

import FixtureRow from '../src/components/FixtureRow.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'
import { fixtureLabel } from '../src/lib/fixtureLabel.js'

const SQUAD = { id: 't-u14b', name: 'U14B Contact' }

// The same fixture twice, differing only in whether it is a league match.
const base = {
  id: 'e-1',
  club_id: 'c-1',
  team_id: 't-u14b',
  type: 'match',
  title: null,
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City, Abu Dhabi',
  pitch: 'A1',
  competition: null,
  starts_at: '2026-09-12T05:00:00.000Z',
  ends_at: '2026-09-12T06:30:00.000Z',
  result_us: null,
  result_them: null,
}

const LEAGUE_FIXTURE = {
  ...base,
  league_team_id: 'lt-2',
  round: 4,
  league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
}

// ⚠️ THE CONTROL. A friendly: no league team, and a `round` deliberately left
// behind on the row to prove the screens read the TEAM and not the round.
const FRIENDLY = {
  ...base,
  id: 'e-2',
  league_team_id: null,
  round: 4,
  league_team: null,
}

// ⚠️ THE LEAGUE PLACEHOLDER (1 Sep 2026): a known league round whose side,
// tier, ground and opponent are not out yet. It must read as a Round
// placeholder — never as a friendly, and never as "Quins match" against
// nobody. The FRIENDLY above is the control that keeps this honest: it also
// has a stale round and no league team, and it must keep rendering nothing,
// because it has no competition_type.
const PLACEHOLDER = {
  ...base,
  id: 'e-3',
  opponent: null,
  home: null,
  venue: null,
  pitch: null,
  competition_type: 'league',
  round: 1,
  league_team_id: null,
  league_team: null,
  league_team_tbd: true,
  tier: 'TBD',
}

describe('fixtureLabel — the one formatter these screens share', () => {
  it('is what all four consumers are expected to render', () => {
    expect(fixtureLabel(LEAGUE_FIXTURE, LEAGUE_FIXTURE.league_team, SQUAD.name)).toBe(
      'ADHQ2 · Div B · Round 4',
    )
    expect(fixtureLabel(FRIENDLY, FRIENDLY.league_team, SQUAD.name)).toBe('U14B Contact')
  })
})

describe('FixtureRow — the Dashboard and all three Schedule tabs', () => {
  it('shows the league identity on a league fixture', () => {
    render(<FixtureRow event={LEAGUE_FIXTURE} teamName={SQUAD.name} onSelect={vi.fn()} />)
    expect(screen.getByText('ADHQ2 · Div B · Round 4')).toBeInTheDocument()
  })

  it('⚠️ shows the plain squad name on a fixture that is not one', () => {
    // The control. A stale `round` is on this row and must not leak out — there
    // is no league team, so there is no round, whatever the column holds.
    render(<FixtureRow event={FRIENDLY} teamName={SQUAD.name} onSelect={vi.fn()} />)
    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.queryByText(/Round 4/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Div/)).not.toBeInTheDocument()
  })

  it('⚠️ renders ONE chip, not the squad name AND the league team', () => {
    // Both would be honest and both would be clutter, on the app's most-reused
    // row. The formatter returns one string precisely so this is not a choice
    // each caller makes.
    render(<FixtureRow event={LEAGUE_FIXTURE} teamName={SQUAD.name} onSelect={vi.fn()} />)
    expect(screen.queryByText('U14B Contact')).not.toBeInTheDocument()
  })

  it('still renders without a squad name or a league team', () => {
    // teamName is optional on this row and always has been.
    render(<FixtureRow event={FRIENDLY} onSelect={vi.fn()} />)
    expect(screen.getByTestId('fixture-row')).toBeInTheDocument()
  })

  it('⚠️ a league placeholder shows its round WITHOUT a league team', () => {
    // The one fact the league has published is the round; hiding it made a
    // placeholder indistinguishable from a friendly on the list a parent
    // actually reads. Gated on competition_type — the FRIENDLY control above
    // proves a stale round without it still renders nothing.
    render(<FixtureRow event={PLACEHOLDER} teamName={SQUAD.name} onSelect={vi.fn()} />)
    expect(screen.getByText('U14B Contact · Round 1')).toBeInTheDocument()
    // And the bold line is the round, not the useless "Quins match".
    expect(screen.getByTestId('fixture-title')).toHaveTextContent('Round 1')
    expect(screen.queryByText('Quins match')).not.toBeInTheDocument()
  })
})

describe('EventDetail — the sheet', () => {
  const detailProps = { onClose: vi.fn(), onEdit: vi.fn(), onDeleted: vi.fn() }

  it('⚠️ keeps Age group AND adds League team — they are different facts', () => {
    // This is the one screen with room for both: "U14B Contact" is who trains
    // together, "ADHQ2 · Div B · Round 4" is what played.
    render(<EventDetail event={LEAGUE_FIXTURE} team={SQUAD} {...detailProps} />)

    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.getByText('League team')).toBeInTheDocument()
    expect(screen.getByText('ADHQ2 · Div B · Round 4')).toBeInTheDocument()
  })

  it('⚠️ shows NO League team row on a fixture that is not a league match', () => {
    // A row reading "Not set" on every friendly would be noise — the same rule
    // the Pitch row follows.
    render(<EventDetail event={FRIENDLY} team={SQUAD} {...detailProps} />)

    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.queryByText('League team')).not.toBeInTheDocument()
    expect(screen.queryByText(/Round 4/)).not.toBeInTheDocument()
  })

  it('⚠️ a league placeholder says TBD, not nothing and not Away', () => {
    // Three assertions, three lies this sheet used to be capable of: hiding
    // the League team row (reads as a friendly), rendering `home: null` as
    // Away (the old ternary), and hiding the round.
    render(<EventDetail event={PLACEHOLDER} team={SQUAD} {...detailProps} />)

    expect(screen.getByText('League team')).toBeInTheDocument()
    expect(screen.getByText('TBD — not known yet')).toBeInTheDocument()
    expect(screen.getByText(/Home or away TBD/)).toBeInTheDocument()
    expect(screen.queryByText(/Away/)).not.toBeInTheDocument()
    // The Competition row already carried the round; list and detail agree.
    expect(screen.getByText('League · Round 1')).toBeInTheDocument()
  })
})
