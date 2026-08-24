import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// src/screens/ChatList.jsx — the WhatsApp-shaped list, 24 Aug 2026. One
// list of everything I am in, newest first; unread badges; a preview that
// says who spoke; search; the pencil that starts a DM. What is IN the list
// is the database's (db/tests/chat-list.sql); this proves the screen shows
// what it is handed and routes each row to the right thread.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const m = { listChats: vi.fn(), listDmCandidates: vi.fn(), openConversation: vi.fn(), subscribeMessages: vi.fn() }
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/messages.js', async (orig) => ({
  ...(await orig()),
  listChats: (...a) => m.listChats(...a),
  listDmCandidates: (...a) => m.listDmCandidates(...a),
  openConversation: (...a) => m.openConversation(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
}))

import ChatList, { previewLine, shortBand } from '../src/screens/ChatList.jsx'

const ME = 'me-1'
const ROWS = [
  { kind: 'squad', team_id: 't1', conversation_id: null, label: 'ZZ Probe U13', detail: 'Squad · announce-only', last_at: '2026-08-24T08:00:00Z', last_body: 'Kick-off moved to 10:30', last_author_id: 'coach-1', last_author_name: 'Zz Coach Probe', unread: 3 },
  { kind: 'dm', team_id: null, conversation_id: 'c1', label: 'Zz Manager Probe', detail: 'Team Manager', last_at: '2026-08-24T07:00:00Z', last_body: 'Two seats held', last_author_id: ME, last_author_name: 'Me', unread: 0 },
  { kind: 'staff', team_id: 't1', conversation_id: null, label: 'ZZ Probe U13 · staff', detail: 'Staff only', last_at: '2026-08-23T07:00:00Z', last_body: 'Selection?', last_author_id: 'coach-1', last_author_name: 'Zz Coach Probe', unread: 0 },
  { kind: 'club', team_id: null, conversation_id: null, label: 'Whole club', detail: 'Club-wide · admins post', last_at: null, last_body: null, last_author_id: null, last_author_name: null, unread: 0 },
]

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/dm/:id" element={<div>dm thread</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  // A coach on t1: sees t1's squad and staff rows; club/DMs/groups pass.
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'coach', team_id: 't1', club_id: 'club-1', status: 'active' }],
    teams: [{ id: 't1', name: 'ZZ Probe U13', sort_order: 1 }],
  })
  m.listChats.mockResolvedValue(ROWS)
  m.subscribeMessages.mockReturnValue(() => {})
  m.listDmCandidates.mockResolvedValue([
    { profile_id: 'p9', full_name: 'Zz Other Parent', role: 'parent', via_team: 'ZZ Probe U13' },
    { profile_id: 'a1', full_name: 'Zz Admin Probe', role: 'admin', via_team: null },
  ])
  m.openConversation.mockResolvedValue('c-new')
})

describe('ChatList', () => {
  // The home shape since the member-chat-home work
  // (claude/plans/2026-08-24-member-chat-home.md): squads then conversations,
  // each under its title, and the club channel as the hero card. Every kind
  // still routes to its thread — that intent is unchanged from day one.
  it('lists every kind of chat, grouped, each routed to its thread', async () => {
    renderList()
    const rows = await screen.findAllByTestId('chat-row')
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/chat/t1', '/chat/t1?channel=staff', '/chat/dm/c1'])
    expect(within(rows[0]).getByText('ZZ Probe U13')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Zz Manager Probe')).toBeInTheDocument()
    expect(screen.getByTestId('chat-hero')).toHaveAttribute('href', '/chat/club')
  })

  it('previews who said the last thing, shows the unread count, and says nothing is here when nothing is', async () => {
    renderList()
    const rows = await screen.findAllByTestId('chat-row')
    expect(within(rows[0]).getByText('Zz Coach Probe: Kick-off moved to 10:30')).toBeInTheDocument()
    expect(within(rows[0]).getByLabelText('3 unread')).toHaveTextContent('3')
    expect(within(rows[2]).getByText('You: Two seats held')).toBeInTheDocument()
    expect(within(rows[2]).queryByLabelText(/unread/)).toBeNull()
    expect(within(screen.getByTestId('chat-hero')).getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('search narrows by name or last line', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findAllByTestId('chat-row')
    await user.type(screen.getByLabelText('Search chats'), 'seats')
    const rows = screen.getAllByTestId('chat-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('href', '/chat/dm/c1')
  })

  // ⚠️ THE FIX FOR "no logical way to send someone a DM". The pencil is it.
  it('the pencil opens the people picker, grouped by squad, and a pick opens the conversation', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findAllByTestId('chat-row')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    const picker = await screen.findByTestId('dm-picker')
    expect(within(picker).getByText('ZZ Probe U13')).toBeInTheDocument()
    expect(within(picker).getByText('Club staff')).toBeInTheDocument()
    await user.type(within(picker).getByLabelText('Search people'), 'other')
    expect(within(picker).queryByText('Zz Admin Probe')).toBeNull()
    await user.click(within(picker).getByRole('button', { name: /Zz Other Parent/ }))
    expect(m.openConversation).toHaveBeenCalledWith('p9')
    expect(await screen.findByText('dm thread')).toBeInTheDocument()
  })

  it('helpers', () => {
    expect(shortBand('U13 Mixed')).toBe('U13')
    expect(shortBand('Senior Men')).toBe('SM')
    expect(previewLine({ kind: 'dm', last_body: 'hi', last_author_id: 'x' }, ME)).toBe('hi')
    expect(previewLine({ kind: 'dm', last_body: 'hi', last_author_id: ME }, ME)).toBe('You: hi')
    expect(previewLine({ kind: 'dm', last_body: null }, ME)).toBe('No messages yet')
  })
})
