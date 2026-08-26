import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The "Squad chat" block on the event screen (squad chat phase 2, 23 Aug
// 2026). Same handler-required rule as every other button in EventDetail —
// see tests/duplicate-event.test.jsx for why that rule exists — and the
// same grep that proves BOTH host screens pass the handler.

const getEventThreadMock = vi.fn()
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {}, getEventThread: (...a) => getEventThreadMock(...a) }))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: vi.fn().mockResolvedValue([]),
  subscribeAvailability: vi.fn(() => () => {}),
}))
vi.mock('../src/data/events.js', () => ({
  countSeriesFrom: vi.fn(),
  deleteEvent: vi.fn(),
  deleteSeriesFrom: vi.fn(),
}))

import EventDetail from '../src/screens/EventDetail.jsx'

const TEAM = { id: 'team-a', name: 'ZZ Probe U12' }
const EVENT = {
  id: 'ev-1', team_id: 'team-a', type: 'match', opponent: 'ZZ Probe Eagles', home: true,
  starts_at: '2026-08-29T05:30:00Z', ends_at: null, time_tbd: false, series_id: null,
}
const PROPS = { event: EVENT, team: TEAM, onClose: vi.fn(), canEdit: false }

beforeEach(() => {
  vi.clearAllMocks()
  getEventThreadMock.mockResolvedValue(null)
})

describe('EventDetail — the Squad chat block', () => {
  it('offers "Start a thread" when the fixture has none, for a parent too', async () => {
    const onOpenChat = vi.fn()
    const user = userEvent.setup()
    render(<EventDetail {...PROPS} onOpenChat={onOpenChat} />)

    const button = await screen.findByRole('button', { name: 'Start a thread' })
    expect(getEventThreadMock).toHaveBeenCalledWith('ev-1')
    await user.click(button)
    expect(onOpenChat).toHaveBeenCalledWith(EVENT)
  })

  it('shows the reply count and opens the thread when one exists', async () => {
    getEventThreadMock.mockResolvedValue({ id: 't1', team_id: 'team-a', replies: 3 })
    const onOpenChat = vi.fn()
    const user = userEvent.setup()
    render(<EventDetail {...PROPS} onOpenChat={onOpenChat} />)

    await user.click(await screen.findByRole('button', { name: '3 replies · Open the thread' }))
    expect(onOpenChat).toHaveBeenCalledWith(EVENT)
  })

  it('⚠️ renders NOTHING when the caller forgot the handler', () => {
    render(<EventDetail {...PROPS} />)
    expect(screen.queryByTestId('event-chat-block')).toBeNull()
    expect(getEventThreadMock).not.toHaveBeenCalled()
  })

  it('⚠️ both host screens pass onOpenChat, navigating to the squad channel with ?event=', () => {
    const read = (f) => readFileSync(join(process.cwd(), 'src', 'screens', f), 'utf8')
    for (const screenFile of ['Schedule.jsx', 'Dashboard.jsx']) {
      expect(read(screenFile), `${screenFile} must pass onOpenChat to EventDetail`).toMatch(
        /onOpenChat=\{\(fixture\) => navigate\(`\/chat\/\$\{fixture\.team_id\}\?event=\$\{fixture\.id\}`\)\}/,
      )
    }
  })
})
