import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

// Squad Hub event-detail sheet: Edit must open the same EventForm Full
// schedule uses; Delete must not render here (calendar delete stays on
// Full schedule). Invented fixture names only.

const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityForEventsMock = vi.fn()
const listAttendanceForEventsMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const listNoticesMock = vi.fn()
const listMyReadsMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  upsertEvent: async () => ({ id: 'e-saved' }),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  countSeriesFrom: async () => 0,
  updateSeriesFrom: async () => [],
  setSeriesTimeFrom: async () => [],
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  listAvailabilityForEvents: (...args) => listAvailabilityForEventsMock(...args),
  subscribeAvailability: () => () => {},
}))
vi.mock('../src/data/attendance.js', () => ({
  listAttendanceForEvents: (...args) => listAttendanceForEventsMock(...args),
}))
vi.mock('../src/data/matchSheets.js', () => ({
  listMatchSheetsFor: (...args) => listMatchSheetsForMock(...args),
}))
vi.mock('../src/data/announcements.js', () => ({
  listNotices: (...args) => listNoticesMock(...args),
  listMyReads: (...args) => listMyReadsMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
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
vi.mock('../src/data/pitchRequests.js', () => ({
  REQUEST_STATUSES: ['submitted', 'allocated', 'declined', 'cancelled'],
  isOpen: () => false,
  listPitchRequests: async () => [],
  requestPitch: async () => ({}),
  allocatePitch: async () => ({}),
  declinePitch: async () => ({}),
  withdrawRequest: async () => ({}),
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async () => [],
}))
vi.mock('../src/data/messages.js', () => ({
  getEventThread: async () => null,
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
}))

import SquadHub from '../src/screens/SquadHub.jsx'

const TEAM_U12 = { id: 't-u12', name: 'U12 Mixed', sort_order: 3 }

const FUTURE_TRAINING = {
  id: 'e-next',
  team_id: 't-u12',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2099-01-05T15:00:00Z',
  ends_at: '2099-01-05T16:00:00Z',
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/squad/t-u12']}>
      <Routes>
        <Route path="/squad/:teamId" element={<SquadHub />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({
    memberships: [{ role: 'coach', team_id: 't-u12', status: 'active' }],
    teams: [TEAM_U12],
    loading: false,
  })
  listEventsMock.mockResolvedValue([FUTURE_TRAINING])
  listPlayersMock.mockResolvedValue([
    { id: 'p-mira', full_name: 'Mira Calder', team_id: 't-u12' },
  ])
  listAvailabilityForEventsMock.mockResolvedValue([])
  listAttendanceForEventsMock.mockResolvedValue([])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  listNoticesMock.mockResolvedValue([])
  listMyReadsMock.mockResolvedValue([])
})

async function openComingUp(user) {
  renderHub()
  await user.click(await screen.findByRole('button', { name: /Tuesday training/ }))
  return screen.getByRole('dialog')
}

describe('Squad Hub event sheet — Edit, Duplicate and Delete', () => {
  it('offers Edit and Duplicate to a coach, and does not offer Delete', async () => {
    const user = userEvent.setup()
    const dialog = await openComingUp(user)
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('opens the same EventForm Full schedule uses, prefilled from the event', async () => {
    const user = userEvent.setup()
    const dialog = await openComingUp(user)
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Tuesday training')
  })

  it('⚠️ Duplicate opens the form in duplicate mode, not edit', async () => {
    // The whole point of adding it here: a coach can re-run a session from
    // their own squad page. Duplicate mode is a CREATE — the sheet says
    // "Duplicate event", the details carry, and (per the duplicate rules) the
    // pitch resets to Pitch TBD. Editing in place is the other test above.
    const user = userEvent.setup()
    const dialog = await openComingUp(user)
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate' }))

    expect(await screen.findByRole('heading', { name: 'Duplicate event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Tuesday training')
  })

  it('⚠️ passes onEdit and onDuplicate, withholds onDeleted — calendar delete stays on Full schedule', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'screens', 'SquadHub.jsx'), 'utf8')
    expect(source, 'SquadHub must pass onEdit to EventDetail').toMatch(
      /onEdit=\{\(event\) => setFormState\(\{ event \}\)\}/,
    )
    expect(source, 'SquadHub must pass onDuplicate to EventDetail').toMatch(
      /onDuplicate=\{\(event\) => setFormState\(\{ event, duplicate: true \}\)\}/,
    )
    expect(source, 'SquadHub must pass the duplicate flag through to EventForm').toMatch(
      /duplicate=\{formState\.duplicate \?\? false\}/,
    )
    expect(source, 'SquadHub must not pass onDeleted to EventDetail').not.toMatch(/onDeleted=/)
    expect(source, 'SquadHub must mount EventForm from that handler').toMatch(/<EventForm/)
  })
})

describe('Full schedule still wires both Edit and Delete', () => {
  it('⚠️ Schedule still passes onEdit and onDeleted', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'screens', 'Schedule.jsx'), 'utf8')
    expect(source).toMatch(/onEdit=\{\(event\) => setFormState\(\{ event \}\)\}/)
    expect(source).toMatch(/onDeleted=\{\(\) => \{/)
  })
})
