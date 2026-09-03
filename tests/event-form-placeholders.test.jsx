import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// League placeholders (Jay, 1 Sep 2026): the league (U11+) publishes ROUNDS
// months before it publishes fixtures, so a known league Saturday whose side,
// tier, ground and opponent are unknown must be sayable without lying.
//
// ⚠️ THE WHOLE FEATURE IS THAT "TBD" AND THE EXISTING EMPTY ANSWERS ARE
// DIFFERENT. "Not a league match" is a friendly; "None — a friendly or
// untiered" is a fixture with no tier; Home/Away were the only two answers a
// ground question could give. Every test here has one of those as its
// control, because the cheapest wrong implementation is to collapse the two.
//
// PROCESS ZONE. America/New_York, same as tests/event-form-league-team.test.jsx:
// this file submits real fixtures, and a zone bug is invisible under a UTC
// runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const insertEventsMock = vi.fn()
const listLeagueTeamsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: (...args) => insertEventsMock(...args),
  deleteEvent: async () => {},
}))

vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))

vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: (...args) => listLeagueTeamsMock(...args),
}))

import EventForm from '../src/screens/EventForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
// ⚠️ The letter is GENDER, not division — U16B is U16 BOYS.
const TEAM_U16B = { id: 't-u16b', club_id: CLUB_ID, name: 'U16B Contact', sort_order: 11 }
const TEAMS = [TEAM_U16B]

const ADHQ1 = { id: 'lt-1', team_id: 't-u16b', rcm_name: 'ADHQ1', division: 'A', is_active: true }
const ADHQ2 = { id: 'lt-2', team_id: 't-u16b', rcm_name: 'ADHQ2', division: 'B', is_active: true }

const ADMIN = [{ id: 'm-a', role: 'admin', admin_rights: ['clubadmin'], status: 'active', team_id: null }]

function renderForm({ event = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  const onSaved = vi.fn()
  render(<EventForm event={event} onClose={vi.fn()} onSaved={onSaved} />)
  return { onSaved, user: userEvent.setup() }
}

/** Date and times only — the placeholder tests leave everything else TBD. */
async function fillWhen(user) {
  const time = document.getElementById('event-time')
  const end = document.getElementById('event-end-time')
  await pickDate(user, '2026-09-12')
  await user.clear(time)
  await user.type(time, '09:00')
  await user.clear(end)
  await user.type(end, '10:30')
}

const submit = (user) => user.click(screen.getByRole('button', { name: /^(save|add event|create)/i }))
const homeGroup = () => screen.getByRole('group', { name: 'Home or away' })

beforeEach(() => {
  vi.clearAllMocks()
  listLeagueTeamsMock.mockImplementation(async ({ teamId } = {}) =>
    teamId === 't-u16b' ? [ADHQ1, ADHQ2] : [],
  )
  upsertEventMock.mockResolvedValue({ id: 'e-new' })
  insertEventsMock.mockResolvedValue([{ id: 'e-new' }])
})

describe('EventForm — the placeholder options are DISTINCT answers', () => {
  it('⚠️ League team offers BOTH "Not a league match" and "TBD — not known yet"', async () => {
    // Merging them is the one implementation this feature forbids: a friendly
    // is not a league placeholder. U16B has ADHQ1/ADHQ2/ADHQ3 — a placeholder
    // means "we don't know which yet", never "this is not league".
    renderForm()

    const select = await screen.findByLabelText(/league team/i)
    expect(within(select).getByText('Not a league match')).toBeInTheDocument()
    expect(within(select).getByText('TBD — not known yet')).toBeInTheDocument()
    // And the default is unchanged — TBD is said on purpose.
    expect(select).toHaveValue('')
  })

  it('⚠️ Tier offers BOTH "None — a friendly or untiered" and TBD', async () => {
    renderForm()

    const select = await screen.findByLabelText(/^tier$/i)
    expect(within(select).getByText('None — a friendly or untiered')).toBeInTheDocument()
    expect(within(select).getByText('TBD — not decided yet')).toBeInTheDocument()
    expect(select).toHaveValue('')
  })

  it('Home or away gains a third option, TBD', async () => {
    renderForm()
    await screen.findByLabelText(/league team/i)

    const group = homeGroup()
    expect(within(group).getByRole('radio', { name: 'Home' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'Away' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'TBD' })).not.toBeChecked()
  })
})

describe('EventForm — saving a league placeholder', () => {
  it('⚠️ saves the full placeholder: round known, everything else honestly TBD', async () => {
    // Jay's "done looks like": Competition League, Round 1, League team TBD,
    // Tier TBD, Home/away TBD, opponent empty — and it SAVES.
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillWhen(user)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'league')
    await user.selectOptions(screen.getByLabelText(/^round$/i), '1')
    await user.selectOptions(screen.getByLabelText(/league team/i), 'tbd')
    await user.selectOptions(screen.getByLabelText(/^tier$/i), 'TBD')
    await user.click(within(homeGroup()).getByRole('radio', { name: 'TBD' }))
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      competition_type: 'league',
      round: 1,
      // ⚠️ THE SENTINEL NEVER REACHES THE FK — TBD is its own column.
      league_team_id: null,
      league_team_tbd: true,
      tier: 'TBD',
      home: null,
      opponent: '',
    })
  })

  it('⚠️ Home/away TBD does not force the venue to Zayed Sports City', async () => {
    // The prefill is cleared only while it is still the untouched default —
    // a typed venue survives (prefill-don't-clobber, the tier rule).
    const { user } = renderForm()
    await screen.findByLabelText(/league team/i)

    expect(screen.getByLabelText(/^venue$/i)).toHaveValue('Zayed Sports City, Abu Dhabi')
    await user.click(within(homeGroup()).getByRole('radio', { name: 'TBD' }))
    expect(screen.getByLabelText(/^venue$/i)).toHaveValue('')

    // Leaving TBD restores the default into the blank it left behind.
    await user.click(within(homeGroup()).getByRole('radio', { name: 'Home' }))
    expect(screen.getByLabelText(/^venue$/i)).toHaveValue('Zayed Sports City, Abu Dhabi')
  })

  it('⚠️ a typed venue is NOT cleared by choosing TBD', async () => {
    const { user } = renderForm()
    await screen.findByLabelText(/league team/i)

    const venue = screen.getByLabelText(/^venue$/i)
    await user.clear(venue)
    await user.type(venue, 'Jebel Ali Centre of Excellence')
    await user.click(within(homeGroup()).getByRole('radio', { name: 'TBD' }))
    expect(venue).toHaveValue('Jebel Ali Centre of Excellence')
  })

  it('⚠️ the opponent is optional for a league fixture…', async () => {
    // "Leave blank until the fixture is out" — the courtesy tournaments
    // already get. No dummy opponent.
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillWhen(user)
    await user.selectOptions(screen.getByLabelText(/^competition$/i), 'league')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
  })

  it('…⚠️ but STILL required for a friendly — the control', async () => {
    // A friendly IS its opponent; nothing else identifies it. This is the
    // assertion that stops "optional for league" decaying into "optional".
    const { user } = renderForm()

    await screen.findByLabelText(/league team/i)
    await fillWhen(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/highlighted fields/i)
    expect(upsertEventMock).not.toHaveBeenCalled()
  })
})

describe('EventForm — a placeholder round-trips and upgrades cleanly', () => {
  const PLACEHOLDER = {
    id: 'e-ph',
    club_id: CLUB_ID,
    team_id: 't-u16b',
    type: 'match',
    title: null,
    opponent: null,
    home: null,
    venue: null,
    pitch: null,
    competition: null,
    competition_type: 'league',
    round: 1,
    league_team_id: null,
    league_team_tbd: true,
    tier: 'TBD',
    starts_at: '2026-09-12T05:00:00.000Z',
    ends_at: '2026-09-12T06:30:00.000Z',
    result_us: null,
    result_them: null,
  }

  it('⚠️ reopens as TBD everywhere, never as "Not a league match" or Home', async () => {
    // league_team_tbd is its own column precisely so the edit form can tell
    // the two apart; and `home: null` reopening as Home would SAVE an answer
    // nobody gave on the next edit.
    renderForm({ event: PLACEHOLDER })

    const select = await screen.findByLabelText(/league team/i)
    await waitFor(() => expect(select).toHaveValue('tbd'))
    expect(screen.getByLabelText(/^tier$/i)).toHaveValue('TBD')
    expect(within(homeGroup()).getByRole('radio', { name: 'TBD' })).toBeChecked()
    expect(within(homeGroup()).getByRole('radio', { name: 'Home' })).not.toBeChecked()
    expect(screen.getByLabelText(/^round$/i)).toHaveValue('1')
  })

  it('⚠️ upgrading to a real side prefills the tier OVER the TBD', async () => {
    // "Editing later to ADHQ1, Home, opponent Exiles does not fight the new
    // defaults" — a TBD tier counts as a blank for the division prefill,
    // unlike a chosen letter, which the prefill has never clobbered.
    const { user } = renderForm({ event: PLACEHOLDER })

    const select = await screen.findByLabelText(/league team/i)
    await waitFor(() => expect(within(select).getByText(/ADHQ2/)).toBeInTheDocument())
    await user.selectOptions(select, 'lt-2')
    expect(screen.getByLabelText(/^tier$/i)).toHaveValue('B')

    await user.click(within(homeGroup()).getByRole('radio', { name: 'Home' }))
    await user.type(screen.getByLabelText(/opponent/i), 'Dubai Exiles')
    await submit(user)

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      league_team_id: 'lt-2',
      league_team_tbd: false,
      tier: 'B',
      home: true,
      opponent: 'Dubai Exiles',
      round: 1,
    })
  })

  it('⚠️ a chosen tier still beats the prefill — the control for the rule above', async () => {
    const { user } = renderForm({ event: { ...PLACEHOLDER, tier: 'A' } })

    const select = await screen.findByLabelText(/league team/i)
    await waitFor(() => expect(within(select).getByText(/ADHQ2/)).toBeInTheDocument())
    await user.selectOptions(select, 'lt-2')
    expect(screen.getByLabelText(/^tier$/i)).toHaveValue('A')
  })
})
