import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// The Admin badge's refresh policy (2 Sep 2026). Jay, desktop: "when I have
// the desktop site open and new join approvals come in the little number
// icon on admin doesn't increment unless I open admin again or refresh".
// Until then the count was taken on mount and on leaving Accounts only.
//
// Three refresh paths, each proven here against a count that CHANGES between
// calls — a test that mocks the same number twice cannot tell a recount from
// a re-render:
//   - realtime on memberships and access_requests (debounced into one count);
//   - the tab coming back (visibilitychange / focus), throttled;
//   - the caller's tick (leaving Accounts), which Sidebar's own tests cover.

const countAdminWaitingMock = vi.fn()
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: (...args) => countAdminWaitingMock(...args),
}))

// Captures each subscription's callback so a test can play a change event.
const subscriptions = []
const unsubscribeMock = vi.fn()
vi.mock('../src/data/subscribeToTable.js', () => ({
  subscribeToTable: (table, callback, options) => {
    subscriptions.push({ table, callback, options })
    return unsubscribeMock
  },
}))

import useAdminWaiting, {
  ADMIN_WAITING_DEBOUNCE_MS,
  ADMIN_WAITING_FOCUS_MIN_AGE_MS,
} from '../src/lib/useAdminWaiting.js'

function Probe(props) {
  const count = useAdminWaiting(props)
  return <output data-testid="count">{count}</output>
}

const read = () => Number(screen.getByTestId('count').textContent)

beforeEach(() => {
  subscriptions.length = 0
  unsubscribeMock.mockReset()
  countAdminWaitingMock.mockReset().mockResolvedValue(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAdminWaiting', () => {
  it('counts on mount and reports the number', async () => {
    countAdminWaitingMock.mockResolvedValue(3)
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(read()).toBe(3))
    expect(countAdminWaitingMock).toHaveBeenCalledWith('me')
  })

  it('subscribes to BOTH tables whose rows are the count, debounced, and lets go on unmount', async () => {
    const { unmount } = render(<Probe userId="me" enabled />)
    await waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalled())
    expect(subscriptions.map((s) => s.table).sort()).toEqual(['access_requests', 'memberships'])
    for (const s of subscriptions) expect(s.options.debounceMs).toBe(ADMIN_WAITING_DEBOUNCE_MS)
    unmount()
    expect(unsubscribeMock).toHaveBeenCalledTimes(2)
  })

  it('⚠️ recounts when a membership change arrives — the number moves without a refresh', async () => {
    countAdminWaitingMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(read()).toBe(1))

    const memberships = subscriptions.find((s) => s.table === 'memberships')
    await act(async () => {
      memberships.callback()
    })
    await waitFor(() => expect(read()).toBe(2))
    expect(countAdminWaitingMock).toHaveBeenCalledTimes(2)
  })

  it('recounts when an access request changes too', async () => {
    countAdminWaitingMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      subscriptions.find((s) => s.table === 'access_requests').callback()
    })
    await waitFor(() => expect(read()).toBe(1))
  })

  it('recounts when the tab comes back, but not on a flicker straight after a count', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    countAdminWaitingMock.mockResolvedValueOnce(1).mockResolvedValueOnce(4)
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(read()).toBe(1))

    // Straight away: too soon, no recount.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(countAdminWaitingMock).toHaveBeenCalledTimes(1)

    // After the minimum age: a return to the tab recounts.
    await act(async () => {
      vi.advanceTimersByTime(ADMIN_WAITING_FOCUS_MIN_AGE_MS + 1)
    })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(read()).toBe(4))
  })

  it('a visibilitychange to HIDDEN never recounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalledTimes(1))
    await act(async () => {
      vi.advanceTimersByTime(ADMIN_WAITING_FOCUS_MIN_AGE_MS + 1)
    })
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(countAdminWaitingMock).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })

  it('a failed recount keeps the last good number rather than dropping to zero', async () => {
    countAdminWaitingMock.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('offline'))
    render(<Probe userId="me" enabled />)
    await waitFor(() => expect(read()).toBe(2))
    await act(async () => {
      subscriptions.find((s) => s.table === 'memberships').callback()
    })
    await waitFor(() => expect(countAdminWaitingMock).toHaveBeenCalledTimes(2))
    expect(read()).toBe(2)
  })

  it('disabled: no count, no subscription, zero', async () => {
    render(<Probe userId="me" enabled={false} />)
    expect(countAdminWaitingMock).not.toHaveBeenCalled()
    expect(subscriptions).toHaveLength(0)
    expect(read()).toBe(0)
  })

  it('the caller’s tick forces a recount', async () => {
    countAdminWaitingMock.mockResolvedValueOnce(3).mockResolvedValueOnce(0)
    const { rerender } = render(<Probe userId="me" enabled tick={0} />)
    await waitFor(() => expect(read()).toBe(3))
    rerender(<Probe userId="me" enabled tick={1} />)
    await waitFor(() => expect(read()).toBe(0))
  })
})
