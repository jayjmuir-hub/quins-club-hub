import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Publish tab of the Rugby Performance Director portal.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 8).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⛔ NOTHING ON THIS SCREEN MAY KEY ON A WEEKDAY, and no test here supplies
// one. Publish is a template, some squads and a DATE RANGE; the database
// function finds those squads' own training events inside the range. A screen
// that knew "Tuesday" would be wrong for every squad that trains on another
// day, and there is no day name, no getDay() and no weekday fixture anywhere.
//
// ⚠️ WHAT IS PINNED, i.e. the things a plausible tidy-up would break:
//   - a squad that does not fit the template is OFFERED DISABLED WITH ITS
//     REASON, never silently filtered out of the list;
//   - preview WRITES NOTHING, and the Publish button does not exist until a
//     preview for the CURRENT inputs exists — change a date and it is gone
//     again, because the rows on screen no longer describe what would happen;
//   - publish is called with exactly the arguments the preview was called with.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9 — the repo is public
// and the club's members are mostly children.

const useMembershipsMock = vi.fn()
const listTemplatesMock = vi.fn()
const previewPublishMock = vi.fn()
const publishMock = vi.fn()
const listFocusMock = vi.fn()
const upsertFocusMock = vi.fn()
const deleteFocusMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL REQUEST. CI sets
// placeholder Supabase env vars, so the client constructs happily, the promise
// never settles, and the screen sits in `loading` forever. See src/test/setup.js.
vi.mock('../src/data/trainingPlans.js', () => ({
  listTemplates: (...args) => listTemplatesMock(...args),
  previewPublish: (...args) => previewPublishMock(...args),
  publish: (...args) => publishMock(...args),
  listFocus: (...args) => listFocusMock(...args),
  upsertFocus: (...args) => upsertFocusMock(...args),
  deleteFocus: (...args) => deleteFocusMock(...args),
}))

import TrainingPublish from '../src/screens/TrainingPublish.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'

// Invented squads whose SHAPES are the real ones. The four cases the fit rule
// has to separate: a tag squad, a contact squad in band, a name with no band
// in it, and a contact squad outside the band.
const TEAMS = [
  { id: 't-u12m', club_id: CLUB, name: 'U12 Mixed', sort_order: 1, requires_contact: false },
  { id: 't-u14b', club_id: CLUB, name: 'U14B', sort_order: 2, requires_contact: true },
  { id: 't-senior', club_id: CLUB, name: 'Senior Men', sort_order: 3, requires_contact: true },
  { id: 't-u18b', club_id: CLUB, name: 'U18B', sort_order: 4, requires_contact: true },
]

const CONTACT_HOUR = {
  id: 'tpl-contact',
  club_id: CLUB,
  name: 'Contact hour',
  min_age: 9,
  max_age: 16,
  requires_contact: true,
  notes: null,
  total_minutes: 60,
  is_active: true,
}

// ⚠️ A SECOND TEMPLATE EXISTS SO THAT THE BOX CAN BE *CHANGED*. Every squad in
// TEAMS with a readable band fits this one, which is what makes the switch to
// the contact template the thing under test rather than the tick itself.
const TAG_HOUR = {
  id: 'tpl-tag',
  club_id: CLUB,
  name: 'Tag hour',
  min_age: 7,
  max_age: 16,
  requires_contact: false,
  notes: null,
  total_minutes: 60,
  is_active: true,
}

const FOCUS_ROWS = [
  {
    id: 'focus-1',
    club_id: CLUB,
    team_id: 't-u14b',
    title: 'Breakdown block',
    starts_on: '2026-08-01',
    ends_on: '2026-08-28',
    notes: null,
  },
]

/** ⚠️ `status: 'active'` is load-bearing — adminRights() skips anything else. */
function admin(rights = ['training']) {
  return [
    { id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB, admin_rights: rights },
  ]
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

function renderPublish(rows = admin()) {
  const user = userEvent.setup()
  useMembershipsMock.mockReturnValue(memberships(rows))
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TrainingPublish />
    </MemoryRouter>,
  )
  return { user }
}

/**
 * ⚠️ `fireEvent.change` FOR A DATE BOX, NOT `user.type`. jsdom's date input
 * takes a whole ISO value; typing into it character by character produces
 * intermediate values that are not dates and the box discards them.
 */
function setDate(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Choose the template, tick U14B, and pin both ends of the range. */
async function pickTheContactHour(user) {
  await user.selectOptions(await screen.findByLabelText('Template'), CONTACT_HOUR.id)
  await user.click(screen.getByRole('checkbox', { name: /U14B/ }))
  setDate('From', '2026-09-01')
  setDate('To', '2026-09-29')
}

const ARGS = {
  templateId: CONTACT_HOUR.id,
  teamIds: ['t-u14b'],
  from: '2026-09-01',
  to: '2026-09-29',
}

beforeEach(() => {
  vi.clearAllMocks()
  listTemplatesMock.mockImplementation(async () => [TAG_HOUR, CONTACT_HOUR])
  listFocusMock.mockImplementation(async () => FOCUS_ROWS)
  previewPublishMock.mockImplementation(async () => [
    { team_id: 't-u14b', will_write: 3, skipped_coach_edited: 1, no_events: false },
  ])
  publishMock.mockImplementation(async () => [
    { team_id: 't-u14b', will_write: 3, skipped_coach_edited: 1, no_events: false },
  ])
  upsertFocusMock.mockImplementation(async (focus) => ({ id: 'focus-new', ...focus }))
  deleteFocusMock.mockImplementation(async (id) => ({ id }))
})

describe('TrainingPublish', () => {
  it('shows the not-your-job card without the training right, and asks for nothing', async () => {
    renderPublish(admin([]))

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Rugby Performance Director hasn.t been added/,
    )
    // ⚠️ THE STRONGER HALF. Rendering the screen and hiding it would satisfy
    // the card check above and still fetch the club's templates and focus rows
    // for somebody without the job. The gate must not even ask.
    expect(listTemplatesMock).not.toHaveBeenCalled()
    expect(listFocusMock).not.toHaveBeenCalled()
  })

  it('disables a tag squad for a contact template with the reason; age only annotates', async () => {
    const { user } = renderPublish()
    await user.selectOptions(await screen.findByLabelText('Template'), CONTACT_HOUR.id)

    // A tag squad under a contact template: offered, refused, and told why.
    // ⚠️ THE CONTACT HALF IS UNCHANGED by the 2 Sep 2026 age loosening.
    const tagSquad = screen.getByRole('checkbox', { name: /U12 Mixed/ })
    expect(tagSquad).toBeDisabled()
    expect(screen.getByText('Contact template; this squad is tag')).toBeInTheDocument()

    // ⚠️ THE NULL-BAND CASE, REVERSED. "Senior Men" has no band in its name.
    // Until 2 Sep 2026 that was a refusal ("Can't tell this squad's age group
    // from its name"); now a name with no band is never outside anything, so
    // the squad is tickable with no note at all. Contact, above, is what kept
    // the twelve-year-old squad away from the adult contact form, and it still
    // does.
    const seniors = screen.getByRole('checkbox', { name: /^Senior Men$/ })
    expect(seniors).toBeEnabled()
    expect(screen.queryByText(/can.t tell this squad/i)).not.toBeInTheDocument()

    // Out of band: tickable, with the band said beside it and in the name —
    // in the muted colour, never the refusal red.
    const u18 = screen.getByRole('checkbox', { name: "U18B, U18 is outside this template's U9–U16" })
    expect(u18).toBeEnabled()
    const note = screen.getByText("U18 is outside this template's U9–U16")
    expect(note.className).toMatch(/text-ink-muted/)
    expect(note.className).not.toMatch(/danger/)

    expect(screen.getByRole('checkbox', { name: /^U14B$/ })).toBeEnabled()
  })

  it('counts the ticked out-of-band squads in one sentence, and stays a note not a gate', async () => {
    const { user } = renderPublish()
    await user.selectOptions(await screen.findByLabelText('Template'), CONTACT_HOUR.id)
    expect(screen.queryByText(/outside this template's band/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /^U18B/ }))
    expect(screen.getByRole('status')).toHaveTextContent(
      "1 squad is outside this template's band — publishing anyway is your call.",
    )
    expect(screen.getByRole('checkbox', { name: /^U18B/ })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /^U14B$/ }))
    expect(screen.getByRole('status')).toHaveTextContent('1 squad is outside')

    await user.click(screen.getByRole('checkbox', { name: /^U18B/ }))
    expect(screen.queryByText(/outside this template's band/)).not.toBeInTheDocument()
  })

  it('previews before it publishes, and the confirm button carries the counts', async () => {
    const { user } = renderPublish()
    await screen.findByLabelText('Template')
    await pickTheContactHour(user)

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    // ⚠️ PREVIEW WRITES NOTHING. Same server function, `_preview` true — the
    // only thing that proves the screen asked the harmless question is that
    // publish() was not the one called.
    await waitFor(() => expect(previewPublishMock).toHaveBeenCalledWith(ARGS))
    expect(publishMock).not.toHaveBeenCalled()

    const row = await screen.findByTestId('preview-t-u14b')
    expect(within(row).getByText('U14B')).toBeInTheDocument()
    expect(row).toHaveTextContent('3 sessions will get the plan · 1 kept (coach edited)')

    await user.click(await screen.findByRole('button', { name: /Publish to 1 squad/ }))

    // The SAME arguments. A publish that quietly re-read the boxes could send
    // something the preview never described.
    await waitFor(() => expect(publishMock).toHaveBeenCalledWith(ARGS))
    expect(
      await screen.findByText('Published to 1 squad — 3 sessions updated, 1 kept.'),
    ).toBeInTheDocument()
  })

  it('never calls publish without a preview first', async () => {
    const { user } = renderPublish()
    await screen.findByLabelText('Template')
    await pickTheContactHour(user)

    // Everything is chosen and the button still does not exist.
    expect(screen.queryByRole('button', { name: /publish to/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByRole('button', { name: /Publish to 1 squad/ })).toBeInTheDocument()

    // ⚠️ AND IT GOES AWAY AGAIN. The rows on screen describe the OLD range, so
    // a Publish button surviving a date change would be offering to do
    // something nobody has been shown.
    setDate('To', '2026-10-31')
    expect(screen.queryByRole('button', { name: /publish to/i })).toBeNull()
    expect(screen.queryByTestId('preview-t-u14b')).toBeNull()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('drops a squad that stops fitting when the template is changed', async () => {
    // ⚠️ THE HOLE THIS PINS. A squad ticked under the tag template and left
    // ticked when the template becomes a contact one is a squad the user
    // CANNOT untick — its chip is disabled by then — and publish_training does
    // no fitness check of its own, so the tag squad would have been handed an
    // adult contact plan by an argument list nobody could see. Two things have
    // to hold: the tick is gone, and the argument list is built from the fit.
    previewPublishMock.mockImplementation(async () => [
      { team_id: 't-u14b', will_write: 2, skipped_coach_edited: 0, no_events: false },
    ])

    const { user } = renderPublish()
    await user.selectOptions(await screen.findByLabelText('Template'), TAG_HOUR.id)

    await user.click(screen.getByRole('checkbox', { name: /U12 Mixed/ }))
    await user.click(screen.getByRole('checkbox', { name: /U14B/ }))
    expect(screen.getByRole('checkbox', { name: /U12 Mixed/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.selectOptions(screen.getByLabelText('Template'), CONTACT_HOUR.id)

    const tagSquad = screen.getByRole('checkbox', { name: /U12 Mixed/ })
    expect(tagSquad).toHaveAttribute('aria-checked', 'false')
    expect(tagSquad).toBeDisabled()
    expect(screen.getByText('Contact template; this squad is tag')).toBeInTheDocument()

    setDate('From', '2026-09-01')
    setDate('To', '2026-09-29')
    await user.click(screen.getByRole('button', { name: 'Preview' }))

    // One squad, and it is the one that still fits.
    expect(await screen.findByRole('button', { name: /Publish to 1 squad/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(previewPublishMock).toHaveBeenCalledWith({
        templateId: CONTACT_HOUR.id,
        teamIds: ['t-u14b'],
        from: '2026-09-01',
        to: '2026-09-29',
      }),
    )
  })

  it('sends two squads in sort_order, whichever order they were ticked in', async () => {
    // ⚠️ THE ARRAY GOES STRAIGHT TO THE DATABASE FUNCTION. Ticking U14B first
    // must not produce a different argument list from ticking U12 Mixed first,
    // or two identical publishes read as different ones in a log.
    previewPublishMock.mockImplementation(async () => [
      { team_id: 't-u12m', will_write: 1, skipped_coach_edited: 0, no_events: false },
      { team_id: 't-u14b', will_write: 2, skipped_coach_edited: 0, no_events: false },
    ])

    const { user } = renderPublish()
    await user.selectOptions(await screen.findByLabelText('Template'), TAG_HOUR.id)

    // Reverse of the drawn order: sort_order 2 first, then sort_order 1.
    await user.click(screen.getByRole('checkbox', { name: /U14B/ }))
    await user.click(screen.getByRole('checkbox', { name: /U12 Mixed/ }))

    setDate('From', '2026-09-01')
    setDate('To', '2026-09-29')
    await user.click(screen.getByRole('button', { name: 'Preview' }))

    await waitFor(() =>
      expect(previewPublishMock).toHaveBeenCalledWith(
        expect.objectContaining({ teamIds: ['t-u12m', 't-u14b'] }),
      ),
    )
    expect(await screen.findByRole('button', { name: /Publish to 2 squads/ })).toBeInTheDocument()
  })

  it('counts the squads that got something, not the rows that came back', async () => {
    // ⚠️ A SQUAD WITH NO TRAINING IN THE RANGE STILL RETURNS A ROW. Counting
    // rows told a director the plan had reached a squad whose sessions were
    // never touched, and that sentence is all they get.
    previewPublishMock.mockImplementation(async () => [
      { team_id: 't-u12m', will_write: 0, skipped_coach_edited: 0, no_events: true },
      { team_id: 't-u14b', will_write: 3, skipped_coach_edited: 1, no_events: false },
    ])
    publishMock.mockImplementation(async () => [
      { team_id: 't-u12m', will_write: 0, skipped_coach_edited: 0, no_events: true },
      { team_id: 't-u14b', will_write: 3, skipped_coach_edited: 1, no_events: false },
    ])

    const { user } = renderPublish()
    await user.selectOptions(await screen.findByLabelText('Template'), TAG_HOUR.id)
    await user.click(screen.getByRole('checkbox', { name: /U12 Mixed/ }))
    await user.click(screen.getByRole('checkbox', { name: /U14B/ }))
    setDate('From', '2026-09-01')
    setDate('To', '2026-09-29')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByTestId('preview-t-u12m')).toHaveTextContent(
      'No training in this range',
    )

    await user.click(await screen.findByRole('button', { name: /Publish to 2 squads/ }))

    expect(
      await screen.findByText('Published to 1 squad — 3 sessions updated, 1 kept.'),
    ).toBeInTheDocument()
  })

  it('says so when a preview comes back with nothing', async () => {
    // ⚠️ EMPTY HAS TWO MEANINGS ON THIS SCREEN. Silence is what "not asked
    // yet" looks like, so an answer of nothing drawn as silence reads as a
    // button that did not work.
    previewPublishMock.mockImplementation(async () => [])

    const { user } = renderPublish()
    await screen.findByLabelText('Template')
    await pickTheContactHour(user)

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nothing to preview — pick a template and at least one squad.',
    )
    expect(screen.queryByRole('button', { name: /publish to/i })).toBeNull()
  })

  it('adds a focus for a squad and a date range', async () => {
    const { user } = renderPublish()
    await screen.findByText('Breakdown block')

    await user.click(screen.getByRole('button', { name: 'Add a focus' }))
    await user.selectOptions(screen.getByLabelText('Focus squad'), 't-u14b')
    await user.type(screen.getByLabelText('Focus title'), 'Scrum block')
    setDate('Focus starts', '2026-09-01')
    setDate('Focus ends', '2026-09-28')

    await user.click(screen.getByRole('button', { name: 'Save focus' }))

    await waitFor(() =>
      expect(upsertFocusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          club_id: CLUB,
          team_id: 't-u14b',
          title: 'Scrum block',
          starts_on: '2026-09-01',
          ends_on: '2026-09-28',
        }),
      ),
    )
  })

  // ⚠️ THE DATES ARE NOT OPTIONAL AND THEY HAVE AN ORDER. `training_focus`
  // has both columns NOT NULL under `check (ends_on >= starts_on)`, so a
  // Save allowed through here comes back as a raw Postgres constraint name.
  it('will not save a focus with a blank Ends', async () => {
    const { user } = renderPublish()
    await screen.findByText('Breakdown block')

    await user.click(screen.getByRole('button', { name: 'Add a focus' }))
    await user.selectOptions(screen.getByLabelText('Focus squad'), 't-u14b')
    await user.type(screen.getByLabelText('Focus title'), 'Scrum block')
    setDate('Focus starts', '2026-09-01')

    expect(screen.getByRole('button', { name: 'Save focus' })).toBeDisabled()
    expect(upsertFocusMock).not.toHaveBeenCalled()
  })

  it('says so, and will not save, when Ends is before Starts', async () => {
    const { user } = renderPublish()
    await screen.findByText('Breakdown block')

    await user.click(screen.getByRole('button', { name: 'Add a focus' }))
    await user.selectOptions(screen.getByLabelText('Focus squad'), 't-u14b')
    await user.type(screen.getByLabelText('Focus title'), 'Scrum block')
    setDate('Focus starts', '2026-09-28')
    setDate('Focus ends', '2026-09-01')

    expect(await screen.findByText("Ends can't be before it starts")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save focus' })).toBeDisabled()
    expect(upsertFocusMock).not.toHaveBeenCalled()
  })

  it('shows the error when a focus refuses to delete', async () => {
    // ⚠️ THE DATA LAYER TURNS AN RLS ZERO-ROW DELETE INTO A THROW. If Remove
    // did not go through the same `run()` as every other write, a refused
    // delete would be drawn as a done one and the label would come back on
    // reload with no explanation.
    deleteFocusMock.mockRejectedValue(new Error('That change was refused.'))
    const { user } = renderPublish()
    await screen.findByText('Breakdown block')

    await user.click(screen.getByRole('button', { name: 'Remove Breakdown block' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove Breakdown block' }))

    expect(await screen.findByText('That change was refused.')).toBeInTheDocument()
  })

  // ⚠️ 2 Sep 2026 UX review, item 4. Remove was a dangerQuiet button that
  // deleted on the FIRST press, against Button.jsx's own contract. Run red
  // against that code.
  it('⚠️ does not delete a focus period on the first tap; Keep backs out', async () => {
    const { user } = renderPublish()
    await screen.findByText('Breakdown block')

    await user.click(screen.getByRole('button', { name: 'Remove Breakdown block' }))
    expect(deleteFocusMock).not.toHaveBeenCalled()
    expect(screen.getByText(/remove breakdown block\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^keep$/i }))
    expect(deleteFocusMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Yes, remove Breakdown block' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Breakdown block' })).toBeInTheDocument()
  })
})
