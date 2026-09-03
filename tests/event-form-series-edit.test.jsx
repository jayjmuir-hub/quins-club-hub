import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ⚠️ REGRESSION TEST FOR "invalid input syntax for type uuid: null" — Jay's
// phone, 29 Aug 2026. Editing a REPEATING event with "apply to this and every
// later session" ticked passed the WRONG series id to updateSeriesFrom: a
// `const seriesId` inside handleSubmit (the CREATE path's new id, which is null
// when editing because `repeating` is `!editing`) SHADOWED the component-scope
// `event.series_id`. updateSeriesFrom(null, …) then filtered `series_id=eq.null`,
// which PostgREST casts to uuid and rejects — every series edit failed.
//
// tests/series-edit.test.js could not catch this: it calls updateSeriesFrom
// directly with an explicit id and never exercises the form's submit. This
// drives the real form, which is where the shadow lived.
//
// PROCESS ZONE, like the other EventForm files: a club-zone bug is invisible
// under a UTC runner, so this submits under America/New_York — four hours the
// other side of UTC from Abu Dhabi.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const updateSeriesFromMock = vi.fn()
const setSeriesTimeFromMock = vi.fn()
const upsertEventMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  updateSeriesFrom: (...args) => updateSeriesFromMock(...args),
  setSeriesTimeFrom: (...args) => setSeriesTimeFromMock(...args),
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

// A real repeating occurrence: a training carrying a series_id, mid-term.
// 14:00Z is 18:00 Abu Dhabi (the form's club wall clock), so leaving the time
// untouched means setSeriesTimeFrom is NOT called — exactly the path that broke.
const SERIES_EVENT = {
  id: 'e-42',
  series_id: 'series-9f3a-4c2e',
  team_id: 't-u14b',
  club_id: CLUB_ID,
  type: 'training',
  title: 'U14 Training',
  starts_at: '2026-09-01T14:00:00.000Z',
  ends_at: '2026-09-01T15:00:00.000Z',
  venue: 'Zayed Sports City',
  pitch: 'Pitch TBD',
  time_tbd: false,
}

function renderForm(event) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  updateSeriesFromMock.mockResolvedValue([{ id: 'e-42' }])
  setSeriesTimeFromMock.mockResolvedValue([{ id: 'e-42' }])
})

describe('EventForm — editing a repeating event applies to the series', () => {
  it('⚠️ passes the event’s real series_id to updateSeriesFrom, never null', async () => {
    const user = renderForm(SERIES_EVENT)

    // Rename the session (the exact thing Jay was doing) and opt into the series.
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'U14 Skills')
    await user.click(
      screen.getByRole('checkbox', { name: /apply to this and every later session/i }),
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateSeriesFromMock).toHaveBeenCalledTimes(1))
    const [seriesId, from, patch] = updateSeriesFromMock.mock.calls[0]
    // ⚠️ THE REGRESSION. A shadowed `seriesId` sent null here, which PostgREST
    // casts to uuid: "invalid input syntax for type uuid: null".
    expect(seriesId).toBe('series-9f3a-4c2e')
    expect(from).toBe('2026-09-01T14:00:00.000Z')
    expect(patch).toMatchObject({ title: 'U14 Skills' })
    // The time was not touched, so the time move must NOT fire.
    expect(setSeriesTimeFromMock).not.toHaveBeenCalled()
  })
})
