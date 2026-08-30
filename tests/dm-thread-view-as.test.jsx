import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Grok item 9: an admin PREVIEWING as a parent who opens somebody else's DM
// is still reviewing it — every database read runs as the real auth.uid().
// useDmThread used to key `admin` on the view-as SYNTHETIC membership set, so
// the preview skipped both the review banner and the logWelfareAccess row.
// This pins the fix: `admin` comes from realMemberships, so the audit fires
// and `reviewing` is set even mid-preview.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/presence.js', () => ({ usePresence: () => new Set() }))
vi.mock('../src/lib/useStayPinnedToBottom.js', () => ({ default: () => {} }))

const logWelfareAccess = vi.fn()
vi.mock('../src/data/messages.js', () => ({
  forwardMessagesTo: vi.fn(),
  listChats: vi.fn(async () => []),
  listMyMessageReads: vi.fn(async () => new Set()),
  listMyStars: vi.fn(async () => new Set()),
  listReactions: vi.fn(async () => new Map()),
  editMessage: vi.fn(),
  getConversation: vi.fn(async () => ({
    id: 'c1',
    kind: 'dm',
    club_id: 'club-1',
    profile_a: 'parent-a',
    profile_b: 'parent-b',
  })),
  listDirectMessages: vi.fn(async () => []),
  listGroupMembers: vi.fn(async () => null),
  listMyBlocks: vi.fn(async () => new Set()),
  listMyConversations: vi.fn(async () => []),
  logWelfareAccess: (...args) => logWelfareAccess(...args),
  markMessagesRead: vi.fn(async () => {}),
  openConversation: vi.fn(),
  removeMessage: vi.fn(),
  reportMessage: vi.fn(),
  sendDirectMessage: vi.fn(),
  setPinned: vi.fn(),
  subscribeMessages: vi.fn(() => () => {}),
  subscribeReactions: vi.fn(() => () => {}),
  toggleReaction: vi.fn(),
  toggleStar: vi.fn(),
  listMessageReceipts: vi.fn(async () => new Map()),
}))
vi.mock('../src/data/chatMedia.js', () => ({
  removeChatPhoto: vi.fn(),
  uploadChatPhoto: vi.fn(),
  uploadChatVoice: vi.fn(),
}))
vi.mock('../src/data/nicknames.js', () => ({ listMyNicknames: vi.fn(async () => new Map()) }))
vi.mock('../src/data/chatPrefs.js', () => ({
  getMyChatPref: vi.fn(async () => null),
  setChatPref: vi.fn(),
}))
vi.mock('../src/data/polls.js', () => ({
  createPoll: vi.fn(),
  listPollsFor: vi.fn(async () => new Map()),
  setPollVote: vi.fn(),
  subscribePollVotes: vi.fn(() => () => {}),
}))

import useDmThread from '../src/lib/useDmThread.js'

const ADMIN_ROWS = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: 'club-1' }]
const SYNTHETIC_PARENT = [{ id: 'view-as', role: 'parent', status: 'active', team_id: 't1', club_id: 'club-1' }]

let hookState
function Probe() {
  hookState = useDmThread('c1')
  return null
}

function mount() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Probe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  logWelfareAccess.mockClear()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1' } })
})

describe('useDmThread under view-as', () => {
  it('an admin previewing as a parent still logs the welfare access and reviews', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: SYNTHETIC_PARENT,
      realMemberships: ADMIN_ROWS,
    })
    mount()
    await waitFor(() => expect(logWelfareAccess).toHaveBeenCalledWith('c1'))
    expect(hookState.reviewing).toBeTruthy()
  })

  it('a REAL parent opening a DM they are not in logs nothing', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: SYNTHETIC_PARENT,
      realMemberships: SYNTHETIC_PARENT,
    })
    mount()
    await waitFor(() => expect(hookState.conversation).toBeTruthy())
    expect(logWelfareAccess).not.toHaveBeenCalled()
    expect(hookState.reviewing).toBeFalsy()
  })

  it('a participant admin is not reviewing their own chat', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'parent-a' } })
    useMembershipsMock.mockReturnValue({
      memberships: ADMIN_ROWS,
      realMemberships: ADMIN_ROWS,
    })
    mount()
    await waitFor(() => expect(hookState.conversation).toBeTruthy())
    expect(logWelfareAccess).not.toHaveBeenCalled()
    expect(hookState.reviewing).toBeFalsy()
  })
})
