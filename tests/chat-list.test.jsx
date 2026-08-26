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
  // (claude/plans/2026-08-24-member-chat-home.md), reordered 25 Aug 2026
  // (Jay: "DMs should always be at the top"): conversations then squads,
  // each under its title, and the club channel as the hero card. Every kind
  // still routes to its thread — that intent is unchanged from day one.
  it('lists every kind of chat, grouped, each routed to its thread', async () => {
    renderList()
    const rows = await screen.findAllByTestId('chat-row')
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/chat/dm/c1', '/chat/t1', '/chat/t1?channel=staff'])
    expect(within(rows[0]).getByText('Zz Manager Probe')).toBeInTheDocument()
    expect(within(rows[1]).getByText('ZZ Probe U13')).toBeInTheDocument()
    expect(screen.getByTestId('chat-hero')).toHaveAttribute('href', '/chat/club')
  })

  // 26 Aug 2026, Jay: "no need to save a chat like that if it wasn't used" —
  // the person card's Chat button creates a conversation on TAP, and four
  // never-messaged "No messages yet" rows appeared in his list within a day.
  // An empty DM is hidden until its first message; last_author_id is the
  // signal (my_chats sets it from the newest VISIBLE message, so a photo-only
  // chat keeps its author and stays).
  it('⚠️ hides a DM nobody has messaged in — until somebody does', async () => {
    m.listChats.mockResolvedValue([
      ...ROWS,
      { kind: 'dm', team_id: null, conversation_id: 'c-empty', label: 'Zz Untouched Probe', detail: 'Direct message', last_at: '2026-08-26T09:00:00Z', last_body: null, last_author_id: null, last_author_name: null, unread: 0 },
      { kind: 'dm', team_id: null, conversation_id: 'c-photo', label: 'Zz Photo Probe', detail: 'Direct message', last_at: '2026-08-26T09:05:00Z', last_body: null, last_author_id: 'other-7', last_author_name: 'Zz Photo Probe', unread: 0 },
      { kind: 'group', team_id: null, conversation_id: 'g-new', label: 'Zz Fresh Group', detail: 'Group · 3 people', last_at: '2026-08-26T09:10:00Z', last_body: null, last_author_id: null, last_author_name: null, unread: 0 },
    ])
    renderList()
    await screen.findAllByTestId('chat-row')
    // Never-messaged DM: not listed.
    expect(screen.queryByText('Zz Untouched Probe')).toBeNull()
    // A photo-only DM has an author and stays.
    expect(screen.getByText('Zz Photo Probe')).toBeInTheDocument()
    // A brand-new GROUP is a deliberate creation and stays.
    expect(screen.getByText('Zz Fresh Group')).toBeInTheDocument()
  })

  it('previews who said the last thing, shows the unread count, and says nothing is here when nothing is', async () => {
    renderList()
    const rows = await screen.findAllByTestId('chat-row')
    expect(within(rows[1]).getByText('Zz Coach Probe: Kick-off moved to 10:30')).toBeInTheDocument()
    expect(within(rows[1]).getByLabelText('3 unread')).toHaveTextContent('3')
    expect(within(rows[0]).getByText('You: Two seats held')).toBeInTheDocument()
    expect(within(rows[0]).queryByLabelText(/unread/)).toBeNull()
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

// ── Desktop fills the width (26 Aug 2026) ──────────────────────────────────
// The two parallel lists sit side by side from the desktop breakpoint up.
// jsdom applies no CSS; the class tokens are the statement.
describe('ChatList — desktop layout', () => {
  it('puts DMs and squads in a two-column grid wrapper on desktop', async () => {
    renderList()
    const dms = await screen.findByTestId('section-dms')
    const squads = screen.getByTestId('section-squads')
    expect(dms.parentElement).toBe(squads.parentElement)
    const tokens = dms.parentElement.className.split(/\s+/)
    expect(tokens).toContain('desktop:grid')
    expect(tokens).toContain('desktop:grid-cols-2')
    expect(tokens).toContain('desktop:items-start')
  })
})
