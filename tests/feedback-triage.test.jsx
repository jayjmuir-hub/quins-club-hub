import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/components/FeedbackTriage.jsx — the admin surface that
// makes the SCREEN the record rather than an inbox.
// Design: claude/plans/2026-08-18-help-and-feedback.md.

const listFeedbackMock = vi.fn()
const setFeedbackStatusMock = vi.fn()
const deleteFeedbackMock = vi.fn()
const unsubscribeSpy = vi.fn()
const subscribeFeedbackMock = vi.fn(() => unsubscribeSpy)
const listFeedbackMessagesMock = vi.fn()
const sendFeedbackMessageMock = vi.fn()
const subscribeFeedbackMessagesMock = vi.fn(() => () => {})

vi.mock('../src/data/feedback.js', () => ({
  listFeedback: (...args) => listFeedbackMock(...args),
  setFeedbackStatus: (...args) => setFeedbackStatusMock(...args),
  deleteFeedback: (...args) => deleteFeedbackMock(...args),
  subscribeFeedback: (...args) => subscribeFeedbackMock(...args),
  listFeedbackMessages: (...args) => listFeedbackMessagesMock(...args),
  sendFeedbackMessage: (...args) => sendFeedbackMessageMock(...args),
  subscribeFeedbackMessages: (...args) => subscribeFeedbackMessagesMock(...args),
  feedbackRef: (ref) => (ref == null ? null : `QCH-${String(ref).padStart(4, '0')}`),
  FEEDBACK_STATUSES: ['new', 'in-progress', 'done', 'wontfix'],
  OPEN_STATUSES: ['new', 'in-progress'],
  FEEDBACK_STATUS_LABELS: {
    new: 'New',
    'in-progress': 'In progress',
    done: 'Done',
    wontfix: "Won't fix",
  },
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}))

// Imported after vi.mock so this binds to the mocked modules.
import FeedbackTriage, { openCount, submittedLabel, visibleReports } from '../src/components/FeedbackTriage.jsx'

// ⚠️ INVENTED NAMES. The repo is public and its members are mostly children —
// CLAUDE.md rule 9. The shape is real; the people are not.
const rows = [
  {
    id: 'f1',
    ref: 41,
    kind: 'bug',
    body: 'The age group is wrong for my son',
    route: '/roster',
    status: 'new',
    created_at: '2026-09-04T14:42:00Z',
    submitted_by: 'member-1',
    club_id: 'club-1',
    profiles: { full_name: 'Priya Vanterpool' },
  },
  {
    id: 'f2',
    ref: 42,
    kind: 'idea',
    body: 'Could we get a reminder the night before',
    route: '/schedule',
    status: 'done',
    profiles: { full_name: 'Tomas Okere' },
  },
]

beforeEach(() => {
  listFeedbackMock.mockReset()
  setFeedbackStatusMock.mockReset()
  subscribeFeedbackMock.mockClear()
  unsubscribeSpy.mockClear()
  listFeedbackMock.mockResolvedValue(rows)
  setFeedbackStatusMock.mockResolvedValue({})
  deleteFeedbackMock.mockReset()
  deleteFeedbackMock.mockResolvedValue({ id: 'f2' })
  listFeedbackMessagesMock.mockReset()
  listFeedbackMessagesMock.mockResolvedValue([
    { id: 'm1', feedback_id: 'f1', author_id: 'admin-1', body: 'Looking into it now.', created_at: '2026-09-04T15:00:00Z' },
    { id: 'm2', feedback_id: 'f1', author_id: 'member-1', body: 'Thanks, it is the U12 roster.', created_at: '2026-09-04T15:10:00Z', profiles: { full_name: 'Priya Vanterpool' } },
  ])
  sendFeedbackMessageMock.mockReset()
  sendFeedbackMessageMock.mockImplementation(async (id, body) => ({
    id: 'm-new', feedback_id: id, author_id: 'admin-1', body, created_at: '2026-09-04T16:00:00Z',
  }))
  subscribeFeedbackMessagesMock.mockClear()
})

describe('the triage list', () => {
  it('counts only what is still open, not the total', async () => {
    render(<FeedbackTriage />)
    // One new, one done — the heading must say 1, or a screen full of finished
    // reports reads as a screen full of work.
    expect(await screen.findByRole('heading', { name: /reports and suggestions \(1\)/i })).toBeTruthy()
  })

  it('shows the member their words, their reference and their name', async () => {
    render(<FeedbackTriage />)
    expect(await screen.findByText(/the age group is wrong for my son/i)).toBeTruthy()
    expect(screen.getByText('QCH-0041')).toBeTruthy()
    expect(screen.getByText('Priya Vanterpool')).toBeTruthy()
  })

  it('says so plainly when nothing has been reported', async () => {
    listFeedbackMock.mockResolvedValue([])
    render(<FeedbackTriage />)
    expect(await screen.findByText(/nobody has reported anything yet/i)).toBeTruthy()
  })

  it('writes a status change through, stamped with the admin who made it', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    const select = await screen.findByLabelText(/status for QCH-0041/i)
    await user.selectOptions(select, 'in-progress')

    await waitFor(() => expect(setFeedbackStatusMock).toHaveBeenCalledTimes(1))
    expect(setFeedbackStatusMock.mock.calls[0][0]).toBe('f1')
    expect(setFeedbackStatusMock.mock.calls[0][1]).toBe('in-progress')
    expect(setFeedbackStatusMock.mock.calls[0][2]).toMatchObject({ actorId: 'admin-1' })
  })

  it('puts the truth back when a status change fails', async () => {
    const user = userEvent.setup()
    setFeedbackStatusMock.mockRejectedValue(new Error('policy refused'))
    render(<FeedbackTriage />)
    const select = await screen.findByLabelText(/status for QCH-0041/i)
    await user.selectOptions(select, 'done')

    // The optimistic move is undone by a reload, and the person is told —
    // a silently reverted control is how somebody thinks they closed a report.
    expect(await screen.findByRole('alert')).toHaveTextContent(/policy refused/i)
    await waitFor(() => expect(listFeedbackMock).toHaveBeenCalledTimes(2))
  })

  it('offers a retry rather than a blank screen when the list will not load', async () => {
    listFeedbackMock.mockRejectedValue(new Error('offline'))
    render(<FeedbackTriage />)
    expect(await screen.findByText(/offline/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})

describe('openCount', () => {
  it('counts new and in-progress, and nothing else', () => {
    expect(
      openCount([
        { status: 'new' },
        { status: 'in-progress' },
        { status: 'done' },
        { status: 'wontfix' },
      ]),
    ).toBe(2)
  })

  it('survives no rows at all', () => {
    expect(openCount(undefined)).toBe(0)
  })
})

// The THREAD (4 Sep 2026): every message from either side, in order, and a
// box to add one. Jay: "there is no way to send a follow-up message with the
// done, there is no thread of messages."
describe('the thread on a report', () => {
  it('shows both sides in order, each line saying who and when', async () => {
    render(<FeedbackTriage />)
    const thread = await screen.findByTestId('feedback-thread')
    const lines = within(thread).getAllByTestId('feedback-message')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('data-from', 'club')
    expect(lines[0]).toHaveTextContent('Looking into it now.')
    expect(lines[0]).toHaveTextContent(/You · Fri 4 Sept, 19:00/)
    expect(lines[1]).toHaveAttribute('data-from', 'reporter')
    expect(lines[1]).toHaveTextContent('Thanks, it is the U12 roster.')
    expect(lines[1]).toHaveTextContent(/Priya Vanterpool · Fri 4 Sept, 19:10/)
    // The thread was asked for once, for the reports on the list.
    expect(listFeedbackMessagesMock).toHaveBeenCalledWith(['f1', 'f2'])
    expect(subscribeFeedbackMessagesMock).toHaveBeenCalledTimes(1)
  })

  it('sends a reply into the thread as the admin, and the status is not touched', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    const box = await screen.findByLabelText(/message on report 41/i)
    await user.type(box, 'Fixed it, thanks for telling us')
    await user.click(screen.getAllByRole('button', { name: /send reply/i })[0])

    await waitFor(() => expect(sendFeedbackMessageMock).toHaveBeenCalledTimes(1))
    expect(sendFeedbackMessageMock.mock.calls[0][0]).toBe('f1')
    expect(sendFeedbackMessageMock.mock.calls[0][1]).toBe('Fixed it, thanks for telling us')
    expect(sendFeedbackMessageMock.mock.calls[0][2]).toMatchObject({ authorId: 'admin-1', clubId: 'club-1' })
    // A message is not a status change: the trigger makes it admin_note and
    // pushes the reporter; nothing here calls setFeedbackStatus.
    expect(setFeedbackStatusMock).not.toHaveBeenCalled()
    // It appears in the thread, and the box empties.
    const thread = screen.getByTestId('feedback-thread')
    expect(within(thread).getAllByTestId('feedback-message')).toHaveLength(3)
    expect(box).toHaveValue('')
  })

  it('refuses an empty send with an inline error, not a request', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    await screen.findByLabelText(/message on report 41/i)
    await user.click(screen.getAllByRole('button', { name: /send reply/i })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent(/write something first/i)
    expect(sendFeedbackMessageMock).not.toHaveBeenCalled()
  })

  it('tells the admin the reply is what the reporter reads', async () => {
    render(<FeedbackTriage />)
    expect(await screen.findByTestId('feedback-summary')).toHaveTextContent(
      /reply you save here is what the reporter reads/i,
    )
  })
})

describe('live updates', () => {
  it('subscribes once, and tears the channel down on unmount', async () => {
    const view = render(<FeedbackTriage />)
    await screen.findByTestId('feedback-summary')
    expect(subscribeFeedbackMock).toHaveBeenCalledTimes(1)
    // ⚠️ A leaked channel per mount is how an admin ends up with a dozen open
    // sockets after navigating around, and nothing visible ever goes wrong.
    view.unmount()
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('re-reads when a change arrives rather than patching from the payload', async () => {
    render(<FeedbackTriage />)
    await screen.findByTestId('feedback-summary')
    expect(listFeedbackMock).toHaveBeenCalledTimes(1)

    // Fire whatever the component handed to the subscription.
    const onChange = subscribeFeedbackMock.mock.calls[0][0]
    await waitFor(() => expect(typeof onChange).toBe('function'))
    onChange({ eventType: 'INSERT' })

    // ⚠️ Re-read, not patch: the payload carries no joined `profiles`, so
    // applying it directly would blank the reporter's name on that row.
    await waitFor(() => expect(listFeedbackMock).toHaveBeenCalledTimes(2))
  })
})

// ══════════════════════════════════════════════════════════════════════════
//  HIDING RESOLVED, AND DELETING — Jay, 19 Aug 2026: "hide resolved and
//  delete". Two features that answer the same complaint in opposite ways, and
//  the hiding is the one that has to be good, or people reach for the
//  destructive one to get a readable screen.
// ══════════════════════════════════════════════════════════════════════════

describe('hiding resolved reports', () => {
  it('keeps done and wontfix out of the list by default', () => {
    const all = [
      { id: 'a', status: 'new' },
      { id: 'b', status: 'in-progress' },
      { id: 'c', status: 'done' },
      { id: 'd', status: 'wontfix' },
    ]
    expect(visibleReports(all, false).map((r) => r.id)).toEqual(['a', 'b'])
    expect(visibleReports(all, true).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not render a resolved report until asked', async () => {
    render(<FeedbackTriage />)
    // f1 is `new`, f2 is `done`.
    expect(await screen.findByText(/the age group is wrong for my son/i)).toBeTruthy()
    expect(screen.queryByText(/reminder the night before/i)).toBeNull()
  })

  it('reveals them on the toggle, and says how many are hidden', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    const toggle = await screen.findByTestId('toggle-resolved')
    expect(toggle).toHaveTextContent('Show resolved (1)')

    await user.click(toggle)
    expect(await screen.findByText(/reminder the night before/i)).toBeTruthy()
    expect(screen.getByTestId('toggle-resolved')).toHaveTextContent('Hide resolved')
  })

  // ⚠️ A control reading "Show resolved (0)" invites a click that does nothing.
  it('offers no toggle when nothing is hidden', async () => {
    listFeedbackMock.mockResolvedValue([rows[0]])
    render(<FeedbackTriage />)
    await screen.findByTestId('feedback-summary')
    expect(screen.queryByTestId('toggle-resolved')).toBeNull()
  })

  // ⚠️ "Nobody has reported anything yet" would be FALSE here, and would send
  // an admin looking for reports that are simply finished.
  it('distinguishes "all dealt with" from "nothing ever reported"', async () => {
    listFeedbackMock.mockResolvedValue([rows[1]])
    render(<FeedbackTriage />)
    expect(await screen.findByText(/nothing open\. every report has been dealt with/i)).toBeTruthy()
    expect(screen.queryByText(/nobody has reported anything yet/i)).toBeNull()
  })
})

describe('deleting a report', () => {
  // ⚠️ ONE ROW ON PURPOSE. These assertions look for "the Delete button", and
  // with several rows on screen that phrase is ambiguous — the tests would then
  // break whenever the LIST changed, which is a different feature. Proved by
  // injecting a fault in the hiding filter: before this, every delete test went
  // red for a reason that had nothing to do with deleting.
  beforeEach(() => {
    listFeedbackMock.mockResolvedValue([rows[0]])
  })

  // ⚠️ THE WHOLE POINT OF THE TWO-STEP. RESTORE.md rules out a native
  // confirm(), and a single red button that deletes on first press is what
  // Button.jsx's danger/dangerQuiet pair exists to prevent.
  it('does not delete on the first press', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))

    expect(deleteFeedbackMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeTruthy()
  })

  it('warns that it disappears for the member too, and offers a way out', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))

    // The admin cannot otherwise know the reporter can see it on /my-reports.
    expect(screen.getByText(/disappears for Priya too/i)).toBeTruthy()
    expect(screen.getByText(/no undo/i)).toBeTruthy()
    // And the non-destructive route out of the confirm.
    await user.click(screen.getByRole('button', { name: /keep it/i }))
    expect(screen.queryByRole('button', { name: /yes, delete/i })).toBeNull()
    expect(deleteFeedbackMock).not.toHaveBeenCalled()
  })

  it('deletes on the second press and drops the row straight away', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => expect(deleteFeedbackMock).toHaveBeenCalledWith('f1'))
    // ⚠️ Removed from state rather than awaited from realtime: a DELETE
    // payload carries only the id, so waiting would leave it on screen after
    // the person confirmed.
    await waitFor(() => expect(screen.queryByText(/the age group is wrong for my son/i)).toBeNull())
  })

  it('says so when the delete is refused, instead of looking like it worked', async () => {
    const user = userEvent.setup()
    deleteFeedbackMock.mockRejectedValue(new Error('you may not have admin rights on it'))
    render(<FeedbackTriage />)
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    // ⚠️ The row must come BACK. load() runs before the message is set - the
    // ordering bug changeStatus already documents, which would otherwise wipe
    // the error and leave the screen silently unchanged.
    expect(await screen.findByRole('alert')).toHaveTextContent(/admin rights/i)
    expect(screen.getByText(/the age group is wrong for my son/i)).toBeTruthy()
  })
})

// Jay, 4 Sep 2026: "there is no date time stamp on that so i can see when it
// was submitted". Club time, to the minute, on the report's header line.
describe('when a report came in', () => {
  it('shows the submitted time in club time on the header line', async () => {
    render(<FeedbackTriage />)
    const when = await screen.findByTestId('feedback-when')
    expect(when).toHaveAttribute('datetime', '2026-09-04T14:42:00Z')
    expect(when).toHaveTextContent('Fri 4 Sept, 18:42')
  })

  it('submittedLabel renders in Asia/Dubai and swallows a bad date', () => {
    expect(submittedLabel('2026-09-04T20:30:00Z')).toBe('Sat 5 Sept, 00:30')
    expect(submittedLabel('nonsense')).toBe('')
  })
})
