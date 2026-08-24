import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The member chat home (claude/plans/2026-08-24-member-chat-home.md): the
// unread strip, the club hero card, and the two titled sections. The
// discriminating pair is the strip at zero unread (ABSENT, not "0 unread")
// and the hero not doubling as a plain row.

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

import ChatList from '../src/screens/ChatList.jsx'

const ME = 'me-1'
// ⚠️ NAMES INVENTED — CLAUDE.md rule 9.
const ROWS = [
  { kind: 'squad', team_id: 't1', conversation_id: null, label: 'ZZ Probe U13', detail: 'Squad · announce-only', last_at: '2026-08-24T08:00:00Z', last_body: 'Kick-off moved', last_author_id: 'coach-1', last_author_name: 'Zz Coach Probe', unread: 3 },
  { kind: 'dm', team_id: null, conversation_id: 'c1', label: 'Zz Manager Probe', detail: 'Team Manager', last_at: '2026-08-24T07:00:00Z', last_body: 'Two seats held', last_author_id: ME, last_author_name: 'Me', unread: 2 },
  { kind: 'group', team_id: null, conversation_id: 'g1', label: 'Zz Probe Carpool', detail: '3 people', last_at: '2026-08-24T06:00:00Z', last_body: 'North gate as usual', last_author_id: 'p2', last_author_name: 'Mira Vantel', unread: 0 },
  { kind: 'staff', team_id: 't1', conversation_id: null, label: 'ZZ Probe U13 · staff', detail: 'Staff only', last_at: '2026-08-23T07:00:00Z', last_body: 'Selection?', last_author_id: 'coach-1', last_author_name: 'Zz Coach Probe', unread: 0 },
  { kind: 'club', team_id: null, conversation_id: null, label: 'Whole club', detail: 'Club-wide · admins post', last_at: '2026-08-22T07:00:00Z', last_body: 'Registration closes Friday', last_author_id: 'a1', last_author_name: 'Zz Admin Probe', unread: 0 },
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
  useAuthMock.mockReturnValue({ user: { id: ME } })
  // A coach on t1: sees t1's squad and staff rows; club/DMs/groups pass.
  useMembershipsMock.mockReturnValue({
    memberships: [{ id: 'm1', role: 'coach', team_id: 't1', club_id: 'club-1', status: 'active' }],
    teams: [{ id: 't1', name: 'ZZ Probe U13', sort_order: 1 }],
  })
  m.listChats.mockResolvedValue(ROWS)
  m.subscribeMessages.mockReturnValue(() => {})
})

describe('the member chat home', () => {
  it('sums unread into the strip, and drops the strip entirely at zero', async () => {
    renderList()
    const strip = await screen.findByTestId('unread-strip')
    expect(strip).toHaveTextContent('5')
    expect(strip).toHaveTextContent('unread in 2 chats')
    m.listChats.mockResolvedValue(ROWS.map((r) => ({ ...r, unread: 0 })))
    renderList()
    await screen.findAllByTestId('chat-hero')
    expect(screen.queryAllByTestId('unread-strip')).toHaveLength(1) // only the first render's
  })

  it('promotes the club channel to a hero card and does not repeat it as a row', async () => {
    renderList()
    const hero = await screen.findByTestId('chat-hero')
    expect(hero).toHaveAttribute('href', '/chat/club')
    expect(within(hero).getByText('Whole club')).toBeInTheDocument()
    expect(within(hero).getByText('Announce-only')).toBeInTheDocument()
    expect(within(hero).getByText('Pinned')).toBeInTheDocument()
    const plainRows = screen.getAllByTestId('chat-row')
    expect(plainRows.map((r) => r.getAttribute('href'))).not.toContain('/chat/club')
  })

  it('groups squads and conversations under their section titles', async () => {
    renderList()
    expect(await screen.findByText('Your squads')).toBeInTheDocument()
    expect(screen.getByText('Direct messages')).toBeInTheDocument()
    const squads = within(screen.getByTestId('section-squads')).getAllByTestId('chat-row')
    expect(squads.map((r) => r.getAttribute('href'))).toEqual(['/chat/t1', '/chat/t1?channel=staff'])
    const dms = within(screen.getByTestId('section-dms')).getAllByTestId('chat-row')
    expect(dms.map((r) => r.getAttribute('href'))).toEqual(['/chat/dm/c1', '/chat/dm/g1'])
  })

  // ⚠️ THE VIEW-AS FIX (Jay, 24 Aug 2026: "why when viewing as U18 coach i
  // can see all the other age group chats?"). my_chats() answers for the
  // REAL account; the screen must scope to the EFFECTIVE memberships like
  // every other screen. A parent on t1 must not see t2's channel or any
  // staff channel, however many rows the server handed over.
  it('scopes squad and staff rows to the effective memberships', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm9', role: 'parent', team_id: 't1', player_id: 'p1', club_id: 'club-1', status: 'active' }],
      teams: [
        { id: 't1', name: 'ZZ Probe U13', sort_order: 1 },
        { id: 't2', name: 'ZZ Probe U18', sort_order: 2 },
      ],
    })
    m.listChats.mockResolvedValue([
      ...ROWS,
      { kind: 'squad', team_id: 't2', conversation_id: null, label: 'ZZ Probe U18', detail: 'Squad · open chat', last_at: '2026-08-24T05:00:00Z', last_body: null, last_author_id: null, last_author_name: null, unread: 0 },
    ])
    renderList()
    const rows = await screen.findAllByTestId('chat-row')
    const hrefs = rows.map((r) => r.getAttribute('href'))
    expect(hrefs).toContain('/chat/t1')
    expect(hrefs).not.toContain('/chat/t2') // other squad: hidden
    expect(hrefs).not.toContain('/chat/t1?channel=staff') // parents hold no staff channel
  })

  it('search flattens: no hero, no section titles, just the matches', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByTestId('chat-hero')
    await user.type(screen.getByLabelText('Search chats'), 'carpool')
    expect(screen.queryByTestId('chat-hero')).toBeNull()
    expect(screen.queryByText('Your squads')).toBeNull()
    const rows = screen.getAllByTestId('chat-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('href', '/chat/dm/g1')
  })
})
