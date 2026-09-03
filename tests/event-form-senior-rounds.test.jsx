import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The 2026–27 senior schedules (3 Sep 2026): the West Asia Premiership is
// eighteen rounds and none of the senior leagues numbers from nought, so a
// SENIOR squad's Round select runs 1–18 and its Tier select offers the named
// competitions. A junior squad keeps 0–8 and the letters — the control.
//
// PROCESS ZONE, same as every other EventForm file.
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
  updateSeriesFrom: async () => {},
  setSeriesTimeFrom: async () => {},
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async ({ teamId } = {}) =>
    teamId === 't-men1'
      ? [{ id: 'lt-wap', team_id: 't-men1', rcm_name: 'ADH', division: 'WAP', is_active: true }]
      : [],
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
// ⚠️ is_senior is a COLUMN. The junior squad is named without the word and the
// senior one is flagged by the column, so a name-sniffing regression would
// fail both assertions rather than pass by accident.
const JUNIOR = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9, is_senior: false }
const SENIOR = { id: 't-men1', club_id: CLUB_ID, name: 'Senior Men - 1st XV', sort_order: 16, is_senior: true }
const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

function renderForm(teams) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm onClose={vi.fn()} onSaved={vi.fn()} />)
  return userEvent.setup()
}

const optionValues = (select) => [...select.options].map((option) => option.value)

beforeEach(() => vi.clearAllMocks())

describe('EventForm — senior squads', () => {
  it('offers Round 1 through Round 18 to a senior squad', async () => {
    const user = renderForm([SENIOR])
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    const values = optionValues(screen.getByLabelText('Round'))
    expect(values).toEqual(['', ...Array.from({ length: 18 }, (_, i) => String(i + 1))])
  })

  it('CONTROL: a junior squad still gets Round 0 through Round 8', async () => {
    const user = renderForm([JUNIOR])
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    expect(optionValues(screen.getByLabelText('Round'))).toEqual([
      '', '0', '1', '2', '3', '4', '5', '6', '7', '8',
    ])
  })

  it('names the senior division on the league-team option and prefills the tier with its code', async () => {
    const user = renderForm([SENIOR])
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    const leagueTeam = await screen.findByLabelText(/league team/i)
    await waitFor(() =>
      expect(within(leagueTeam).getByText('ADH — Premiership')).toBeInTheDocument(),
    )
    await user.selectOptions(leagueTeam, 'lt-wap')
    const tier = screen.getByLabelText('Tier')
    expect(tier.value).toBe('WAP')
    // The senior tier list, by name; no junior letter on it.
    expect(optionValues(tier)).toEqual(['', 'TBD', 'WAP', 'D1', 'D2', 'W7s', 'WXV'])
    expect(within(tier).getByText('West Asia Premiership')).toBeInTheDocument()
  })

  it('CONTROL: a junior squad’s tier list is still A, B, C', async () => {
    const user = renderForm([JUNIOR])
    await user.selectOptions(screen.getByLabelText('Competition'), 'league')
    expect(optionValues(screen.getByLabelText('Tier'))).toEqual(['', 'TBD', 'A', 'B', 'C'])
  })
})
