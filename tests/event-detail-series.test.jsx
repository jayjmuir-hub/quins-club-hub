import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/screens/EventDetail.jsx — what the sheet SHOWS for the three things
// added on 8 Aug 2026 (end time, additional info) and what its Delete step
// DOES for an occurrence that belongs to a repeating series.
//
// Jay's ruling on the delete: FUTURE ONLY. "This and all later sessions"
// removes the occurrence being looked at and every later one; the sessions
// already played stay, because they carry results and availability history.
//
// ⚠️ THE HARD PART IS NOT THE HAPPY PATH. RLS refuses a row by filtering it
// out of the statement rather than raising, so a delete that removed three of
// ten arrives as a perfectly successful response with no error anywhere —
// the same shape that caught this codebase out once already (the silent anon
// downgrade behind the session guard in src/lib/supabase.js). The count and
// the comparison exist for that, and the short-count test below is the only
// thing holding them.

const listAvailabilityMock = vi.fn()
const deleteEventMock = vi.fn()
const deleteSeriesFromMock = vi.fn()
const countSeriesFromMock = vi.fn()
const getSessionMock = vi.fn()

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: () => () => {},
}))

vi.mock('../src/data/events.js', () => ({
  deleteEvent: (...args) => deleteEventMock(...args),
  deleteSeriesFrom: (...args) => deleteSeriesFromMock(...args),
  countSeriesFrom: (...args) => countSeriesFromMock(...args),
}))

// ⚠️ MOCKED BECAUSE AN UNMOCKED DATA MODULE MAKES A REAL REQUEST. The sheet
// mounts SessionPlan on a training event; CI sets placeholder Supabase env
// vars, so the client constructs happily, the promise never settles, and the
// card sits in `loading` forever — with an error that names nothing.
vi.mock('../src/data/trainingPlans.js', () => ({
  getSession: (...args) => getSessionMock(...args),
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

const TEAM_U12 = { id: 't-u12', name: 'U12' }

// 14:00Z is 18:00 in Abu Dhabi; 15:30Z is 19:30.
const ONE_OFF = {
  id: 'e-1',
  team_id: 't-u12',
  type: 'training',
  title: 'U12 Contact',
  opponent: null,
  home: null,
  venue: 'Zayed Sports City, Abu Dhabi',
  pitch: null,
  competition: null,
  starts_at: '2026-08-11T14:00:00.000Z',
  ends_at: '2026-08-11T15:30:00.000Z',
  notes: null,
  series_id: null,
  result_us: null,
  result_them: null,
}

const IN_SERIES = { ...ONE_OFF, series_id: 's-u12-autumn' }

function show(event, props = {}) {
  const onDeleted = vi.fn()
  const onClose = vi.fn()
  render(
    <EventDetail
      event={event}
      team={TEAM_U12}
      onClose={onClose}
      canEdit
      onDeleted={onDeleted}
      {...props}
    />,
  )
  return { onDeleted, onClose, user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  listAvailabilityMock.mockResolvedValue([])
  deleteEventMock.mockResolvedValue(undefined)
  // 13 sessions from this one forward: this one plus 12 later.
  countSeriesFromMock.mockResolvedValue(13)
  getSessionMock.mockResolvedValue(null)
  deleteSeriesFromMock.mockImplementation(async () =>
    Array.from({ length: 13 }, (_, i) => ({ id: `e-${i}` })),
  )
})

// --- what the sheet shows -------------------------------------------------

describe('EventDetail — end time', () => {
  it('shows the start and the finish', async () => {
    show(ONE_OFF)
    // 18:00–19:30 Abu Dhabi, rendered in the reader's locale, so this asserts
    // on the numbers and the dash rather than on a locale-specific string.
    // The zone note is its own span inside the line, so read the whole line.
    const line = (await screen.findByText(/Abu Dhabi time/)).closest('p')
    expect(line.textContent).toMatch(/\b0?6:00\b|\b18:00\b/)
    expect(line.textContent).toMatch(/\b0?7:30\b|\b19:30\b/)
    expect(line.textContent).toContain('–')
  })

  it('shows the start alone when there is no end time', () => {
    // ⚠️ The ordinary state of every event created before the column existed,
    // and of anything an external fixture feed sends. It must NOT borrow the
    // calendar feed's per-type duration guess and present it as fact.
    show({ ...ONE_OFF, ends_at: null })
    const line = screen.getByText(/Abu Dhabi time/).closest('p')
    expect(line.textContent).toMatch(/\b0?6:00\b|\b18:00\b/)
    expect(line.textContent).not.toContain('–')
  })
})

describe('EventDetail — pitch and portion', () => {
  it('shows the share to staff — "sharing ⅓" — when a booking takes part of a pitch', () => {
    // Item 4, refined 30 Aug 2026: a shared pitch reads "D2 · sharing ½" so a
    // coach knows the pitch is split. The glyph (½), not the word "Half", which
    // read like a second pitch.
    show({ ...ONE_OFF, pitch: 'D2', pitch_portion: 'half' }) // `show` passes canEdit
    const row = screen.getByText('Pitch').closest('div')
    expect(row).toHaveTextContent('D2')
    expect(row).toHaveTextContent('sharing ½')
  })

  it('⚠️ hides the share from a parent or player (cannot edit)', () => {
    // How the ground is carved up is a pitch-management detail — noise to a
    // parent, and the confusion this whole change is about. No canEdit, no share.
    show({ ...ONE_OFF, pitch: 'D2', pitch_portion: 'half' }, { canEdit: false })
    const row = screen.getByText('Pitch').closest('div')
    expect(row).toHaveTextContent('D2')
    expect(row.textContent).not.toMatch(/sharing|½|half/i)
  })

  it('shows the pitch alone when it is a whole pitch (full or unset)', () => {
    // A full/unset pitch is nobody's share, so even staff see just the pitch.
    show({ ...ONE_OFF, pitch: 'D2', pitch_portion: 'full' })
    const full = screen.getByText('Pitch').closest('div')
    expect(full).toHaveTextContent('D2')
    expect(full.textContent).not.toMatch(/sharing/i)

    cleanup()
    show({ ...ONE_OFF, pitch: 'D2', pitch_portion: null })
    const unset = screen.getByText('Pitch').closest('div')
    expect(unset).toHaveTextContent('D2')
    expect(unset.textContent).not.toMatch(/sharing|¼|⅓|½/)
  })

  it('shows no pitch row at all when there is no pitch', () => {
    show(ONE_OFF)
    expect(screen.queryByText('Pitch')).not.toBeInTheDocument()
  })
})

describe('EventDetail — additional info', () => {
  it('shows the note when there is one', () => {
    show({ ...ONE_OFF, notes: 'Meet at the gate 30 minutes before.' })
    expect(screen.getByRole('heading', { name: /additional info/i })).toBeInTheDocument()
    expect(screen.getByText('Meet at the gate 30 minutes before.')).toBeInTheDocument()
  })

  it('shows no heading at all when there is none', () => {
    // Same rule as Pitch: an empty labelled block on every event is noise.
    show(ONE_OFF)
    expect(screen.queryByRole('heading', { name: /additional info/i })).not.toBeInTheDocument()
  })

  it('treats an empty string as no note', () => {
    show({ ...ONE_OFF, notes: '' })
    expect(screen.queryByRole('heading', { name: /additional info/i })).not.toBeInTheDocument()
  })
})

// --- deleting -------------------------------------------------------------

describe('deleting an event that is NOT in a series', () => {
  it('behaves exactly as it did before: one confirm, one delete', async () => {
    const { user, onDeleted } = show(ONE_OFF)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /later session/i })).not.toBeInTheDocument()
    // No series means nothing to count, so nothing is asked of the database.
    expect(countSeriesFromMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith('e-1'))
    expect(deleteSeriesFromMock).not.toHaveBeenCalled()
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })
})

describe('deleting an occurrence of a series', () => {
  it('offers two destructive choices, and names how many are going', async () => {
    const { user } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The count is asked for from THIS occurrence forward — past sessions
    // are not being deleted and must not be counted as though they were.
    await waitFor(() =>
      expect(countSeriesFromMock).toHaveBeenCalledWith('s-u12-autumn', '2026-08-11T14:00:00.000Z'),
    )

    expect(await screen.findByRole('button', { name: 'Just this one' })).toBeInTheDocument()
    // 13 from here forward = this one and 12 later.
    expect(
      await screen.findByRole('button', { name: 'This and 12 later sessions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep it/i })).toBeInTheDocument()
  })

  it('says the already-played sessions are staying', async () => {
    const { user } = show(IN_SERIES)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/already started stay/i)).toBeInTheDocument()
  })

  it('still deletes only this one down the "Just this one" path', async () => {
    const { user, onDeleted } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Just this one' }))

    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith('e-1'))
    expect(deleteSeriesFromMock).not.toHaveBeenCalled()
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('deletes from this occurrence forward down the series path', async () => {
    const { user, onDeleted } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'This and 12 later sessions' }))

    await waitFor(() =>
      expect(deleteSeriesFromMock).toHaveBeenCalledWith(
        's-u12-autumn',
        '2026-08-11T14:00:00.000Z',
      ),
    )
    expect(deleteEventMock).not.toHaveBeenCalled()
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('uses the singular when exactly one later session is going', async () => {
    countSeriesFromMock.mockResolvedValue(2)
    const { user } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('button', { name: 'This and 1 later session' })).toBeInTheDocument()
  })

  it('offers no series button on the LAST occurrence', async () => {
    // Nothing later left: "this and all later sessions" and "just this one"
    // would be the same action wearing two labels, which is how someone taps
    // the wrong one.
    countSeriesFromMock.mockResolvedValue(1)
    const { user } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(countSeriesFromMock).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Just this one' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /later session/i })).not.toBeInTheDocument()
  })

  it('withdraws the series button when the count itself fails', async () => {
    // A button promising "all later sessions" against a number nobody has is
    // a promise that cannot be checked afterwards. The single delete stays.
    countSeriesFromMock.mockRejectedValue(new Error('network down'))
    const { user } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/couldn't check how many/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /later session/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Just this one' })).toBeInTheDocument()
  })

  it('surfaces a refusal instead of closing the sheet', async () => {
    deleteSeriesFromMock.mockRejectedValue(
      new Error("We couldn't delete that. You may not have permission."),
    )
    const { user, onDeleted } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'This and 12 later sessions' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't delete that/i)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('WARNS rather than reporting success when fewer rows went than promised', async () => {
    // ⚠️ THE WHOLE REASON deleteSeriesFrom RETURNS ITS ROWS. PostgREST reports
    // an RLS-refused row as a successful absence, so 13 asked for and 4
    // deleted arrives here as a clean success. Reporting "done" would leave a
    // coach telling a squad that nine sessions are cancelled when they are
    // still in everyone's calendar.
    deleteSeriesFromMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    const { user, onDeleted } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'This and 12 later sessions' }))

    const alert = await screen.findByRole('alert')
    // Both numbers, plainly: what was attempted and what actually went.
    expect(alert).toHaveTextContent(/13/)
    expect(alert).toHaveTextContent(/4/)
    expect(alert).toHaveTextContent(/still there/i)
    // NOT success: the sheet stays, and the caller is not told the event is
    // gone (it isn't — some of the series survived).
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('reports success only when the row count matches what the button promised', async () => {
    const { user, onDeleted } = show(IN_SERIES)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'This and 12 later sessions' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(screen.queryByText(/still there/i)).not.toBeInTheDocument()
  })

  it('offers no delete at all to someone who cannot edit this squad', async () => {
    show(IN_SERIES, { canEdit: false })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /later session/i })).toBeNull()
  })
})

// --- the session plan ------------------------------------------------------

describe('EventDetail — the session plan', () => {
  it('shows no heading for a training event with no plan, to a member', async () => {
    // Most training sessions have no published plan. An empty "Session plan"
    // heading on every one of them is noise on the screen members read.
    // ⚠️ canEdit:false — since 27 Aug 2026 a COACH does get a card here (it is
    // where they build the first plan); a parent still sees nothing.
    show(ONE_OFF, { canEdit: false })
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledWith('e-1'))
    expect(screen.queryByRole('heading', { name: /session plan/i })).not.toBeInTheDocument()
  })

  it('never asks for a session plan on a match', async () => {
    // ⚠️ THE GATE IS IN THIS SCREEN, and this is what holds it. A match has
    // no session plan, so the read must not happen at all — a card that
    // rendered nothing would still have cost a round trip per fixture.
    show({ ...ONE_OFF, type: 'match', opponent: 'Dubai Wanderers', home: true })
    await waitFor(() => expect(listAvailabilityMock).toHaveBeenCalled())
    expect(getSessionMock).not.toHaveBeenCalled()
  })
})

// --- whole club (club-wide events, 30 Aug 2026) --------------------------
describe('EventDetail — whole club', () => {
  it('reads "Whole club" and shows no roster RSVP for a squad-less event', () => {
    // A club-wide event (team_id null) has no roster, so the player-based
    // availability section is suppressed — it would render empty and confuse.
    show({ ...ONE_OFF, team_id: null, type: 'social', title: 'Adult Tag' }, { team: null })
    const ageRow = screen.getByText('Age group').closest('div')
    expect(ageRow).toHaveTextContent('Whole club')
    expect(screen.queryByRole('heading', { name: /availability/i })).not.toBeInTheDocument()
  })

  it('a normal squad social still shows the availability section', () => {
    // The control: hiding RSVP is specific to club-wide, not to socials.
    show({ ...ONE_OFF, type: 'social', title: 'Team dinner' })
    expect(screen.getByRole('heading', { name: /availability/i })).toBeInTheDocument()
  })
})
