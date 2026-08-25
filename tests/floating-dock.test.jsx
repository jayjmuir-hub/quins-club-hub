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
]
const DM_THREAD = [
  { id: 'x1', conversation_id: 'c1', channel: 'dm', author_id: 'other-1', body: 'Zz two seats held', created_at: '2026-08-24T07:00:00Z', deleted_at: null, author: { full_name: 'Zz Manager Probe' } },
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
  m.listDirectMessages.mockResolvedValue(DM_THREAD)
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
    const labels = dockRows.map((r) => within(r).getByText(/ZZ Probe U13|ZZ Probe U18|Zz Manager Probe/).textContent)
    expect(labels).toContain('ZZ Probe U13')
    expect(labels).toContain('Zz Manager Probe')
    expect(labels).not.toContain('ZZ Probe U18')
  })

  it('a DM row opens the thread in the panel and Send sends', async () => {
    const user = userEvent.setup()
    renderAt('/roster')
    await user.click(screen.getByTestId('dock-bubble-button'))
    await user.click((await screen.findAllByTestId('dock-row'))[1])
    expect(await screen.findByTestId('dock-bubble')).toHaveTextContent('Zz two seats held')
    // First name only in the greeting (Jay, 25 Aug 2026) — the full name is
    // already the header's job. Squads keep their whole label.
    expect(screen.getByPlaceholderText('Message Zz')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Message'), 'Zz on my way')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'Zz on my way', { attachmentPath: null }))
  })
})
