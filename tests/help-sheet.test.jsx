import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'

// Unit tests for src/components/HelpSheet.jsx — the two-step help panel.
// Design: claude/plans/2026-08-18-help-and-feedback.md (the flow) and
// claude/plans/2026-08-24-help-into-account-menu.md (open/onClose as props —
// the floating `?` these tests used to click is gone; the real trigger is the
// account menu's "Report a problem" item, covered in account-menu.test.jsx).
//
// The data module is mocked, so this exercises the component's own behaviour
// and never a real insert. What the DATABASE guarantees (the stamping trigger,
// the RLS policies, the column grants) is not testable from here and is not
// what these assert — see db/migrations/20260818_feedback.sql.

const submitFeedbackMock = vi.fn()
const captureContextMock = vi.fn(() => ({ route: '/roster' }))

const listFeedbackMock = vi.fn(() => Promise.resolve([]))

vi.mock('../src/data/feedback.js', () => ({
  listFeedback: (...args) => listFeedbackMock(...args),
  FEEDBACK_STATUS_LABELS: { new: 'New', 'in-progress': 'In progress', done: 'Done', wontfix: "Won't fix" },
  submitFeedback: (...args) => submitFeedbackMock(...args),
  captureContext: (...args) => captureContextMock(...args),
  feedbackRef: (ref) => (ref == null ? null : `QCH-${String(ref).padStart(4, '0')}`),
}))

// Imported after vi.mock so this binds to the mocked module.
import HelpSheet, { routeLabel } from '../src/components/HelpSheet.jsx'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

// The same wiring AppShell has: a trigger owning `open`, the sheet fed props.
// A plain always-open render would skip close() and miss the reset-on-close
// behaviour the shared-family-phone test below exists to pin.
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Report a problem
      </button>
      <HelpSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function renderAt(path = '/roster') {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <Harness />
    </MemoryRouter>,
  )
}

const openPanel = async (user) =>
  user.click(screen.getByRole('button', { name: /report a problem/i }))

beforeEach(() => {
  submitFeedbackMock.mockReset()
  captureContextMock.mockClear()
  submitFeedbackMock.mockResolvedValue({ ref: 41 })
})

describe('the sheet as a controlled component', () => {
  it('renders nothing at all until opened', () => {
    renderAt()
    // The old floating `?` was always on screen; the replacement must cost the
    // page NOTHING while closed — no dialog, no stray flow buttons.
    expect(screen.queryByText(/something.s broken/i)).toBeNull()
    expect(screen.queryByText(/need a hand/i)).toBeNull()
  })

  it('opens from the trigger it is wired to', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    expect(screen.getByRole('button', { name: /something.s broken/i })).toBeTruthy()
  })
})

describe('the two-step panel', () => {
  it('names the current page so nobody has to describe it', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await openPanel(user)
    expect(screen.getByText(/you.re on the Roster page/i)).toBeTruthy()
  })

  it('offers both lanes, and an invitation for everything else', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    expect(screen.getByRole('button', { name: /something.s broken/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /suggestion/i })).toBeTruthy()
    // ⚠️ NOT a button. If this ever becomes one, the panel has started asking
    // the member to classify their problem correctly — see HelpSheet.jsx.
    const invitation = screen.getByText(/Jay will sort it out/i)
    expect(invitation.closest('button')).toBeNull()
  })

  it('asks a different question depending on the lane', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    expect(screen.getByLabelText(/what went wrong/i)).toBeTruthy()
  })

  it('tells the member what is collected BEFORE it is sent', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    expect(screen.getByText(/sent automatically with your message/i)).toBeTruthy()
    expect(screen.getByText(/the page you.re on — Roster/i)).toBeTruthy()
  })
})

describe('sending', () => {
  it('refuses an empty report without calling the data layer', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/tell us what happened/i)
    expect(submitFeedbackMock).not.toHaveBeenCalled()
  })

  it('sends the kind, the words and the route, and shows the reference back', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    await user.type(screen.getByLabelText(/what went wrong/i), 'The age group is wrong')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(submitFeedbackMock).toHaveBeenCalledTimes(1))
    expect(submitFeedbackMock.mock.calls[0][0]).toMatchObject({
      kind: 'bug',
      body: 'The age group is wrong',
      route: '/roster',
    })
    expect(await screen.findByText('QCH-0041')).toBeTruthy()
  })

  it('keeps the words on screen when the send fails', async () => {
    const user = userEvent.setup()
    submitFeedbackMock.mockRejectedValue(new Error('network down'))
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /suggestion/i }))
    await user.type(screen.getByLabelText(/what would make this better/i), 'A dark mode')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/network down/i)
    // The paragraph they typed must survive — a pitch-side dropout should cost
    // a retry, not the message.
    expect(screen.getByLabelText(/what would make this better/i)).toHaveValue('A dark mode')
  })

  it('points a not-yet-approved member at the mailbox instead of a raw error', async () => {
    const user = userEvent.setup()
    submitFeedbackMock.mockRejectedValue(
      new Error('no active membership: cannot file feedback'),
    )
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    await user.type(screen.getByLabelText(/what went wrong/i), 'I cannot see my child')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/waiting to be approved/i)
    expect(alert).toHaveTextContent(/help@adhquins-clubhub.com/i)
  })

  it('does not show the next person what the last one typed', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    await user.type(screen.getByLabelText(/what went wrong/i), 'half a sentence')

    // Close without sending, then reopen. On a shared family phone the next
    // person to open the sheet must not find somebody else's words in the box.
    await user.keyboard('{Escape}')
    await openPanel(user)

    // ⚠️ GO BACK INTO THE FORM BEFORE ASSERTING, AND THAT IS THE WHOLE TEST.
    // The first version stopped at the choice step and checked the textarea
    // was absent — which it always is there, so it passed with the reset
    // deliberately removed. A fixture that cannot fail is worse than none:
    // it reports confidence. Proved by injecting exactly that fault.
    expect(screen.getByRole('button', { name: /something.s broken/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    expect(screen.getByLabelText(/what went wrong/i)).toHaveValue('')
  })
})

describe('routeLabel', () => {
  it('names the screens a member recognises', () => {
    expect(routeLabel('/roster')).toBe('Roster')
    expect(routeLabel('/')).toBe('Home')
  })

  it('names the section for a nested route rather than echoing an id', () => {
    expect(routeLabel('/admin/accounts')).toBe('Admin')
  })

  it('falls back to the path rather than guessing a label', () => {
    // Ugly beats confidently wrong: an unmapped path shows itself.
    expect(routeLabel('/some/unmapped/thing')).toBe('/some/unmapped/thing')
  })
})

describe('a member tracking their own report', () => {
  it('lists what they sent, with the status and the club reply', async () => {
    const user = userEvent.setup()
    listFeedbackMock.mockResolvedValue([
      {
        id: 'f1',
        ref: 7,
        status: 'in-progress',
        body: 'Tomas shows as U12 but he is 10',
        admin_note: 'Good spot — fixing the cut-off date now.',
      },
    ])
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /already reported/i }))

    expect(await screen.findByText('QCH-0007')).toBeTruthy()
    expect(screen.getByText(/in progress/i)).toBeTruthy()
    // ⚠️ THE REPLY IS THE WHOLE POINT. Jay chose in-app over a second email, so
    // if this stops rendering, admins type answers nobody ever reads.
    expect(screen.getByText(/fixing the cut-off date/i)).toBeTruthy()
  })

  it('distinguishes "nothing yet" from "not loaded"', async () => {
    const user = userEvent.setup()
    listFeedbackMock.mockResolvedValue([])
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /already reported/i }))
    expect(await screen.findByText(/haven.t reported anything yet/i)).toBeTruthy()
  })

  it('says so when the list will not load, rather than looking empty', async () => {
    const user = userEvent.setup()
    listFeedbackMock.mockRejectedValue(new Error('offline'))
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /already reported/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i)
  })

  it('tells the reporter where updates will appear, since no email follows', async () => {
    const user = userEvent.setup()
    renderAt()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /something.s broken/i }))
    await user.type(screen.getByLabelText(/what went wrong/i), 'something')
    await user.click(screen.getByRole('button', { name: /^send$/i }))
    expect(await screen.findByText(/already reported/i)).toBeTruthy()
  })
})
