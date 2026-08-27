import { readFileSync } from 'node:fs'
// ⚠️ `join(process.cwd(), …)`, NOT `new URL('../src/…', import.meta.url)`, and
// that is the house pattern for a reason — tests/page-header-wrap.test.js and
// tests/button-sweep.test.js both resolve source this way. Under Vitest's
// transform, import.meta.url is not a full absolute file URL here: the second
// version resolved to `C:\src\screens\Schedule.jsx` and failed with ENOENT on
// Windows, where it would have passed in CI on Linux. Same shape as the CRLF
// trap in state-of-play.md — green in Actions, broken on the machine the work
// is actually done on.
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Duplicating an event. Jay, 12 Aug 2026: "need the ability to duplicate an
// event, mainly training" — and, asked what Duplicate solves that the existing
// Repeats panel does not, "re-entering a session I already set up. The details
// take the effort, not the date."
//
// So the whole feature is one claim: EVERYTHING THAT TOOK EFFORT CARRIES, AND
// EVERYTHING THAT BELONGS TO ONE OCCURRENCE DOES NOT. Each test below pins one
// half of that, and each was checked by breaking the source on purpose and
// confirming it goes red — a test that would pass against the bug it exists to
// catch is worse than no test.
//
// PROCESS ZONE, matching the other EventForm suites: these submit real
// fixtures, and a zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const upsertEventMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
vi.mock('../src/data/events.js', () => ({
  listEvents: async () => [],
  subscribeEvents: () => () => {},
  upsertEvent: (...args) => upsertEventMock(...args),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  countSeriesFrom: async () => 0,
  updateSeriesFrom: async () => [],
  setSeriesTimeFrom: async () => [],
}))
vi.mock('../src/data/pitches.js', () => ({
  listPitches: async () => [],
  PITCH_TBD: 'Pitch TBD',
}))
vi.mock('../src/data/leagueTeams.js', () => ({
  listLeagueTeams: async () => [],
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

import EventForm from '../src/screens/EventForm.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM = { id: 't-u14b', club_id: CLUB_ID, name: 'U14B Contact', sort_order: 9 }
const ADMIN = [{ id: 'm-a', role: 'admin', status: 'active', team_id: null }]

// A Tuesday training session with every detail somebody actually typed. This
// is the fixture the whole feature is about: the venue, pitch, end time and
// notes are the work, and re-entering them by hand is what Duplicate removes.
const TRAINING = {
  id: 'e-tue',
  club_id: CLUB_ID,
  team_id: 't-u14b',
  type: 'training',
  title: 'U14 Contact & Conditioning',
  opponent: null,
  home: null,
  // 2026-09-08 18:00 Dubai == 14:00Z. Written as the instant, because that is
  // what the column holds.
  starts_at: '2026-09-08T14:00:00.000Z',
  ends_at: '2026-09-08T15:30:00.000Z',
  venue: 'Zayed Sports City, Abu Dhabi',
  pitch: 'A2',
  notes: 'Meet at the gate 30 minutes before. Bring both kits.',
  competition: null,
  competition_type: null,
  league_team_id: null,
  round: null,
  result_us: null,
  result_them: null,
  series_id: 'ser-autumn',
  group_id: null,
}

function renderForm(props) {
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<EventForm onClose={vi.fn()} onSaved={vi.fn()} {...props} />)
  return userEvent.setup()
}

const field = (id) => document.getElementById(id)
const payload = () => upsertEventMock.mock.calls[0][0]

async function pickDateAndSave(user, date = '2026-09-15') {
  const input = field('event-date')
  await user.clear(input)
  await user.type(input, date)
  await user.click(screen.getByRole('button', { name: /^add event$/i }))
  await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertEventMock.mockResolvedValue({ id: 'e-new' })
})

describe('Duplicate — what carries over', () => {
  it('keeps the details that took the effort', async () => {
    // The headline claim. If this passes while the date test below fails, the
    // feature is a rename of Edit; if it fails, Duplicate saves nobody
    // anything and they may as well use Add.
    const user = renderForm({ event: TRAINING, duplicate: true })
    await pickDateAndSave(user)

    const saved = payload()
    expect(saved.type).toBe('training')
    expect(saved.title).toBe('U14 Contact & Conditioning')
    expect(saved.venue).toBe('Zayed Sports City, Abu Dhabi')
    expect(saved.pitch).toBe('A2')
    expect(saved.notes).toBe('Meet at the gate 30 minutes before. Bring both kits.')
    expect(saved.team_id).toBe('t-u14b')
  })

  it('keeps the time of day, on the NEW date', async () => {
    // ⚠️ THE TIME IS THE SUBTLE HALF. It is stored as an instant, so carrying
    // it means re-converting 18:00 club wall-clock against a DIFFERENT date —
    // exactly the trap the series generator hit, where reusing one ends_at
    // gave every occurrence the first date's finish. 15 Sept 2026 18:00 Dubai
    // is 14:00Z; 19:30 is 15:30Z.
    const user = renderForm({ event: TRAINING, duplicate: true })
    await pickDateAndSave(user, '2026-09-15')

    expect(payload().starts_at).toBe('2026-09-15T14:00:00.000Z')
    expect(payload().ends_at).toBe('2026-09-15T15:30:00.000Z')
  })
})

describe('Duplicate — what must NOT carry over', () => {
  it('opens with the date blank and refuses to save until one is picked', async () => {
    // Jay picked blank over "next week", "same date" and "today". Blank cannot
    // be wrong, only unfinished — and the form's existing required-date check
    // is what enforces it, which is why this needed no new guard.
    const user = renderForm({ event: TRAINING, duplicate: true })
    expect(field('event-date')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: /^add event$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/highlighted fields/i)
    expect(upsertEventMock).not.toHaveBeenCalled()
  })

  it('⚠️ does not join the original series', async () => {
    // THE ONE THAT WOULD BE FOUND LAST AND HURT MOST. A duplicate carrying
    // series_id would be swept up by "delete this and every later session"
    // from an occurrence it has nothing to do with, sitting on a date nobody
    // would think to check. The protection is structural — series_id is only
    // ever written by the `repeating` branch — and this pins it.
    const user = renderForm({ event: TRAINING, duplicate: true })
    await pickDateAndSave(user)

    expect(TRAINING.series_id).toBe('ser-autumn')
    expect(payload().series_id ?? null).toBeNull()
    expect(payload().group_id ?? null).toBeNull()
  })

  it('⚠️ does not carry the score of a played match', async () => {
    // Duplicating a played fixture is the normal way to set up the return
    // match. Carrying the score would create a NEW fixture that is already a
    // result: hasResult() would drop it straight out of Upcoming and into
    // Results, with numbers nothing on screen accounts for.
    const played = {
      ...TRAINING,
      id: 'e-played',
      type: 'match',
      title: null,
      opponent: 'Dubai Exiles',
      home: true,
      series_id: null,
      result_us: 24,
      result_them: 12,
    }
    const user = renderForm({ event: played, duplicate: true })
    await pickDateAndSave(user)

    expect(payload().opponent).toBe('Dubai Exiles')
    expect(payload().result_us).toBeNull()
    expect(payload().result_them).toBeNull()
  })

  it('⚠️ does not carry the league round, but does keep the league team', async () => {
    // A round belongs to one fixture in a season's sequence — "Round 4" twice
    // is a wrong result filed with the governing body, not an obvious typo.
    // The league TEAM belongs to the squad, and the squad carries, so it stays.
    const league = {
      ...TRAINING,
      id: 'e-league',
      type: 'match',
      title: null,
      opponent: 'Dubai Exiles',
      home: true,
      series_id: null,
      competition_type: 'league',
      league_team_id: 'lt-2',
      round: 4,
    }
    const user = renderForm({ event: league, duplicate: true })
    await pickDateAndSave(user)

    expect(payload().round).toBeNull()
    expect(payload().league_team_id).toBe('lt-2')
  })

  it('⚠️ INSERTS rather than updating — no id reaches the payload', async () => {
    // The difference between "duplicate" and "silently overwrite the fixture
    // you were looking at". upsertEvent branches on the id being present.
    const user = renderForm({ event: TRAINING, duplicate: true })
    await pickDateAndSave(user)

    expect(TRAINING.id).toBe('e-tue')
    expect(payload().id).toBeUndefined()
  })
})

describe('Duplicate — the sheet says what it is', () => {
  it('is titled "Duplicate event", not "Add" or "Edit"', async () => {
    // The form opens full of an existing fixture's details. "Add event" reads
    // as though it failed to load; "Edit event" is a lie that costs an
    // accidental overwrite.
    renderForm({ event: TRAINING, duplicate: true })
    expect(await screen.findByText('Duplicate event')).toBeInTheDocument()
  })

  it('still says "Edit event" when actually editing', async () => {
    // The discriminating half: a title test that passed for both modes would
    // prove nothing.
    renderForm({ event: TRAINING })
    expect(await screen.findByText('Edit event')).toBeInTheDocument()
  })

  it('offers Repeats, which editing never does', async () => {
    // A duplicate is a CREATE, so the row-multiplying controls come back. This
    // is what makes "run last term's Tuesday session again all next term"
    // possible at all — Repeats is create-time only, so it cannot extend an
    // existing series.
    renderForm({ event: TRAINING, duplicate: true })
    expect(await screen.findByLabelText(/repeat until/i)).toBeInTheDocument()
  })

  it('does NOT offer "apply to the rest of the series"', async () => {
    // That control rewrites every later occurrence of the ORIGINAL series. On
    // a duplicate it would be an edit wearing a create's clothes.
    renderForm({ event: TRAINING, duplicate: true })
    await screen.findByLabelText(/repeat until/i)
    expect(screen.queryByText(/apply to this and every later session/i)).toBeNull()
  })
})

// ── The dead-button guard ───────────────────────────────────────────────────
//
// ⚠️ THIS COMPONENT HAS ALREADY SHIPPED A DEAD BUTTON, and that is why these
// exist rather than being belt-and-braces. "Set my availability" rendered
// unconditionally and called `onOpenAvailability?.(event)`; Schedule passed the
// handler and the Dashboard did not, so on the home screen the button drew
// itself, invited a tap and swallowed it, silently, for weeks. The fix pattern
// is: render only when a handler exists, and test BOTH screens actually pass
// one.

const DETAIL_PROPS = {
  event: { ...TRAINING, series_id: null },
  team: TEAM,
  onClose: vi.fn(),
  canEdit: true,
}

describe('EventDetail — the Duplicate button', () => {
  it('renders when a handler is passed', () => {
    render(<EventDetail {...DETAIL_PROPS} onDuplicate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^duplicate$/i })).toBeInTheDocument()
  })

  it('⚠️ renders NOTHING when the caller forgot the handler', () => {
    // A screen that forgets gets no button rather than a lying one.
    render(<EventDetail {...DETAIL_PROPS} />)
    expect(screen.queryByRole('button', { name: /^duplicate$/i })).toBeNull()
  })

  it('hands the event back to the handler', async () => {
    const onDuplicate = vi.fn()
    render(<EventDetail {...DETAIL_PROPS} onDuplicate={onDuplicate} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^duplicate$/i }))
    expect(onDuplicate).toHaveBeenCalledWith(DETAIL_PROPS.event)
  })

  it('shows nothing to someone who cannot edit the squad', () => {
    render(<EventDetail {...DETAIL_PROPS} canEdit={false} onDuplicate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^duplicate$/i })).toBeNull()
  })

  it('⚠️ BOTH screens that render this sheet pass the handler', () => {
    // The regression guard for the actual historical defect. Schedule passed
    // onOpenAvailability and the Dashboard did not, and no test caught it
    // because every test drove Schedule.
    //
    // ⚠️ A SOURCE CHECK, AND ITS LIMIT IS STATED RATHER THAN GLOSSED: it
    // proves the prop is WIRED, not that the handler works. What the handler
    // does is covered by the payload tests above, which drive the real form.
    // Pinned this way — the same technique tests/page-header-wrap.test.js uses
    // — because standing both whole screens up costs seconds per run to
    // re-prove something one grep answers.
    const read = (f) => readFileSync(join(process.cwd(), 'src', 'screens', f), 'utf8')
    for (const screenFile of ['Schedule.jsx', 'Dashboard.jsx']) {
      const source = read(screenFile)
      expect(source, `${screenFile} must pass onDuplicate to EventDetail`).toMatch(
        /onDuplicate=\{\(event\) => setFormState\(\{ event, duplicate: true \}\)\}/,
      )
      expect(source, `${screenFile} must pass duplicate through to EventForm`).toMatch(
        /duplicate=\{formState\.duplicate \?\? false\}/,
      )
    }
  })

  it('the action row can wrap, so a third button cannot squeeze the other two', () => {
    // ⚠️ THIS TEST PINS INSURANCE, NOT A FIX, AND SAYS SO BECAUSE THE FIRST
    // VERSION OF IT LIED. It claimed flex-wrap was what stopped three buttons
    // widening the document. Measured in real Chromium at 320px: the row is
    // 284px, the buttons are 83 + 97 + 85 with 10px gaps, they fit on ONE
    // line, and removing flex-wrap changes nothing at any harness width.
    // Sheet is `position:fixed` and sets body overflow hidden while open, so
    // this row could not reach the document's scrollWidth even if it did
    // overflow.
    //
    // What it genuinely guards is the day a label gets longer or a user's
    // text size is larger: with wrap the buttons drop to a second line, and
    // without it they are pushed below min-content and clip. That is worth a
    // line of pinning; it is not worth a paragraph claiming a catastrophe.
    render(<EventDetail {...DETAIL_PROPS} onDuplicate={vi.fn()} />)
    const row = screen.getByRole('button', { name: /^duplicate$/i }).parentElement
    expect(row.className).toMatch(/\bflex-wrap\b/)
  })
})

describe('EventDetail — Edit and Delete follow the same handler-required rule', () => {
  // Squad Hub used to pass canEdit so both buttons drew, then omit onEdit —
  // Edit swallowed the tap — while Delete would have deleted the calendar
  // row. Same defect Duplicate already fixed: render only when a handler exists.
  it('renders Edit when a handler is passed', () => {
    render(<EventDetail {...DETAIL_PROPS} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  it('⚠️ renders no Edit when the caller forgot the handler', () => {
    render(<EventDetail {...DETAIL_PROPS} />)
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
  })

  it('hands the event back to onEdit', async () => {
    const onEdit = vi.fn()
    render(<EventDetail {...DETAIL_PROPS} onEdit={onEdit} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onEdit).toHaveBeenCalledWith(DETAIL_PROPS.event)
  })

  it('renders Delete when a handler is passed', () => {
    render(<EventDetail {...DETAIL_PROPS} onDeleted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('⚠️ renders no Delete when the caller forgot the handler', () => {
    render(<EventDetail {...DETAIL_PROPS} />)
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
  })

  it('shows neither Edit nor Delete to someone who cannot edit the squad', () => {
    render(
      <EventDetail {...DETAIL_PROPS} canEdit={false} onEdit={vi.fn()} onDeleted={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
  })
})
