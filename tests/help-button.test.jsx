import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/components/HelpButton.jsx — the floating `?` and the
// two-step panel behind it. Design: claude/plans/2026-08-18-help-and-feedback.md.
//
// The data module is mocked, so this exercises the component's own behaviour
// and never a real insert. What the DATABASE guarantees (the stamping trigger,
// the RLS policies, the column grants) is not testable from here and is not
// what these assert — see db/migrations/20260818_feedback.sql.

const submitFeedbackMock = vi.fn()
const captureContextMock = vi.fn(() => ({ route: '/roster' }))

vi.mock('../src/data/feedback.js', () => ({
  submitFeedback: (...args) => submitFeedbackMock(...args),
  captureContext: (...args) => captureContextMock(...args),
  feedbackRef: (ref) => (ref == null ? null : `QCH-${String(ref).padStart(4, '0')}`),
}))

// Imported after vi.mock so this binds to the mocked module.
import HelpButton, { routeLabel } from '../src/components/HelpButton.jsx'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderAt(path = '/roster') {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <HelpButton />
    </MemoryRouter>,
  )
}

const openPanel = async (user) =>
  user.click(screen.getByRole('button', { name: /report a problem or suggest a change/i }))

beforeEach(() => {
  submitFeedbackMock.mockReset()
  captureContextMock.mockClear()
  submitFeedbackMock.mockResolvedValue({ ref: 41 })
})

describe('the floating help button', () => {
  it('is reachable by its accessible name, not by the glyph', async () => {
    renderAt()
    // ⚠️ The visible character is `?` and is aria-hidden. If somebody removes
    // the aria-label, a screen reader announces "question mark" and this fails
    // — which is the point of asserting on the name rather than the text.
    expect(screen.getByRole('button', { name: /report a problem or suggest a change/i })).toBeTruthy()
  })

  it('clears the accessibility floor at 44px', async () => {
    renderAt()
    const fab = screen.getByRole('button', { name: /report a problem/i })
    // h-11/w-11 is 44px in this Tailwind scale. design-system.md sets the floor
    // at >=40px; asserting the class keeps a later "make it smaller" honest,
    // because jsdom applies no CSS and cannot measure a real box.
    expect(fab.className).toMatch(/\bh-11\b/)
    expect(fab.className).toMatch(/\bw-11\b/)
  })

  it('floats under the tab bar, never over it', async () => {
    renderAt()
    const fab = screen.getByRole('button', { name: /report a problem/i })
    // Nav.jsx is z-40. A floating control that covers navigation traps the
    // person on the screen, so this must stay strictly below it.
    expect(fab.className).toMatch(/\bz-30\b/)
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
    // the member to classify their problem correctly — see HelpButton.jsx.
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
    // person to tap `?` must not find somebody else's words in the box.
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
