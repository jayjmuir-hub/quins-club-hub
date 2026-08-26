import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The floating chat dock (claude/plans/2026-08-24-floating-chat-dock.md).
// The discriminating assertions: the dock is ABSENT on /chat routes, and its
// list is scoped by the same effective-membership filter as the Chats screen
// — a dock that showed an admin every squad under View-as would reintroduce
// the exact bug fixed the same day.

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
}
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
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

  it('a DM row opens the thread in the panel and Send sends', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dock-bubble')
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
    const bubbles = await screen.findAllByTestId('dock-bubble')
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
    const bubble = await screen.findByTestId('dock-bubble')
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
    await screen.findAllByTestId('dock-bubble')
    // jsdom has no layout: give the panel real-looking scroll metrics only
    // NOW, after the initial pin already ran against zero heights.
    const panel = screen.getByTestId('dock-thread')
    let y = 0
    Object.defineProperty(panel, 'scrollTop', { get: () => y, set: (v) => { y = v }, configurable: true })
    Object.defineProperty(panel, 'scrollHeight', { get: () => 480, configurable: true })
    Object.defineProperty(panel, 'clientHeight', { get: () => 200, configurable: true })
    await waitFor(() => expect(y).toBe(480), { timeout: 2000 })
  })

  it('a squad channel names theirs — same as MessageRow, not a third style', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    const bubble = await screen.findByTestId('dock-bubble')
    expect(within(bubble).getByText('Zz Coach Probe')).toBeInTheDocument()
    expect(bubble.querySelector('[class*="rounded-[14px]"]')).not.toBeNull()
  })

  it('empty storage paints crest on the thread — default on every chat', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[0])
    const panel = await screen.findByTestId('dock-thread')
    expect(panel.getAttribute('data-background')).toBe('crest')
    expect(panel.style.backgroundImage).toContain('/chat-backgrounds/crest.jpg')
    expect(panel.style.backgroundImage).not.toContain('data:image/svg+xml')
  })
})

// 26 Aug 2026, Jay's screenshot: the full thread's chevron menu simply was
// not in the dock. The dock's menu offers only what the dock can honestly
// do — Reply where its send carries a quote, Copy where there is a body,
// and the full view for everything richer.
describe('the dock chevron menu', () => {
  it('a DM bubble carries Reply, Copy and More in full view', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dock-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menuitem', { name: 'Reply' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'More in full view' })).toBeInTheDocument()
  })

  it('Reply quotes into the composer and the send carries quotedId', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dock-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    expect(screen.getByTestId('dock-quote-preview')).toHaveTextContent('Zz two seats held')
    await user.type(screen.getByLabelText('Message'), 'Zz noted')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'Zz noted', {
        attachmentPath: null,
        quotedId: 'x1',
      }),
    )
    // The strip clears with the send — a second message must not re-quote.
    expect(screen.queryByTestId('dock-quote-preview')).toBeNull()
  })

  it('More in full view expands to the real thread', async () => {
    const user = userEvent.setup()
    // A probe route instead of a navigate mock: the file renders a REAL
    // MemoryRouter, so landing on the thread route is the assertion.
    render(
      <MemoryRouter initialEntries={['/roster']}>
        <Routes>
          <Route path="/chat/dm/:id" element={<div data-testid="probe-thread" />} />
          <Route path="*" element={<FloatingChatDock badge />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    const bubbles = await screen.findAllByTestId('dock-bubble')
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'More in full view' }))
    expect(await screen.findByTestId('probe-thread')).toBeInTheDocument()
  })
})
