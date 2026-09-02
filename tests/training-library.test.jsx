import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Library tab of the Rugby Performance Director portal — the drill library.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 6).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ NOTHING HERE IS SECURITY. The `training` right gates the SCREEN, not the
// data — RLS on public.drills is what actually decides. What is pinned below is
// the set of things a plausible tidy-up would break:
//   - the gate does not merely HIDE the list, it never asks for it;
//   - a blank age box saves NULL, never 0 and never '' (the fault injected to
//     prove that test, see the task-6 report);
//   - the screen offers Retire and has no Delete anywhere, because
//     session_template_blocks.drill_id is ON DELETE RESTRICT and a deleted
//     drill would take a published session's history with it.
//
// ⚠️ EVERY NAME AND ADDRESS IN THIS FILE IS INVENTED. CLAUDE.md rule 9 — the
// repo is public and the club's members are mostly children.

const useMembershipsMock = vi.fn()
const listDrillsMock = vi.fn()
const upsertDrillMock = vi.fn()
const setDrillActiveMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL REQUEST. CI sets
// placeholder Supabase env vars, so the client constructs happily, the promise
// never settles, and the screen sits in `loading` forever — with an error that
// names nothing. The long-form reasoning is in src/test/setup.js.
const listSubmittedDrillsMock = vi.fn(async () => [])
const approveDrillToClubMock = vi.fn(async () => ({}))
const dismissDrillSubmissionMock = vi.fn(async () => ({}))
vi.mock('../src/data/trainingPlans.js', () => ({
  getSuggestion: async () => null,
  listPendingSuggestions: async () => [],
  decideSuggestion: async () => null,
  listDrills: (...args) => listDrillsMock(...args),
  upsertDrill: (...args) => upsertDrillMock(...args),
  setDrillActive: (...args) => setDrillActiveMock(...args),
  listSubmittedDrills: (...args) => listSubmittedDrillsMock(...args),
  approveDrillToClub: (...args) => approveDrillToClubMock(...args),
  dismissDrillSubmission: (...args) => dismissDrillSubmissionMock(...args),
}))

import TrainingLibrary from '../src/screens/TrainingLibrary.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [{ id: 'team-u10', club_id: CLUB, name: 'U10 Mixed Contact', sort_order: 1 }]

/** ⚠️ `status: 'active'` is load-bearing — adminRights() skips anything else. */
function admin(rights = ['training']) {
  return [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB, admin_rights: rights }]
}

function memberships(rows) {
  return {
    memberships: rows,
    realMemberships: rows,
    teams: TEAMS,
    viewAs: null,
    setViewAs: vi.fn(),
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

// Invented drills. The SHAPES are the real ones: a banded tag drill, an
// open-topped contact drill, and a retired one.
const RUCK_RACE = {
  id: 'drill-1',
  club_id: CLUB,
  title: 'Ruck race',
  summary: 'Two lines, one ball, first to seal it.',
  body: 'Split the squad into two lines…',
  source_name: null,
  source_url: null,
  diagram_url: 'https://example.org/diagrams/ruck-race.svg',
  minutes: 10,
  category: 'game',
  requires_contact: false,
  min_age: 9,
  max_age: 13,
  is_active: true,
}
const CHOP_LADDER = {
  id: 'drill-2',
  club_id: CLUB,
  title: 'Chop tackle ladder',
  summary: 'Low, cheek to cheek, drive.',
  body: 'Four cones, four metres apart…',
  source_name: 'Coaching notes',
  source_url: 'https://example.com/chop',
  minutes: 15,
  category: 'skill',
  requires_contact: true,
  min_age: 13,
  max_age: null,
  is_active: true,
}
const OLD_WARMUP = {
  id: 'drill-3',
  club_id: CLUB,
  title: 'Old bulldog warm-up',
  summary: null,
  body: null,
  source_name: null,
  source_url: null,
  minutes: 8,
  category: 'warm_up',
  requires_contact: false,
  min_age: null,
  max_age: null,
  is_active: false,
}

function renderLibrary(rows = admin()) {
  const user = userEvent.setup()
  useMembershipsMock.mockReturnValue(memberships(rows))
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TrainingLibrary />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.clearAllMocks()
  // The default read: active drills only.
  listDrillsMock.mockImplementation(async ({ includeRetired } = {}) =>
    includeRetired ? [CHOP_LADDER, OLD_WARMUP, RUCK_RACE] : [CHOP_LADDER, RUCK_RACE],
  )
  upsertDrillMock.mockImplementation(async (drill) => ({ id: 'drill-new', ...drill }))
  setDrillActiveMock.mockImplementation(async (id, active) => ({ id, is_active: active }))
})

describe('TrainingLibrary', () => {
  it('shows the not-your-job card without the training right', async () => {
    renderLibrary(admin([]))

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Rugby Performance Director hasn.t been added/,
    )
    // ⚠️ THE STRONGER HALF OF THE ASSERTION. Rendering the list and hiding it
    // would satisfy the card check above and still fetch the club's library for
    // somebody without the job. The gate must not even ask.
    expect(listDrillsMock).not.toHaveBeenCalled()
  })

  it('lists drills with category and band, and filters by contact', async () => {
    const { user } = renderLibrary()

    const ruck = await screen.findByTestId('drill-drill-1')
    expect(within(ruck).getByText('Game')).toBeInTheDocument()
    expect(within(ruck).getByText('U9–U13')).toBeInTheDocument()

    const chop = screen.getByTestId('drill-drill-2')
    expect(within(chop).getByText('Skill')).toBeInTheDocument()
    expect(within(chop).getByText('U13 and up')).toBeInTheDocument()
    expect(within(chop).getByText('Contact')).toBeInTheDocument()

    // The contact filter. Tag-only leaves the tackling drill out, which is the
    // whole reason the filter exists.
    await user.click(screen.getByRole('radio', { name: 'Tag only' }))
    expect(screen.getByTestId('drill-drill-1')).toBeInTheDocument()
    expect(screen.queryByTestId('drill-drill-2')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Contact only' }))
    expect(screen.queryByTestId('drill-drill-1')).toBeNull()
    expect(screen.getByTestId('drill-drill-2')).toBeInTheDocument()
  })

  it('shows the pitch diagram on the open editor, never on the list row', async () => {
    const { user } = renderLibrary()
    const ruck = await screen.findByTestId('drill-drill-1')
    expect(within(ruck).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /pitch diagram/i })).not.toBeInTheDocument()

    await user.click(ruck)
    const panel = await screen.findByTestId('drill-panel')
    const diagram = within(panel).getByRole('img', { name: 'Ruck race pitch diagram' })
    expect(diagram).toHaveAttribute('src', RUCK_RACE.diagram_url)
    expect(screen.getByLabelText('Pitch diagram URL')).toHaveValue(RUCK_RACE.diagram_url)
  })

  it('hides the diagram image when the editor row has no URL', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByTestId('drill-drill-2'))
    const panel = await screen.findByTestId('drill-panel')
    expect(within(panel).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Pitch diagram URL')).toHaveValue('')
  })

  it('re-fetches with includeRetired when Show retired is switched on', async () => {
    const { user } = renderLibrary()
    await screen.findByTestId('drill-drill-1')
    expect(listDrillsMock).toHaveBeenCalledWith({ includeRetired: false })

    await user.click(screen.getByRole('switch', { name: 'Show retired' }))

    await waitFor(() => expect(listDrillsMock).toHaveBeenCalledWith({ includeRetired: true }))
    expect(await screen.findByTestId('drill-drill-3')).toBeInTheDocument()
  })

  it('adds a drill: title, category, minutes, body, contact flag', async () => {
    const { user } = renderLibrary()
    await screen.findByTestId('drill-drill-1')

    await user.click(screen.getByRole('button', { name: 'Add a drill' }))

    await user.type(screen.getByLabelText('Drill title'), 'Tackle tech')
    await user.selectOptions(screen.getByLabelText('Category'), 'skill')

    const minutes = screen.getByLabelText('Minutes')
    await user.clear(minutes)
    await user.type(minutes, '15')

    await user.type(screen.getByLabelText('The drill'), 'Cheek to cheek, then drive.')
    await user.click(screen.getByRole('switch', { name: 'Contact drill' }))
    await user.type(screen.getByLabelText('Youngest age'), '13')
    // ⚠️ "Oldest age" IS LEFT BLANK ON PURPOSE — see the payload below.

    await user.click(screen.getByRole('button', { name: 'Add drill' }))

    // ⚠️ THE EXACT PAYLOAD, NOT objectContaining. Two of these fields are the
    // point of the test: `max_age: null` (a blank box is "no limit", never 0
    // and never '' — 0 fails the 4..19 check constraint and '' is not a
    // smallint), and `club_id`, which a new drill can only get from the
    // membership context. objectContaining would pass with either of them
    // wrong.
    expect(upsertDrillMock).toHaveBeenCalledWith({
      club_id: CLUB,
      title: 'Tackle tech',
      summary: null,
      body: 'Cheek to cheek, then drive.',
      source_name: null,
      source_url: null,
      diagram_url: null,
      minutes: 15,
      category: 'skill',
      requires_contact: true,
      min_age: 13,
      max_age: null,
    })
  })

  // The 21 Aug review follow-up: a typo of 99 used to go all the way to
  // Postgres and come back as a raw `drills_min_age_check`. Discriminates:
  // against that bug, upsertDrill WOULD be called and this fails.
  it('refuses an age typo in the form, before Postgres sees it', async () => {
    const { user } = renderLibrary()
    await screen.findByTestId('drill-drill-1')

    await user.click(screen.getByRole('button', { name: 'Add a drill' }))
    await user.type(screen.getByLabelText('Drill title'), 'Tackle tech')
    await user.type(screen.getByLabelText('Youngest age'), '99')

    expect(screen.getByRole('alert')).toHaveTextContent('Ages are 4 to 19')
    expect(screen.getByRole('button', { name: 'Add drill' })).toBeDisabled()
    expect(upsertDrillMock).not.toHaveBeenCalled()

    // Correcting the box clears the refusal — the gate is the value, not the visit.
    const youngest = screen.getByLabelText('Youngest age')
    await user.clear(youngest)
    await user.type(youngest, '9')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add drill' })).toBeEnabled()
  })

  it('offers Retire and never Delete', async () => {
    const { user } = renderLibrary()

    await user.click(await screen.findByTestId('drill-drill-1'))

    expect(await screen.findByRole('button', { name: /retire/i })).toBeInTheDocument()
    // ⚠️ ASKED AFTER THE DRILL IS OPEN. Before it opens there is no Delete
    // button anywhere on the screen either, so the same assertion made on the
    // closed list would pass against a screen that offers Delete — a test that
    // cannot fail. session_template_blocks.drill_id is ON DELETE RESTRICT.
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(setDrillActiveMock).toHaveBeenCalledWith('drill-1', false))
  })

  it('keeps the panel open, with the error, on a refused write', async () => {
    upsertDrillMock.mockRejectedValue(
      new Error("We couldn't save that — you may not have the Rugby Performance Director right."),
    )
    const { user } = renderLibrary()
    await screen.findByTestId('drill-drill-1')

    await user.click(screen.getByRole('button', { name: 'Add a drill' }))
    await user.type(screen.getByLabelText('Drill title'), 'Tackle tech')
    await user.click(screen.getByRole('button', { name: 'Add drill' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save that/i)
    // The typing survives, because the save did not happen.
    expect(screen.getByLabelText('Drill title')).toHaveValue('Tackle tech')
  })
})

// ── The Director's suggestion queue (27 Aug 2026) ───────────────────────────
describe('TrainingLibrary — coach suggestions', () => {
  const SUB = { id: 'd-sub', title: 'Squad ruck race', category: 'game', min_age: null, max_age: null, requires_contact: false, team_id: 'team-u10', submitted_at: '2026-08-27T00:00:00Z' }

  it('shows suggestions and approves one into the club library', async () => {
    listSubmittedDrillsMock.mockResolvedValue([SUB])
    const { user } = renderLibrary()
    const panel = await screen.findByTestId('drill-suggestions')
    expect(within(panel).getByText('Squad ruck race')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: /add to club library/i }))
    await waitFor(() => expect(approveDrillToClubMock).toHaveBeenCalledWith('d-sub'))
  })

  it('dismisses a suggestion, leaving it the squad’s own', async () => {
    listSubmittedDrillsMock.mockResolvedValue([SUB])
    const { user } = renderLibrary()
    const panel = await screen.findByTestId('drill-suggestions')
    await user.click(within(panel).getByRole('button', { name: /keep it theirs/i }))
    await waitFor(() => expect(dismissDrillSubmissionMock).toHaveBeenCalledWith('d-sub'))
  })

  it('shows no suggestions panel when the queue is empty', async () => {
    listSubmittedDrillsMock.mockResolvedValue([])
    renderLibrary()
    await screen.findByRole('button', { name: /add a drill/i })
    expect(screen.queryByTestId('drill-suggestions')).not.toBeInTheDocument()
  })
})
