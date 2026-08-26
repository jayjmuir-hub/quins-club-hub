import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Chat navigation (claude/plans/2026-08-24-chat-navigation.md): the chip
// filters driven by ?filter=, the foldable sections remembered per device,
// and unread-first ordering. The sidebar's category links emit the same
// ?filter= URLs, so proving the param here proves the sidebar's deep-links.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listChats: vi.fn(),
  listDmCandidates: vi.fn(),
  openConversation: vi.fn(),
  subscribeMessages: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
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
  { kind: 'club', team_id: null, conversation_id: null, label: 'Whole club', detail: 'Club-wide · admins post', last_at: '2026-08-24T08:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 0 },
  { kind: 'squad', team_id: 't1', label: 'U16B', detail: 'Squad', last_at: '2026-08-24T09:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 0 },
  { kind: 'squad', team_id: 't2', label: 'U7 Tag', detail: 'Squad', last_at: '2026-08-24T07:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 3 },
  { kind: 'dm', conversation_id: 'c1', label: 'Zz Manager Probe', detail: 'Direct message', last_at: '2026-08-24T10:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 0 },
  { kind: 'group', conversation_id: 'g1', label: 'Zz Probe Carpool', detail: '3 people', last_at: '2026-08-24T06:00:00Z', last_body: 'x', last_author_id: 'a1', unread: 2 },
]

function renderList(entry = '/chat') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
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
  // memberships not loaded → scopeChatRows passes rows through untouched
  // (the database has already scoped them for real users).
  useMembershipsMock.mockReturnValue({ memberships: null, teams: null })
  m.listChats.mockResolvedValue(ROWS)
  m.listDmCandidates.mockResolvedValue([])
  m.subscribeMessages.mockReturnValue(() => {})
})

describe('the filter chips', () => {
  it('?filter=squads shows squads only and hides the hero; the URL is the mechanism', async () => {
    renderList('/chat?filter=squads')
    expect(await screen.findByText('U16B')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-hero')).toBeNull()
    expect(screen.queryByText('Zz Probe Carpool')).toBeNull()
  })

  it('the Unread chip carries its count and narrows to unread rows of any kind', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByText('U16B')
    await user.click(screen.getByRole('button', { name: 'Unread · 2' }))
    expect(screen.getByText('U7 Tag')).toBeInTheDocument()
    expect(screen.getByText('Zz Probe Carpool')).toBeInTheDocument()
    expect(screen.queryByText('U16B')).toBeNull()
    expect(screen.queryByText('Zz Manager Probe')).toBeNull()
  })
})

describe('DMs lead the list', () => {
  // Jay, 25 Aug 2026: "DMs should always be at the top of the chat screen
  // instead of having to scroll down to the bottom area for them".
  it('the Direct messages section renders ABOVE Your squads', async () => {
    renderList()
    const dms = await screen.findByTestId('section-dms')
    const squads = screen.getByTestId('section-squads')
    expect(dms.compareDocumentPosition(squads) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('unread first', () => {
  it('within a section, unread rows sort above newer read rows', async () => {
    renderList()
    const section = await screen.findByTestId('section-squads')
    const labels = [...section.querySelectorAll('li')].map((li) => li.textContent)
    // U7 Tag (unread, older) above U16B (read, newer)
    expect(labels.findIndex((t) => t.includes('U7 Tag'))).toBeLessThan(labels.findIndex((t) => t.includes('U16B')))
  })
})

describe('the folds', () => {
  it('folding a section hides its card, shows the count, and survives a remount', async () => {
    const user = userEvent.setup()
    const first = renderList()
    await screen.findByText('U16B')
    await user.click(screen.getByTestId('fold-your-squads'))
    expect(screen.queryByText('U16B')).toBeNull()
    expect(within(screen.getByTestId('fold-your-squads')).getByText('2')).toBeInTheDocument()

    first.unmount()
    renderList()
    await screen.findByText('Zz Manager Probe')
    expect(screen.queryByText('U16B')).toBeNull()
    expect(screen.getByTestId('fold-your-squads')).toHaveAttribute('aria-expanded', 'false')
  })
})
