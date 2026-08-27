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
const shareElementAsImageMock = vi.fn()

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
vi.mock('../src/lib/shareImage.js', () => ({
  shareElementAsImage: (...args) => shareElementAsImageMock(...args),
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

const U18_TEAM = { id: 't-u18b', name: 'U18B', requires_contact: true, club_id: 'club-1' }
const U18_EVENT = { ...EVENT, id: 'e-u18', team_id: 't-u18b' }
const U12G_TEAM = { id: 't-u12g-qr', name: 'U12G QR', requires_contact: false, club_id: 'club-1' }
const U12G_EVENT = { ...EVENT, id: 'e-u12g', team_id: 't-u12g-qr' }

const CHIP_LABELS = ['Tackle', 'Passing', 'Ruck', 'Attack', 'Defence']
function contactPack(min, max) {
  return CHIP_LABELS.map((chip_label) => ({
    id: `tpl-${chip_label}-${min}-${max}`,
    name: `${chip_label} hour U${min}–U${max}`,
    chip_label,
    requires_contact: true,
    min_age: min,
    max_age: max,
    team_id: null,
    blocks: [],
  }))
}
const THREE_CONTACT_PACKS = [...contactPack(9, 10), ...contactPack(11, 14), ...contactPack(16, 18)]

const TOUCH_COPIES = [
  {
    id: 'd-touch-u16',
    title: '4 v 2 Continuous Touch',
    minutes: 8,
    category: 'game',
    min_age: 16,
    max_age: 18,
    requires_contact: true,
    is_active: true,
  },
  {
    id: 'd-touch-u9',
    title: '4 v 2 Continuous Touch',
    minutes: 8,
    category: 'game',
    min_age: 9,
    max_age: 10,
    requires_contact: true,
    is_active: true,
  },
  {
    id: 'd-touch-u11',
    title: '4 v 2 Continuous Touch',
    minutes: 8,
    category: 'game',
    min_age: 11,
    max_age: 14,
    requires_contact: true,
    is_active: true,
  },
]

/** Invented drills. The SHAPES are the real ones. */
const GRID = {
  id: 'd-grid',
  title: 'Grid passing',
  summary: 'Four cones, two balls, hands only.',
  body: 'Set a fifteen-metre grid. Two lines, ball starts at opposite corners.',
  source_name: 'Coaching notebook',
  source_url: 'https://example.org/grid-passing',
  diagram_url: 'https://example.org/diagrams/grid-passing.svg',
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

// Invented Combined Preseason hour. Shape of the live share that painted each
// next title over the previous coach-note: long notes, category chips, and a
// "How it runs" summary on every drill. Names are made up; no real people.
const PIGGYBACK_NOTE =
  'Pairs, one carries. Twenty metres out, twenty back. Swap. Then a sprint to the far cone and walk the recovery. Keep the line honest — if the carrier dumps early, restart that pair.'
const TOUCH_NOTE =
  'Attack two, defence two. Four touches then off. Reset from the near cone. Last two lines of this note are the ones a short next header used to sit on top of.'
const PLUS_ONE_NOTE =
  'Same grid, plus one defender arriving late. Catch them before the extra body lands. The header after this used to cover the last two lines.'

function preseasonDrill(id, title, category, summary) {
  return {
    id,
    title,
    summary,
    body: `${title} body — coaches tap How it runs for this, WhatsApp must not.`,
    minutes: 10,
    category,
    requires_contact: false,
    min_age: 14,
    max_age: 18,
    is_active: true,
  }
}

const PRESEASON_HOUR = {
  ...SESSION,
  id: 's-preseason',
  notes: 'U14/U16/U18 Combined Preseason. Water bottles at the far cone.',
  blocks: [
    {
      id: 'b-act',
      position: 1,
      drill_id: 'd-act',
      minutes: 5,
      coach_note: 'Squad run it',
      drill: preseasonDrill('d-act', 'Activate (player-led)', 'warm_up', 'Player-led pulse raiser.'),
    },
    {
      id: 'b-pig',
      position: 2,
      drill_id: 'd-pig',
      minutes: 10,
      coach_note: PIGGYBACK_NOTE,
      drill: preseasonDrill('d-pig', 'Piggyback fitness', 'conditioning', 'Carry and sprint.'),
    },
    {
      id: 'b-water',
      position: 3,
      drill_id: 'd-water',
      minutes: 5,
      coach_note: null,
      drill: preseasonDrill('d-water', 'Water and stretch', 'cool_down', 'Drink, then stretch.'),
    },
    {
      id: 'b-32',
      position: 4,
      drill_id: 'd-32',
      minutes: 10,
      coach_note: TOUCH_NOTE,
      drill: preseasonDrill('d-32', '3 v 2 touch', 'game', 'Two-on-one into two-on-two.'),
    },
    {
      id: 'b-plus',
      position: 5,
      drill_id: 'd-plus',
      minutes: 15,
      coach_note: PLUS_ONE_NOTE,
      drill: preseasonDrill('d-plus', 'Touch +1', 'game', 'Late extra defender.'),
    },
    {
      id: 'b-cool',
      position: 6,
      drill_id: 'd-cool',
      minutes: 15,
      coach_note: null,
      drill: preseasonDrill('d-cool', 'Cool down', 'cool_down', 'Walk and stretch.'),
    },
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
  shareElementAsImageMock.mockResolvedValue('shared')
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

    // Pitch drawing sits above the body once the card is opened. The closed
    // list row is title / minutes / category only — no thumbnail.
    const diagram = within(detail).getByRole('img', { name: 'Grid passing pitch diagram' })
    expect(diagram).toHaveAttribute('src', GRID.diagram_url)
    expect(diagram.compareDocumentPosition(within(detail).getByText(GRID.body)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(items[1]).queryByRole('img')).not.toBeInTheDocument()
  })

  it('opens How it runs for a diagram-only drill', async () => {
    getSessionMock.mockResolvedValue({
      ...SESSION,
      blocks: [
        {
          id: 'b-angle',
          position: 1,
          drill_id: 'd-angle',
          minutes: 10,
          coach_note: null,
          drill: {
            id: 'd-angle',
            title: 'Angle Track Drill',
            summary: null,
            body: null,
            source_url: null,
            diagram_url: 'https://example.org/diagrams/angle-track.svg',
            minutes: 10,
            category: 'skill',
            is_active: true,
          },
        },
      ],
    })
    const { user } = show()
    const item = await screen.findByRole('listitem')
    const detail = within(item).getByText('How it runs').closest('details')
    expect(detail).not.toHaveAttribute('open')
    await user.click(within(item).getByText('How it runs'))
    expect(detail).toHaveAttribute('open')
    expect(within(item).getByRole('img', { name: 'Angle Track Drill pitch diagram' })).toHaveAttribute(
      'src',
      'https://example.org/diagrams/angle-track.svg',
    )
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

  it('omits a drill this squad cannot do — never a disabled option with the reason', async () => {
    // ⚠️ FILTER THE LIST, never CSS-hide and never a disabled <option>.
    // Disabled-with-reason is the chip-row rule; a dropdown option you cannot
    // pick is worse than omitting it. Jay, 27 Aug 2026: U18B must not see
    // U9/U11 copies, and U12 must not be offered a U16-and-up drill.
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /adjust/i }))

    const picker = await screen.findByLabelText(/add a drill/i)
    expect(within(picker).queryByRole('option', { name: /full-contact mauling/i })).not.toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: /grid passing/i })).not.toBeDisabled()
    expect(within(picker).queryByRole('option', { name: /outside/i })).not.toBeInTheDocument()
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

  it('from-scratch Only me still creates a draft — chip apply does not own this path', async () => {
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByTestId('build-session'))
    await user.selectOptions(screen.getByLabelText(/add a drill/i), 'd-grid')
    await user.click(within(screen.getByRole('radiogroup', { name: /who can see this plan/i })).getByRole('radio', { name: /only me/i }))
    await user.click(screen.getByRole('button', { name: /save plan/i }))

    await waitFor(() => expect(createSessionMock).toHaveBeenCalled())
    expect(createSessionMock.mock.calls[0][0].visibility).toBe('draft')
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

  it('U18B START FROM A TEMPLATE is Freestyle then 16–18 hours, never U9 or U11 packs', async () => {
    // ⚠️ THE SCREENSHOT. Squad Hub → Training → build a session. The select
    // used to dump every age pack. Filter is shelfRowsForSquad — same rule as
    // the shelf chips, at the option list, not CSS. EventDetail and Squad
    // Training mount this same SessionPlan; they have no sibling picker.
    listTemplatesMock.mockResolvedValue(THREE_CONTACT_PACKS)
    const { user } = show({ canEdit: true, event: U18_EVENT, team: U18_TEAM })
    await user.click(await screen.findByTestId('build-session'))

    const picker = await screen.findByLabelText(/start from a template/i)
    const options = within(picker).getAllByRole('option')
    expect(options[0]).toHaveTextContent('Freestyle — an empty plan')
    expect(options.map((el) => el.textContent)).toEqual([
      'Freestyle — an empty plan',
      'Tackle hour U16–U18',
      'Passing hour U16–U18',
      'Ruck hour U16–U18',
      'Attack hour U16–U18',
      'Defence hour U16–U18',
    ])
    expect(picker.textContent).not.toMatch(/U9–U10|U11–U14/)
    expect(options.every((el) => !el.disabled)).toBe(true)
  })

  it('U18B ADD A DRILL hides out-of-age copies of the same drill', async () => {
    listDrillsMock.mockResolvedValue(TOUCH_COPIES)
    const { user } = show({ canEdit: true, event: U18_EVENT, team: U18_TEAM })
    await user.click(await screen.findByTestId('build-session'))

    const picker = await screen.findByLabelText(/add a drill/i)
    const copies = within(picker).getAllByRole('option', { name: /4 v 2 Continuous Touch/i })
    expect(copies).toHaveLength(1)
    expect(copies[0]).toHaveValue('d-touch-u16')
    expect(copies[0]).not.toBeDisabled()
  })

  it('U12G QR START FROM A TEMPLATE never lists a contact Tackle hour; Freestyle stays', async () => {
    // Contact is teams.requires_contact, never inferred from the name. A
    // contact hour must not appear as a selectable (or disabled) option.
    listTemplatesMock.mockResolvedValue([
      {
        id: 'tpl-tackle-contact',
        name: 'Tackle hour U16–U18',
        chip_label: 'Tackle',
        requires_contact: true,
        min_age: 16,
        max_age: 18,
        team_id: null,
        blocks: [],
      },
      {
        id: 'tpl-tag-passing',
        name: 'Passing hour tag U11–U14',
        chip_label: 'Passing',
        requires_contact: false,
        min_age: 11,
        max_age: 14,
        team_id: null,
        blocks: [],
      },
    ])
    listDrillsMock.mockResolvedValue([
      {
        id: 'd-live-tackle',
        title: 'Live Tackle',
        minutes: 15,
        category: 'skill',
        min_age: 11,
        max_age: 14,
        requires_contact: true,
        is_active: true,
      },
      {
        id: 'd-rip',
        title: 'Rip and roll',
        minutes: 10,
        category: 'skill',
        min_age: 11,
        max_age: 14,
        requires_contact: false,
        is_active: true,
      },
    ])
    const { user } = show({ canEdit: true, event: U12G_EVENT, team: U12G_TEAM })
    await user.click(await screen.findByTestId('build-session'))

    const picker = await screen.findByLabelText(/start from a template/i)
    expect(within(picker).getByRole('option', { name: /freestyle/i })).toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: /tackle/i })).not.toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: /passing hour tag/i })).not.toBeDisabled()
    expect(within(picker).queryByRole('option', { name: /contact/i })).not.toBeInTheDocument()

    const drills = await screen.findByLabelText(/add a drill/i)
    expect(within(drills).queryByRole('option', { name: /live tackle/i })).not.toBeInTheDocument()
    expect(within(drills).getByRole('option', { name: /rip and roll/i })).not.toBeDisabled()
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

describe('SessionPlan — Share', () => {
  it('offers Share next to Adjust for a coach reading a plan', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show({ canEdit: true, event: { ...EVENT, title: 'Tuesday training' } })
    const adjust = await screen.findByRole('button', { name: /adjust/i })
    const share = screen.getByRole('button', { name: /^share$/i })
    expect(adjust.parentElement).toContainElement(share)
    expect(screen.getByRole('button', { name: /save as my template/i })).toBeInTheDocument()
  })

  it('does not offer Share to a parent reading a squad plan', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    show({ canEdit: false })
    await screen.findByTestId('session-total')
    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument()
  })

  it('offers the same Share control on a U18B hour', async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, event_id: 'e-u18' })
    show({ canEdit: true, event: U18_EVENT, team: U18_TEAM })
    const adjust = await screen.findByRole('button', { name: /adjust/i })
    expect(adjust.parentElement).toContainElement(screen.getByRole('button', { name: /^share$/i }))
  })

  it('photographs the plan card, not Adjust or Save as my template, and sends the deep link', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true, event: { ...EVENT, title: 'Tuesday training' } })
    await user.click(await screen.findByRole('button', { name: /^share$/i }))

    expect(shareElementAsImageMock).toHaveBeenCalledTimes(1)
    const [element, options] = shareElementAsImageMock.mock.calls[0]
    expect(element).toHaveAttribute('data-testid', 'session-plan-capture')
    expect(element).toHaveTextContent('15 min')
    expect(element).toHaveTextContent('Grid passing')
    expect(element).toHaveTextContent('Skill')
    expect(element).toHaveTextContent('Keep the width')
    expect(element).toHaveTextContent('Total 35 min')
    expect(element).toHaveTextContent('Wet pitch, keep it tight.')
    expect(element.textContent).not.toMatch(/Adjust/)
    expect(element.textContent).not.toMatch(/Save as my template/)
    expect(element.textContent).not.toMatch(/Share/)
    expect(element.querySelector('details')).toBeNull()
    expect(element.textContent).not.toMatch(/How it runs/)
    expect(options.text).toMatch(/\/schedule\?event=e-1/)
    expect(options.url).toMatch(/\/schedule\?event=e-1/)
    expect(options.title).toBe('Tuesday training')
  })

  it('photographs a share-only block tree, not the live flex-wrap How it runs rows', async () => {
    getSessionMock.mockResolvedValue(SESSION)
    const { user } = show({ canEdit: true })
    await user.click(await screen.findByRole('button', { name: /^share$/i }))

    const [element] = shareElementAsImageMock.mock.calls[0]
    expect(element).toHaveAttribute('data-testid', 'session-plan-capture')
    expect(element).toHaveTextContent('15 min · Grid passing')
    expect(element).toHaveTextContent('Keep the width')
    expect(element).toHaveTextContent('Total 35 min')
    expect(element.querySelector('details')).toBeNull()
    expect(element.textContent).not.toMatch(/How it runs/)
    expect(element.textContent).not.toMatch(GRID.summary)
    expect(element.textContent).not.toMatch(GRID.body)

    // Live SessionPlan still uses BlockRow (flex-wrap + details) for reading.
    const liveItems = screen.getAllByRole('listitem')
    expect(within(liveItems[0]).getByText('How it runs')).toBeInTheDocument()
    expect(liveItems[0].querySelector('.flex-wrap')).not.toBeNull()
    expect(element.contains(liveItems[0])).toBe(false)

    const shareBlocks = within(element).getAllByTestId('session-plan-share-block')
    expect(shareBlocks).toHaveLength(2)
    expect(shareBlocks[0].nextElementSibling).toBe(shareBlocks[1])
    for (const block of shareBlocks) {
      expect(block.className.split(/\s+/)).toContain('block')
      expect(block.className.split(/\s+/)).not.toContain('flex')
      expect(block.className.split(/\s+/)).not.toContain('flex-wrap')
      expect(block.querySelector('.flex-wrap')).toBeNull()
      expect(block.querySelector('details')).toBeNull()
    }
  })

  it('on a Combined Preseason hour, capture has the running order and notes and none of How it runs', async () => {
    getSessionMock.mockResolvedValue(PRESEASON_HOUR)
    const { user } = show({
      canEdit: true,
      event: { ...EVENT, title: 'U14/U16/U18 Combined Preseason' },
    })
    await user.click(await screen.findByRole('button', { name: /^share$/i }))

    const [element] = shareElementAsImageMock.mock.calls[0]
    expect(element).toHaveAttribute('data-testid', 'session-plan-capture')
    expect(element).toHaveTextContent('5 min · Activate (player-led)')
    expect(element).toHaveTextContent('Warm-up')
    expect(element).toHaveTextContent('Squad run it')
    expect(element).toHaveTextContent('10 min · Piggyback fitness')
    expect(element).toHaveTextContent('Conditioning')
    expect(element).toHaveTextContent(PIGGYBACK_NOTE)
    expect(element).toHaveTextContent('5 min · Water and stretch')
    expect(element).toHaveTextContent('Cool-down')
    expect(element).toHaveTextContent('10 min · 3 v 2 touch')
    expect(element).toHaveTextContent(TOUCH_NOTE)
    expect(element).toHaveTextContent('15 min · Touch +1')
    expect(element).toHaveTextContent(PLUS_ONE_NOTE)
    expect(element).toHaveTextContent('15 min · Cool down')
    expect(element).toHaveTextContent('Total 60 min')
    expect(element).toHaveTextContent('U14/U16/U18 Combined Preseason. Water bottles at the far cone.')
    expect(element.querySelector('details')).toBeNull()
    expect(element.textContent).not.toMatch(/How it runs/)
    expect(element.textContent).not.toMatch(/Player-led pulse raiser/)
    expect(element.textContent).not.toMatch(/WhatsApp must not/)

    const shareBlocks = within(element).getAllByTestId('session-plan-share-block')
    expect(shareBlocks).toHaveLength(6)
    expect(shareBlocks[1].nextElementSibling).toBe(shareBlocks[2])
    expect(shareBlocks[1]).toHaveTextContent(PIGGYBACK_NOTE)
    expect(shareBlocks[2]).toHaveTextContent('Water and stretch')
    expect(shareBlocks[2].textContent).not.toMatch(PIGGYBACK_NOTE)

    const liveItems = screen.getAllByRole('listitem')
    expect(liveItems).toHaveLength(6)
    expect(within(liveItems[1]).getByText('How it runs')).toBeInTheDocument()
  })
})
