import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../src/components/ErrorBoundary.jsx'

// ⚠️ WHAT THIS FILE IS ACTUALLY FOR, because the component is the easy half.
//
// Before 13 Aug 2026 there was no error boundary anywhere in src/. React 18
// unmounts the ENTIRE tree on an uncaught render error, so one null where a
// component expected a string produced a blank white page with no text, no
// message and no way back. RESTORE.md already documents that exact symptom in
// a test context ("an empty <body> and an error mentioning nothing about
// object URLs") — it behaves the same way on a parent's phone.
//
// ⚠️ AND REFRESHING DOES NOT FIX IT. The service worker serves the same bundle
// back, so "turn it off and on again" fails in the one situation where every
// non-technical person tries it. That is why the fallback offers to CLEAR THE
// CACHED DATA as well as reload, and why that is tested here rather than left
// as a comment.
//
// ⚠️ THE TESTS THAT MATTER MOST ARE THE WIRING ONES AT THE BOTTOM, NOT THESE.
// A boundary component that nothing renders is worth exactly nothing, and a
// test of the component in isolation stays green while that is true. See
// tests/error-boundary-wiring.test.jsx.

function Boom({ message = 'boom' }) {
  throw new Error(message)
}

function Fine() {
  return <p>the real screen</p>
}

// React logs caught render errors to console.error. Silenced so a passing run
// is readable — but captured, so a test can still assert we reported it.
let consoleError

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Fine />
      </ErrorBoundary>,
    )
    expect(screen.getByText('the real screen')).toBeInTheDocument()
  })

  it('catches a render error and puts something readable on screen', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    // ⚠️ THE POINT IS THAT THE BODY IS NOT EMPTY. That is the failure being
    // prevented, so assert it directly rather than only asserting the copy.
    expect(document.body.textContent.trim().length).toBeGreaterThan(0)
  })

  it('speaks to a parent, not to a developer', () => {
    render(
      <ErrorBoundary>
        <Boom message="Cannot read properties of null (reading trim)" />
      </ErrorBoundary>,
    )
    // The raw exception text must not be the thing a person is shown.
    expect(screen.queryByText(/Cannot read properties of null/)).not.toBeInTheDocument()
  })

  it('reports the error rather than swallowing it', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <Boom message="reportable" />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0][0].message).toBe('reportable')
  })

  it('recovers when the cause has gone away — "Try again" re-renders the child', async () => {
    const user = userEvent.setup()
    let shouldThrow = true
    function Flaky() {
      if (shouldThrow) throw new Error('transient')
      return <Fine />
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('the real screen')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays on the fallback when "Try again" hits the same error again', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    await user.click(screen.getByRole('button', { name: /try again/i }))
    // ⚠️ Not a no-op test: a boundary that clears its state and does not
    // re-catch would render a blank screen here, which is the original bug
    // wearing a recovery button.
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('offers the cache purge, because a reload alone cannot fix a poisoned cache', async () => {
    const user = userEvent.setup()
    const onClearCache = vi.fn().mockResolvedValue(true)

    render(
      <ErrorBoundary onClearCache={onClearCache}>
        <Boom />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: /clear saved data/i }))
    expect(onClearCache).toHaveBeenCalledTimes(1)
  })

  it('isolates: a sibling outside the boundary keeps rendering', () => {
    render(
      <div>
        <p>the navigation</p>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByText('the navigation')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
