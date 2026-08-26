import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The dock's resize grip (Jay, 24 Aug 2026: "can we make the chat box
// resizeable? this would be beneficial in desktop mode"). A top-left grip —
// the panel is anchored bottom-right, so dragging left/up GROWS it — with
// clamped bounds and device-level persistence, same ruling as
// chat-enter-sends.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
// The DM identity badges fetch member_identity (26 Aug 2026); empty here
// keeps this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
// The wallpaper rides chat_prefs since 26 Aug 2026 — quiet defaults keep
// this file about its own subject and network-free.
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: async () => null,
  setChatPref: async () => {},
  listMyChatPrefs: async () => new Map(),
}))
vi.mock('../src/data/chatMedia.js', () => ({
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(async () => null),
}))
// Presence is a live websocket; tests get a quiet empty room.
vi.mock('../src/lib/presence.js', () => ({
  usePresence: () => new Map(),
  dotState: (map, id) => (id && map?.get?.(id)) || 'offline',
}))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  chatPath: () => '/chat',
  listChats: vi.fn(async () => []),
  listDirectMessages: vi.fn(async () => []),
  listMessages: vi.fn(async () => []),
  listReactions: vi.fn(async () => new Map()),
  listStaffMessages: vi.fn(async () => []),
  markMessagesRead: vi.fn(),
  postMessage: vi.fn(),
  postStaffMessage: vi.fn(),
  sendDirectMessage: vi.fn(),
  subscribeMessages: () => () => {},
  subscribeReactions: () => () => {},
  toggleReaction: vi.fn(),
}))
vi.mock('../src/screens/ChatList.jsx', () => ({
  RowAvatar: () => <span />,
  previewLine: () => '',
  scopeChatRows: (rows) => rows,
}))

import FloatingChatDock, { clampDockSize } from '../src/components/FloatingChatDock.jsx'

function renderDock() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <FloatingChatDock />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthMock.mockReturnValue({ user: { id: 'me-1' } })
  useMembershipsMock.mockReturnValue({ memberships: [], teams: [] })
})

describe('clampDockSize', () => {
  it('holds the bounds and falls back to the default on junk', () => {
    expect(clampDockSize({ w: 100, h: 100 })).toEqual({ w: 320, h: 400 })
    expect(clampDockSize({ w: 9000, h: 9000 })).toEqual({ w: 1100, h: 860 })
    expect(clampDockSize({ w: 400, h: 600 })).toEqual({ w: 400, h: 600 })
    expect(clampDockSize(null)).toEqual({ w: 380, h: 560 })
    expect(clampDockSize({ w: 'x', h: 500 })).toEqual({ w: 380, h: 560 })
  })
})

describe('the resize grip', () => {
  it('dragging the grip up-left grows the panel, and the size is saved on release', async () => {
    const user = userEvent.setup()
    renderDock()
    await user.click(screen.getByTestId('dock-bubble-button'))
    const panel = screen.getByTestId('dock-panel')
    expect(panel.style.width).toBe('380px')
    expect(panel.style.height).toBe('560px')

    const grip = screen.getByTestId('dock-resize-grip')
    fireEvent.pointerDown(grip, { clientX: 500, clientY: 500 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 380 })
    expect(panel.style.width).toBe('480px')
    expect(panel.style.height).toBe('680px')
    fireEvent.pointerUp(window)

    expect(JSON.parse(localStorage.getItem('chat-dock-size'))).toEqual({ w: 480, h: 680 })
  })

  it('a stored size is applied on mount, clamped', async () => {
    localStorage.setItem('chat-dock-size', JSON.stringify({ w: 9000, h: 200 }))
    const user = userEvent.setup()
    renderDock()
    await user.click(screen.getByTestId('dock-bubble-button'))
    const panel = screen.getByTestId('dock-panel')
    expect(panel.style.width).toBe('1100px')
    expect(panel.style.height).toBe('400px')
  })

  it('a drag past the bounds stops at them', async () => {
    const user = userEvent.setup()
    renderDock()
    await user.click(screen.getByTestId('dock-bubble-button'))
    const grip = screen.getByTestId('dock-resize-grip')
    fireEvent.pointerDown(grip, { clientX: 500, clientY: 500 })
    fireEvent.pointerMove(window, { clientX: 2000, clientY: 2000 })
    const panel = screen.getByTestId('dock-panel')
    expect(panel.style.width).toBe('320px')
    expect(panel.style.height).toBe('400px')
  })
})
