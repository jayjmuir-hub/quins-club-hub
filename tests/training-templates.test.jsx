import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Templates tab of the Rugby Performance Director portal — the hour builder.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 7).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ NOTHING HERE IS SECURITY. The `training` right gates the SCREEN, not the
// data — RLS on public.session_templates is what actually decides. What is
// pinned below is the set of things a plausible tidy-up would break:
//   - the running total is ALWAYS visible while building, and 60 is marked;
//   - a total that is not 60 ASKS before saving and never refuses — and the
//     save must not have happened before the answer (the fault injected to
//     prove that test: call saveTemplate directly and skip the confirm);
//   - a drill that does not fit the draft's band or contact flag is OFFERED
//     DISABLED WITH ITS REASON, never silently missing;
//   - the order the blocks are in is the order they are handed to the data
//     layer, which is what renumbers positions 1..n.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9 — the repo is public
// and the club's members are mostly children.

const useMembershipsMock = vi.fn()
const listTemplatesMock = vi.fn()
const listDrillsMock = vi.fn()
const saveTemplateMock = vi.fn()
const setTemplateActiveMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL REQUEST. CI sets
// placeholder Supabase env vars, so the client constructs happily, the promise
// never settles, and the screen sits in `loading` forever — with an error that
// names nothing. The long-form reasoning is in src/test/setup.js.
const listSubmittedTemplatesMock = vi.fn(async () => [])
const approveTemplateToClubMock = vi.fn(async () => ({}))
const dismissTemplateSubmissionMock = vi.fn(async () => ({}))
vi.mock('../src/data/trainingPlans.js', () => ({
  listTemplates: (...args) => listTemplatesMock(...args),
  listDrills: (...args) => listDrillsMock(...args),
  saveTemplate: (...args) => saveTemplateMock(...args),
  setTemplateActive: (...args) => setTemplateActiveMock(...args),
  listSubmittedTemplates: (...args) => listSubmittedTemplatesMock(...args),
  approveTemplateToClub: (...args) => approveTemplateToClubMock(...args),
  dismissTemplateSubmission: (...args) => dismissTemplateSubmissionMock(...args),
}))

import TrainingTemplates from '../src/screens/TrainingTemplates.jsx'

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

/** Invented drills. The SHAPES are the real ones. */
function drill(id, title, minutes, extra = {}) {
  return {
    id,
    club_id: CLUB,
    title,
    summary: null,
    body: null,
    source_name: null,
    source_url: null,
    minutes,
    category: 'skill',
    requires_contact: false,
    min_age: null,
    max_age: null,
    is_active: true,
    ...extra,
  }
}

const LADDER = drill('drill-1', 'Ladder shuttle', 15, { category: 'warm_up' })
const KEEP_BALL = drill('drill-2', 'Keep ball', 20, { category: 'game' })
const GRID_PASS = drill('drill-3', 'Grid passing', 30)
const WIDE_GAME = drill('drill-4', 'Wide channel game', 30, { category: 'game' })
// The two that must be OFFERED AND REFUSED against a tag U9–U13 template.
const CHOP_LADDER = drill('drill-5', 'Chop tackle ladder', 15, { requires_contact: true, min_age: 13 })
const SEVENS_SET = drill('drill-6', 'Sevens set piece', 25, { min_age: 14 })

const ALL_DRILLS = [CHOP_LADDER, GRID_PASS, KEEP_BALL, LADDER, SEVENS_SET, WIDE_GAME]

const SAT_HOUR = {
  id: 'tpl-1',
  club_id: CLUB,
  name: 'Saturday hour',
  min_age: 9,
  max_age: 13,
  requires_contact: false,
  notes: null,
  total_minutes: 60,
  is_active: true,
  blocks: [
    { id: 'b1', position: 1, drill_id: GRID_PASS.id, minutes: 30, coach_note: null, drill: GRID_PASS },
    { id: 'b2', position: 2, drill_id: WIDE_GAME.id, minutes: 30, coach_note: null, drill: WIDE_GAME },
  ],
}

function renderTemplates(rows = admin()) {
  const user = userEvent.setup()
  useMembershipsMock.mockReturnValue(memberships(rows))
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TrainingTemplates />
    </MemoryRouter>,
  )
  return { user }
}

/** Open the builder on a blank template and give it the one required field. */
async function openBuilder(user, name = 'Tuesday hour') {
  await user.click(await screen.findByRole('button', { name: 'Add a template' }))
  await user.type(await screen.findByLabelText('Template name'), name)
}

/** Pick a drill out of the "Add a drill" select. */
async function addDrill(user, id) {
  await user.selectOptions(screen.getByLabelText('Add a drill'), id)
}

function blockRows() {
  return screen.getAllByTestId(/^block-/)
}

beforeEach(() => {
  vi.clearAllMocks()
  listTemplatesMock.mockImplementation(async () => [SAT_HOUR])
  listDrillsMock.mockImplementation(async () => ALL_DRILLS)
  saveTemplateMock.mockImplementation(async (template) => ({ id: 'tpl-new', ...template }))
  setTemplateActiveMock.mockImplementation(async (id, active) => ({ id, is_active: active }))
})

describe('TrainingTemplates', () => {
  it('shows the not-your-job card without the training right', async () => {
    renderTemplates(admin([]))

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Rugby Performance Director hasn.t been added/,
    )
    // ⚠️ THE STRONGER HALF. Rendering the builder and hiding it would satisfy
    // the card check above and still fetch the club's templates for somebody
    // without the job. The gate must not even ask.
    expect(listTemplatesMock).not.toHaveBeenCalled()
    expect(listDrillsMock).not.toHaveBeenCalled()
  })

  // Same 21 Aug follow-up as the library's: an age typo used to reach
  // Postgres as a raw check-constraint error. Against that bug saveTemplate
  // WOULD fire and this fails.
  it('refuses an age typo in the form, before Postgres sees it', async () => {
    const { user } = renderTemplates()
    await openBuilder(user)
    await user.type(screen.getByLabelText('Youngest age'), '99')

    expect(screen.getByRole('alert')).toHaveTextContent('Ages are 4 to 19')
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    expect(saveTemplateMock).not.toHaveBeenCalled()
  })

  it('lists templates with their total, band and contact flag', async () => {
    renderTemplates()

    const row = await screen.findByTestId('template-tpl-1')
    expect(within(row).getByText('Saturday hour')).toBeInTheDocument()
    expect(within(row).getByText('60 min')).toBeInTheDocument()
    expect(within(row).getByText('U9–U13')).toBeInTheDocument()
  })

  it('shows the running total as blocks are added and marks 60', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user)

    // ⚠️ VISIBLE FROM THE FIRST MOMENT, not only once something is added —
    // "the running total is ALWAYS visible while building" is the design rule.
    expect(screen.getByTestId('running-total')).toHaveTextContent('0 / 60 min')

    await addDrill(user, GRID_PASS.id)
    expect(screen.getByTestId('running-total')).toHaveTextContent('30 / 60 min')

    await addDrill(user, WIDE_GAME.id)
    expect(screen.getByTestId('running-total')).toHaveTextContent('60 / 60 min')

    // At the target, nothing is being warned about.
    expect(screen.getByTestId('running-total')).not.toHaveTextContent(/not 60/)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks before saving 65 and saves on confirm', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user)

    await addDrill(user, LADDER.id) // 15
    await addDrill(user, KEEP_BALL.id) // 20
    await addDrill(user, GRID_PASS.id) // 30
    expect(screen.getByTestId('running-total')).toHaveTextContent('65 / 60 min')

    await user.click(screen.getByRole('button', { name: 'Save template' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('This is 65 minutes, not 60. Save anyway?')
    // ⚠️ THE DISCRIMINATING HALF, AND THE ONE THE FAULT INJECTION TARGETS. A
    // build that saved first and asked afterwards would still show this dialog.
    expect(saveTemplateMock).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }))

    // ⚠️ THE EXACT ARGUMENTS, NOT objectContaining. The template row must be
    // BARE — a row carrying `blocks` is an unknown column and PostgREST answers
    // 400 — and total_minutes is the data layer's to compute, never ours.
    await waitFor(() =>
      expect(saveTemplateMock).toHaveBeenCalledWith(
        {
          club_id: CLUB,
          name: 'Tuesday hour',
          min_age: null,
          max_age: null,
          requires_contact: false,
          notes: null,
        },
        [
          { drill_id: LADDER.id, minutes: 15, coach_note: null },
          { drill_id: KEEP_BALL.id, minutes: 20, coach_note: null },
          { drill_id: GRID_PASS.id, minutes: 30, coach_note: null },
        ],
      ),
    )
  })

  it('saves a 60 straight away, without ever asking', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user, 'Exactly sixty')

    await addDrill(user, GRID_PASS.id) // 30
    await addDrill(user, WIDE_GAME.id) // 30

    await user.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(() => expect(saveTemplateMock).toHaveBeenCalledTimes(1))
    // No dialog was ever drawn — at the target, Save goes straight through.
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(saveTemplateMock.mock.calls[0][1]).toEqual([
      { drill_id: GRID_PASS.id, minutes: 30, coach_note: null },
      { drill_id: WIDE_GAME.id, minutes: 30, coach_note: null },
    ])
  })

  it('offers only drills that fit the template band and contact, and says why for the rest', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user)

    // A tag template for U9–U13. The draft's OWN band is what the picker reads,
    // so this is answered before the template has ever been saved.
    await user.type(screen.getByLabelText('Youngest age'), '9')
    await user.type(screen.getByLabelText('Oldest age'), '13')

    const picker = screen.getByLabelText('Add a drill')

    const fits = within(picker).getByRole('option', { name: /Grid passing/ })
    expect(fits).not.toBeDisabled()

    // ⚠️ OFFERED AND REFUSED, NOT MISSING. A coach who cannot find a drill
    // assumes the library is wrong; a coach who is told why fixes the template.
    const contact = within(picker).getByRole('option', { name: /Chop tackle ladder/ })
    expect(contact).toBeDisabled()
    expect(contact).toHaveTextContent('Contact drill; this template is tag')

    const tooOld = within(picker).getByRole('option', { name: /Sevens set piece/ })
    expect(tooOld).toBeDisabled()
    expect(tooOld).toHaveTextContent('Drill is for U14 and up; template is U9–U13')
  })

  it('renumbers positions after a move up', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user, 'Reordered hour')

    await addDrill(user, GRID_PASS.id) // 30
    await addDrill(user, WIDE_GAME.id) // 30

    const rows = blockRows()
    expect(rows).toHaveLength(2)
    // The ends have nowhere to go, and say so rather than doing nothing.
    expect(within(rows[0]).getByRole('button', { name: 'Move up' })).toBeDisabled()
    expect(within(rows[1]).getByRole('button', { name: 'Move down' })).toBeDisabled()

    await user.click(within(rows[1]).getByRole('button', { name: 'Move up' }))

    await user.click(screen.getByRole('button', { name: 'Save template' }))

    // ⚠️ THE ORDER HANDED OVER IS THE ONLY SOURCE OF TRUTH FOR position — the
    // data layer renumbers 1..n from it. Asserting the on-screen order alone
    // would pass against a builder that swapped the rows and saved the old
    // order.
    await waitFor(() => expect(saveTemplateMock).toHaveBeenCalledTimes(1))
    expect(saveTemplateMock.mock.calls[0][1]).toEqual([
      { drill_id: WIDE_GAME.id, minutes: 30, coach_note: null },
      { drill_id: GRID_PASS.id, minutes: 30, coach_note: null },
    ])
  })

  it('says why an added block no longer fits when the band changes under it', async () => {
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user)

    await addDrill(user, SEVENS_SET.id)
    // Now narrow the template underneath it. ⚠️ THE BLOCK IS NOT SILENTLY
    // DROPPED — somebody put it there on purpose, and losing it without a word
    // is worse than showing it with its reason.
    await user.type(screen.getByLabelText('Oldest age'), '13')

    const row = blockRows()[0]
    expect(within(row).getByText(/Drill is for U14 and up; template is up to U13/)).toBeInTheDocument()
  })

  it('offers Retire and never Delete', async () => {
    const { user } = renderTemplates()

    await user.click(await screen.findByTestId('template-tpl-1'))

    expect(await screen.findByRole('button', { name: /retire/i })).toBeInTheDocument()
    // ⚠️ ASKED AFTER THE TEMPLATE IS OPEN. Before it opens there is no Delete
    // button anywhere either, so the same assertion on the closed list would
    // pass against a screen that offers Delete.
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(setTemplateActiveMock).toHaveBeenCalledWith('tpl-1', false))
  })

  it('keeps the builder open, with the error, on a refused write', async () => {
    saveTemplateMock.mockRejectedValue(
      new Error("We couldn't save that — you may not have the Rugby Performance Director right."),
    )
    const { user } = renderTemplates()
    await screen.findByTestId('template-tpl-1')
    await openBuilder(user, 'Refused hour')

    await addDrill(user, GRID_PASS.id)
    await addDrill(user, WIDE_GAME.id)
    await user.click(screen.getByRole('button', { name: 'Save template' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save that/i)
    expect(screen.getByLabelText('Template name')).toHaveValue('Refused hour')
  })
})

// ── The Director's template suggestion queue (27 Aug 2026) ──────────────────
describe('TrainingTemplates — coach suggestions', () => {
  const SUB = { id: 'tpl-sub', name: 'U10 skills night', total_minutes: 60, team_id: 'team-u10', submitted_at: '2026-08-27T00:00:00Z', blocks: [{ id: 'x', position: 1, drill_id: 'd', minutes: 60, coach_note: null }] }

  it('approves a suggested template into the club library', async () => {
    listSubmittedTemplatesMock.mockResolvedValue([SUB])
    const { user } = renderTemplates()
    const panel = await screen.findByTestId('template-suggestions')
    expect(within(panel).getByText('U10 skills night')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: /add to club library/i }))
    await waitFor(() => expect(approveTemplateToClubMock).toHaveBeenCalledWith('tpl-sub'))
  })

  it('dismisses a suggested template', async () => {
    listSubmittedTemplatesMock.mockResolvedValue([SUB])
    const { user } = renderTemplates()
    const panel = await screen.findByTestId('template-suggestions')
    await user.click(within(panel).getByRole('button', { name: /keep it theirs/i }))
    await waitFor(() => expect(dismissTemplateSubmissionMock).toHaveBeenCalledWith('tpl-sub'))
  })
})
