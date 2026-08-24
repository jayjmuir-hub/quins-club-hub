import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Group threads (claude/plans/2026-08-24-group-chats.md). The discriminating
// assertion here is (b): a group renders NO notice banner — Jay's ruling,
// claude/decisions/2026-08-24-groups-open-no-warnings.md — where a DM always
// renders one. A test that only checked the title would pass against a
// screen that still lectured every carpool group about safeguarding.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMyConversations: vi.fn(),
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
  listGroupMembers: vi.fn(),
  renameGroup: vi.fn(),
  addGroupMembers: vi.fn(),
  leaveGroup: vi.fn(),
  removeGroupMember: vi.fn(),
  listGroupCandidates: vi.fn(),
  createGroup: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/messages.js', () => ({
  listMyConversations: (...a) => m.listMyConversations(...a),
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
  listGroupMembers: (...a) => m.listGroupMembers(...a),
  renameGroup: (...a) => m.renameGroup(...a),
  addGroupMembers: (...a) => m.addGroupMembers(...a),
  leaveGroup: (...a) => m.leaveGroup(...a),
  removeGroupMember: (...a) => m.removeGroupMember(...a),
  listGroupCandidates: (...a) => m.listGroupCandidates(...a),
  createGroup: (...a) => m.createGroup(...a),
}))

import DirectMessages from '../src/screens/DirectMessages.jsx'

const ME = 'me-1'
const PARENT = [{ id: 'm1', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]

// ⚠️ NAMES INVENTED — CLAUDE.md rule 9.
const GROUP = {
  id: 'g1',
  club_id: 'club-1',
  kind: 'group',
  title: 'Zz Test Group',
  profile_a: null,
  profile_b: null,
  involves_minor: false,
}
const MEMBERS = [
  { profile_id: ME, is_owner: true, full_name: 'Me Myself' },
  { profile_id: 'p-2', is_owner: false, full_name: 'Mira Vantel' },
  { profile_id: 'p-3', is_owner: false, full_name: 'Tomas Orrin' },
]
const msg = (id, author, name, body) => ({
  id,
  conversation_id: 'g1',
  channel: 'dm',
  author_id: author,
  body,
  created_at: '2026-08-24T08:00:00Z',
  deleted_at: null,
  author: { full_name: name },
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
  useMembershipsMock.mockReturnValue({ memberships: PARENT })
  m.getConversation.mockResolvedValue(GROUP)
  m.listDirectMessages.mockResolvedValue([msg('x1', 'p-2', 'Mira Vantel', 'Zz seats sorted')])
  m.listMyConversations.mockResolvedValue([])
  m.listMyBlocks.mockResolvedValue(new Set())
  m.listGroupMembers.mockResolvedValue(MEMBERS)
  m.subscribeMessages.mockReturnValue(() => {})
  m.markMessagesRead.mockResolvedValue()
})

describe('a group thread', () => {
  it('shows the title, the member count, and the author on their bubbles', async () => {
    renderAt('/chat/dm/g1')
    expect(await screen.findByRole('heading', { name: 'Zz Test Group' })).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('3 people')
    const bubble = screen.getByTestId('dm-bubble')
    expect(within(bubble).getByText('Mira Vantel')).toBeInTheDocument()
  })

  it('renders NO notice banner — the 24 Aug ruling', async () => {
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })
    expect(screen.queryByTestId('dm-notice')).toBeNull()
  })

  it('offers Rename/Add/Leave/Delete to the owner, and never Block', async () => {
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    const menu = screen.getByRole('menu')
    for (const label of ['Rename group', 'Add people', 'Leave group', 'Delete group']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    expect(within(menu).queryByRole('menuitem', { name: /block/i })).toBeNull()
  })

  it('a non-owner gets Leave but not Rename', async () => {
    m.listGroupMembers.mockResolvedValue([
      { profile_id: ME, is_owner: false, full_name: 'Me Myself' },
      { profile_id: 'p-2', is_owner: true, full_name: 'Mira Vantel' },
      { profile_id: 'p-3', is_owner: false, full_name: 'Tomas Orrin' },
    ])
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Leave group' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Rename group' })).toBeNull()
  })

  it('leaving confirms, calls leaveGroup and lands on the list', async () => {
    m.leaveGroup.mockResolvedValue()
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Leave group' }))
    // three people: leaving closes it for everyone, and the confirm says so
    expect(await screen.findByText(/leaving closes this group for everyone/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave group' }))
    await waitFor(() => expect(m.leaveGroup).toHaveBeenCalledWith('g1'))
    expect(await screen.findByText('the list')).toBeInTheDocument()
  })
})
