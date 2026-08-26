import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Five photo papers, crest letterhead default
// (claude/plans/2026-08-25-chat-wallpaper-papers.md). Retired stored keys
// fall back to crest; the picker is just the five tiles.

import {
  BACKGROUND_PRESETS,
  backgroundStyle,
  getChatBackground,
} from '../src/lib/chatBackgrounds.js'
import ChatBackgroundPicker from '../src/components/ChatBackgroundPicker.jsx'

const FIVE_KEYS = ['harlequin', 'dusk', 'crest', 'doodle', 'kit']
const FIVE_LABELS = [
  'Harlequin (kit diamonds + crest bat)',
  'Dusk (Zayed dusk photo)',
  'Crest (DEFAULT; cream paper, faded shield)',
  'Club doodle (lighter than the others)',
  'Kit (green/red hoop fabric)',
]
const RETIRED = ['plain', 'green', 'warm', 'hoops']

describe('the preset table', () => {
  it('is exactly the five keys, in picker order', () => {
    expect(BACKGROUND_PRESETS.map((p) => p.key)).toEqual(FIVE_KEYS)
    expect(new Set(BACKGROUND_PRESETS.map((p) => p.key)).size).toBe(5)
  })

  it('every paper is a covered photo washed toward --surface-rgb', () => {
    for (const preset of BACKGROUND_PRESETS) {
      expect(preset.style.backgroundImage, preset.key).toContain(`url(/chat-backgrounds/${preset.key}.jpg)`)
      expect(preset.style.backgroundImage, preset.key).toContain('rgb(var(--surface-rgb) /')
      expect(preset.style.backgroundImage, preset.key).not.toContain('data:image/svg+xml')
      expect(preset.style.backgroundSize).toBe('cover')
      expect(preset.style.backgroundPosition).toBe('center')
    }
  })

  it('empty, unknown, and retired keys fall back to crest', () => {
    window.localStorage.removeItem('chat-background')
    expect(getChatBackground()).toBe('crest')
    expect(backgroundStyle(undefined).backgroundImage).toContain('/chat-backgrounds/crest.jpg')

    window.localStorage.setItem('chat-background', 'not-a-paper')
    expect(getChatBackground()).toBe('crest')
    expect(backgroundStyle('not-a-paper').backgroundImage).toContain('/chat-backgrounds/crest.jpg')

    for (const key of RETIRED) {
      window.localStorage.setItem('chat-background', key)
      expect(getChatBackground(), key).toBe('crest')
      expect(backgroundStyle(key).backgroundImage, key).toContain('/chat-backgrounds/crest.jpg')
    }
  })
})

describe('the shared picker', () => {
  it('opens as a SHEET with only the five labels and reports Crest / Club doodle', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<ChatBackgroundPicker open onClose={() => {}} current="crest" onPick={onPick} />)
    expect(screen.getByRole('dialog', { name: 'Chat background' })).toBeInTheDocument()
    const picker = screen.getByTestId('background-picker')
    const buttons = within(picker).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(FIVE_LABELS)
    expect(within(picker).queryByRole('button', { name: 'Hoops' })).toBeNull()
    expect(screen.queryByText('Colours')).toBeNull()
    expect(screen.queryByText('Gradients')).toBeNull()
    expect(screen.queryByText('Patterns')).toBeNull()

    await user.click(within(picker).getByRole('button', { name: /^Crest\b/ }))
    expect(onPick).toHaveBeenCalledWith('crest')
    await user.click(within(picker).getByRole('button', { name: /Club doodle/ }))
    expect(onPick).toHaveBeenCalledWith('doodle')
  })

  it('renders nothing while closed', () => {
    render(<ChatBackgroundPicker open={false} onClose={() => {}} current="crest" onPick={() => {}} />)
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
  // Ticks (26 Aug 2026): receipts empty, state null — no ticks drawn.
  listMessageReceipts: async () => new Map(),
  receiptState: () => null,
  markMessagesDelivered: async () => {},
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
  window.localStorage.clear()
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
  it('empty storage paints crest — the default on every chat', async () => {
    renderChat()
    await waitFor(() => expect(screen.getByTestId('composer-locked')).toBeInTheDocument())
    const painted = document.querySelector('[data-background]')
    expect(painted?.getAttribute('data-background')).toBe('crest')
    expect(painted?.style.backgroundImage).toContain('/chat-backgrounds/crest.jpg')
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
