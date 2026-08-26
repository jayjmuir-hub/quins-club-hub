import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/SessionPlan.jsx — the coach's card on a training event.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 9).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ NOTHING HERE IS SECURITY. `canEdit` decides what the card OFFERS; RLS on
// public.training_sessions decides what the database hands over and accepts.
// What is pinned below is the set of things a plausible tidy-up would break:
//   - a training event with no session and no focus renders NOTHING, not an
//     empty labelled block on every training session in the club;
//   - the blocks come out in the stored order, with their minutes;
//   - "Edited by the coach" is visible, because that flag is what stops the
//     next publish overwriting this plan and the coach must be able to see it;
//   - the blocks handed to saveSessionBlocks are NUMBERS, in order, WITH the
//     notes — the exact-argument assertion below is the whole test.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9 — the repo is public
// and the club's members are mostly children.

const getSessionMock = vi.fn()
const saveSessionBlocksMock = vi.fn()
const listFocusMock = vi.fn()
const listDrillsMock = vi.fn()
const listTemplatesMock = vi.fn()
const createSessionMock = vi.fn()
const setSessionVisibilityMock = vi.fn()
const saveSquadTemplateMock = vi.fn()
const upsertDrillMock = vi.fn()
const submitTemplateToClubMock = vi.fn()

// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL REQUEST. CI sets
// placeholder Supabase env vars, so the client constructs happily, the promise
// never settles, and the card sits in `loading` forever.
vi.mock('../src/data/trainingPlans.js', () => ({
  getSession: (...args) => getSessionMock(...args),
  saveSessionBlocks: (...args) => saveSessionBlocksMock(...args),
  listFocus: (...args) => listFocusMock(...args),
  listDrills: (...args) => listDrillsMock(...args),
  listTemplates: (...args) => listTemplatesMock(...args),
  createSession: (...args) => createSessionMock(...args),
  setSessionVisibility: (...args) => setSessionVisibilityMock(...args),
  saveSquadTemplate: (...args) => saveSquadTemplateMock(...args),
  upsertDrill: (...args) => upsertDrillMock(...args),
  submitTemplateToClub: (...args) => submitTemplateToClubMock(...args),
}))

import SessionPlan from '../src/components/SessionPlan.jsx'

// 14:00Z is 18:00 in Abu Dhabi, so the club date is the 25th — the component
// must still ask eventFormat for it rather than reading date.getDate().
const EVENT = {
  id: 'e-1',
  team_id: 't-u12',
  type: 'training',
  starts_at: '2026-08-25T14:00:00.000Z',
}

const TEAM = { id: 't-u12', name: 'U12 Mixed', requires_contact: true, club_id: 'club-1' }

/** Invented drills. The SHAPES are the real ones. */
const GRID = {
  id: 'd-grid',
  title: 'Grid passing',
  summary: 'Four cones, two balls, hands only.',
  body: 'Set a fifteen-metre grid. Two lines, ball starts at opposite corners.',
  source_name: 'Coaching notebook',
  source_url: 'https://example.org/grid-passing',
  minutes: 15,
  category: 'skill',
  requires_contact: false,
  min_age: null,
  max_age: null,
  is_active: true,
}

const LADDER = {
  id: 'd-ladder',
  title: 'Tackle ladder',
  summary: 'Progressive contact, knees first.',
  body: null,
  source_name: null,
  source_url: null,
  minutes: 20,
  category: 'conditioning',
  requires_contact: true,
  min_age: 10,
  max_age: null,
  is_active: true,
}

const SENIORS_ONLY = {
  id: 'd-seniors',
  title: 'Full-contact mauling',
  summary: null,
  body: null,
  source_name: null,
  source_url: null,
  minutes: 20,
  category: 'game',
  requires_contact: true,
  min_age: 16,
  max_age: null,
  is_active: true,
}

const SESSION = {
  id: 's-1',
  event_id: 'e-1',
  template_id: 'tpl-1',
  published_at: '2026-08-20T06:00:00.000Z',
  coach_edited_at: null,
  visibility: 'squad',
  created_by: null,
  notes: 'Wet pitch, keep it tight.',
  blocks: [
    { id: 'b-1', position: 1, drill_id: 'd-grid', minutes: 15, coach_note: 'Keep the width', drill: GRID },
    { id: 'b-2', position: 2, drill_id: 'd-ladder', minutes: 20, coach_note: null, drill: LADDER },
  ],
}

const FOCUS = {
  id: 'f-1',
  team_id: 't-u12',
  title: 'Tackle technique',
  starts_on: '2026-08-24',
  ends_on: '2026-09-06',
  notes: null,
}

function show(props = {}) {
  render(<SessionPlan event={EVENT} team={TEAM} canEdit={false} {...props} />)
  return { user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionMock.mockResolvedValue(null)
  listFocusMock.mockResolvedValue([])
  listDrillsMock.mockResolvedValue([GRID, LADDER, SENIORS_ONLY])
  listTemplatesMock.mockResolvedValue([])
  saveSessionBlocksMock.mockResolvedValue(undefined)
  createSessionMock.mockResolvedValue({ id: 's-new' })
  setSessionVisibilityMock.mockResolvedValue({})
  saveSquadTemplateMock.mockResolvedValue({ id: 'tpl-new' })
  upsertDrillMock.mockResolvedValue({ ...GRID, id: 'd-made', title: 'Made drill' })
})

describe('SessionPlan — when it renders at all', () => {
  it('renders nothing for a training event with no plan', async () => {
    show()
    // Waiting for the read to settle first, so this is "nothing after
    // loading" rather than the trivially-true "nothing on the first frame".
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-1'))
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('renders nothing when a focus covers another squad', async () => {
    listFocusMock.mockResolvedValue([{ ...FOCUS, team_id: 't-u14' }])
    show()
    await waitFor(() => expect(listFocusMock).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('renders nothing when the focus window closed before this session', async () => {
    // The event's club date is 2026-08-25; this window ended on the 24th.
    listFocusMock.mockResolvedValue([{ ...FOCUS, starts_on: '2026-08-10', ends_on: '2026-08-24' }])
    show()
    await waitFor(() => expect(listFocusMock).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('uses the CLUB date, not UTC, at the edge of a focus window', async () => {
    // ⚠️ THE ONE FIXTURE THAT CAN TELL THE TWO APART. 20:30Z on 25 Aug is
    // 00:30 on 26 Aug in Abu Dhabi. A focus ending on the 25th therefore does
    // NOT cover this session — but a UTC implementation would say it does.
    // Every other fixture in this file is at 14:00Z, where both answers agree,
    // so without this test `new Date(starts_at).toISOString().slice(0, 10)`
    // would pass the suite. design-system.md §7: the club's day, never UTC.
    listFocusMock.mockResolvedValue([{ ...FOCUS, starts_on: '2026-08-10', ends_on: '2026-08-25' }])
    show({ event: { ...EVENT, starts_at: '2026-08-25T20:30:00.000Z' } })
    await waitFor(() => expect(listFocusMock).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('shows the focus on its own, with no session', async () => {
    // A focus is a LABEL and gates nothing — a squad can have a theme for the
    // fortnight with no published plan for tonight, and that is worth saying.
    listFocusMock.mockResolvedValue([FOCUS])
    show()
    expect(await screen.findByTestId('session-focus')).toHaveTextContent('Tackle technique')
    expect(screen.getByRole('heading', { name: /session plan/i })).toBeInTheDocument()
  })
})

describe('SessionPlan — reading the plan', () => {
  it('shows the focus, then the blocks in order with minutes, and the body on tap', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    listFocusMock.mockResolvedValue([FOCUS])
    const { user } = show()

    expect(await screen.findByTestId('session-focus')).toHaveTextContent('Tackle technique')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('15 min')
    expect(items[0].textContent).toContain('Grid passing')
    expect(items[0].textContent).toContain('Skill')
    expect(items[0].textContent).toContain('Keep the width')
    expect(items[1].textContent).toContain('20 min')
    expect(items[1].textContent).toContain('Tackle ladder')

    // The total, so a coach can see the hour without adding it up.
    expect(screen.getByTestId('session-total')).toHaveTextContent('35 min')

    // ⚠️ THE BODY IS BEHIND A <details> AND STARTS CLOSED. Two paragraphs per
    // block on a phone buries the running order, which is what the card is for.
    const detail = within(items[0]).getByText('How it runs').closest('details')
    expect(detail).not.toHaveAttribute('open')
    await user.click(within(items[0]).getByText('How it runs'))
    expect(detail).toHaveAttribute('open')
    expect(within(detail).getByText(GRID.body)).toBeInTheDocument()

    // The source is credited and opens away from the app.
    const link = within(detail).getByRole('link', { name: /coaching notebook/i })
    expect(link).toHaveAttribute('href', 'https://example.org/grid-passing')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('says "Edited by the coach" when coach_edited_at is set', async () => {
    // ⚠️ THIS IS NOT DECORATION. publish_training leaves a coach-edited session
    // alone, so this chip is the only thing on screen that explains why tonight's
    // plan did not change when the Director published a new template.
    getSessionMock.mockResolvedValue({ ...SESSION, coach_edited_at: '2026-08-21T05:00:00.000Z' })
    show()
    expect(await screen.findByText('Edited by the coach')).toBeInTheDocument()
  })

  it('does not say it when the session is untouched', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show()
    await screen.findByText('Grid passing')
    expect(screen.queryByText('Edited by the coach')).not.toBeInTheDocument()
  })

  it('offers no Adjust without canEdit', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show()
    await screen.findByText('Grid passing')
    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument()
  })

  it('still renders the plan when the focus read fails', async () => {
    // Same rule as PitchRequest: a failed read of a side-card's extras is not
    // an error state — the sheet's job is the event, not the label.
    getSessionMock.mockResolvedValue(SESSION)
    listFocusMock.mockRejectedValue(new Error('nope'))
    show()
    expect(await screen.findByText('Grid passing')).toBeInTheDocument()
  })
})

describe('SessionPlan — the coach adjusting it', () => {
  it('lets a coach change minutes and save, which stamps the edit', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })

    await user.click(await screen.findByRole('button', { name: /adjust/i }))

    const minutes = screen.getAllByLabelText('Minutes')
    expect(minutes).toHaveLength(2)
    await user.clear(minutes[0])
    await user.type(minutes[0], '10')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // ⚠️ THE EXACT ARGUMENTS ARE THE TEST. Minutes must be NUMBERS (the boxes
    // hold strings and the column is an integer), the order must be the order
    // on screen, the coach notes must survive, and the notes must be sent —
    // saveSessionBlocks writes `notes` in the same statement that stamps
    // coach_edited_at, so dropping the argument silently blanks them.
    await waitFor(() =>
      expect(saveSessionBlocksMock).toHaveBeenCalledWith(
        's-1',
        [
          { drill_id: 'd-grid', minutes: 10, coach_note: 'Keep the width' },
          { drill_id: 'd-ladder', minutes: 20, coach_note: null },
        ],
        'Wet pitch, keep it tight.',
      ),
    )
    // And it reloads, so what the card then shows comes from the row the
    // database now holds rather than from a guess made on this screen.
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(2))
  })

  it('moves a block and sends the order it shows', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /adjust/i }))

    await user.click(screen.getAllByRole('button', { name: /move up/i })[1])
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(saveSessionBlocksMock).toHaveBeenCalledWith(
        's-1',
        [
          { drill_id: 'd-ladder', minutes: 20, coach_note: null },
          { drill_id: 'd-grid', minutes: 15, coach_note: 'Keep the width' },
        ],
        'Wet pitch, keep it tight.',
      ),
    )
  })

  it('offers a drill the squad cannot do, disabled and with the reason', async () => {
    // ⚠️ REFUSED WITH THE REASON, NEVER MISSING — and here the fit is asked of
    // the SQUAD, not of a template: this coach is adding a drill to one night's
    // plan for U12, and a U16-and-up drill must say so rather than vanish.
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /adjust/i }))

    const picker = await screen.findByLabelText(/add a drill/i)
    const refused = within(picker).getByRole('option', { name: /full-contact mauling/i })
    expect(refused).toBeDisabled()
    expect(refused.textContent).toMatch(/U12 is outside/)
    // The ones that do fit are offered normally.
    expect(within(picker).getByRole('option', { name: /grid passing/i })).not.toBeDisabled()
  })

  it('cancels back to the saved plan, writing nothing', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /adjust/i }))

    const minutes = screen.getAllByLabelText('Minutes')
    await user.clear(minutes[0])
    await user.type(minutes[0], '45')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(saveSessionBlocksMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('15 min')
  })
})

// ── The coach building their OWN plan (27 Aug 2026) ─────────────────────────
// Jay: coaches create their own plans for sessions — freestyle or from a
// template — and choose who sees it (draft/staff/squad). What is pinned here is
// the shape a tidy-up would break: the build affordance only for canEdit; a new
// plan is created with the author and the chosen visibility; a template seeds
// the running order; a parent still sees no builder.
describe('SessionPlan — a coach builds their own plan', () => {
  it('offers "Build a session" to a coach on an event with no plan', async () => {
    const { user } = show({ canEdit: true })
    expect(await screen.findByTestId('build-session')).toBeInTheDocument()
    await user.click(screen.getByTestId('build-session'))
    // The visibility control appears, defaulting to squad staff.
    const radios = within(screen.getByRole('radiogroup', { name: /who can see this plan/i })).getAllByRole('radio')
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')).toHaveTextContent('Squad staff')
  })

  it('shows a parent nothing on an event with no plan', async () => {
    show({ canEdit: false })
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-1'))
    expect(screen.queryByTestId('build-session')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('creates a session with the chosen visibility and the blocks', async () => {
    // ⚠️ THE AUTHOR IS NOT SENT — training_sessions.created_by defaults to
    // auth.uid() in the DB, so the client needs no user id and no auth
    // provider (which is why the EventDetail sheet can render this card
    // everywhere without one).
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('build-session'))
    await user.selectOptions(screen.getByLabelText(/add a drill/i), 'd-grid')
    // Publish it to the whole squad.
    await user.click(within(screen.getByRole('radiogroup', { name: /who can see this plan/i })).getByRole('radio', { name: /whole squad/i }))
    await user.click(screen.getByRole('button', { name: /save plan/i }))

    await waitFor(() => expect(createSessionMock).toHaveBeenCalled())
    const arg = createSessionMock.mock.calls[0][0]
    expect(arg.eventId).toBe('e-1')
    expect(arg.createdBy).toBeUndefined()
    expect(arg.visibility).toBe('squad')
    expect(arg.blocks).toEqual([{ drill_id: 'd-grid', minutes: 15, coach_note: null }])
  })

  it('seeds the running order from a chosen template', async () => {
    listTemplatesMock.mockResolvedValue([
      { id: 'tpl-a', name: 'Skills night', team_id: null, notes: null, blocks: [
        { id: 'tb-1', position: 1, drill_id: 'd-grid', minutes: 15, coach_note: null, drill: GRID },
      ] },
    ])
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('build-session'))
    await user.selectOptions(screen.getByLabelText(/start from a template/i), 'tpl-a')

    // The seeded block is in the editor.
    expect(screen.getByText('Grid passing')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save plan/i }))
    await waitFor(() => expect(createSessionMock).toHaveBeenCalled())
    expect(createSessionMock.mock.calls[0][0].blocks).toEqual([{ drill_id: 'd-grid', minutes: 15, coach_note: null }])
  })

  it('will not save an empty plan', async () => {
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('build-session'))
    expect(screen.getByRole('button', { name: /save plan/i })).toBeDisabled()
  })

  it('creates a squad-owned drill inline and adds it to the plan', async () => {
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('build-session'))
    await user.click(screen.getByRole('button', { name: /create a drill/i }))
    await user.type(screen.getByLabelText('New drill title'), 'Ruck race')
    await user.click(within(screen.getByTestId('new-drill')).getByRole('button', { name: /add drill/i }))

    await waitFor(() => expect(upsertDrillMock).toHaveBeenCalled())
    const drillArg = upsertDrillMock.mock.calls[0][0]
    expect(drillArg.team_id).toBe('t-u12')
    expect(drillArg.club_id).toBe('club-1')
    expect(drillArg.title).toBe('Ruck race')
  })
})

describe('SessionPlan — visibility on an existing plan', () => {
  it('shows who can see the plan, to a coach', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show({ canEdit: true })
    expect(await screen.findByTestId('session-visibility')).toHaveTextContent('The whole squad')
  })

  it('does not show the visibility chip to a parent', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show({ canEdit: false })
    await screen.findByTestId('session-total')
    expect(screen.queryByTestId('session-visibility')).not.toBeInTheDocument()
  })

  it('saves a changed visibility alongside an adjust', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /adjust/i }))
    await user.click(within(screen.getByRole('radiogroup', { name: /who can see this plan/i })).getByRole('radio', { name: /only me/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(setSessionVisibilityMock).toHaveBeenCalledWith('s-1', 'draft'))
  })

  it('saves the running order as the squad’s template', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('save-as-template'))
    await user.click(screen.getByRole('button', { name: /save template/i }))

    await waitFor(() => expect(saveSquadTemplateMock).toHaveBeenCalled())
    const arg = saveSquadTemplateMock.mock.calls[0][0]
    expect(arg.teamId).toBe('t-u12')
    expect(arg.clubId).toBe('club-1')
    expect(arg.blocks).toHaveLength(2)
  })
})
