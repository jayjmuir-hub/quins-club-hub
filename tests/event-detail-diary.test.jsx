import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Club Diary phase 1, task 7 — claude/plans/2026-08-31-club-diary.md.
//
// An information-only event has nothing to RSVP to, so EventDetail must offer
// no availability at all: not the live summary, and not the "Set my
// availability" button.
//
// ⚠️ THE BUTTON IS SUPPRESSED BY NOT PASSING THE HANDLER'S GUARD, not by
// styling it away. This component has already shipped a defect where a button
// rendered without a handler drew itself, invited a tap, and had the tap
// swallowed by an optional call — silently, for weeks. The rule that came out
// of it is that a screen which cannot service the button shows no button.
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

// Mocked because an unmocked data module makes a real request — the sheet
// mounts SessionPlan on a training event and the promise never settles.
vi.mock('../src/data/trainingPlans.js', () => ({
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

const ORDINARY_SOCIAL = {
  id: 'e-party',
  team_id: 't-u16',
  type: 'social',
  title: 'Welcome back party',
  info_only: false,
  opponent: null,
  home: null,
  venue: 'The clubhouse',
  pitch: null,
  competition: null,
  starts_at: '2026-09-11T15:00:00.000Z',
  ends_at: '2026-09-11T19:00:00.000Z',
  notes: null,
  series_id: null,
  result_us: null,
  result_them: null,
}

const DIARY_ENTRY = { ...ORDINARY_SOCIAL, id: 'e-kit', title: 'Kit collection', info_only: true }

function show(event) {
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

describe('EventDetail for an information-only event', () => {
  it('offers NO availability button, even though a handler was passed', () => {
    show(DIARY_ENTRY)
    expect(screen.queryByRole('button', { name: /availability/i })).not.toBeInTheDocument()
  })

  it('⚠️ still offers it for an ordinary social — the control', () => {
    // Without this, the assertion above would pass just as well if the button
    // had been removed for every event in the app.
    show(ORDINARY_SOCIAL)
    expect(screen.getByRole('button', { name: /availability/i })).toBeInTheDocument()
  })

  it('does not even ask the database for replies', () => {
    // The summary is not merely hidden — it is not mounted, so no query runs.
    // A hidden component that still fetches is a cost with no benefit.
    show(DIARY_ENTRY)
    expect(listAvailabilityMock).not.toHaveBeenCalled()
  })

  it('⚠️ still asks for an ordinary social — the control', () => {
    show(ORDINARY_SOCIAL)
    expect(listAvailabilityMock).toHaveBeenCalled()
  })
})
