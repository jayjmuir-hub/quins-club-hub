import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// src/screens/DirectMessages.jsx — squad chat phase 3, reshaped 24 Aug 2026.
// One thread: the header bar, the permanent notice, block, report, remove,
// delete chat. (The inbox and the picker live in ChatList since the reshape.) Who may
// message whom is the database's (db/tests/squad-chat-phase3.sql); this
// proves the screen shows what the database hands it and nothing else.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
  listMyMessageReads: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
  listDmCandidates: vi.fn(),
  openConversation: vi.fn(),
  getConversation: vi.fn(),
  listDirectMessages: vi.fn(),
  sendDirectMessage: vi.fn(),
  listMyBlocks: vi.fn(),
  blockDm: vi.fn(),
  unblockDm: vi.fn(),
  reportMessage: vi.fn(),
  logWelfareAccess: vi.fn(),
  markMessagesRead: vi.fn(),
  subscribeMessages: vi.fn(),
  removeMessage: vi.fn(),
  deleteConversation: vi.fn(),
  listMessageReceipts: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: async () => new Map(),
  setNickname: async () => {},
}))
// Presence is a live websocket; tests inject who is "online" per test.
const onlineMock = vi.fn(() => new Set())
vi.mock('../src/lib/presence.js', () => ({ usePresence: (...a) => onlineMock(...a) }))
// The header's identity line fetches the person card (26 Aug 2026) — the
// same server ruling the tap-a-name card uses, injected per test.
const getPersonCardMock = vi.fn(async () => null)
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: (...a) => getPersonCardMock(...a) }))
// The identity badge rows — every hat, injected per test.
const getMemberIdentityMock = vi.fn(async () => [])
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: (...a) => getMemberIdentityMock(...a) }))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): the receipts map is injected per test; receiptState
  // mirrors the real pure function so tick states are exercised for real.
  listMessageReceipts: (...a) => m.listMessageReceipts(...a),
  receiptState: (receipt, recipients) => {
    const others = (recipients ?? []).filter(Boolean)
    if (others.length === 0) return 'sent'
    if (receipt && others.every((id) => receipt.read.has(id))) return 'read'
    if (receipt && others.every((id) => receipt.delivered.has(id))) return 'delivered'
    return 'sent'
  },
  markMessagesDelivered: async () => {},
  listMyConversations: (...a) => m.listMyConversations(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
  listDmCandidates: (...a) => m.listDmCandidates(...a),
  openConversation: (...a) => m.openConversation(...a),
  getConversation: (...a) => m.getConversation(...a),
  listDirectMessages: (...a) => m.listDirectMessages(...a),
  sendDirectMessage: (...a) => m.sendDirectMessage(...a),
  listMyBlocks: (...a) => m.listMyBlocks(...a),
  blockDm: (...a) => m.blockDm(...a),
  unblockDm: (...a) => m.unblockDm(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  logWelfareAccess: (...a) => m.logWelfareAccess(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  deleteConversation: (...a) => m.deleteConversation(...a),
}))

import DirectMessages from '../src/screens/DirectMessages.jsx'

const ME = 'me-1'
const OTHER = 'other-1'
const PARENT = [{ id: 'm1', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]
const ADMIN = [{ id: 'm2', role: 'admin', team_id: null, club_id: 'club-1', status: 'active', is_super: true }]

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat/dm" element={<DirectMessages />} />
        <Route path="/chat/dm/:conversationId" element={<DirectMessages />} />
        <Route path="/chat" element={<div>the list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const CONV = { id: 'c1', club_id: 'club-1', profile_a: ME < OTHER ? ME : OTHER, profile_b: ME < OTHER ? OTHER : ME }
const INBOX_ROW = { conversation_id: 'c1', other_id: OTHER, other_name: 'Zz Manager Probe', other_role: 'manager', last_at: '2026-08-23T08:00:00Z', last_body: 'Two seats held', last_author_id: OTHER, unread: true }
const dm = (id, author, body) => ({ id, conversation_id: 'c1', channel: 'dm', author_id: author, body, created_at: '2026-08-23T08:00:00Z', deleted_at: null, author: { full_name: author === ME ? 'Me' : 'Zz Manager Probe' } })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: PARENT, teams: [] })
  m.listMyConversations.mockResolvedValue([INBOX_ROW])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.listDmCandidates.mockResolvedValue([{ profile_id: OTHER, full_name: 'Zz Manager Probe', role: 'manager', via_team: 'ZZ Probe U12' }])
  m.openConversation.mockResolvedValue('c1')
  m.getConversation.mockResolvedValue(CONV)
  m.listDirectMessages.mockResolvedValue([dm('d1', OTHER, 'Two seats held'), dm('d2', ME, 'Thanks!')])
  m.sendDirectMessage.mockResolvedValue(dm('d3', ME, 'x'))
  m.listMyBlocks.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.subscribeMessages.mockReturnValue(() => {})
  m.removeMessage.mockResolvedValue(undefined)
  m.deleteConversation.mockResolvedValue(undefined)
  m.listMessageReceipts.mockResolvedValue(new Map())
  onlineMock.mockReturnValue(new Set())
})

// ── Ticks and online status (26 Aug 2026) ──────────────────────────────────
describe('ticks and online status', () => {
  it('my message shows delivered ticks once their device has it, viewed once they read it', async () => {
    m.listMessageReceipts.mockResolvedValue(new Map([
      ['d2', { delivered: new Set([OTHER]), read: new Set() }],
    ]))
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    const mine = bubbles.find((b) => b.dataset.mine === 'true')
    expect(within(mine).getByTestId('message-ticks')).toHaveAttribute('data-state', 'delivered')

    m.listMessageReceipts.mockResolvedValue(new Map([
      ['d2', { delivered: new Set([OTHER]), read: new Set([OTHER]) }],
    ]))
  })

  it('an unreceipted message of mine shows a single sent tick; theirs shows none', async () => {
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    const mine = bubbles.find((b) => b.dataset.mine === 'true')
    const theirs = bubbles.find((b) => b.dataset.mine === 'false')
    expect(within(mine).getByTestId('message-ticks')).toHaveAttribute('data-state', 'sent')
    expect(within(theirs).queryByTestId('message-ticks')).toBeNull()
  })

  it('the header says Online while they are, and falls back to the private line when not', async () => {
    onlineMock.mockReturnValue(new Set([OTHER]))
    renderAt('/chat/dm/c1')
    expect(await screen.findByText('Online')).toBeInTheDocument()
    expect(screen.queryByText(/Private · you and/)).toBeNull()
  })
})

describe('DirectMessages — /chat/dm', () => {
  it('the old inbox URL goes to the Chats list', async () => {
    renderAt('/chat/dm')
    expect(await screen.findByText('the list')).toBeInTheDocument()
  })
})

// 26 Aug 2026, Jay: "when you have a chat with someone you should see their
// badge and details" — a staff member's DM header carries their real title
// (head or assistant) and their squads, from the same member_contact_card
// ruling the tap-a-name person card reads. The database decides who may see
// what; a null card renders exactly what rendered before.
describe('the DM identity line', () => {
  // Reshaped hours after it shipped (claude/plans/2026-08-26-dm-identity-rows.md,
  // Jay over a live multi-hat DM): EVERY active membership renders, in order —
  // admin, per-squad staff titles, parent, player — from member_identity rows,
  // not member_contact_card's best-role summary.
  it('⚠️ the multi-hat: admin badge AND both per-squad titles, in age order', async () => {
    getMemberIdentityMock.mockResolvedValue([
      { role: 'coach', title: 'Assistant Coach', is_super: false, squad: 'ZZ U18 Probe', squad_sort: 12 },
      { role: 'admin', title: null, is_super: true, squad: null, squad_sort: null },
      { role: 'coach', title: 'Assistant Coach', is_super: false, squad: 'ZZ U16 Probe', squad_sort: 10 },
    ])
    renderAt('/chat/dm/c1')
    const line = await screen.findByTestId('dm-identity')
    const labels = [...line.querySelectorAll('span > span:first-child')].map((n) => n.textContent)
    expect(labels).toEqual(['Club Hub admin', 'ZZ U16 Probe Assistant Coach', 'ZZ U18 Probe Assistant Coach'])
  })

  it('a parent shows their badge with their squads', async () => {
    getMemberIdentityMock.mockResolvedValue([
      { role: 'parent', title: null, is_super: false, squad: 'ZZ U10 Probe', squad_sort: 3 },
      { role: 'parent', title: null, is_super: false, squad: 'ZZ U12 Probe', squad_sort: 5 },
    ])
    renderAt('/chat/dm/c1')
    const line = await screen.findByTestId('dm-identity')
    expect(within(line).getByText('Parent')).toBeInTheDocument()
    expect(within(line).getByText('ZZ U10 Probe, ZZ U12 Probe')).toBeInTheDocument()
  })

  it('no identity rows: no badge strip, no invention, no crash', async () => {
    getMemberIdentityMock.mockResolvedValue([])
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    expect(screen.queryByTestId('dm-identity')).toBeNull()
  })

  // 26 Aug 2026, Jay: the badges "scroll off the screen in longer chats…
  // they should always be visible". jsdom applies no CSS — the class tokens
  // ARE the statement, same convention as the roster's layout tests.
  it('⚠️ the header block is sticky, badges inside it', async () => {
    getMemberIdentityMock.mockResolvedValue([
      { role: 'coach', title: 'Head Coach', is_super: false, squad: 'ZZ U16 Probe', squad_sort: 10 },
    ])
    renderAt('/chat/dm/c1')
    const header = await screen.findByTestId('dm-header')
    const tokens = header.className.split(/\s+/)
    expect(tokens).toContain('sticky')
    expect(tokens).toContain('top-0')
    // ⚠️ INSIDE the sticky wrapper — the pre-existing bug was precisely that
    // ChatHeader was already sticky while the badge strip below it was not.
    expect(await within(header).findByTestId('dm-identity')).toBeInTheDocument()
  })
})

describe('DirectMessages — a thread', () => {
  // ⚠️ THE MEMBER-FACING NOTICE IS GONE SINCE 26 Aug 2026 — Jay: "remove the
  // club admins can review notice", pointing at the dock, which never showed
  // it. This reverses the 23 Aug permanent-notice ruling; the reviewing
  // banner (about the ADMIN, below) is the one that stays.
  it('shows NO notice to members — adults-only or not', async () => {
    renderAt('/chat/dm/c1')
    await screen.findAllByTestId('dm-bubble')
    expect(screen.queryByTestId('dm-notice')).toBeNull()
  })

  it('shows no notice even with a minor in it — the bubbles, and sends', async () => {
    const user = userEvent.setup()
    m.getConversation.mockResolvedValue({ ...CONV, involves_minor: true })
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    expect(screen.queryByTestId('dm-notice')).toBeNull()
    expect(bubbles[0]).toHaveAttribute('data-mine', 'false')
    expect(bubbles[1]).toHaveAttribute('data-mine', 'true')
    await waitFor(() => expect(m.markMessagesRead).toHaveBeenCalledWith(ME, ['d1']))
    expect(m.logWelfareAccess).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Message'), 'See you Saturday')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    // Round 2 rides along: no quote, no photo unless the user set one up.
    expect(m.sendDirectMessage).toHaveBeenCalledWith('c1', 'See you Saturday', { quotedId: null, attachmentPath: null })
  })

  it('block hides the composer and says so; unblock brings it back', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    m.listMyBlocks.mockResolvedValue(new Set([OTHER]))
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Block Zz Manager Probe' }))
    expect(m.blockDm).toHaveBeenCalledWith(OTHER)
    expect(await screen.findByTestId('dm-blocked')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
  })

  it('reports a message from the other side with a reason', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findAllByTestId('dm-bubble')
    // Round 4: actions live in the bubble's chevron menu.
    await user.click(within((await screen.findAllByTestId('dm-bubble'))[0]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Report' }))
    await user.type(screen.getByLabelText('Report this message to the club'), 'Rude')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(m.reportMessage).toHaveBeenCalledWith('d1', 'Rude')
  })

  it('the header says who this is private to', async () => {
    renderAt('/chat/dm/c1')
    expect(await screen.findByRole('heading', { name: 'Zz Manager Probe' })).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('Private · you and Zz Manager Probe')
    expect(screen.getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/chat')
  })

  it('Delete on my own bubble deletes it for good', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    const bubbles = await screen.findAllByTestId('dm-bubble')
    // Theirs offers Report in its menu, never Delete; mine offers Delete.
    await user.click(within(bubbles[0]).getByRole('button', { name: 'Message options' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(within(bubbles[1]).getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(m.removeMessage).toHaveBeenCalledWith('d2')
  })

  // ⚠️ "COMPLETELY" — Jay, 24 Aug 2026. Deleted for BOTH, and the copy says
  // so before the tap. (The for-me clear built earlier that day is gone.)
  it('Delete chat asks, says it is for both of you, deletes, and returns to the list', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/c1')
    await screen.findByTestId('dm-composer')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete chat' }))
    const confirm = await screen.findByTestId('delete-chat-confirm')
    expect(confirm).toHaveTextContent(/deleted for both of you/)
    expect(m.deleteConversation).not.toHaveBeenCalled()
    await user.click(within(confirm).getByRole('button', { name: 'Delete chat' }))
    expect(m.deleteConversation).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('the list')).toBeInTheDocument()
  })

  it('an admin opening an adults-only conversation that is not reported gets the not-available card and nothing is logged', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-9' } })
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [] })
    m.listMyConversations.mockResolvedValue([])
    m.getConversation.mockResolvedValue(null)   // RLS: no row for this reader
    m.listDirectMessages.mockResolvedValue([])
    renderAt('/chat/dm/c1')
    expect(await screen.findByTestId('dm-missing')).toHaveTextContent(/private to them unless a message in it is reported/)
    expect(screen.queryByTestId('dm-notice')).toBeNull()
    expect(m.logWelfareAccess).not.toHaveBeenCalled()
  })

  // ⚠️ THE RULING MADE VISIBLE — AND NARROWED THE SAME EVENING. This path now
  // only exists for a conversation the database lets the admin read: one that
  // involves a minor, or one with a reported message. An admin who is not a participant sees the
  // thread read-only, the notice says the open was recorded, and it WAS.
  it('an admin who is not in it reads only, sees the review notice, and the open is logged', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-9' } })
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: [] })
    m.listMyConversations.mockResolvedValue([])
    m.getConversation.mockResolvedValue({ ...CONV, involves_minor: true })
    renderAt('/chat/dm/c1')
    const notice = await screen.findByTestId('dm-notice')
    expect(notice).toHaveTextContent(/reviewing a private conversation as a club admin/)
    expect(await screen.findByTestId('dm-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
    await waitFor(() => expect(m.logWelfareAccess).toHaveBeenCalledWith('c1'))
  })
})
