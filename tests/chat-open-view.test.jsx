import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Opening a chat, 25 Aug 2026 (Jay): "the latest message is not always
// visible, sometimes below the input bar", "not working correctly with the
// bottom and top menu bars", and "new messages should be highlighted when a
// chat is opened". Three fixes, all screen-side:
//
// 1. The squad/club composer lifts 74px+safe-area above the phone tab bar —
//    the DM thread got this in bc971f8 (#389) and Chat.jsx was missed.
//    jsdom cannot measure the chrome, so the classes ARE the assertion —
//    the same stance as tests/chat-mobile-fit.test.jsx.
// 2. Landing at the newest message scrolls to the TRUE document end.
//    scrollIntoView({block:'end'}) aligned the anchor with the viewport
//    bottom, where the sticky composer and the tab bar overlay it.
// 3. Chat.jsx grows the DM thread's "New" divider, and its unread dots
//    survive the mark-read-on-arrival effect instead of vanishing under
//    the reader.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  // Chat.jsx (squad/club stream)
  listMessages: vi.fn(),
  listMyMessageReads: vi.fn(),
  markMessagesRead: vi.fn(),
  messageReadStats: vi.fn(),
  getChannelSettings: vi.fn(),
  postMessage: vi.fn(),
  replyToMessage: vi.fn(),
  removeMessage: vi.fn(),
  clearChannel: vi.fn(),
  setPinned: vi.fn(),
  setAnnounceOnly: vi.fn(),
  subscribeMessages: vi.fn(),
  listMentionablesFor: vi.fn(),
  listStaffMessages: vi.fn(),
  postStaffMessage: vi.fn(),
  reportMessage: vi.fn(),
  getEventThread: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
  // DirectMessages.jsx (thread)
  blockDm: vi.fn(),
  deleteConversation: vi.fn(),
  forwardMessagesTo: vi.fn(),
  listChats: vi.fn(),
  listMyStars: vi.fn(),
  getConversation: vi.fn(),
  leaveGroup: vi.fn(),
  listDirectMessages: vi.fn(),
  listGroupMembers: vi.fn(),
  listMyBlocks: vi.fn(),
  listMyConversations: vi.fn(),
  logWelfareAccess: vi.fn(),
  openConversation: vi.fn(),
  renameGroup: vi.fn(),
  sendDirectMessage: vi.fn(),
  toggleStar: vi.fn(),
  unblockDm: vi.fn(),
}
// The DM header identity line fetches the person card (26 Aug 2026);
// null here keeps this file about its own subject and network-free.
// The DM identity badges fetch member_identity (26 Aug 2026); empty here
// keeps this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
// The wallpaper rides chat_prefs since 26 Aug 2026 — quiet defaults keep
// this file about its own subject and network-free.
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: async () => null,
  setChatPref: async () => {},
  listMyChatPrefs: async () => new Map(),
}))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: async () => new Map(),
  setNickname: async () => {},
}))
vi.mock('../src/data/chatMedia.js', () => ({
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
  signChatPhotoUrl: vi.fn(async () => null),
}))
// Lazy arrows only — the factory is hoisted above `m`'s initialization.
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
  listMessages: (...a) => m.listMessages(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  messageReadStats: (...a) => m.messageReadStats(...a),
  getChannelSettings: (...a) => m.getChannelSettings(...a),
  postMessage: (...a) => m.postMessage(...a),
  replyToMessage: (...a) => m.replyToMessage(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  clearChannel: (...a) => m.clearChannel(...a),
  setPinned: (...a) => m.setPinned(...a),
  setAnnounceOnly: (...a) => m.setAnnounceOnly(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
  listMentionablesFor: (...a) => m.listMentionablesFor(...a),
  listStaffMessages: (...a) => m.listStaffMessages(...a),
  postStaffMessage: (...a) => m.postStaffMessage(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  getEventThread: (...a) => m.getEventThread(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
  blockDm: (...a) => m.blockDm(...a),
  deleteConversation: (...a) => m.deleteConversation(...a),
  forwardMessagesTo: (...a) => m.forwardMessagesTo(...a),
  listChats: (...a) => m.listChats(...a),
  listMyStars: (...a) => m.listMyStars(...a),
  getConversation: (...a) => m.getConversation(...a),
  leaveGroup: (...a) => m.leaveGroup(...a),
  listDirectMessages: (...a) => m.listDirectMessages(...a),
  listGroupMembers: (...a) => m.listGroupMembers(...a),
  listMyBlocks: (...a) => m.listMyBlocks(...a),
  listMyConversations: (...a) => m.listMyConversations(...a),
  logWelfareAccess: (...a) => m.logWelfareAccess(...a),
  openConversation: (...a) => m.openConversation(...a),
  renameGroup: (...a) => m.renameGroup(...a),
  sendDirectMessage: (...a) => m.sendDirectMessage(...a),
  toggleStar: (...a) => m.toggleStar(...a),
  unblockDm: (...a) => m.unblockDm(...a),
}))
vi.mock('../src/data/events.js', () => ({ listEvents: vi.fn(async () => []) }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: vi.fn(async () => []) }))
vi.mock('../src/screens/ChatList.jsx', () => ({
  RowAvatar: () => <span />,
  scopeChatRows: (rows) => rows,
  previewLine: () => '',
  shortBand: () => 'U12',
}))

import Chat from '../src/screens/Chat.jsx'
import DirectMessages from '../src/screens/DirectMessages.jsx'

const CLUB_ID = 'club-1'
const TEAM_A = { id: 'team-a', club_id: CLUB_ID, name: 'ZZ Probe U12', sort_order: 1 }
const PARENT = [{ id: 'm2', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: CLUB_ID, status: 'active' }]

function post(overrides = {}) {
  return {
    id: 'msg-1',
    club_id: CLUB_ID,
    team_id: 'team-a',
    channel: 'squad',
    parent_id: null,
    author_id: 'coach-1',
    author_role: 'coach',
    author_title: 'Head Coach',
    body: 'Training moves to pitch 3.',
    pinned: false,
    edited_at: null,
    deleted_at: null,
    created_at: '2026-08-23T08:00:00Z',
    author: { full_name: 'Zz Coach Probe' },
    replies: [],
    ...overrides,
  }
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/chat/team-a']}>
      <Routes>
        <Route path="/chat" element={<div>the list</div>} />
        <Route path="/chat/:teamId" element={<Chat />} />
      </Routes>
    </MemoryRouter>,
  )
}

const ME = 'me-1'
const OTHER = 'other-1'
const CONV = { id: 'c1', club_id: CLUB_ID, profile_a: ME < OTHER ? ME : OTHER, profile_b: ME < OTHER ? OTHER : ME }

function renderThread() {
  return render(
    <MemoryRouter initialEntries={['/chat/dm/c1']}>
      <Routes>
        <Route path="/chat/dm/:conversationId" element={<DirectMessages />} />
        <Route path="/chat" element={<div>the list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({
    memberships: PARENT,
    realMemberships: PARENT,
    teams: [TEAM_A],
    loading: false,
    error: null,
    viewAs: null,
  })
  m.listMessages.mockResolvedValue([post()])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.messageReadStats.mockResolvedValue(new Map())
  m.getChannelSettings.mockResolvedValue({ team_id: 'team-a', announce_only: true })
  m.subscribeMessages.mockReturnValue(() => {})
  m.subscribeReactions.mockReturnValue(() => {})
  m.listMentionablesFor.mockResolvedValue([])
  m.listReactions.mockResolvedValue(new Map())
  m.listStaffMessages.mockResolvedValue([])
  // DM thread
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([
    {
      id: 'dm-1',
      conversation_id: 'c1',
      channel: 'dm',
      author_id: OTHER,
      body: 'See you at training.',
      created_at: '2026-08-23T08:00:00Z',
      deleted_at: null,
      quoted_id: null,
      quoted: null,
      forwarded: false,
      pinned: false,
      attachment_path: null,
      author: { full_name: 'Zz Manager Probe' },
    },
  ])
  m.listMyConversations.mockResolvedValue([
    { conversation_id: 'c1', other_id: OTHER, other_name: 'Zz Manager Probe', other_role: 'manager', last_at: '2026-08-23T08:00:00Z', last_body: 'x', last_author_id: OTHER, unread: false },
  ])
  m.listMyBlocks.mockResolvedValue([])
  m.listMyStars.mockResolvedValue(new Set())
  m.listChats.mockResolvedValue([])
})

describe('the composer hugs the bottom edge (chrome-free conversations, 25 Aug 2026)', () => {
  // The tab bar is gone inside a conversation, so the 74px lift went with
  // it: bottom-0, with the safe-area folded into the padding so the Send
  // row clears the home indicator.
  it('the squad composer sits at bottom-0 with safe-area padding', async () => {
    renderChat()
    const locked = await screen.findByTestId('composer-locked')
    const bar = locked.parentElement
    expect(bar.className).toMatch(/(^|\s)bottom-0(\s|$)/)
    expect(bar.className).toContain('pb-[calc(8px+env(safe-area-inset-bottom))]')
    expect(bar.className).not.toContain('74px')
  })

  it('the DM composer sits at bottom-0 with safe-area padding', async () => {
    renderThread()
    const composer = await screen.findByTestId('dm-composer')
    const bar = composer.parentElement
    expect(bar.className).toMatch(/(^|\s)bottom-0(\s|$)/)
    expect(bar.className).toContain('pb-[calc(8px+env(safe-area-inset-bottom))]')
    expect(bar.className).not.toContain('74px')
  })
})

describe('opening a chat lands at the true document end', () => {
  // scrollIntoView({block:'end'}) put the anchor at the viewport bottom —
  // under the sticky composer. The fix scrolls the window to scrollHeight,
  // where the composer sits in flow and the newest message clears it.
  it('squad chat scrolls the window to the end once messages load', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChat()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, document.documentElement.scrollHeight))
    scrollTo.mockRestore()
  })

  it('the DM thread scrolls the window to the end once messages load', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderThread()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, document.documentElement.scrollHeight))
    scrollTo.mockRestore()
  })
})

describe('the page keeps growing after the messages render — and the reader stays pinned', () => {
  // Jay's phone, 25 Aug 2026: "still when i open a chat i have to scroll
  // down", with the composer floating mid-content in the screenshot. The
  // one-shot scroll fires when the DATA arrives, but photos render as
  // nothing until their signed URL lands and then grow the page below the
  // viewport. A ResizeObserver on the body re-pins on every growth while
  // the reader is near the bottom — and leaves them alone once they have
  // scrolled up into history.
  let observers

  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb
      observers.push(this)
    }
    observe(el) {
      this.el = el
    }
    disconnect() {
      this.disconnected = true
    }
  }

  beforeEach(() => {
    observers = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  it('squad chat re-pins to the end when the body grows', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChat()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    const watching = observers.filter((o) => o.el === document.body)
    expect(watching.length).toBeGreaterThan(0)
    scrollTo.mockClear()
    watching.forEach((o) => o.cb())
    expect(scrollTo).toHaveBeenCalledWith(0, document.documentElement.scrollHeight)
    scrollTo.mockRestore()
  })

  it('the DM thread re-pins to the end when the body grows', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderThread()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    const watching = observers.filter((o) => o.el === document.body)
    expect(watching.length).toBeGreaterThan(0)
    scrollTo.mockClear()
    watching.forEach((o) => o.cb())
    expect(scrollTo).toHaveBeenCalledWith(0, document.documentElement.scrollHeight)
    scrollTo.mockRestore()
  })

  it('does NOT yank a reader who deliberately scrolled UP into history', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChat()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    // A tall document; the reader scrolls DOWNWARD state to y=2000, then UP
    // to y=1000 — the upward move is the intent that unsticks.
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 2000, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    scrollTo.mockClear()
    observers.filter((o) => o.el === document.body).forEach((o) => o.cb())
    expect(scrollTo).not.toHaveBeenCalled()
    delete document.documentElement.scrollHeight
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    scrollTo.mockRestore()
  })

  it('a growth-induced scroll event does NOT unstick the pin — the phone bug', async () => {
    // 25 Aug 2026, the mechanism that survived two deploys: Android's scroll
    // anchoring fires adjustment scroll events when photos load above the
    // viewport while the page has also grown below. The old gate read
    // "far from bottom" off that event and permanently disarmed the re-pin.
    // Intent semantics: scrollY did not DECREASE, so the reader stays stuck.
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChat()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    // The page grows under the reader: suddenly far from the end, scrollY
    // unchanged (or clamped upward by anchoring — either way, not a user
    // scroll upward).
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    scrollTo.mockClear()
    observers.filter((o) => o.el === document.body).forEach((o) => o.cb())
    expect(scrollTo).toHaveBeenCalledWith(0, document.documentElement.scrollHeight)
    delete document.documentElement.scrollHeight
    scrollTo.mockRestore()
  })
})

describe('the composer greets by first name', () => {
  // Jay, 25 Aug 2026: "it show message and then the full name ... lets
  // change that so it shows message and then just the first name only".
  it('the DM placeholder carries only the first name', async () => {
    renderThread()
    const composer = await screen.findByTestId('dm-composer')
    expect(composer.querySelector('textarea')?.placeholder).toBe('Message Zz')
  })
})

describe('the channel thread uses the same bubble language as a DM (25 Aug 2026)', () => {
  // The DM thread got chrome-free bubbles in bc971f8 / #389; Chat.jsx was
  // missed. Classes ARE the assertion — jsdom cannot screenshot.
  it('a squad post has no You label, no under-bubble action links, and a chevron menu', async () => {
    renderChat()
    const row = await screen.findByTestId('message-row')
    expect(within(row).queryByText('You')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull()
    expect(within(row).getByRole('button', { name: 'Message options' })).toBeInTheDocument()
    expect(within(row).getByTestId('message-bubble')).toBeInTheDocument()
  })

  it("the viewer's own staff post is quins green, with the stamp inside", async () => {
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm1', role: 'coach', team_id: 'team-a', club_id: CLUB_ID, status: 'active' }],
      realMemberships: [{ id: 'm1', role: 'coach', team_id: 'team-a', club_id: CLUB_ID, status: 'active' }],
      teams: [TEAM_A],
      loading: false,
      error: null,
      viewAs: null,
    })
    m.listMessages.mockResolvedValue([post({ author_id: 'coach-1' })])
    renderChat()
    const row = await screen.findByTestId('message-row')
    expect(row).toHaveAttribute('data-mine', 'true')
    expect(row.querySelector('[class*="bg-accent-deep"]')).not.toBeNull()
    expect(within(row).queryByText('You')).not.toBeInTheDocument()
  })
})

describe('what arrived since the last visit is highlighted', () => {
  it('a New divider marks where unread starts, and survives mark-read', async () => {
    m.listMessages.mockResolvedValue([
      post({ id: 'msg-old', body: 'Seen last week.' }),
      post({ id: 'msg-new', body: 'Posted since your last visit.' }),
    ])
    m.listMyMessageReads.mockResolvedValue(new Set(['msg-old']))
    renderChat()
    const divider = await screen.findByTestId('new-divider')
    expect(divider).toHaveAccessibleName('New messages')
    // The mark-read-on-arrival effect must NOT wipe the highlight: the
    // divider and the unread dot describe the moment the chat was opened.
    await waitFor(() => expect(m.markMessagesRead).toHaveBeenCalled())
    expect(screen.getByTestId('new-divider')).toBeInTheDocument()
    expect(screen.getByText('Posted since your last visit.')).toBeInTheDocument()
    const dots = screen.getAllByText('New.', { exact: false })
    expect(dots.length).toBeGreaterThan(0)
  })

  it('no divider when nothing is unread', async () => {
    m.listMyMessageReads.mockResolvedValue(new Set(['msg-1']))
    renderChat()
    await screen.findByText('Training moves to pitch 3.')
    expect(screen.queryByTestId('new-divider')).toBeNull()
  })
})
