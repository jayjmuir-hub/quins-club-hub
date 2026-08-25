import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// The wallpaper gallery and the DM-first list
// (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md). The preset
// table's shape, the shared picker, the squad chat finally painting the
// wallpaper it always claimed to honour, and DMs leading the chat list.

import {
  BACKGROUND_GROUPS,
  BACKGROUND_PRESETS,
  backgroundStyle,
} from '../src/lib/chatBackgrounds.js'
import ChatBackgroundPicker from '../src/components/ChatBackgroundPicker.jsx'

describe('the preset table', () => {
  it('has unique keys, and every preset carries a group the picker knows', () => {
    const keys = BACKGROUND_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    const known = new Set(BACKGROUND_GROUPS.map((g) => g.group))
    for (const preset of BACKGROUND_PRESETS) {
      expect(known.has(preset.group), `${preset.key} group`).toBe(true)
    }
  })

  it('every preset except plain paints something', () => {
    for (const preset of BACKGROUND_PRESETS) {
      if (preset.key === 'plain') expect(preset.style).toBeNull()
      else expect(preset.style?.backgroundImage, preset.key).toBeTruthy()
    }
  })

  it('is a real gallery, in four groups', () => {
    // "Too few choices" was the complaint — this pins the floor, not the
    // exact count, so adding a preset never fails it.
    expect(BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(16)
    expect(BACKGROUND_GROUPS).toHaveLength(4)
  })

  it('every SVG preset decodes to REAL colours — the invisible-pattern bug', () => {
    // Jay, 25 Aug 2026: "most of the backgrounds don't have anything in
    // them". The sources carried %23 (an already-encoded #) and then went
    // through encodeURIComponent, double-encoding to %2523 — after the
    // browser's single decode the colour was the literal string
    // "%23808080", invalid, and nothing painted. Inherited from round 3:
    // the original doodle never drew either. A colour must decode to #.
    for (const preset of BACKGROUND_PRESETS) {
      const image = preset.style?.backgroundImage ?? ''
      const match = image.match(/^url\("data:image\/svg\+xml,(.*)"\)$/)
      if (!match) continue
      const decoded = decodeURIComponent(match[1])
      expect(decoded, `${preset.key} decodes cleanly`).not.toContain('%23')
      expect(decoded, `${preset.key} paints with a real colour`).toMatch(/(stroke|fill)='#[0-9a-fA-F]{6}'/)
    }
  })

  it('round-3 stored choices still resolve — green and warm survive', () => {
    // A saved wallpaper must not reset because a label improved.
    expect(backgroundStyle('green')).toBeTruthy()
    expect(backgroundStyle('warm')).toBeTruthy()
    expect(backgroundStyle('doodle')).toBeTruthy()
  })
})

describe('the shared picker', () => {
  it('opens as a SHEET with the four group labels and reports the pick', async () => {
    // A sheet, not an in-flow card: the card opened at the TOP of the
    // conversation while the stay-pinned hook held the reader at the
    // BOTTOM — "nothing happens at all". The portal makes scroll position
    // irrelevant.
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<ChatBackgroundPicker open onClose={() => {}} current="plain" onPick={onPick} />)
    expect(screen.getByRole('dialog', { name: 'Chat background' })).toBeInTheDocument()
    for (const { label } of BACKGROUND_GROUPS) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Hoops' }))
    expect(onPick).toHaveBeenCalledWith('hoops')
  })

  it('renders nothing while closed', () => {
    render(<ChatBackgroundPicker open={false} onClose={() => {}} current="plain" onPick={() => {}} />)
    expect(screen.queryByTestId('background-picker')).toBeNull()
  })
})

// ── Squad chat wears the wallpaper ─────────────────────────────────────────

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const m = {
  listMessages: vi.fn(),
  listMyMessageReads: vi.fn(),
  markMessagesRead: vi.fn(),
  messageReadStats: vi.fn(),
  getChannelSettings: vi.fn(),
  postMessage: vi.fn(),
  replyToMessage: vi.fn(),
  removeMessage: vi.fn(),
  clearChannel: vi.fn(),
  setPinned: vi.fn(),
  setAnnounceOnly: vi.fn(),
  subscribeMessages: vi.fn(),
  listMentionablesFor: vi.fn(),
  listStaffMessages: vi.fn(),
  postStaffMessage: vi.fn(),
  reportMessage: vi.fn(),
  getEventThread: vi.fn(),
  listReactions: vi.fn(),
  toggleReaction: vi.fn(),
  subscribeReactions: vi.fn(),
}
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/lib/auth.jsx', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../src/data/messages.js', () => ({
  listMessages: (...a) => m.listMessages(...a),
  listMyMessageReads: (...a) => m.listMyMessageReads(...a),
  markMessagesRead: (...a) => m.markMessagesRead(...a),
  messageReadStats: (...a) => m.messageReadStats(...a),
  getChannelSettings: (...a) => m.getChannelSettings(...a),
  postMessage: (...a) => m.postMessage(...a),
  replyToMessage: (...a) => m.replyToMessage(...a),
  removeMessage: (...a) => m.removeMessage(...a),
  clearChannel: (...a) => m.clearChannel(...a),
  setPinned: (...a) => m.setPinned(...a),
  setAnnounceOnly: (...a) => m.setAnnounceOnly(...a),
  subscribeMessages: (...a) => m.subscribeMessages(...a),
  listMentionablesFor: (...a) => m.listMentionablesFor(...a),
  listStaffMessages: (...a) => m.listStaffMessages(...a),
  postStaffMessage: (...a) => m.postStaffMessage(...a),
  reportMessage: (...a) => m.reportMessage(...a),
  getEventThread: (...a) => m.getEventThread(...a),
  listReactions: (...a) => m.listReactions(...a),
  toggleReaction: (...a) => m.toggleReaction(...a),
  subscribeReactions: (...a) => m.subscribeReactions(...a),
}))
vi.mock('../src/data/events.js', () => ({ listEvents: vi.fn(async () => []) }))
vi.mock('../src/data/availability.js', () => ({ listAvailabilityForEvents: vi.fn(async () => []) }))
vi.mock('../src/screens/ChatList.jsx', () => ({
  RowAvatar: () => <span />,
  scopeChatRows: (rows) => rows,
  previewLine: () => '',
  shortBand: () => 'U12',
}))

import Chat from '../src/screens/Chat.jsx'

const TEAM_A = { id: 'team-a', club_id: 'club-1', name: 'ZZ Probe U12', sort_order: 1 }
const PARENT = [{ id: 'm2', role: 'parent', team_id: 'team-a', player_id: 'p1', club_id: 'club-1', status: 'active' }]

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/chat/team-a']}>
      <Routes>
        <Route path="/chat" element={<div>the list</div>} />
        <Route path="/chat/:teamId" element={<Chat />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'me-1' } })
  useMembershipsMock.mockReturnValue({
    memberships: PARENT,
    realMemberships: PARENT,
    teams: [TEAM_A],
    loading: false,
    error: null,
    viewAs: null,
  })
  m.listMessages.mockResolvedValue([])
  m.listMyMessageReads.mockResolvedValue(new Set())
  m.markMessagesRead.mockResolvedValue(undefined)
  m.messageReadStats.mockResolvedValue(new Map())
  m.getChannelSettings.mockResolvedValue({ team_id: 'team-a', announce_only: true })
  m.subscribeMessages.mockReturnValue(() => {})
  m.subscribeReactions.mockReturnValue(() => {})
  m.listMentionablesFor.mockResolvedValue([])
  m.listReactions.mockResolvedValue(new Map())
  m.listStaffMessages.mockResolvedValue([])
})

describe('the squad chat wears the wallpaper', () => {
  it('paints the stored choice — the "for every chat" promise, finally kept', async () => {
    window.localStorage.setItem('chat-background', 'hoops')
    renderChat()
    await waitFor(() => expect(screen.getByTestId('composer-locked')).toBeInTheDocument())
    const painted = document.querySelector('[data-background]')
    expect(painted?.getAttribute('data-background')).toBe('hoops')
    expect(painted?.style.backgroundImage).toContain('url(')
  })

  it('offers Chat background in the header menu and opens the gallery', async () => {
    const user = userEvent.setup()
    renderChat()
    await waitFor(() => expect(screen.getByTestId('composer-locked')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Chat background' }))
    expect(screen.getByTestId('background-picker')).toBeInTheDocument()
  })
})
