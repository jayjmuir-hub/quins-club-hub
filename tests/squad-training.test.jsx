import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// /squad/:teamId/training — the squad-level Training Plans read
// (option b of the 22 Aug ideas list).
//
// ⚠️ WHAT MATTERS HERE:
//   - the gate is "not your squad", same as the hub and the picker;
//   - only UPCOMING TRAINING lists — matches and past sessions never do;
//   - the "Planned · N blocks · M min" badge discriminates per session;
//   - a plan-read failure costs the badges, never the session list;
//   - opening a row hands the SAME event to SessionPlan (one renderer of a
//     plan, everywhere), with the no-plan fallback line when nothing is
//     published.

const listEventsMock = vi.fn()
const listSessionsForEventsMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
}))
vi.mock('../src/data/trainingPlans.js', () => ({
  listSessionsForEvents: (...args) => listSessionsForEventsMock(...args),
}))
vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
// The plan's own rendering (drills, focus, coach editing) is SessionPlan's
// suite's job — tests/session-plan.test.jsx. Here only the wiring matters.
vi.mock('../src/components/SessionPlan.jsx', () => ({
  default: ({ event, canEdit }) => (
    <div data-testid="session-plan-stub">
      plan for {event.id} · canEdit {String(canEdit)}
    </div>
  ),
}))
vi.mock('../src/components/TrainingShelf.jsx', () => ({
  default: () => <div data-testid="training-shelf-stub" />,
}))

import SquadTraining from '../src/screens/SquadTraining.jsx'

const TEAMS = [{ id: 't-u12', name: 'U12 Mixed', sort_order: 3 }]

const TRAINING_PLANNED = {
  id: 'e-t1',
  team_id: 't-u12',
  type: 'training',
  title: 'Tuesday training',
  starts_at: '2099-01-05T15:00:00Z',
}
const TRAINING_UNPLANNED = {
  id: 'e-t2',
  team_id: 't-u12',
  type: 'training',
  title: 'Thursday training',
  starts_at: '2099-01-07T15:00:00Z',
}
const PAST_TRAINING = {
  id: 'e-past',
  team_id: 't-u12',
  type: 'training',
  title: 'Old session',
  starts_at: '2026-08-01T15:00:00Z',
}
const FUTURE_MATCH = {
  id: 'e-match',
  team_id: 't-u12',
  type: 'match',
  opponent: 'Dubai Falcons',
  starts_at: '2099-01-09T08:00:00Z',
}

function renderAt(path = '/squad/t-u12/training') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/squad/:teamId/training" element={<SquadTraining />} />
      </Routes>
    </MemoryRouter>,
  )
}

const COACH = [{ role: 'coach', team_id: 't-u12', status: 'active' }]

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue({ memberships: COACH, teams: TEAMS, loading: false })
  listEventsMock.mockResolvedValue([TRAINING_PLANNED, TRAINING_UNPLANNED, PAST_TRAINING, FUTURE_MATCH])
  listSessionsForEventsMock.mockResolvedValue(
    new Map([['e-t1', { id: 's1', blockCount: 5, minutes: 60 }]]),
  )
})

describe('the gate', () => {
  it('turns a parent-only account away with "not your squad"', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ role: 'parent', team_id: 't-u12', status: 'active', player_id: 'p1' }],
      teams: TEAMS,
      loading: false,
    })
    renderAt()
    expect(await screen.findByText(/isn't one of your squads/i)).toBeInTheDocument()
    expect(listEventsMock).not.toHaveBeenCalled()
  })
})

describe('the list', () => {
  it('shows upcoming training only — no matches, no past sessions', async () => {
    renderAt()
    const list = await screen.findByTestId('squad-training-list')
    expect(within(list).getByText('Tuesday training')).toBeInTheDocument()
    expect(within(list).getByText('Thursday training')).toBeInTheDocument()
    expect(within(list).queryByText('Old session')).not.toBeInTheDocument()
    expect(within(list).queryByText(/Dubai Falcons/)).not.toBeInTheDocument()
  })

  it('badges the planned session with its size and the other with "No plan yet"', async () => {
    renderAt()
    const list = await screen.findByTestId('squad-training-list')
    const [planned, unplanned] = within(list).getAllByRole('listitem')
    expect(within(planned).getByText(/Planned · 5 blocks · 60 min/)).toBeInTheDocument()
    expect(within(unplanned).getByText(/No plan yet/)).toBeInTheDocument()
  })

  it('a plan-read failure costs the badges, not the session list', async () => {
    listSessionsForEventsMock.mockRejectedValue(new Error('nope'))
    renderAt()
    const list = await screen.findByTestId('squad-training-list')
    expect(within(list).getByText('Tuesday training')).toBeInTheDocument()
    expect(within(list).queryByText(/Planned ·/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says plans hang off sessions when no training is coming up', async () => {
    listEventsMock.mockResolvedValue([PAST_TRAINING, FUTURE_MATCH])
    renderAt()
    expect(await screen.findByText(/No upcoming training/i)).toBeInTheDocument()
  })
})

describe('the sheet', () => {
  it('opening a planned row renders SessionPlan for that event, editable', async () => {
    const user = userEvent.setup()
    renderAt()
    const list = await screen.findByTestId('squad-training-list')
    await user.click(within(list).getByText('Tuesday training'))
    expect(screen.getByTestId('session-plan-stub')).toHaveTextContent('plan for e-t1 · canEdit true')
    expect(screen.queryByText(/No plan published/i)).not.toBeInTheDocument()
  })

  it('opening an unplanned row says so instead of an empty sheet', async () => {
    const user = userEvent.setup()
    renderAt()
    const list = await screen.findByTestId('squad-training-list')
    await user.click(within(list).getByText('Thursday training'))
    expect(screen.getByText(/No plan published for this session yet/i)).toBeInTheDocument()
    // SessionPlan still mounts — it may have a fortnight focus to show even
    // with no published session.
    expect(screen.getByTestId('session-plan-stub')).toHaveTextContent('plan for e-t2')
  })
})
