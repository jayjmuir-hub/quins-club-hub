import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A score with components behind it is DERIVED, and EventForm must say so.
// Plan: claude/plans/2026-08-12-scoring-model.md.
//
// ⚠️ THE BUG THIS PINS IS INVISIBLE, WHICH IS WHY IT NEEDS A TEST. Since
// 12 Aug 2026 result_us / result_them are computed by a database trigger from
// the tries, conversions, penalties and drop goals on the fixture. An UPDATE
// from this form does not send those components, so the trigger recomputes from
// the ones already stored and OVERWRITES whatever was typed — correctly, and
// with no error anywhere. Left as plain inputs, a coach types 30-0, presses
// Save, and watches it come back 22-12 with nothing explaining why.
//
// PROCESS ZONE, same as the other EventForm files.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: async () => ({ id: 'e-1' }),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
  updateSeriesFrom: async () => {},
  setSeriesTimeFrom: async () => {},
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async () => [],
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9 }
const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

const PLAYED = {
  id: 'e-1',
  club_id: CLUB_ID,
  team_id: 't-u14b',
  type: 'match',
  opponent: 'Dubai Exiles',
  home: true,
  starts_at: '2026-09-12T05:00:00.000Z',
  ends_at: '2026-09-12T06:30:00.000Z',
  result_us: 22,
  result_them: 12,
}

function renderForm({ event = null, duplicate = false } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm event={event} duplicate={duplicate} onClose={vi.fn()} onSaved={vi.fn()} />)
  return { user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventForm — a score that is derived', () => {
  it('stays typeable when the fixture has no components', async () => {
    // The ordinary case, and the one that must not regress: a friendly whose
    // score somebody just wants to record.
    renderForm({ event: PLAYED })
    const ours = await screen.findByLabelText(/quins score/i)
    expect(ours).not.toHaveAttribute('readonly')
    expect(screen.getByText(/leave the scores blank until the match/i)).toBeInTheDocument()
  })

  it('⚠️ goes read-only the moment ONE component exists', async () => {
    renderForm({ event: { ...PLAYED, tries_us: 4, conversions_us: 1 } })
    expect(await screen.findByLabelText(/quins score/i)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/opposition score/i)).toHaveAttribute('readonly')
    expect(screen.getByText(/worked out from the tries and kicks/i)).toBeInTheDocument()
  })

  it("⚠️ fires on the OPPOSITION's components too, not only ours", async () => {
    // The trigger's guard is per SIDE, and a fixture where only the opposition
    // has been recorded is the normal case at half-time. Reading only `_us`
    // would leave the boxes typeable while the trigger still overwrote them.
    renderForm({ event: { ...PLAYED, tries_them: 2 } })
    expect(await screen.findByLabelText(/quins score/i)).toHaveAttribute('readonly')
  })

  it('⚠️ a recorded ZERO counts as a component', async () => {
    // 0 penalties is a fact somebody recorded; only null is "not recorded".
    // Reading zero as absent would hand back typeable boxes the trigger
    // overwrites.
    renderForm({ event: { ...PLAYED, penalties_us: 0 } })
    expect(await screen.findByLabelText(/quins score/i)).toHaveAttribute('readonly')
  })

  it('⚠️ a DUPLICATE is typeable, components or not', async () => {
    // Duplicating a played match clears the score, and the new fixture has no
    // components of its own — so locking the boxes would leave a coach unable
    // to record the return fixture at all.
    renderForm({ event: { ...PLAYED, tries_us: 4 }, duplicate: true })
    expect(await screen.findByLabelText(/quins score/i)).not.toHaveAttribute('readonly')
  })
})
