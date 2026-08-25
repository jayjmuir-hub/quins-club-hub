import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Unit tests for src/screens/Chat.jsx (squad chat, phase 1 —
// claude/plans/2026-08-23-squad-chat.md). useMemberships, useAuth and
// src/data/messages.js are mocked; this exercises the screen's own
// behaviour: routing, the announce-only composer lock, the staff panel,
// read receipts, replying, and marking read on arrival. The DATABASE half
// (who may post, who is pushed) is db/tests/squad-chat.sql.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listMessagesMock = vi.fn()
const listMyMessageReadsMock = vi.fn()
const markMessagesReadMock = vi.fn()
const messageReadStatsMock = vi.fn()
const getChannelSettingsMock = vi.fn()
const postMessageMock = vi.fn()
const replyToMessageMock = vi.fn()
const removeMessageMock = vi.fn()
const clearChannelMock = vi.fn()
const setPinnedMock = vi.fn()
const setAnnounceOnlyMock = vi.fn()
const subscribeMessagesMock = vi.fn()
const listMentionablesMock = vi.fn()
const listStaffMessagesMock = vi.fn()
const postStaffMessageMock = vi.fn()
const reportMessageMock = vi.fn()
const listEventsMock = vi.fn()
const listAvailabilityForEventsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
const listReactionsMock = vi.fn()
const subscribeReactionsMock = vi.fn()
vi.mock('../src/data/messages.js', () => ({
  listReactions: (...a) => listReactionsMock(...a),
  toggleReaction: vi.fn(),
  subscribeReactions: (...a) => subscribeReactionsMock(...a),
  listMessages: (...a) => listMessagesMock(...a),
  listMyMessageReads: (...a) => listMyMessageReadsMock(...a),
  markMessagesRead: (...a) => markMessagesReadMock(...a),
  messageReadStats: (...a) => messageReadStatsMock(...a),
  getChannelSettings: (...a) => getChannelSettingsMock(...a),
  postMessage: (...a) => postMessageMock(...a),
  replyToMessage: (...a) => replyToMessageMock(...a),
  removeMessage: (...a) => removeMessageMock(...a),
  clearChannel: (...a) => clearChannelMock(...a),
  setPinned: (...a) => setPinnedMock(...a),
  setAnnounceOnly: (...a) => setAnnounceOnlyMock(...a),
  subscribeMessages: (...a) => subscribeMessagesMock(...a),
  listMentionablesFor: (...a) => listMentionablesMock(...a),
  listStaffMessages: (...a) => listStaffMessagesMock(...a),
  postStaffMessage: (...a) => postStaffMessageMock(...a),
  reportMessage: (...a) => reportMessageMock(...a),
  getEventThread: vi.fn(),
}))
vi.mock('../src/data/events.js', () => ({ listEvents: (...a) => listEventsMock(...a) }))
vi.mock('../src/data/availability.js', () => ({
  listAvailabilityForEvents: (...a) => listAvailabilityForEventsMock(...a),
}))

import Chat from '../src/screens/Chat.jsx'

const CLUB_ID = 'club-1'
const TEAM_A = { id: 'team-a', club_id: CLUB_ID, name: 'ZZ Probe U12', sort_order: 1 }
const TEAM_B = { id: 'team-b', club_id: CLUB_ID, name: 'ZZ Probe U14', sort_order: 2 }

const COACH = [{ id: 'm1', role: 'coach', team_id: 'team-a', club_id: CLUB_ID, status: 'active' }]
const PARENT = [{ id: 'm2', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: CLUB_ID, status: 'active' }]
const PARENT_TWO = [
  ...PARENT,
  { id: 'm3', role: 'parent', team_id: 'team-b', player_id: 'p2', club_id: CLUB_ID, status: 'active' },
]

function post(overrides = {}) {
  return {
    id: 'msg-1',
    club_id: CLUB_ID,
    team_id: 'team-a',
    channel: 'squad',
    parent_id: null,
    author_id: 'coach-1',
    author_role: 'coach',
    author_title: 'Head Coach',
    body: 'Training moves to pitch 3.',
    pinned: false,
    edited_at: null,
    deleted_at: null,
    created_at: '2026-08-23T08:00:00Z',
    author: { full_name: 'Zz Coach Probe' },
    replies: [],
    ...overrides,
  }
}

function memberships(rows, teams = [TEAM_A, TEAM_B]) {
  return { memberships: rows, realMemberships: rows, teams, loading: false, error: null, viewAs: null }
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chat" element={<div>the list</div>} />
        <Route path="/chat/:teamId" element={<Chat />} />
        <Route path="/squad/:teamId/chat" element={<Chat />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listReactionsMock.mockResolvedValue(new Map())
  subscribeReactionsMock.mockReturnValue(() => {})
  useAuthMock.mockReturnValue({ user: { id: 'parent-1' } })
  useMembershipsMock.mockReturnValue(memberships(PARENT))
  listMessagesMock.mockResolvedValue([post()])
  listMyMessageReadsMock.mockResolvedValue(new Set())
  markMessagesReadMock.mockResolvedValue(undefined)
  messageReadStatsMock.mockResolvedValue(new Map())
  getChannelSettingsMock.mockResolvedValue({ team_id: 'team-a', announce_only: true })
  postMessageMock.mockResolvedValue(post({ id: 'msg-2' }))
  replyToMessageMock.mockResolvedValue(post({ id: 'r1', parent_id: 'msg-1' }))
  subscribeMessagesMock.mockReturnValue(() => {})
  listMentionablesMock.mockResolvedValue([])
  listStaffMessagesMock.mockResolvedValue([])
  postStaffMessageMock.mockResolvedValue(post({ id: 'st-1', channel: 'staff' }))
  reportMessageMock.mockResolvedValue(undefined)
  listEventsMock.mockResolvedValue([])
  listAvailabilityForEventsMock.mockResolvedValue([])
})

describe('Chat — routing', () => {
  // ⚠️ "THE LIST ALWAYS" — Jay, 23 Aug 2026. /chat is ChatList; this screen
  // never picks a squad for you and never shows a picker.
  it('a squad the reader is not on sends them back to the list', async () => {
    renderAt('/chat/team-zzz')
    expect(await screen.findByText('the list')).toBeInTheDocument()
    expect(listMessagesMock).not.toHaveBeenCalled()
  })

  it('names the squad and who reads it in the header bar', async () => {
    renderAt('/chat/team-a')
    expect(await screen.findByRole('heading', { name: /ZZ Probe U12/ })).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('announce-only')
    expect(screen.getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/chat')
  })

  it('renders the same screen under /squad/:teamId/chat', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    renderAt('/squad/team-a/chat')
    expect(await screen.findByRole('heading', { name: /ZZ Probe U12/ })).toBeInTheDocument()
  })

  it('reads the club-wide channel at /chat/club with team_id null', async () => {
    renderAt('/chat/club')
    expect(await screen.findByRole('heading', { name: /Whole club/ })).toBeInTheDocument()
    expect(listMessagesMock).toHaveBeenCalledWith(null)
  })
})

describe('Chat — announce-only', () => {
  it('locks the composer for a parent while announce-only is on, but still lets them reply', async () => {
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    expect(screen.getByTestId('composer-locked')).toHaveTextContent(/only staff can post/i)
    expect(screen.queryByTestId('composer')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Reply' }))
    await user.type(screen.getByLabelText('Reply'), 'Is there a bus?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(replyToMessageMock).toHaveBeenCalledWith('msg-1', 'Is there a bus?', { mentions: [] })
  })

  it('opens the composer for a parent when the squad has turned announce-only off', async () => {
    getChannelSettingsMock.mockResolvedValue({ team_id: 'team-a', announce_only: false })
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    await user.type(await screen.findByLabelText('Message'), 'Anyone need a lift?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(postMessageMock).toHaveBeenCalledWith('team-a', 'Anyone need a lift?', { eventId: null, mentions: [], attachmentPath: null })
  })

  it('always opens the composer for a coach, and never shows them the lock', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    expect(screen.getByTestId('composer')).toBeInTheDocument()
    expect(screen.queryByTestId('composer-locked')).toBeNull()
  })
})

describe('Chat — staff panel and receipts', () => {
  beforeEach(() => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    messageReadStatsMock.mockResolvedValue(new Map([['msg-1', { reads: 18, audience: 27 }]]))
  })

  it('shows the announce-only switch to a coach and writes the flip', async () => {
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    const panel = await screen.findByTestId('channel-settings')

    await user.click(within(panel).getByRole('button', { name: 'Turn off' }))

    expect(setAnnounceOnlyMock).toHaveBeenCalledWith('team-a', CLUB_ID, 'coach-1', false)
  })

  it('shows "Read by N of M" on a post to a coach', async () => {
    renderAt('/chat/team-a')
    expect(await screen.findByTestId('read-stat')).toHaveTextContent('Read by 18 of 27')
  })

  it('never asks for read stats as a parent, and shows none', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))
    useAuthMock.mockReturnValue({ user: { id: 'parent-1' } })
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    expect(messageReadStatsMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('read-stat')).toBeNull()
  })

  it('hides the staff panel on the club-wide channel', async () => {
    renderAt('/chat/club')
    await screen.findByRole('heading', { name: /Whole club/ })
    expect(screen.queryByTestId('channel-settings')).toBeNull()
  })
})

describe('Chat — reading', () => {
  it('marks the posts on screen read on arrival, and the dot SURVIVES the visit', async () => {
    // 25 Aug 2026, Jay: "new messages should be highlighted somehow when a
    // chat is opened". The dot used to vanish the moment mark-read ran —
    // wiped under the reader. It now describes the moment the chat was
    // opened (tests/chat-open-view.test.jsx carries the divider half).
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    await waitFor(() => expect(markMessagesReadMock).toHaveBeenCalledWith('parent-1', ['msg-1']))
    expect(screen.getByText('New.', { exact: false })).toBeInTheDocument()
  })

  it('does not re-mark a post already read', async () => {
    listMyMessageReadsMock.mockResolvedValue(new Set(['msg-1']))
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')

    expect(markMessagesReadMock).not.toHaveBeenCalled()
  })

  it('shows a staff post with the role pill and a removed message as removed', async () => {
    listMessagesMock.mockResolvedValue([
      post(),
      post({ id: 'msg-gone', author_role: 'parent', author_title: null, deleted_at: '2026-08-23T09:00:00Z', body: '(removed)' }),
    ])
    renderAt('/chat/team-a')
    const rows = await screen.findAllByTestId('message-row')

    expect(rows[0]).toHaveAttribute('data-staff', 'true')
    expect(within(rows[0]).getByText('Head Coach')).toBeInTheDocument()
    expect(rows[1]).toHaveAttribute('data-staff', 'false')
    expect(within(rows[1]).getByText('Message removed')).toBeInTheDocument()
  })

  it('lists pinned posts in the pinned block', async () => {
    listMessagesMock.mockResolvedValue([post({ pinned: true })])
    renderAt('/chat/team-a')
    expect(await screen.findByTestId('pinned-block')).toHaveTextContent('Training moves to pitch 3.')
  })

  it('subscribes to realtime for the channel and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    subscribeMessagesMock.mockReturnValue(unsubscribe)
    const { unmount } = renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    expect(subscribeMessagesMock).toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

// ── Phase 2: fixture threads and @mentions ─────────────────────────────────

const FIXTURE = {
  id: 'ev-1', type: 'match', title: null, opponent: 'ZZ Probe Eagles', home: false,
  starts_at: '2026-08-29T05:30:00Z', ends_at: null, time_tbd: false, venue: null, pitch: null, team_id: 'team-a',
}

describe('Chat — fixture threads', () => {
  it('renders a fixture card with RSVP chips on a thread post', async () => {
    listMessagesMock.mockResolvedValue([post({ event_id: 'ev-1', event: FIXTURE })])
    listAvailabilityForEventsMock.mockResolvedValue([
      { event_id: 'ev-1', status: 'in' }, { event_id: 'ev-1', status: 'in' }, { event_id: 'ev-1', status: 'out' },
    ])
    renderAt('/chat/team-a')
    const card = await screen.findByTestId('fixture-card')
    expect(within(card).getByText(/ZZ Probe Eagles/)).toBeInTheDocument()
    expect(listAvailabilityForEventsMock).toHaveBeenCalledWith(['ev-1'])
    await waitFor(() => expect(within(card).getByText('Going · 2')).toBeInTheDocument())
    expect(within(card).getByText('Can’t · 1')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open fixture' })).toHaveAttribute('href', '/schedule?event=ev-1')
  })

  it('lets a parent start a fixture thread under announce-only via the fixture picker', async () => {
    listEventsMock.mockResolvedValue([FIXTURE])
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    expect(screen.getByTestId('composer-locked')).toHaveTextContent(/pick a fixture/i)

    await user.selectOptions(screen.getByLabelText('Fixture'), 'ev-1')
    await user.type(await screen.findByLabelText('Message'), 'Who needs a lift?')
    await user.click(screen.getByRole('button', { name: 'Start thread' }))

    expect(postMessageMock).toHaveBeenCalledWith('team-a', 'Who needs a lift?', { eventId: 'ev-1', mentions: [], attachmentPath: null })
  })

  it('hides a fixture from the picker once it has a thread', async () => {
    listEventsMock.mockResolvedValue([FIXTURE, { ...FIXTURE, id: 'ev-2', opponent: 'ZZ Probe Lions' }])
    listMessagesMock.mockResolvedValue([post({ event_id: 'ev-1', event: FIXTURE })])
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    const options = [...(await screen.findByLabelText('Fixture')).querySelectorAll('option')].map((o) => o.textContent)
    expect(options.some((t) => t.includes('Lions'))).toBe(true)
    expect(options.some((t) => t.includes('Eagles'))).toBe(false)
  })

  it('?event= opens the existing thread for that fixture', async () => {
    listMessagesMock.mockResolvedValue([post({ event_id: 'ev-1', event: FIXTURE, replies: [post({ id: 'r1', parent_id: 'msg-1', body: 'Two seats please' })] })])
    renderAt('/chat/team-a?event=ev-1')
    expect(await screen.findByText('Two seats please')).toBeInTheDocument()
  })

  it('?event= with no thread yet preselects the fixture in the composer', async () => {
    listEventsMock.mockResolvedValue([FIXTURE])
    renderAt('/chat/team-a?event=ev-1')
    await screen.findByTestId('message-row')
    await waitFor(() => expect(screen.getByLabelText('Fixture')).toHaveValue('ev-1'))
    expect(screen.getByRole('button', { name: 'Start thread' })).toBeInTheDocument()
  })

  it('?thread= opens that thread on arrival', async () => {
    listMessagesMock.mockResolvedValue([post({ replies: [post({ id: 'r1', parent_id: 'msg-1', body: 'Hidden until opened' })] })])
    renderAt('/chat/team-a?thread=msg-1')
    expect(await screen.findByText('Hidden until opened')).toBeInTheDocument()
  })
})

describe('Chat — @mentions', () => {
  const PEOPLE = [
    { profile_id: 'coach-1', full_name: 'Zz Coach Probe', role: 'coach' },
    { profile_id: 'parent-2', full_name: 'Zz Other Parent', role: 'parent' },
  ]

  it('picks a person into the reply and sends their id as a mention', async () => {
    listMentionablesMock.mockResolvedValue(PEOPLE)
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    await user.click(screen.getByRole('button', { name: 'Reply' }))
    await user.click(screen.getByRole('button', { name: 'Mention someone' }))
    await user.click(screen.getByRole('option', { name: /Zz Coach Probe/ }))
    await user.type(screen.getByLabelText('Reply'), 'can we bring two extra?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(replyToMessageMock).toHaveBeenCalledWith('msg-1', '@Zz Coach Probe can we bring two extra?', { mentions: ['coach-1'] })
  })

  it('drops the mention if the @Name is deleted from the text', async () => {
    listMentionablesMock.mockResolvedValue(PEOPLE)
    getChannelSettingsMock.mockResolvedValue({ team_id: 'team-a', announce_only: false })
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    await user.click(screen.getByRole('button', { name: 'Mention someone' }))
    await user.click(screen.getByRole('option', { name: /Zz Other Parent/ }))
    await user.clear(screen.getByLabelText('Message'))
    await user.type(screen.getByLabelText('Message'), 'changed my mind')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(postMessageMock).toHaveBeenCalledWith('team-a', 'changed my mind', { eventId: null, mentions: [], attachmentPath: null })
  })

  it('shows no mention button when nobody can be mentioned', async () => {
    listMentionablesMock.mockResolvedValue([])
    getChannelSettingsMock.mockResolvedValue({ team_id: 'team-a', announce_only: false })
    renderAt('/chat/team-a')
    await screen.findByTestId('composer')
    expect(screen.queryByRole('button', { name: 'Mention someone' })).toBeNull()
  })
})

// ── Phase 3: the staff channel and reporting ───────────────────────────────

describe('Chat — staff channel', () => {
  // The staff channel is its own row in the Chats list since 24 Aug 2026 —
  // no tabs on the thread. The header names it so nobody posts to the wrong one.
  // "need to be able to delete ... entire chats" — for a channel that means
  // every message, not the channel: it IS the squad.
  it('Clear chat in the header menu asks, then empties the channel — staff only', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    clearChannelMock.mockResolvedValue(3)
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Clear chat' }))
    const confirm = await screen.findByTestId('clear-chat-confirm')
    expect(confirm).toHaveTextContent(/Reported messages stay/)
    await user.click(within(confirm).getByRole('button', { name: 'Clear chat' }))
    expect(clearChannelMock).toHaveBeenCalledWith('team-a', 'squad')
  })

  it("a parent's Chat options holds ONLY the wallpaper — nothing staff-shaped", async () => {
    // Until 25 Aug 2026 a parent had no ⋯ menu at all; the wallpaper entry
    // (device-level, everyone's to pick) gives them one. The intent this
    // test guards is unchanged: no moderation reaches a parent.
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(['Chat background'])
  })

  it('?channel=staff is titled as the staff channel, and a parent never gets it', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    listStaffMessagesMock.mockResolvedValue([])
    renderAt('/chat/team-a?channel=staff')
    expect(await screen.findByRole('heading', { name: /ZZ Probe U12 · staff/ })).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent(/staff only/i)
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('?channel=staff reads the staff stream and posts to it, with staff mentionables', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    listStaffMessagesMock.mockResolvedValue([post({ id: 'st-0', channel: 'staff', body: 'Selection thoughts?' })])
    const user = userEvent.setup()
    renderAt('/chat/team-a?channel=staff')

    expect(await screen.findByText('Selection thoughts?')).toBeInTheDocument()
    expect(listStaffMessagesMock).toHaveBeenCalledWith('team-a')
    expect(listMessagesMock).not.toHaveBeenCalled()
    expect(listMentionablesMock).toHaveBeenCalledWith('team-a', 'staff')
    expect(screen.queryByTestId('channel-settings')).toBeNull()

    await user.type(screen.getByLabelText('Message'), 'Go with the big pack')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(postStaffMessageMock).toHaveBeenCalledWith('team-a', 'Go with the big pack', { mentions: [], attachmentPath: null })
    expect(postMessageMock).not.toHaveBeenCalled()
  })

  it('a parent asking for ?channel=staff gets the squad channel', async () => {
    renderAt('/chat/team-a?channel=staff')
    await screen.findByTestId('message-row')
    expect(listMessagesMock).toHaveBeenCalledWith('team-a')
    expect(listStaffMessagesMock).not.toHaveBeenCalled()
  })
})

describe('Chat — reporting', () => {
  it('a parent can report a coach post with a reason', async () => {
    const user = userEvent.setup()
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    await user.click(screen.getByRole('button', { name: 'Report' }))
    await user.type(screen.getByLabelText('Report this message to the club'), 'Not appropriate')
    await user.click(screen.getByRole('button', { name: 'Send report' }))
    expect(reportMessageMock).toHaveBeenCalledWith('msg-1', 'Not appropriate')
  })

  it('never offers Report on my own post', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    useAuthMock.mockReturnValue({ user: { id: 'coach-1' } })
    renderAt('/chat/team-a')
    await screen.findByTestId('message-row')
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull()
  })
})
