import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Task 5 — the format shown on EventDetail, only when it is not 15s.
// claude/plans/2026-09-02-fixture-format.md.
//
// ⚠️ EVENTDETAIL TAKES `event` AS A PROP — THERE IS NO getEvent TO MOCK.
// The brief's decisions called for copying a getEvent-mocking test's mock
// block, but no such test exists in this repo (checked: every
// tests/event-detail*.test.jsx mounts EventDetail directly with an event
// object, same as tests/match-sheets.test.jsx's sheet-side mocks do for a
// different screen). This file is modelled on
// tests/event-detail-diary.test.jsx and tests/event-detail-series.test.jsx
// instead, which mount the real component the same way production does —
// Schedule and the Dashboard both pass `event` straight through.
//
// ⚠️ EVERY EVENT BELOW IS INVENTED. This repo is PUBLIC.

const listAvailabilityMock = vi.fn()

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: () => () => {},
}))

vi.mock('../src/data/events.js', () => ({
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  countSeriesFrom: async () => 0,
}))

// Mocked for the same reason every other EventDetail test mocks it: an
// unmocked module makes a real request and the promise never settles.
vi.mock('../src/data/trainingPlans.js', () => ({
  getSuggestion: async () => null,
  listPendingSuggestions: async () => [],
  decideSuggestion: async () => null,
  getSession: async () => null,
  saveSessionBlocks: async () => {},
  listFocus: async () => [],
  listDrills: async () => [],
  listTemplates: async () => [],
  createSession: async () => ({ id: 's-new' }),
  setSessionVisibility: async () => ({}),
  saveSquadTemplate: async () => ({ id: 'tpl-new' }),
  upsertDrill: async () => ({ id: 'd-new' }),
  submitDrillToClub: async () => ({}),
  submitTemplateToClub: async () => ({}),
}))

import EventDetail from '../src/screens/EventDetail.jsx'

const TEAM_U16 = { id: 't-u16', name: 'U16' }

const MATCH = {
  id: 'e-match',
  team_id: 't-u16',
  type: 'match',
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City',
  pitch: null,
  competition: null,
  competition_type: null,
  // A tournament GAME (not the container) has a tournament_id, so its title
  // stays "Quins vs <opponent>" and does not collapse to the competition
  // name — see eventTitle's tournament-container branch in eventFormat.js.
  // Without this, the fixture below would render "Harness Cup" twice: once
  // as the hero title, once in the Competition row, and findByText would be
  // ambiguous for a reason that has nothing to do with the format row.
  tournament_id: 't-tourney',
  round: null,
  format: null,
  starts_at: '2026-09-11T15:00:00.000Z',
  ends_at: null,
  notes: null,
  series_id: null,
  result_us: null,
  result_them: null,
}

function mountDetail(event) {
  render(
    <EventDetail
      event={event}
      team={TEAM_U16}
      onClose={() => {}}
      canEdit
      onOpenAvailability={vi.fn()}
      onDeleted={() => {}}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listAvailabilityMock.mockResolvedValue([])
})

describe('EventDetail — the format row', () => {
  it('shows "Format 7s" on a 7s fixture and no Format row on a 15s one', async () => {
    mountDetail({ ...MATCH, competition_type: 'tournament', competition: 'Harness Sevens', format: 7 })
    expect(await screen.findByText('7s')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    cleanup()
    mountDetail({ ...MATCH, competition_type: 'tournament', competition: 'Harness Cup', format: null })
    await screen.findByText('Harness Cup')
    expect(screen.queryByText('Format')).toBeNull()
  })
})

describe('EventDetail — the venue is a map link (2 Sep 2026 UX review, parents)', () => {
  it('links the venue to a maps search with the pitch appended, in a new tab', async () => {
    mountDetail({ ...MATCH, venue: 'Zayed Sports City', pitch: 'Pitch 4' })
    const link = await screen.findByTestId('venue-map-link')
    expect(link).toHaveTextContent('Zayed Sports City')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link.getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Zayed%20Sports%20City%20Pitch%204',
    )
  })

  it('"To be confirmed" is plain text, not a link to nowhere', async () => {
    mountDetail({ ...MATCH, venue: null, pitch: null })
    expect(await screen.findByText('To be confirmed')).toBeInTheDocument()
    expect(screen.queryByTestId('venue-map-link')).toBeNull()
  })
})
