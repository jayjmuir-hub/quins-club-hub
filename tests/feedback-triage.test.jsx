import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/components/FeedbackTriage.jsx — the admin surface that
// makes the SCREEN the record rather than an inbox.
// Design: claude/plans/2026-08-18-help-and-feedback.md.

const listFeedbackMock = vi.fn()
const setFeedbackStatusMock = vi.fn()

vi.mock('../src/data/feedback.js', () => ({
  listFeedback: (...args) => listFeedbackMock(...args),
  setFeedbackStatus: (...args) => setFeedbackStatusMock(...args),
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
import FeedbackTriage, { openCount } from '../src/components/FeedbackTriage.jsx'

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
  listFeedbackMock.mockResolvedValue(rows)
  setFeedbackStatusMock.mockResolvedValue({})
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

describe('replying to a report', () => {
  it('saves the reply against the row, keeping the status unchanged', async () => {
    const user = userEvent.setup()
    render(<FeedbackTriage />)
    const box = await screen.findByLabelText(/reply to Priya/i)
    await user.type(box, 'Fixed it, thanks for telling us')
    await user.click(screen.getAllByRole('button', { name: /save reply/i })[0])

    await waitFor(() => expect(setFeedbackStatusMock).toHaveBeenCalledTimes(1))
    // ⚠️ The status argument must be the row's CURRENT status. Passing a
    // literal here would silently reopen a finished report every time somebody
    // typed a reply into it.
    expect(setFeedbackStatusMock.mock.calls[0][1]).toBe('new')
    expect(setFeedbackStatusMock.mock.calls[0][2]).toMatchObject({
      adminNote: 'Fixed it, thanks for telling us',
    })
  })

  it('will not save until something has actually changed', async () => {
    render(<FeedbackTriage />)
    await screen.findByLabelText(/reply to Priya/i)
    // Nothing typed, so there is nothing to write — an enabled button here
    // would stamp handled_by/handled_at for a non-event.
    expect(screen.getAllByRole('button', { name: /save reply/i })[0]).toBeDisabled()
  })

  it('tells the admin the reply is what the reporter reads', async () => {
    render(<FeedbackTriage />)
    expect(await screen.findByTestId('feedback-summary')).toHaveTextContent(
      /reply you save here is what the reporter reads/i,
    )
  })
})
