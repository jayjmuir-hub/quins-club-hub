import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The floating chat dock (claude/plans/2026-08-24-floating-chat-dock.md).
// The discriminating assertions: the dock is ABSENT on /chat routes, and its
// list is scoped by the same effective-membership filter as the Chats screen
// — a dock that showed an admin every squad under View-as would reintroduce
// the exact bug fixed the same day.
//
// Since 26 Aug 2026 (shared-chat-thread phases 2 and 4) EVERY thread in the
// dock IS the full screen's: DMs/groups render useDmThread + DmThread, and
// squad/staff/club channels render useChannelThread + ChannelThread — so
// these tests assert the FULL menus, MessageRow bubbles in channels, and
// the announce-only composer lock reaching the dock.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const m = {
  listChats: vi.fn(),
  listDirectMessages: vi.fn(),
  listMessages: vi.fn(),
  listStaffMessages: vi.fn(),
  markMessagesRead: vi.fn(),
  postMessage: vi.fn(),
  postStaffMessage: vi.fn(),
  sendDirectMessage: vi.fn(),
  subscribeMessages: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
  listDmCandidates: vi.fn(),
  openConversation: vi.fn(),
  getConversation: vi.fn(),
  listMyConversations: vi.fn(),
  listMyBlocks: vi.fn(),
  listMyMessageReads: vi.fn(),
  listMyStars: vi.fn(),
  listMessageReceipts: vi.fn(),
  listGroupMembers: vi.fn(),
  removeMessage: vi.fn(),
  reportMessage: vi.fn(),
  setPinned: vi.fn(),
  toggleStar: vi.fn(),
  forwardMessagesTo: vi.fn(),
  logWelfareAccess: vi.fn(),
  getChannelSettings: vi.fn(),
  listMentionablesFor: vi.fn(),
  messageReadStats: vi.fn(),
  replyToMessage: vi.fn(),
}
// The DM identity badges fetch member_identity (26 Aug 2026); empty here
// keeps this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
// Presence is a live websocket; tests get a quiet empty room.
vi.mock('../src/lib/presence.js', () => ({
  usePresence: () => new Map(),
  dotState: (map, id) => (id && map?.get?.(id)) || 'offline',
}))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: vi.fn().mockResolvedValue(new Map()),
  setNickname: vi.fn(),
}))
// useChannelThread reaches these two for fixture threads and RSVP chips;
// both are decoration the hook tolerates failing, but an unmocked import
// would walk into the real Supabase client.
vi.mock('../src/data/events.js', () => ({ listEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('../src/data/messages.js', async (orig) => ({
  ...(await orig()),
  listChats: (...a) => m.listChats(...a),
  listDirectMessages: (...a) => m.listDirectMessages(...a),
  listMessages: (...a) => m.listMessages(...a),
  listStaffMessages: (...a) => m.listStaffMessages(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  postMessage: (...a) => m.postMessage(...a),
  postStaffMessage: (...a) => m.postStaffMessage(...a),
  sendDirectMessage: (...a) => m.sendDirectMessage(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
  listDmCandidates: (...a) => m.listDmCandidates(...a),
  openConversation: (...a) => m.openConversation(...a),
  getConversation: (...a) => m.getConversation(...a),
  listMyConversations: (...a) => m.listMyConversations(...a),
  listMyBlocks: (...a) => m.listMyBlocks(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  listMyStars: (...a) => m.listMyStars(...a),
  listMessageReceipts: (...a) => m.listMessageReceipts(...a),
  listGroupMembers: (...a) => m.listGroupMembers(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  setPinned: (...a) => m.setPinned(...a),
  toggleStar: (...a) => m.toggleStar(...a),
  forwardMessagesTo: (...a) => m.forwardMessagesTo(...a),
  logWelfareAccess: (...a) => m.logWelfareAccess(...a),
  getChannelSettings: (...a) => m.getChannelSettings(...a),
  listMentionablesFor: (...a) => m.listMentionablesFor(...a),
  messageReadStats: (...a) => m.messageReadStats(...a),
  replyToMessage: (...a) => m.replyToMessage(...a),
}))

import FloatingChatDock from '../src/components/FloatingChatDock.jsx'

const ME = 'me-1'
// ⚠️ NAMES INVENTED — CLAUDE.md rule 9.
const ROWS = [
  { kind: 'squad', team_id: 't1', conversation_id: null, label: 'ZZ Probe U13', detail: 'Squad · open chat', last_at: '2026-08-24T08:00:00Z', last_body: 'Kick-off moved', last_author_id: 'coach-1', last_author_name: 'Zz Coach Probe', unread: 1 },
  { kind: 'squad', team_id: 't2', conversation_id: null, label: 'ZZ Probe U18', detail: 'Squad · open chat', last_at: '2026-08-24T07:30:00Z', last_body: null, last_author_id: null, last_author_name: null, unread: 0 },
  { kind: 'dm', team_id: null, conversation_id: 'c1', label: 'Zz Manager Probe', detail: 'Team Manager', last_at: '2026-08-24T07:00:00Z', last_body: 'Two seats held', last_author_id: ME, last_author_name: 'Me', unread: 0 },
  { kind: 'group', team_id: null, conversation_id: 'g1', label: 'Zz Car Pool', detail: 'Group · 3 people', last_at: '2026-08-24T06:00:00Z', last_body: 'Seats sorted', last_author_id: 'other-2', last_author_name: 'Zz Parent Probe', unread: 0 },
]
const DM_THREAD = [
  { id: 'x1', conversation_id: 'c1', channel: 'dm', author_id: 'other-1', body: 'Zz two seats held', created_at: '2026-08-24T07:00:00Z', deleted_at: null, author: { full_name: 'Zz Manager Probe' } },
  { id: 'x2', conversation_id: 'c1', channel: 'dm', author_id: ME, body: 'Zz on my way yesterday', created_at: '2026-08-24T07:05:00Z', deleted_at: null, author: { full_name: 'Me Probe' } },
]
const GROUP_THREAD = [
  { id: 'g-x1', conversation_id: 'g1', channel: 'dm', author_id: 'other-2', body: 'Zz seats sorted', created_at: '2026-08-24T06:00:00Z', deleted_at: null, author: { full_name: 'Zz Parent Probe' } },
]
const SQUAD_THREAD = [
  { id: 's1', team_id: 't1', channel: 'squad', author_id: 'coach-1', body: 'Kick-off moved', created_at: '2026-08-24T08:00:00Z', deleted_at: null, author: { full_name: 'Zz Coach Probe' }, author_role: 'coach' },
]

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<FloatingChatDock badge />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  // A parent on t1 only: t2's channel must never appear in the dock.
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'parent', team_id: 't1', player_id: 'p1', club_id: 'club-1', status: 'active' }],
    teams: [
      { id: 't1', name: 'ZZ Probe U13', sort_order: 1 },
      { id: 't2', name: 'ZZ Probe U18', sort_order: 2 },
    ],
  })
  m.listChats.mockResolvedValue(ROWS)
  m.listDirectMessages.mockImplementation(async (id) => (id === 'g1' ? GROUP_THREAD : DM_THREAD))
  m.listMessages.mockResolvedValue(SQUAD_THREAD)
  m.sendDirectMessage.mockResolvedValue()
  m.markMessagesRead.mockResolvedValue()
  m.subscribeMessages.mockReturnValue(() => {})
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  // What useDmThread loads on top of the old dock's fetches.
  m.getConversation.mockImplementation(async (id) =>
    id === 'g1' ? { id: 'g1', kind: 'group', title: 'Zz Car Pool' } : { id: 'c1', kind: 'dm', profile_a: ME, profile_b: 'other-1' },
  )
  m.listMyConversations.mockResolvedValue([
    { conversation_id: 'c1', other_id: 'other-1', other_name: 'Zz Manager Probe', other_role: 'manager' },
  ])
  m.listMyBlocks.mockResolvedValue(new Set())
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listMyStars.mockResolvedValue(new Set())
  m.listMessageReceipts.mockResolvedValue(new Map())
  m.listGroupMembers.mockResolvedValue([
    { profile_id: ME, full_name: 'Me Probe', is_owner: false },
    { profile_id: 'other-2', full_name: 'Zz Parent Probe', is_owner: true },
    { profile_id: 'other-3', full_name: 'Zz Third Probe', is_owner: false },
  ])
  m.removeMessage.mockResolvedValue()
  m.reportMessage.mockResolvedValue()
  m.setPinned.mockResolvedValue()
  m.toggleStar.mockResolvedValue()
  m.forwardMessagesTo.mockResolvedValue()
  m.logWelfareAccess.mockResolvedValue()
  m.openConversation.mockResolvedValue('c1')
  // Channel fetches (phase 4): announce-only ON, the default — the dock must
  // show a parent the same locked composer the main chat shows.
  m.getChannelSettings.mockResolvedValue({ announce_only: true })
  m.listMentionablesFor.mockResolvedValue([])
  m.messageReadStats.mockResolvedValue(new Map())
  m.replyToMessage.mockResolvedValue()
})

describe('the floating chat dock', () => {
  it('shows the bubble with its unread dot, but never on /chat', () => {
    renderAt('/roster')
    expect(screen.getByTestId('dock-bubble-button')).toBeInTheDocument()
    expect(screen.getByTestId('dock-badge')).toBeInTheDocument()
  })

  it('is absent on chat routes — the full page IS chat there', () => {
    renderAt('/chat/t1')
    expect(screen.queryByTestId('chat-dock')).toBeNull()
  })

  it('opens to the scoped list: your squad and your DMs, never another squad', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    const dockRows = await screen.findAllByTestId('dock-row')
    const labels = dockRows.map((r) => within(r).getByText(/ZZ Probe U13|ZZ Probe U18|Zz Manager Probe|Zz Car Pool/).textContent)
    expect(labels).toContain('ZZ Probe U13')
    expect(labels).toContain('Zz Manager Probe')
    expect(labels).toContain('Zz Car Pool')
    expect(labels).not.toContain('ZZ Probe U18')
  })

  it('a DM row opens the REAL thread in the panel and Send sends', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    // dm-bubble, not a dock-only bubble: this IS DmThread (phase 2).
    const bubbles = await screen.findAllByTestId('dm-bubble')
    expect(bubbles[0]).toHaveTextContent('Zz two seats held')
    // First name only in the greeting (Jay, 25 Aug 2026) — the full name is
    // already the header's job. Squads keep their whole label.
    expect(screen.getByPlaceholderText('Message Zz')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Message'), 'Zz on my way')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'Zz on my way', { attachmentPath: null, quotedId: null }))
  })

  it('a 1:1 does not print their name on every incoming bubble, and own is green with no You', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dm-bubble')
    expect(bubbles).toHaveLength(2)
    // Incoming: the header already says Zz Manager Probe — the bubble must not.
    expect(within(bubbles[0]).queryByText('Zz Manager Probe')).not.toBeInTheDocument()
    expect(bubbles[0]).toHaveTextContent('Zz two seats held')
    expect(bubbles[0].querySelector('[class*="bg-accent-deep"]')).toBeNull()
    // Own: quins-green, stamp inside, no You.
    expect(bubbles[1]).toHaveAttribute('data-mine', 'true')
    expect(bubbles[1].querySelector('[class*="bg-accent-deep"]')).not.toBeNull()
    expect(within(bubbles[1]).queryByText('You')).not.toBeInTheDocument()
    expect(within(bubbles[1]).getByText('Zz on my way yesterday').textContent).toMatch(/Zz on my way yesterday/)
    // Reaction trigger sits BESIDE, not an action row inside the bubble.
    expect(within(bubbles[0]).getByTestId('reaction-trigger')).toBe(bubbles[0].lastElementChild)
    expect(within(bubbles[1]).getByTestId('reaction-trigger')).toBe(bubbles[1].firstElementChild)
  })

  it('a group still names theirs, never You on own', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[2])
    const bubble = await screen.findByTestId('dm-bubble')
    expect(within(bubble).getByText('Zz Parent Probe')).toBeInTheDocument()
    expect(within(bubble).queryByText('You')).not.toBeInTheDocument()
  })

  it('pins its own panel to the newest message — and KEEPS pinning as photos grow it', async () => {
    // The dock scrolls a div, not the window, so the useStayPinnedToBottom
    // fix for the full screens never reached it: a one-shot scrollIntoView
    // fired at data time and landed short once signed photo URLs grew the
    // list (Jay, 25 Aug 2026: opening from the bubble doesn't show the
    // latest message). The ticker must re-pin AFTER the data has rendered.
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    await screen.findAllByTestId('dm-bubble')
    // jsdom has no layout: give the panel real-looking scroll metrics only
    // NOW, after the initial pin already ran against zero heights.
    const panel = screen.getByTestId('dock-thread')
    let y = 0
    Object.defineProperty(panel, 'scrollTop', { get: () => y, set: (v) => { y = v }, configurable: true })
    Object.defineProperty(panel, 'scrollHeight', { get: () => 480, configurable: true })
    Object.defineProperty(panel, 'clientHeight', { get: () => 200, configurable: true })
    await waitFor(() => expect(y).toBe(480), { timeout: 2000 })
  })

  it('a squad channel renders MessageRow itself — the SAME component as the main chat', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    // message-row/message-bubble, not a dock-only bubble: phase 4 mounts
    // ChannelThread, so the channel post carries its author and role pill
    // exactly as the full screen draws them.
    const row = await screen.findByTestId('message-row')
    expect(within(row).getByText('Zz Coach Probe')).toBeInTheDocument()
    expect(screen.getByTestId('message-bubble')).toBeInTheDocument()
  })

  it('announce-only reaches the dock: a parent sees the locked composer, not a live one', async () => {
    // The old dock showed everyone a composer and let the database refuse
    // the send. Parity means the dock says what the main chat says.
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    await screen.findByTestId('message-row')
    expect(screen.getByTestId('composer-locked')).toBeInTheDocument()
    expect(screen.queryByTestId('composer')).toBeNull()
  })

  it('empty storage paints crest on the thread — default on every chat', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    // The wallpaper paints the STREAM inside the dock's scroll container —
    // the same paint site as the full screens since phase 4.
    const panel = await screen.findByTestId('dock-thread')
    const stream = panel.querySelector('[data-background]')
    expect(stream.getAttribute('data-background')).toBe('crest')
    expect(stream.style.backgroundImage).toContain('/chat-backgrounds/crest.jpg')
    expect(stream.style.backgroundImage).not.toContain('data:image/svg+xml')
  })
})

// 26 Aug 2026, phase 2 of claude/plans/2026-08-26-shared-chat-thread.md.
// Jay: the dock should "function exactly as the main chat". These are the
// discriminating assertions — every one of them FAILS against the phase-1
// dock, whose DM menu was Reply / Copy / More in full view and nothing else.
describe('the dock chevron menu — full parity for DMs and groups', () => {
  it('an incoming DM bubble carries the FULL menu, with no More in full view', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    for (const label of ['Reply', 'Forward', 'Copy', 'Pin', 'Star', 'Report']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    // Theirs, in a 1:1: no Delete, no Reply privately — same as the screen.
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Reply privately' })).toBeNull()
    // The menu is COMPLETE now — the expand icon in the header is the only
    // remaining road to the full view.
    expect(screen.queryByRole('menuitem', { name: 'More in full view' })).toBeNull()
  })

  it('own bubble offers Delete, and Delete deletes', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[1]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(m.removeMessage).toHaveBeenCalledWith('x2'))
  })

  it('Report opens the form in the dock and sends the report', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Report' }))
    const form = await screen.findByTestId('report-form')
    await user.type(within(form).getByLabelText('Report this message to the club'), 'Zz not okay')
    await user.click(within(form).getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(m.reportMessage).toHaveBeenCalledWith('x1', 'Zz not okay'))
  })

  it('Reply quotes into the composer and the send carries quotedId', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dm-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    expect(screen.getByTestId('quote-preview')).toHaveTextContent('Zz two seats held')
    await user.type(screen.getByLabelText('Message'), 'Zz noted')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'Zz noted', {
        attachmentPath: null,
        quotedId: 'x1',
      }),
    )
    // The strip clears with the send — a second message must not re-quote.
    expect(screen.queryByTestId('quote-preview')).toBeNull()
  })

  it('Reply privately from a group STAYS IN THE DOCK, quote armed', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[2])
    const bubble = await screen.findByTestId('dm-bubble')
    await user.click(within(bubble).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply privately' }))
    // The panel switched to the 1:1 — no navigation, the dock is still here.
    await waitFor(() => expect(m.openConversation).toHaveBeenCalledWith('other-2'))
    expect(await screen.findByTestId('quote-preview')).toHaveTextContent('Zz seats sorted')
    expect(screen.getByTestId('dock-panel')).toBeInTheDocument()
  })

  it('a channel post carries the SAME menu as the main chat — thread reply included (phase 4)', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    const bubble = await screen.findByTestId('message-bubble')
    await user.click(within(bubble).getByRole('button', { name: 'Message options' }))
    // A parent on an incoming coach post, exactly as MessageRow decides it.
    for (const label of ['Reply', 'Reply privately', 'Report']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('menuitem', { name: 'More in full view' })).toBeNull()
    // Reply opens the INLINE thread with its composer — full-view furniture
    // no longer: it lives in the dock.
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    await user.type(screen.getByLabelText('Reply'), 'Zz got it, thanks')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(m.replyToMessage).toHaveBeenCalledWith('s1', 'Zz got it, thanks', { mentions: [] }))
  })
})
