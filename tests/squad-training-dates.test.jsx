import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The path Jay taps: /squad/:teamId/training, two-week date strip above the
// Spotify chips, chips apply to the SELECTED night.
// Spec: claude/specs/2026-08-27-training-date-strip.md
//
// ⚠️ EVERY NAME IS INVENTED. CLAUDE.md rule 9.

const listEventsMock = vi.fn()
const listSessionsForEventsMock = vi.fn()
const useMembershipsMock = vi.fn()
const listTemplatesMock = vi.fn()
const listDrillsMock = vi.fn()
const getSessionMock = vi.fn()
const applyChipHourMock = vi.fn()
const appendDrillsToSessionMock = vi.fn()
const listLikesMock = vi.fn()
const listCoachNamesMock = vi.fn()
const listRecentTrainingUsageMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
}))
vi.mock('../src/data/trainingPlans.js', () => ({
  getSuggestion: async () => null,
  listPendingSuggestions: async () => [],
  decideSuggestion: async () => null,
  listSessionsForEvents: (...args) => listSessionsForEventsMock(...args),
  listTemplates: (...args) => listTemplatesMock(...args),
  listDrills: (...args) => listDrillsMock(...args),
  getSession: (...args) => getSessionMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'p-manager' } }),
}))
vi.mock('../src/components/SessionPlan.jsx', () => ({
  default: ({ event }) => <div data-testid="session-plan-stub">plan for {event.id}</div>,
}))
vi.mock('../src/data/trainingShelf.js', () => ({
  applyChipHour: (...args) => applyChipHourMock(...args),
  appendDrillsToSession: (...args) => appendDrillsToSessionMock(...args),
  listLikes: (...args) => listLikesMock(...args),
  listCoachNames: (...args) => listCoachNamesMock(...args),
  listRecentTrainingUsage: (...args) => listRecentTrainingUsageMock(...args),
  toggleDrillLike: vi.fn(),
  toggleDrillFavorite: vi.fn(),
  toggleTemplateLike: vi.fn(),
  toggleTemplateFavorite: vi.fn(),
  likeCounts: () => new Map(),
  idsForProfile: () => new Set(),
  usedThisWeekById: () => 0,
}))

import SquadTraining from '../src/screens/SquadTraining.jsx'

const TEAM = { id: 't-u16b', name: 'U16B', requires_contact: true, club_id: 'club-1' }
const STAFF = [{ role: 'manager', team_id: 't-u16b', status: 'active' }]

const PASSING = {
  id: 'tpl-pass',
  name: 'Passing hour',
  chip_label: 'Passing',
  requires_contact: true,
  min_age: 16,
  max_age: 18,
  total_minutes: 60,
  created_by: null,
  blocks: [{ position: 1, drill_id: 'd-act', minutes: 15, coach_note: null, drill: { title: 'Activate' } }],
}

const TUE = {
  id: 'e-tue-1',
  team_id: 't-u16b',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2026-09-01T14:00:00Z',
}
const SAT = {
  id: 'e-sat-5',
  team_id: 't-u16b',
  type: 'training',
  title: 'Saturday training',
  starts_at: '2026-09-05T14:00:00Z',
  pitch: 'D1',
}
const TUE_8 = {
  id: 'e-tue-8',
  team_id: 't-u16b',
  type: 'training',
  title: 'Later Tuesday',
  starts_at: '2026-09-08T14:00:00Z',
}
const FAR = {
  id: 'e-far',
  team_id: 't-u16b',
  type: 'training',
  title: 'September 22nd',
  starts_at: '2026-09-22T14:00:00Z',
}

function renderTraining() {
  return render(
    <MemoryRouter initialEntries={['/squad/t-u16b/training']}>
      <Routes>
        <Route path="/squad/:teamId/training" element={<SquadTraining />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date('2026-09-01T10:00:00Z'), toFake: ['Date'] })
  useMembershipsMock.mockReturnValue({ memberships: STAFF, teams: [TEAM], loading: false })
  listEventsMock.mockResolvedValue([TUE, SAT, TUE_8, FAR])
  listSessionsForEventsMock.mockResolvedValue(
    new Map([
      ['e-sat-5', { id: 's-sat', blockCount: 5, minutes: 60, visibility: 'staff' }],
    ]),
  )
  listTemplatesMock.mockResolvedValue([PASSING])
  listDrillsMock.mockResolvedValue([])
  getSessionMock.mockResolvedValue(null)
  applyChipHourMock.mockResolvedValue({ applied: true, needsConfirm: false })
  appendDrillsToSessionMock.mockResolvedValue({})
  listLikesMock.mockResolvedValue([])
  listCoachNamesMock.mockResolvedValue(new Map())
  listRecentTrainingUsageMock.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('two-week date strip on Squad Training', () => {
  it('shows only this squad’s training nights in the next two weeks, with no photos', async () => {
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    const chips = within(strip).getAllByRole('button')
    expect(chips.map((el) => el.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Tue 1 Sep/), expect.stringMatching(/Sat 5 Sep/)]),
    )
    expect(within(strip).queryByText(/September 22nd/)).not.toBeInTheDocument()
    expect(within(strip).queryByRole('img')).not.toBeInTheDocument()
    expect(strip.textContent).not.toMatch(/player|FaceStack/i)
  })

  it('default-selects tonight when this squad trains today', async () => {
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    const tonight = within(strip).getByRole('button', { name: /Tue 1 Sep/i })
    expect(tonight).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByTestId('training-date-summary')).toHaveTextContent(
      /Tue 1 Sep · nothing published yet/i,
    )
  })

  it('default-selects the next upcoming night when there is no training tonight', async () => {
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'))
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    expect(within(strip).getByRole('button', { name: /Sat 5 Sep/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(strip).queryByRole('button', { name: /Tue 1 Sep/i })).not.toBeInTheDocument()
  })

  it('tapping a future night applies the shelf chips to that event, not tonight', async () => {
    const user = userEvent.setup()
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    await user.click(within(strip).getByRole('button', { name: /Sat 5 Sep/i }))
    expect(await screen.findByTestId('training-date-summary')).toHaveTextContent(
      /Sat 5 Sep · published to staff · D1 booked/i,
    )
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-sat-5'))
    const passing = await screen.findByRole('button', { name: /^Passing$/i })
    expect(passing).not.toBeDisabled()
    await user.click(passing)
    await waitFor(() => expect(applyChipHourMock).toHaveBeenCalled())
    expect(applyChipHourMock.mock.calls[0][0].eventId).toBe('e-sat-5')
  })

  it('each night has an Open control that opens that session’s plan; a tap only selects', async () => {
    const user = userEvent.setup()
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    // Tapping the pill selects it for the shelf — it must NOT pop the plan open.
    await user.click(within(strip).getByRole('button', { name: /Sat 5 Sep/i }))
    expect(screen.queryByTestId('session-plan-stub')).toBeNull()
    // The dedicated Open control opens THAT session's plan.
    await user.click(within(strip).getByTestId('open-plan-e-sat-5'))
    expect(await screen.findByTestId('session-plan-stub')).toHaveTextContent('plan for e-sat-5')
  })

  it('after applying a chip and reloading, Tuesday reads Staff not Draft', async () => {
    const user = userEvent.setup()
    listSessionsForEventsMock.mockResolvedValue(new Map())
    applyChipHourMock.mockImplementation(async () => {
      listSessionsForEventsMock.mockResolvedValue(
        new Map([
          ['e-tue-1', { id: 's-tue', blockCount: 4, minutes: 60, visibility: 'staff' }],
        ]),
      )
      return { applied: true, needsConfirm: false }
    })
    renderTraining()
    const strip = await screen.findByTestId('training-date-strip')
    expect(within(strip).getByRole('button', { name: /Tue 1 Sep/i })).toHaveAccessibleName(/Empty/)
    await user.click(await screen.findByRole('button', { name: /^Passing$/i }))
    await waitFor(() => expect(applyChipHourMock).toHaveBeenCalled())
    await waitFor(() => {
      expect(
        within(screen.getByTestId('training-date-strip')).getByRole('button', { name: /Tue 1 Sep/i }),
      ).toHaveAccessibleName(/Staff/)
    })
    expect(
      within(screen.getByTestId('training-date-strip')).getByRole('button', { name: /Tue 1 Sep/i }).textContent,
    ).not.toMatch(/Draft/)
  })

  it('an empty window shows an empty strip and leaves chips disabled', async () => {
    listEventsMock.mockResolvedValue([FAR])
    listSessionsForEventsMock.mockResolvedValue(new Map())
    renderTraining()
    expect(await screen.findByTestId('training-date-strip-empty')).toHaveTextContent(
      /no training nights in the next two weeks/i,
    )
    expect(screen.queryByTestId('training-date-strip')).not.toBeInTheDocument()
    const chips = await screen.findByTestId('focus-chips')
    const passing = within(chips).queryByRole('button', { name: /^Passing$/i })
    if (passing) expect(passing).toBeDisabled()
  })
})
