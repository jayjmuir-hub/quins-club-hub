import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { pickDate } from './helpers/pickDate.js'

// Unit tests for src/screens/EventForm.jsx (Task 14) plus the wiring that
// opens it — Schedule's "Add" button and EventDetail's Edit/Delete footer.
// useMemberships and every data module are mocked, so no network is
// reachable from this file.
//
// PROCESS ZONE. This whole file runs under America/New_York, deliberately.
// The single most-regressed thing in this codebase is Abu Dhabi time, and
// the form's job on submit is to read the typed date/time as Abu Dhabi
// wall-clock and write the matching UTC instant. Under a UTC runner a naive
// `new Date(`${date}T${time}`)` produces the right answer by accident and
// the assertion proves nothing; under New York it is four (or five) hours
// wrong. Set before any module is imported so the runtime picks it up.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()
const deleteEventMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
  upsertEvent: (...args) => upsertEventMock(...args),
  deleteEvent: (...args) => deleteEventMock(...args),
}))

// Only reached when a fixture row opens EventDetail; mocked so this file
// stays network-free either way.
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

// Imported after vi.mock so these bind to the mocked modules.
import EventForm from '../src/screens/EventForm.jsx'
import Schedule from '../src/screens/Schedule.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'

const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAM_1XV = { id: 't-1xv', club_id: CLUB_ID, name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_1XV, TEAM_U12, TEAM_U14] // deliberately unsorted

const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]
const COACH_U12 = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u12' }]
const COACH_TWO = [
  { id: 'm-c1', role: 'coach', status: 'active', team_id: 't-u12' },
  { id: 'm-c2', role: 'coach', status: 'active', team_id: 't-u14' },
]
const PARENT = [{ id: 'm-p', role: 'parent', team_id: 't-u12', player_id: 'p1' }]

// 16:00Z on 30 Jul 2026 is 20:00 in Abu Dhabi — and 12:00 in New York, the
// zone this file runs under.
const EXISTING_MATCH = {
  id: 'e-1',
  club_id: CLUB_ID,
  team_id: 't-u12',
  type: 'match',
  title: null,
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City, Abu Dhabi',
  competition: 'UAE Youth League',
  starts_at: '2026-07-30T16:00:00.000Z',
  // 20:00–22:00 Abu Dhabi. See the ends_at note on the multi-squad fixture:
  // the null-ends_at edit path is covered separately, below.
  ends_at: '2026-07-30T18:00:00.000Z',
  result_us: null,
  result_them: null,
}

function membershipValue(memberships, teams = TEAMS) {
  return { memberships, teams, loading: false, error: null, reload: vi.fn() }
}

function renderForm({ memberships = COACH_U12, teams = TEAMS, event = null, ...rest } = {}) {
  useMembershipsMock.mockReturnValue(membershipValue(memberships, teams))
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const utils = render(<EventForm event={event} onClose={onClose} onSaved={onSaved} {...rest} />)
  return { ...utils, onClose, onSaved }
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  upsertEventMock.mockReset()
  deleteEventMock.mockReset()
  listEventsMock.mockReset()
  subscribeEventsMock.mockReset()
  upsertEventMock.mockResolvedValue({ id: 'e-saved' })
  deleteEventMock.mockResolvedValue(undefined)
  listEventsMock.mockResolvedValue([])
  subscribeEventsMock.mockReturnValue(() => {})
})

// Guard the guard: if Node ever stopped honouring a runtime TZ change, the
// timezone assertions below would pass vacuously against the exact bug they
// exist to catch.
// ⚠️ Schedule and the Dashboard became ROUTER-AWARE on 12 Aug 2026: the match
// sheet is a full-page form, so EventDetail's entry point navigates rather
// than opening a sheet. Rendering them bare now throws "useNavigate() may be
// used only in the context of a <Router>". Wrapping here is the honest fix —
// the real app never renders these outside a Router, and a test that did was
// exercising a shape production does not have.
function withRouter(ui) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe('the test process zone really is hostile', () => {
  it('is not UTC', () => {
    expect(new Date('2026-07-30T16:00:00Z').getHours()).toBe(12)
  })
})

describe('EventForm — shape and scoping', () => {
  it('opens as a sheet titled for adding when there is no event', () => {
    renderForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add event' })).toBeInTheDocument()
  })

  it('opens as a sheet titled for editing when there is an event', () => {
    renderForm({ event: EXISTING_MATCH })
    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
  })

  it('limits the age-group options to the teams the coach can edit', () => {
    renderForm({ memberships: COACH_TWO })
    const select = screen.getByLabelText('Age group')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['U12', 'U14'])
    expect(options).not.toContain('Senior Men 1st XV')
  })

  it('gives an admin every team, in the club sort order', () => {
    renderForm({ memberships: ADMIN })
    const select = screen.getByLabelText('Age group')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['U12', 'U14', 'Senior Men 1st XV'])
  })

  it('refuses to render a form at all when there is no team the user can edit', () => {
    // A parent has no editable team, and canEditTeam(memberships, null) is
    // false by design even for an admin with an unresolvable team. Rendering
    // an empty dropdown over a live Save button would offer a write that RLS
    // will always refuse.
    renderForm({ memberships: PARENT })
    expect(screen.getByRole('alert')).toHaveTextContent(/squad you can add or change/i)
    expect(screen.queryByRole('button', { name: /save|add event/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Age group')).not.toBeInTheDocument()
  })
})

describe('EventForm — conditional fields', () => {
  it('shows the match-only fields for a match and no title field', () => {
    renderForm()
    expect(screen.getByLabelText('Opponent')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Away' })).toBeInTheDocument()
    expect(screen.getByLabelText('Competition')).toBeInTheDocument()
    expect(screen.getByLabelText('Quins score')).toBeInTheDocument()
    expect(screen.getByLabelText('Opposition score')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('swaps to a title field and hides every match-only field for training', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('radio', { name: 'Training' }))

    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.queryByLabelText('Opponent')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Competition')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quins score')).not.toBeInTheDocument()
  })

  it('does the same for social', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('radio', { name: 'Social' }))

    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.queryByLabelText('Opponent')).not.toBeInTheDocument()
  })

  it('keeps the date, time, age group and venue fields for every type', async () => {
    const user = userEvent.setup()
    renderForm()

    for (const type of ['Training', 'Social', 'Match']) {
      await user.click(screen.getByRole('radio', { name: type }))
      expect(screen.getByLabelText('Date')).toBeInTheDocument()
      expect(screen.getByLabelText('Time')).toBeInTheDocument()
      expect(screen.getByLabelText('Age group')).toBeInTheDocument()
      expect(screen.getByLabelText('Venue')).toBeInTheDocument()
    }
  })
})

describe('EventForm — validation', () => {
  it('blocks submit and explains why when required fields are empty', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    // A brand-new match form has no opponent and no time.
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/fill in|before saving/i)
  })

  it('marks the offending fields invalid rather than only shouting at the top', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(screen.getByLabelText('Opponent')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Time')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true')
    // Venue is prefilled and optional — it must not be flagged.
    expect(screen.getByLabelText('Venue')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('requires a title instead of an opponent for training', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('radio', { name: 'Training' }))
    await user.type(screen.getByLabelText('Time'), '17:30')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
  })
})

// --- end time (8 Aug 2026) ------------------------------------------------
//
// REQUIRED in the form, NULLABLE in the database — see
// db/migrations/20260808_event_end_time_and_notes.sql for why those two are
// not in conflict. The form is the only place the requirement exists, so
// these tests are the only thing holding it.

describe('EventForm — end time', () => {
  it('offers an end time next to the start time', () => {
    renderForm()
    expect(screen.getByLabelText('Time')).toBeInTheDocument()
    expect(screen.getByLabelText('End time')).toBeInTheDocument()
  })

  it('refuses to save without one, however complete the rest of the form is', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    // ...and no end time.
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/fill in|before saving/i)
  })

  it('refuses an end BEFORE the start, and says which rule was broken', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '18:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    // Not "fill in the highlighted fields" — the field IS filled in. The
    // database's events_ends_after_starts CHECK is the real boundary, but it
    // surfaces as a raw 23514 that means nothing to a coach.
    expect(screen.getByRole('alert')).toHaveTextContent(/end time must be after the start/i)
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true')
  })

  it('refuses an end EQUAL to the start — a zero-length event is not an event', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '20:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/end time must be after the start/i)
  })

  it('writes ends_at as ABU DHABI wall-clock, like starts_at', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    // 20:00–22:00 Abu Dhabi. This file runs under America/New_York, where the
    // naive construction would give 2026-07-31T02:00:00.000Z for the end.
    expect(written.starts_at).toBe('2026-07-30T16:00:00.000Z')
    expect(written.ends_at).toBe('2026-07-30T18:00:00.000Z')
  })

  it('prefills the end time when editing an event that has one', async () => {
    renderForm({ event: EXISTING_MATCH })
    // 18:00Z is 22:00 in Abu Dhabi and 14:00 in New York.
    expect(screen.getByLabelText('End time')).toHaveValue('22:00')
  })

  it('opens blank on an event with no ends_at, and then requires one to save', async () => {
    // ⚠️ THE ORDINARY CASE FOR EVERY EVENT CREATED BEFORE 8 AUG 2026, and for
    // anything a future external fixture feed sends. Editing one must not
    // show "Invalid Date", and must not save until an end time is supplied.
    const user = userEvent.setup()
    renderForm({ event: { ...EXISTING_MATCH, ends_at: null } })

    expect(screen.getByLabelText('End time')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      id: 'e-1',
      ends_at: '2026-07-30T18:00:00.000Z',
    })
  })
})

// --- tournament mode (phase 3, 29 Aug 2026) -------------------------------
//
// The chooser's Tournament card opens the form as a CONTAINER: the name is the
// identity, and opponent / home-away / league / round / competition-dropdown /
// score / repeats all disappear. "Also add for" STAYS (it fans the container
// out, one tournament per squad — Jay, 30 Aug 2026; see
// tests/multi-squad-and-pitch.test.jsx). Editing is unaffected — this is driven
// by initialKind, not by competition_type. See
// claude/plans/2026-08-29-tournaments-as-containers.md.

describe('EventForm — tournament mode', () => {
  it('opens as a tournament: name at the top, no opponent, no competition dropdown', () => {
    renderForm({ initialKind: 'tournament' })

    expect(screen.getByRole('heading', { name: 'New tournament' })).toBeInTheDocument()
    // The name IS the fixture — a Tournament picker, not an Opponent box.
    expect(screen.getByLabelText('Tournament')).toBeInTheDocument()
    expect(screen.queryByLabelText('Opponent')).not.toBeInTheDocument()
    // The chooser already answered "tournament", so these are all gone.
    expect(screen.queryByLabelText('Competition')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Type' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Home or away' })).not.toBeInTheDocument()
  })

  it('requires a name — "Something else" left blank refuses to save', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'tournament' })

    // The default selection is "Something else…" with an empty custom box.
    await pickDate(user, '2026-09-12')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '15:00')
    await user.click(screen.getByRole('button', { name: /add tournament/i }))

    expect(upsertEventMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tournament name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('saves a container: match + competition_type tournament, no opponent or home', async () => {
    const user = userEvent.setup()
    renderForm({ initialKind: 'tournament' })

    await user.selectOptions(screen.getByLabelText('Tournament'), 'ADHJRT')
    await pickDate(user, '2026-09-12')
    await user.type(screen.getByLabelText('Time'), '09:00')
    await user.type(screen.getByLabelText('End time'), '15:00')
    await user.click(screen.getByRole('button', { name: /add tournament/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    expect(written).toMatchObject({
      type: 'match',
      competition_type: 'tournament',
      competition: 'ADHJRT',
    })
    // Named, not opposed; not home or away — those belong to the games.
    expect(written.opponent).toBeNull()
    expect(written.home).toBeNull()
    // A container is not itself part of another tournament.
    expect(written.tournament_id ?? null).toBeNull()
  })
})

// --- notes (8 Aug 2026) ---------------------------------------------------

describe('EventForm — additional info', () => {
  it('saves what was typed', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.type(
      screen.getByLabelText('Additional info'),
      'Meet at the gate 30 minutes before.',
    )
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].notes).toBe('Meet at the gate 30 minutes before.')
  })

  it('is optional, and writes null rather than an empty string', async () => {
    // Same rule as pitch: '' would render an "Additional info" heading over
    // nothing on the detail sheet and an empty DESCRIPTION line in the feed.
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].notes).toBeNull()
  })

  it('caps the length rather than letting an essay reach the calendar feed', () => {
    renderForm()
    expect(screen.getByLabelText('Additional info')).toHaveAttribute('maxlength', '500')
  })

  it('prefills when editing, and can be cleared back to null', async () => {
    const user = userEvent.setup()
    renderForm({ event: { ...EXISTING_MATCH, notes: 'Bring both kits.' } })

    expect(screen.getByLabelText('Additional info')).toHaveValue('Bring both kits.')

    await user.clear(screen.getByLabelText('Additional info'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].notes).toBeNull()
  })
})

describe('EventForm — saving', () => {
  it('writes the typed date and time as ABU DHABI wall-clock, not the browser zone', async () => {
    const user = userEvent.setup()
    const { onSaved, onClose } = renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    const written = upsertEventMock.mock.calls[0][0]
    // 20:00 in Abu Dhabi. The browser here is in New York, where the naive
    // construction would give 2026-07-31T00:00:00.000Z.
    expect(written.starts_at).toBe('2026-07-30T16:00:00.000Z')
    expect(written).not.toHaveProperty('id')
    expect(written).toMatchObject({
      club_id: CLUB_ID,
      team_id: 't-u12',
      type: 'match',
      opponent: 'Dubai Exiles',
      title: null,
      home: true,
      venue: 'Zayed Sports City, Abu Dhabi',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves the score null when a future fixture has none', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ result_us: null, result_them: null })
  })

  it('records a nil-all draw as a real score, not as no score', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.type(screen.getByLabelText('Quins score'), '0')
    await user.type(screen.getByLabelText('Opposition score'), '0')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ result_us: 0, result_them: 0 })
  })

  it('drops a half-entered score rather than writing an unreadable result', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.type(screen.getByLabelText('Quins score'), '31')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ result_us: null, result_them: null })
  })

  it('sends training with a title, no opponent and no match-only fields', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: COACH_TWO })

    await user.click(screen.getByRole('radio', { name: 'Training' }))
    await user.type(screen.getByLabelText('Title'), 'U14 Contact & Conditioning')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')
    await user.type(screen.getByLabelText('Time'), '17:30')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      type: 'training',
      team_id: 't-u14',
      title: 'U14 Contact & Conditioning',
      opponent: null,
      competition: null,
      result_us: null,
      result_them: null,
    })
  })

  it('prefills an existing event in club time and updates it by id', async () => {
    const user = userEvent.setup()
    renderForm({ event: EXISTING_MATCH })

    // 16:00Z is 20:00 in Abu Dhabi and 12:00 in New York.
    // The DatePicker trigger shows the value formatted, not a raw input value.
    expect(screen.getByLabelText('Date')).toHaveTextContent('30 Jul 2026')
    expect(screen.getByLabelText('Time')).toHaveValue('20:00')
    expect(screen.getByLabelText('Opponent')).toHaveValue('Dubai Exiles')
    // ⚠️ Competition became a SELECT on 12 Aug 2026. This fixture predates
    // `competition_type`, so it holds free text and a null type — which the
    // form reads as a tournament whose name is that text, keeping what somebody
    // typed rather than orphaning it on the next save.
    expect(screen.getByLabelText('Competition')).toHaveValue('tournament')
    expect(screen.getByLabelText(/tournament name/i)).toHaveValue('UAE Youth League')
    expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked()

    await user.type(screen.getByLabelText('Quins score'), '31')
    await user.type(screen.getByLabelText('Opposition score'), '19')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      id: 'e-1',
      starts_at: '2026-07-30T16:00:00.000Z',
      result_us: 31,
      result_them: 19,
    })
  })

  it('round-trips an unchanged event without shifting its start time', async () => {
    const user = userEvent.setup()
    renderForm({ event: EXISTING_MATCH })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0].starts_at).toBe(EXISTING_MATCH.starts_at)
  })

  it('surfaces a Supabase error and keeps the form open with the typed values', async () => {
    const user = userEvent.setup()
    upsertEventMock.mockRejectedValue(new Error('new row violates row-level security policy'))
    const { onSaved, onClose } = renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'new row violates row-level security policy',
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Opponent')).toHaveValue('Dubai Exiles')
    // And the button is usable again, not stuck in its saving state.
    expect(screen.getByRole('button', { name: /add event/i })).toBeEnabled()
  })

  it('disables the submit button while the save is in flight', async () => {
    const user = userEvent.setup()
    let release
    upsertEventMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ id: 'e-saved' })
    }))
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    const button = await screen.findByRole('button', { name: /saving/i })
    expect(button).toBeDisabled()
    release()
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
  })

  it('does not submit twice when the button is clicked twice', async () => {
    const user = userEvent.setup()
    let release
    upsertEventMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ id: 'e-saved' })
    }))
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    const button = screen.getByRole('button', { name: /add event/i })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: /saving/i }))

    expect(upsertEventMock).toHaveBeenCalledTimes(1)

    // Let the in-flight save settle before the test ends, so React's state
    // update lands inside the test's act() scope rather than leaking an
    // "update was not wrapped in act(...)" warning into the suite's stderr.
    release()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('accepts typed text into every field without losing keystrokes', async () => {
    // Sheet's focus effect used to re-run on every keystroke when the caller
    // passed an inline onClose, yanking focus out of the input after each
    // character. A controlled form inside a Sheet is exactly that case.
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Opponent'), 'Jebel Ali Dragons')
    await user.clear(screen.getByLabelText('Venue'))
    await user.type(screen.getByLabelText('Venue'), 'The Sevens, Dubai')
    // ⚠️ Competition is a SELECT since 12 Aug 2026, so the free-text box this
    // test was watching for keystroke loss is now the TOURNAMENT NAME box
    // behind it — which is the one that still takes typing, and therefore still
    // the one that can lose it.
    await user.selectOptions(screen.getByLabelText('Competition'), 'tournament')
    await user.selectOptions(screen.getByLabelText(/^tournament$/i), '__other_tournament__')
    await user.type(screen.getByLabelText(/tournament name/i), 'West Asia Premiership')

    expect(screen.getByLabelText('Opponent')).toHaveValue('Jebel Ali Dragons')
    expect(screen.getByLabelText('Venue')).toHaveValue('The Sevens, Dubai')
    expect(screen.getByLabelText(/tournament name/i)).toHaveValue('West Asia Premiership')
  })
})

// --- availability override (27 Aug 2026) ----------------------------------

describe('EventForm — self-service availability', () => {
  it('defaults availability to Auto and sends the chosen override in the payload', async () => {
    const user = userEvent.setup()
    renderForm()

    const group = screen.getByRole('group', { name: /self-service availability/i })
    expect(within(group).getByRole('radio', { name: /auto/i })).toBeChecked()

    await user.click(within(group).getByRole('radio', { name: /locked/i }))

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ availability_override: 'locked' })
  })
})

// --- wiring ---------------------------------------------------------------

describe('Schedule wiring', () => {
  it('offers an Add event button to a coach', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U12))
    render(withRouter(<Schedule />))
    expect(await screen.findByRole('button', { name: /add event/i })).toBeInTheDocument()
  })

  it('does not offer it to a parent', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))
    render(withRouter(<Schedule />))
    await screen.findByText(/no upcoming fixtures/i)
    expect(screen.queryByRole('button', { name: /add event/i })).not.toBeInTheDocument()
  })

  it('opens the empty form from the Add button', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U12))
    render(withRouter(<Schedule />))

    // "Add event" now opens the "What are you adding?" chooser first; pick Match
    // to reach the generic form this test is about.
    await user.click(await screen.findByRole('button', { name: /add event/i }))
    const chooser = await screen.findByRole('dialog')
    await user.click(within(chooser).getByRole('button', { name: /^match/i }))

    expect(await screen.findByRole('heading', { name: 'Add event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Opponent')).toHaveValue('')
  })

  it('reloads the schedule after a save', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U12))
    render(withRouter(<Schedule />))

    await user.click(await screen.findByRole('button', { name: /add event/i }))
    const chooser = await screen.findByRole('dialog')
    await user.click(within(chooser).getByRole('button', { name: /^match/i }))
    const callsBefore = listEventsMock.mock.calls.length

    await user.type(screen.getByLabelText('Opponent'), 'Dubai Exiles')
    await user.type(screen.getByLabelText('Time'), '20:00')
    await user.type(screen.getByLabelText('End time'), '22:00')
    // Schedule's trigger button and the form's submit button now share the
    // "Add event" name (the trigger used to say "Add fixture"), so scope this
    // to the open sheet rather than matching both.
    const sheet = screen.getByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(listEventsMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('EventDetail wiring', () => {
  beforeEach(() => {
    listEventsMock.mockResolvedValue([EXISTING_MATCH])
  })

  async function openDetail(memberships) {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(memberships))
    render(withRouter(<Schedule />))
    await user.click(await screen.findByRole('button', { name: /Dubai Exiles/i }))
    await screen.findByRole('dialog')
    return user
  }

  it('offers Edit and Delete to a coach of that squad', async () => {
    await openDetail(COACH_U12)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('offers a parent no buttons, and no read-only banner in their place', async () => {
    await openDetail(PARENT)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    // The absence of the buttons IS the message; the banner that used to sit
    // here said nothing the empty footer didn't already (4 Aug 2026).
    expect(within(dialog).queryByText(/read-only|can't change/i)).toBeNull()
  })

  it('opens the edit form prefilled from the event', async () => {
    const user = await openDetail(COACH_U12)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Opponent')).toHaveValue('Dubai Exiles')
  })

  it('asks for confirmation before deleting, and does nothing if cancelled', async () => {
    const user = await openDetail(COACH_U12)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(deleteEventMock).not.toHaveBeenCalled()
    expect(screen.getByText(/delete this event\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /keep it/i }))
    expect(deleteEventMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes on confirmation and closes back to the schedule', async () => {
    const user = await openDetail(COACH_U12)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith('e-1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('surfaces a delete failure and leaves the event on screen', async () => {
    deleteEventMock.mockRejectedValue(new Error('permission denied for table events'))
    const user = await openDetail(COACH_U12)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'permission denied for table events',
    )
    expect(dialog).toBeInTheDocument()
  })
})

// --- whole club (club-wide events, 30 Aug 2026) --------------------------
//
// A club-wide event has no squad (team_id null): it lands on every member's
// calendar. Admin-only, and only for a SOCIAL — a whole-club match or training
// makes no sense, and the "__club__" sentinel in the Age group <select> is
// mapped to team_id null in the payload. Because it is ONE event (no fan-out) it
// may still repeat, unlike the multi-squad fan-out.
describe('EventForm — whole club', () => {
  it('offers Whole club to an admin on a social, and writes team_id null', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN })

    await user.click(screen.getByRole('radio', { name: 'Social' }))
    await user.selectOptions(screen.getByLabelText('Age group'), '__club__')
    await user.type(screen.getByLabelText('Title'), 'Adult Tag')
    await pickDate(user, '2026-07-30')
    await user.type(screen.getByLabelText('Time'), '18:00')
    await user.type(screen.getByLabelText('End time'), '19:00')
    await user.click(screen.getByRole('button', { name: /add event/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      team_id: null, // the whole-club marker — no squad
      type: 'social',
      title: 'Adult Tag',
    })
    // club_id is NOT NULL in the database, so it must still be present.
    expect(upsertEventMock.mock.calls[0][0].club_id).toBeTruthy()
  })

  it('does not offer Whole club on a match, only on a social', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: ADMIN }) // opens as a match

    expect(
      within(screen.getByLabelText('Age group')).queryByText(/whole club/i),
    ).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Social' }))
    expect(
      within(screen.getByLabelText('Age group')).getByText(/whole club/i),
    ).toBeInTheDocument()
  })

  it('never offers Whole club to a coach, even on a social', async () => {
    const user = userEvent.setup()
    renderForm({ memberships: COACH_U12 })

    await user.click(screen.getByRole('radio', { name: 'Social' }))
    expect(
      within(screen.getByLabelText('Age group')).queryByText(/whole club/i),
    ).toBeNull()
  })

  it('⚠️ EDITING a club-wide event keeps Whole club selected and team_id null', async () => {
    // The edit bug (Jay): a club-wide event opened with a squad selected, so
    // saving would silently reassign it to that squad. It must open on "Whole
    // club" and stay squad-less.
    const user = userEvent.setup()
    const clubEvent = {
      id: 'e-club',
      team_id: null,
      type: 'social',
      title: 'Adult Tag',
      venue: 'Zayed Sports City',
      starts_at: '2026-09-02T14:00:00Z', // 18:00 Abu Dhabi
      ends_at: '2026-09-02T15:00:00Z',
    }
    renderForm({ memberships: ADMIN, event: clubEvent })

    expect(screen.getByLabelText('Age group')).toHaveValue('__club__')

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(upsertEventMock).toHaveBeenCalledTimes(1))
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ id: 'e-club', team_id: null })
  })
})
