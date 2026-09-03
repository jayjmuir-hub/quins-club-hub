import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../src/components/Toast.jsx'

// design-system.md §4.24, built 3 Sep 2026. The rules: one at a time (a new
// toast replaces, never stacks), ~2.2s then gone, longer when it carries an
// action, announced through a live region that is always mounted, and a
// hook that is a harmless no-op outside the provider.

function Fixture({ onToast }) {
  const toast = useToast()
  onToast(toast)
  return <button type="button" onClick={() => toast('Saved.')}>Save</button>
}

function renderWithProvider() {
  let fire
  render(
    <ToastProvider>
      <Fixture onToast={(t) => { fire = t }} />
    </ToastProvider>,
  )
  return { fire: (...args) => act(() => fire(...args)) }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows the message in an always-mounted live region, then hides it after ~2.2s', () => {
    vi.useFakeTimers()
    const { fire } = renderWithProvider()
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByTestId('toast')).toBeNull()

    fire('Saved.')
    expect(screen.getByTestId('toast')).toHaveTextContent('Saved.')

    act(() => { vi.advanceTimersByTime(2100) })
    expect(screen.getByTestId('toast')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('a new toast replaces the current one and restarts the clock', () => {
    vi.useFakeTimers()
    const { fire } = renderWithProvider()
    fire('First')
    act(() => { vi.advanceTimersByTime(2000) })
    fire('Second')
    expect(screen.getAllByTestId('toast')).toHaveLength(1)
    expect(screen.getByTestId('toast')).toHaveTextContent('Second')
    // 2000 + 1000 would have cleared the first; the second is still here.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('toast')).toHaveTextContent('Second')
  })

  it('an action holds the toast longer, runs on click, and dismisses it', () => {
    vi.useFakeTimers()
    const undo = vi.fn()
    const { fire } = renderWithProvider()
    fire('Deleted.', { action: { label: 'Undo', onClick: undo } })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByTestId('toast')).toBeInTheDocument()

    // fireEvent, not userEvent: userEvent's own delays deadlock under fake timers.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('can be dismissed by hand', async () => {
    const { fire } = renderWithProvider()
    fire('Saved.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('is a no-op outside the provider — a bare screen render must not crash', () => {
    let fire
    render(<Fixture onToast={(t) => { fire = t }} />)
    expect(() => fire('Saved.')).not.toThrow()
    expect(screen.queryByTestId('toast')).toBeNull()
  })
})
