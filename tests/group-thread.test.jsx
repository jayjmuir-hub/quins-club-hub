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
  listGroupMembers: vi.fn(),
  renameGroup: vi.fn(),
  addGroupMembers: vi.fn(),
  leaveGroup: vi.fn(),
  removeGroupMember: vi.fn(),
  listGroupCandidates: vi.fn(),
  createGroup: vi.fn(),
}
// The DM identity badges fetch member_identity (26 Aug 2026); empty here
// keeps this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
// The wallpaper rides chat_prefs since 26 Aug 2026 — quiet defaults keep
// this file about its own subject and network-free.
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: async () => null,
  setChatPref: async () => {},
  listMyChatPrefs: async () => new Map(),
}))
vi.mock('../src/data/nicknames.js', () => ({
  listMyNicknames: async () => new Map(),
  setNickname: async () => {},
}))
// Presence is a live websocket; tests get a quiet empty room.
vi.mock('../src/lib/presence.js', () => ({
  usePresence: () => new Map(),
  dotState: (map, id) => (id && map?.get?.(id)) || 'offline',
}))
vi.mock('../src/data/polls.js', () => ({
  createPoll: vi.fn(),
  listPollsFor: vi.fn(async () => new Map()),
  setPollVote: vi.fn(),
  subscribePollVotes: vi.fn(() => () => {}),
}))
vi.mock('../src/data/messages.js', () => ({
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
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
  listGroupMembers: (...a) => m.listGroupMembers(...a),
  renameGroup: (...a) => m.renameGroup(...a),
  addGroupMembers: (...a) => m.addGroupMembers(...a),
  leaveGroup: (...a) => m.leaveGroup(...a),
  removeGroupMember: (...a) => m.removeGroupMember(...a),
  listGroupCandidates: (...a) => m.listGroupCandidates(...a),
  createGroup: (...a) => m.createGroup(...a),
}))

// The person card's fetch, mocked so this file stays network-free; the card's
// own behaviour is covered by tests/person-card.test.jsx.
const getPersonCardMock = vi.fn()
vi.mock('../src/data/personCard.js', () => ({
  getPersonCard: (...args) => getPersonCardMock(...args),
}))

// Profile icons (claude/plans/2026-08-31-profile-icons.md): decoration, off
// unless a test arms the map — which is why every OTHER test in this file
// keeps passing with exact-name queries.
const listClubIconMapMock = vi.fn(async () => new Map())
vi.mock('../src/data/profileIcons.js', () => ({
  listClubIconMap: (...a) => listClubIconMapMock(...a),
  listMemberIcons: async () => [],
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
  listClubIconMapMock.mockResolvedValue(new Map())
  useAuthMock.mockReturnValue({ user: { id: ME } })
  useMembershipsMock.mockReturnValue({ memberships: PARENT })
  m.getConversation.mockResolvedValue(GROUP)
  m.listDirectMessages.mockResolvedValue([msg('x1', 'p-2', 'Mira Vantel', 'Zz seats sorted')])
  m.listMyConversations.mockResolvedValue([])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.listReactions.mockResolvedValue(new Map())
  m.subscribeReactions.mockReturnValue(() => {})
  m.listMyBlocks.mockResolvedValue(new Set())
  m.listGroupMembers.mockResolvedValue(MEMBERS)
  m.subscribeMessages.mockReturnValue(() => {})
  m.markMessagesRead.mockResolvedValue()
})

describe('a group thread', () => {
  it('shows the title, the member count, and the author on their bubbles', async () => {
    renderAt('/chat/dm/g1')
    expect(await screen.findByRole('heading', { name: 'Zz Test Group' })).toBeInTheDocument()
    // Round 3, Jay: "at the top it previews who is in the chat under the
    // name of the chat" — first names, You for the reader, not a bare count.
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('You, Mira, Tomas')
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

// Profile icons in the thread (claude/plans/2026-08-31-profile-icons.md):
// the primary icon rides after the author name on bubbles and after the
// name-button in the member line — AFTER the button, so the accessible name
// stays the bare first name the person-card tests already pin.
describe('profile icons in a group thread', () => {
  it('a crowned author shows 👑 on their bubble and in the member line', async () => {
    listClubIconMapMock.mockResolvedValue(new Map([['p-2', 'crown']]))
    renderAt('/chat/dm/g1')
    const bubble = await screen.findByTestId('dm-bubble')
    await waitFor(() => expect(within(bubble).getByText(/Mira Vantel 👑/)).toBeInTheDocument())
    const subtitle = screen.getByTestId('chat-subtitle')
    await waitFor(() => expect(subtitle).toHaveTextContent('Mira 👑'))
    // The name button keeps its bare accessible name — the icon sits outside.
    expect(within(subtitle).getByRole('button', { name: 'Mira' })).toBeInTheDocument()
  })

  it('an unknown icon key decorates nothing', async () => {
    listClubIconMapMock.mockResolvedValue(new Map([['p-2', 'retired_icon_key']]))
    renderAt('/chat/dm/g1')
    const bubble = await screen.findByTestId('dm-bubble')
    expect(within(bubble).getByText('Mira Vantel')).toBeInTheDocument()
  })
})

// Group @ mentions (claude/plans/2026-08-31-group-chat-mentions.md): the same
// button-not-typeahead picker the channels use, fed from the already-loaded
// member list. The discriminating pair: the id rides in `mentions` only while
// its @Full Name survives in the draft — a deleted name un-mentions.
describe('group @ mentions', () => {
  it('the picker lists the members minus me, and a pick sends the id', async () => {
    m.sendDirectMessage.mockResolvedValue({ id: 'sent-1' })
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })

    await user.click(screen.getByRole('button', { name: 'Mention someone' }))
    const list = screen.getByRole('listbox', { name: 'People in this channel' })
    expect(within(list).getByRole('option', { name: /Mira Vantel/ })).toBeInTheDocument()
    // Never myself — mentioning the author is noise the trigger strips anyway.
    expect(within(list).queryByRole('option', { name: /Me Myself/ })).toBeNull()

    await user.click(within(list).getByRole('option', { name: /Mira Vantel/ }))
    expect(screen.getByLabelText('Message')).toHaveValue('@Mira Vantel ')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(m.sendDirectMessage).toHaveBeenCalledWith('g1', '@Mira Vantel ', expect.objectContaining({ mentions: ['p-2'] })),
    )
  })

  it('deleting the @name from the draft un-mentions — the id is NOT sent', async () => {
    m.sendDirectMessage.mockResolvedValue({ id: 'sent-2' })
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')
    await screen.findByRole('heading', { name: 'Zz Test Group' })

    await user.click(screen.getByRole('button', { name: 'Mention someone' }))
    await user.click(screen.getByRole('option', { name: /Tomas Orrin/ }))
    const draft = screen.getByLabelText('Message')
    await user.clear(draft)
    await user.type(draft, 'changed my mind')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(m.sendDirectMessage).toHaveBeenCalledWith('g1', 'changed my mind', expect.objectContaining({ mentions: [] })),
    )
  })
})

// The person card (claude/plans/2026-08-26-person-card.md): each name in the
// group header's member line is a door; "You" stays plain text.
describe('group thread — member names open the person card', () => {
  it('a member name is a button, You is not', async () => {
    getPersonCardMock.mockResolvedValue({
      profileId: 'p-2',
      name: 'Mira Vantel',
      role: 'parent',
      title: null,
      isSuper: false,
      squads: [],
      phone: null,
      email: null,
      photoUrl: null,
      focus: null,
    })
    const user = userEvent.setup()
    renderAt('/chat/dm/g1')

    const subtitle = await screen.findByTestId('chat-subtitle')
    await user.click(within(subtitle).getByRole('button', { name: 'Mira' }))
    expect(await screen.findByTestId('person-card')).toBeInTheDocument()
    expect(getPersonCardMock).toHaveBeenCalledWith('p-2')
    expect(within(subtitle).queryByRole('button', { name: 'You' })).toBeNull()
  })
})
