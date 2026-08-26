import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Pinned chats and archive — round 6
// (claude/plans/2026-08-24-chat-pins-archive.md). Who may is the
// database's (db/tests/chat-prefs.sql, owner-only); this proves the list:
// pins sort first and wear the mark, archived rows leave the sections and
// the unread arithmetic and live in a default-folded Archived section, and
// the row menu drives setChatPref.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listChats: vi.fn(),
  listDmCandidates: vi.fn(),
  openConversation: vi.fn(),
  subscribeMessages: vi.fn(),
}
const prefApi = {
  listMyChatPrefs: vi.fn(),
  setChatPref: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/chatPrefs.js', () => ({
  listMyChatPrefs: (...a) => prefApi.listMyChatPrefs(...a),
  setChatPref: (...a) => prefApi.setChatPref(...a),
}))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
  chatPath: (row) => `/chat/${row.team_id ?? row.conversation_id ?? 'club'}`,
  listChats: (...a) => m.listChats(...a),
  listDmCandidates: (...a) => m.listDmCandidates(...a),
  openConversation: (...a) => m.openConversation(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
}))

import ChatList from '../src/screens/ChatList.jsx'

const ME = 'me-1'
const ROWS = [
  { kind: 'dm', conversation_id: 'c1', label: 'Zz Manager Probe', detail: 'Direct message', last_at: '2026-08-24T10:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 0 },
  { kind: 'dm', conversation_id: 'c2', label: 'Zz Coach Probe', detail: 'Direct message', last_at: '2026-08-24T09:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 4 },
  { kind: 'group', conversation_id: 'g1', label: 'Zz Probe Carpool', detail: '3 people', last_at: '2026-08-24T08:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 0 },
]

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/chat" element={<ChatList />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: null, teams: null })
  m.listChats.mockResolvedValue(ROWS)
  m.listDmCandidates.mockResolvedValue([])
  m.subscribeMessages.mockReturnValue(() => {})
  prefApi.listMyChatPrefs.mockResolvedValue(new Map())
  prefApi.setChatPref.mockResolvedValue(undefined)
})

describe('pins', () => {
  it('a pinned chat sorts above unread and newer chats, and wears the mark', async () => {
    prefApi.listMyChatPrefs.mockResolvedValue(new Map([['group-g1', { pinned: true, archived: false }]]))
    renderList()
    const section = await screen.findByTestId('section-dms')
    const labels = [...section.querySelectorAll('[data-testid="chat-row"]')].map((a) => a.textContent)
    expect(labels[0]).toContain('Zz Probe Carpool')
    expect(within(section).getByTestId('row-pin')).toBeInTheDocument()
  })

  it('the row menu pins through setChatPref with my id and the row key', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByText('Zz Manager Probe')
    await user.click(screen.getByRole('button', { name: 'Options for Zz Manager Probe' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await waitFor(() => expect(prefApi.setChatPref).toHaveBeenCalledWith(ME, 'dm-c1', { pinned: true }))
  })
})

describe('archive', () => {
  it('an archived chat leaves its section and the unread strip, and sits folded under Archived', async () => {
    prefApi.listMyChatPrefs.mockResolvedValue(new Map([['dm-c2', { pinned: false, archived: true }]]))
    renderList()
    const section = await screen.findByTestId('section-dms')
    expect(within(section).queryByText('Zz Coach Probe')).toBeNull()
    // its 4 unread vanish from the strip (absent at zero)
    expect(screen.queryByTestId('unread-strip')).toBeNull()
    // default-folded Archived section carries it
    const fold = screen.getByTestId('fold-archived')
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Zz Coach Probe')).toBeNull()
    const user = userEvent.setup()
    await user.click(fold)
    expect(await screen.findByText('Zz Coach Probe')).toBeInTheDocument()
  })
})
