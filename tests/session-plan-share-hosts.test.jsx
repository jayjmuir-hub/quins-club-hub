import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Share is ON SessionPlan, and SessionPlan is mounted from EventDetail and
// Squad Training's sheet. This file proves both hosts get that one control,
// that it is not the event-sheet Edit/Delete footer, and that a parent still
// cannot see a staff-only plan. Spec:
// claude/specs/2026-08-27-session-plan-share.md
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9.

const getSessionMock = vi.fn()
const listFocusMock = vi.fn()
const listAvailabilityMock = vi.fn()
const shareElementAsImageMock = vi.fn()
const listEventsMock = vi.fn()
const listSessionsForEventsMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/trainingPlans.js', () => ({
  getSession: (...args) => getSessionMock(...args),
  saveSessionBlocks: async () => {},
  listFocus: (...args) => listFocusMock(...args),
  listDrills: async () => [],
  listTemplates: async () => [],
  createSession: async () => ({ id: 's-new' }),
  setSessionVisibility: async () => ({}),
  saveSquadTemplate: async () => ({ id: 'tpl-new' }),
  upsertDrill: async () => ({ id: 'd-new' }),
  submitDrillToClub: async () => ({}),
  submitTemplateToClub: async () => ({}),
  listSessionsForEvents: (...args) => listSessionsForEventsMock(...args),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: () => () => {},
}))
vi.mock('../src/data/events.js', () => ({
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  countSeriesFrom: async () => 0,
  listEvents: (...args) => listEventsMock(...args),
}))
vi.mock('../src/lib/shareImage.js', () => ({
  shareElementAsImage: (...args) => shareElementAsImageMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/components/TrainingShelf.jsx', () => ({
  default: () => <div data-testid="training-shelf-stub" />,
}))
vi.mock('../src/components/PitchRequest.jsx', () => ({
  default: () => null,
}))

import EventDetail from '../src/screens/EventDetail.jsx'
import SquadTraining from '../src/screens/SquadTraining.jsx'

const TEAM = { id: 't-u12', name: 'U12 Mixed', club_id: 'club-1', requires_contact: true }
const TRAINING = {
  id: 'e-train-1',
  team_id: 't-u12',
  type: 'training',
  title: 'Tuesday training',
  opponent: null,
  home: null,
  venue: null,
  pitch: null,
  competition: null,
  starts_at: '2099-01-05T15:00:00Z',
  ends_at: null,
  notes: null,
  series_id: null,
  result_us: null,
  result_them: null,
}

const GRID = {
  id: 'd-grid',
  title: 'Grid passing',
  summary: 'Four cones.',
  body: 'Set a fifteen-metre grid.',
  minutes: 15,
  category: 'skill',
}

const SQUAD_SESSION = {
  id: 's-1',
  event_id: 'e-train-1',
  visibility: 'squad',
  notes: 'Wet pitch, keep it tight.',
  coach_edited_at: null,
  blocks: [
    {
      id: 'b-1',
      position: 1,
      drill_id: 'd-grid',
      minutes: 15,
      coach_note: 'Keep the width',
      drill: GRID,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionMock.mockResolvedValue(SQUAD_SESSION)
  listFocusMock.mockResolvedValue([])
  listAvailabilityMock.mockResolvedValue([])
  shareElementAsImageMock.mockResolvedValue('shared')
  listEventsMock.mockResolvedValue([TRAINING])
  listSessionsForEventsMock.mockResolvedValue(
    new Map([['e-train-1', { id: 's-1', blockCount: 1, minutes: 15 }]]),
  )
  useMembershipsMock.mockReturnValue({
    memberships: [{ role: 'coach', team_id: 't-u12', status: 'active' }],
    teams: [TEAM],
    loading: false,
  })
})

describe('EventDetail mounts the same Share control', () => {
  it('puts Share on the Session Plan card, not the Edit/Delete footer', async () => {
    const user = userEvent.setup()
    render(
      <EventDetail event={TRAINING} team={TEAM} onClose={vi.fn()} canEdit onDeleted={vi.fn()} />,
    )
    const share = await screen.findByRole('button', { name: /^share$/i })
    const adjust = screen.getByRole('button', { name: /adjust/i })
    expect(adjust.parentElement).toContainElement(share)

    const edit = screen.getByRole('button', { name: /^edit$/i })
    const footer = edit.parentElement
    expect(within(footer).queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: /^delete$/i })).toBeInTheDocument()

    await user.click(share)
    const [element] = shareElementAsImageMock.mock.calls[0]
    expect(element).toHaveAttribute('data-testid', 'session-plan-capture')
    expect(element.textContent).not.toMatch(/\bEdit\b/)
    expect(element.textContent).not.toMatch(/\bDelete\b/)
    expect(element.textContent).not.toMatch(/Availability/)
  })

  it('a parent still cannot see a staff-only plan — Share is not a back door', async () => {
    getSessionMock.mockResolvedValue(null)
    render(
      <EventDetail event={TRAINING} team={TEAM} onClose={vi.fn()} canEdit={false} />,
    )
    await vi.waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-train-1'))
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Grid passing')).not.toBeInTheDocument()
  })
})

describe('Squad Training sheet mounts the same Share control', () => {
  it('opening tonight’s hour offers Share next to Adjust', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/squad/t-u12/training']}>
        <Routes>
          <Route path="/squad/:teamId/training" element={<SquadTraining />} />
        </Routes>
      </MemoryRouter>,
    )
    const list = await screen.findByTestId('squad-training-list')
    await user.click(within(list).getByText('Tuesday training'))
    const share = await screen.findByRole('button', { name: /^share$/i })
    const adjust = screen.getByRole('button', { name: /adjust/i })
    expect(adjust.parentElement).toContainElement(share)
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })
})
