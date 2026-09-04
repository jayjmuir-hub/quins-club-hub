import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const countUnreadMessagesMock = vi.fn()
const subscribeMessagesMock = vi.fn()
const countAdminWaitingMock = vi.fn()
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  countUnreadMessages: (...args) => countUnreadMessagesMock(...args),
  subscribeMessages: (...args) => subscribeMessagesMock(...args),
}))
vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: (...args) => countAdminWaitingMock(...args),
}))

import useDockBadges from '../src/lib/useDockBadges.js'

function Probe(props) {
  const badges = useDockBadges(props)
  return <output data-testid="badges">{JSON.stringify(badges)}</output>
}

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe userId="me" admin enabled {...props} />
    </MemoryRouter>,
  )
}

const read = () => JSON.parse(screen.getByTestId('badges').textContent)

beforeEach(() => {
  countUnreadMessagesMock.mockReset().mockResolvedValue(0)
  subscribeMessagesMock.mockReset().mockReturnValue(() => {})
  countAdminWaitingMock.mockReset().mockResolvedValue(0)
})

describe('useDockBadges', () => {
  it('lights Chat when there are unread posts, and More when an admin has reviews waiting', async () => {
    countUnreadMessagesMock.mockResolvedValue(2)
    countAdminWaitingMock.mockResolvedValue(1)
    renderAt('/')
    await waitFor(() => expect(read()).toEqual({ '/chat': true, '/more': true, chatCount: 2 }))
  })

  it('never lights More for a non-admin, and does not even ask', async () => {
    countAdminWaitingMock.mockResolvedValue(5)
    renderAt('/', { admin: false })
    await waitFor(() => expect(countUnreadMessagesMock).toHaveBeenCalled())
    expect(countAdminWaitingMock).not.toHaveBeenCalled()
    expect(read()['/more']).toBe(false)
  })

  // While you are on the screen the dot points at, it is noise.
  it('suppresses the Chat dot AND the sidebar count while on /chat', async () => {
    countUnreadMessagesMock.mockResolvedValue(4)
    renderAt('/chat')
    await waitFor(() => expect(countUnreadMessagesMock).toHaveBeenCalled())
    expect(read()['/chat']).toBe(false)
    expect(read().chatCount).toBe(0)
  })

  // 4 Sep 2026: the sidebar wears the NUMBER (Jay's ruling over the dot).
  it('hands the sidebar the unread number off /chat', async () => {
    countUnreadMessagesMock.mockResolvedValue(4)
    renderAt('/roster')
    await waitFor(() => expect(read().chatCount).toBe(4))
  })

  // A count that cannot be read must never paint a dot the screen cannot clear.
  it('fails to no dot when a count throws', async () => {
    countUnreadMessagesMock.mockRejectedValue(new Error('offline'))
    countAdminWaitingMock.mockRejectedValue(new Error('offline'))
    renderAt('/')
    await waitFor(() => expect(countUnreadMessagesMock).toHaveBeenCalled())
    expect(read()).toEqual({ '/chat': false, '/more': false, chatCount: 0 })
  })

  it('subscribes to message changes and recounts on each one', async () => {
    let fire
    subscribeMessagesMock.mockImplementation((cb) => {
      fire = cb
      return () => {}
    })
    renderAt('/')
    await waitFor(() => expect(countUnreadMessagesMock).toHaveBeenCalledTimes(1))
    countUnreadMessagesMock.mockResolvedValue(1)
    fire()
    await waitFor(() => expect(read()['/chat']).toBe(true))
  })

  it('asks nothing while disabled (membership set not yet known)', () => {
    renderAt('/', { enabled: false })
    expect(countUnreadMessagesMock).not.toHaveBeenCalled()
    expect(countAdminWaitingMock).not.toHaveBeenCalled()
    expect(read()).toEqual({ '/chat': false, '/more': false, chatCount: 0 })
  })
})
