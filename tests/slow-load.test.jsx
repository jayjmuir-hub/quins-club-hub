// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import useSlowLoad from '../src/lib/useSlowLoad.js'

function Probe({ active, delay }) {
  const slow = useSlowLoad(active, delay)
  return <span>{slow ? 'slow' : 'fine'}</span>
}

describe('useSlowLoad', () => {
  afterEach(() => vi.useRealTimers())

  it('flips to slow only after the delay, and resets when the load ends', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Probe active delay={6000} />)
    expect(screen.getByText('fine')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(5999))
    expect(screen.getByText('fine')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('slow')).toBeInTheDocument()

    // The load finished — no more "taking longer" once it is no longer active.
    rerender(<Probe active={false} delay={6000} />)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('never flips if the load finishes before the delay', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Probe active delay={6000} />)
    act(() => vi.advanceTimersByTime(3000))
    rerender(<Probe active={false} delay={6000} />)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})
