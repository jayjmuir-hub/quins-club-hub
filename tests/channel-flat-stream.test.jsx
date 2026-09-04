import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// 4 Sep 2026 — claude/decisions/2026-09-04-channel-threads-flat-stream.md.
// A channel is one flat stream, oldest to newest; a reply is a message at
// its own time wearing a QUOTE of what it answers (WhatsApp). Threads are
// not folded, and a fixture's "thread" is a FILTER the reader asks for,
// with a bar saying so and the way back on screen. The live fixture's card
// stays at the top until kick-off.
//
// The day's bug, for the record: a manager's reply to the second-to-last
// post in a role channel was promised by the chat list's preview and
// invisible in the chat, folded behind an 11px "1 reply" toggle.

vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/profileIcons.js', () => ({
  listClubIconMap: async () => new Map(),
  listMemberIcons: async () => [],
}))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: async () => 'blob:signed',
  isAudioAttachment: () => false,
  attachmentPreviewLabel: () => '📷 Photo',
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
}))
vi.mock('../src/components/VoiceComposer.jsx', () => ({ default: () => null }))

import MessageRow from '../src/components/MessageRow.jsx'
import ChannelThread from '../src/components/ChannelThread.jsx'

const ME = 'me-1'
const OTHER = 'zz-manager-probe'
const FIXTURE = {
  id: 'ev-1',
  type: 'match',
  title: null,
  opponent: 'Zz Probe RFC',
  home: true,
  starts_at: '2036-09-12T06:00:00Z', // far ahead: the card is "live"
  ends_at: null,
  time_tbd: false,
  venue: 'Zayed Sports City',
  pitch: '3',
  team_id: 'team-a',
}

function msg(id, body, extra = {}) {
  return {
    id,
    author_id: OTHER,
    author_role: 'manager',
    author: { full_name: 'Zz Manager Probe' },
    body,
    parent_id: null,
    created_at: '2026-09-03T16:45:00Z',
    deleted_at: null,
    pinned: false,
    forwarded: false,
    attachment_path: null,
    ...extra,
  }
}

const ask = msg('p-1', 'Please send me your list')
const later = msg('p-2', '@everyone', { created_at: '2026-09-03T16:45:16Z' })
const answer = msg('r-1', 'Including those who need training?', {
  parent_id: 'p-1',
  parent: ask,
  author_id: 'zz-other-manager',
  author: { full_name: 'Zz Other Manager' },
  created_at: '2026-09-04T03:17:02Z',
})

function renderRow(message, props = {}) {
  return render(
    <MemoryRouter>
      <MessageRow message={message} selfId={ME} {...props} />
    </MemoryRouter>,
  )
}

describe('MessageRow — a reply is a message with a quote', () => {
  it('wears a quote naming who and what it answers, and no fold exists', () => {
    renderRow(answer, { onReply: vi.fn() })
    const quote = screen.getByTestId('quote-block')
    expect(quote).toHaveTextContent('Zz Manager Probe')
    expect(quote).toHaveTextContent('Please send me your list')
    expect(screen.getByText('Including those who need training?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^\d+ repl/ })).toBeNull()
    expect(screen.getByTestId('message-row')).toHaveAttribute('data-reply', 'true')
  })

  it('CONTROL: a plain post wears no quote and no reply marker', () => {
    renderRow(ask, { onReply: vi.fn() })
    expect(screen.queryByTestId('quote-block')).toBeNull()
    expect(screen.getByTestId('message-row')).not.toHaveAttribute('data-reply')
  })

  it('a quote of a soft-deleted parent says so without re-showing a word of it', () => {
    renderRow({ ...answer, parent: { ...ask, deleted_at: '2026-09-04T01:00:00Z' } })
    expect(screen.getByTestId('quote-block')).toHaveTextContent('Message deleted')
    expect(screen.queryByText('Please send me your list')).toBeNull()
  })

  it('a quote of a fixture post names the fixture and, tapped, FILTERS to it rather than scrolling', async () => {
    const user = userEvent.setup()
    const onFocus = vi.fn()
    const fixturePost = msg('f-1', '', { event_id: 'ev-1', event: FIXTURE })
    renderRow({ ...answer, parent_id: 'f-1', parent: fixturePost }, { onFocus })
    const quote = screen.getByTestId('quote-block')
    expect(quote).toHaveTextContent(/Zz Probe RFC/)
    expect(quote).toHaveAttribute('data-fixture', 'true')
    await user.click(quote)
    expect(onFocus).toHaveBeenCalledWith('f-1')
  })

  it('Reply in the menu hands the whole message to the composer — it does not open a form under the post', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    renderRow(ask, { onReply })
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalledWith(ask)
    expect(screen.queryByLabelText('Reply')).toBeNull()
  })

  it('a fixture post carries the filter door; Pin is never offered on a reply', async () => {
    const user = userEvent.setup()
    const onFocus = vi.fn()
    const fixturePost = msg('f-1', '', { event_id: 'ev-1', event: FIXTURE })
    renderRow(fixturePost, { onFocus, canModerate: true, onPin: vi.fn() })
    await user.click(screen.getByTestId('focus-fixture'))
    expect(onFocus).toHaveBeenCalledWith('f-1')
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()
  })

  it('CONTROL: Pin is not offered on a reply, even to staff', async () => {
    const user = userEvent.setup()
    renderRow(answer, { canModerate: true, onPin: vi.fn(), onRemove: vi.fn() })
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    // The menu is there (Delete proves it) and Pin is not.
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).toBeNull()
  })
})

// ── ChannelThread: the filter, the bar, the live card, the quote preview ──────

function stubThread(overrides = {}) {
  const messages = overrides.messages ?? [ask, later, answer]
  const reads = new Set(messages.map((m) => m.id))
  return {
    selfId: ME,
    isClub: false,
    staffChannel: false,
    canModerate: false,
    messages,
    visible: messages,
    focusId: null,
    focusPost: null,
    setFocusId: vi.fn(),
    liveFixtures: [],
    replyTo: null,
    setReplyTo: vi.fn(),
    reads,
    openReadsRef: { current: reads },
    newFromRef: { current: null },
    stats: new Map(),
    announceOnly: false,
    mayPost: true,
    pinned: [],
    attachable: [],
    attachedEvent: null,
    error: null,
    sendError: null,
    tallies: new Map(),
    reactions: new Map(),
    mentionables: [],
    background: 'none',
    tray: { items: [], add: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    polls: new Map(),
    draft: '',
    setDraft: vi.fn(),
    setDraftMentions: vi.fn(),
    draftRef: { current: null },
    fileRef: { current: null },
    composerOpen: true,
    sending: false,
    progress: null,
    send: vi.fn(),
    sendVoice: vi.fn(),
    sendPoll: vi.fn(),
    postingPoll: false,
    allowPolls: false,
    attachEventId: '',
    setAttachEventId: vi.fn(),
    setSendError: vi.fn(),
    pickPhoto: vi.fn(),
    md: false,
    onReact: vi.fn(),
    onReply: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    onPin: vi.fn(),
    onReport: vi.fn(),
    onReplyPrivately: vi.fn(),
    openDmWith: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  }
}

function renderThread(thread) {
  return render(
    <MemoryRouter>
      <ChannelThread thread={thread} />
    </MemoryRouter>,
  )
}

describe('ChannelThread — flat stream, fixture filter, live card', () => {
  it("the day's bug: the reply is the LAST bubble, on screen, under nothing", () => {
    renderThread(stubThread())
    const rows = screen.getAllByTestId('message-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[2]).getByText('Including those who need training?')).toBeInTheDocument()
    expect(within(rows[2]).getByTestId('quote-block')).toHaveTextContent('Please send me your list')
    expect(screen.queryByRole('button', { name: /^\d+ repl/ })).toBeNull()
  })

  it('a filter shows the bar with the fixture name and Show everything clears it', async () => {
    const user = userEvent.setup()
    const fixturePost = msg('f-1', '', { event_id: 'ev-1', event: FIXTURE, created_at: '2026-09-01T10:00:00Z' })
    const reply = { ...answer, parent_id: 'f-1', parent: fixturePost }
    const thread = stubThread({
      messages: [fixturePost, ask, reply],
      visible: [fixturePost, reply],
      focusId: 'f-1',
      focusPost: fixturePost,
    })
    renderThread(thread)
    expect(screen.getByTestId('focus-bar')).toHaveTextContent(/Showing .*Zz Probe RFC/)
    expect(screen.queryByText('Please send me your list')).toBeNull()
    expect(screen.getByText('Including those who need training?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(thread.setFocusId).toHaveBeenCalledWith(null)
  })

  it('CONTROL: no bar and nothing hidden when nothing is focused', () => {
    renderThread(stubThread())
    expect(screen.queryByTestId('focus-bar')).toBeNull()
    expect(screen.getAllByTestId('message-row')).toHaveLength(3)
  })

  it('a live fixture keeps its card at the top, and its door filters; hidden while filtering', async () => {
    const user = userEvent.setup()
    const fixturePost = msg('f-1', '', { event_id: 'ev-1', event: FIXTURE })
    const thread = stubThread({ messages: [fixturePost, ask], visible: [fixturePost, ask], liveFixtures: [fixturePost] })
    const { unmount } = renderThread(thread)
    const live = screen.getByTestId('live-fixtures')
    expect(within(live).getByText(/Zz Probe RFC/)).toBeInTheDocument()
    await user.click(within(live).getByTestId('focus-fixture'))
    expect(thread.setFocusId).toHaveBeenCalledWith('f-1')
    unmount()
    renderThread(stubThread({ messages: [fixturePost, ask], visible: [fixturePost], liveFixtures: [fixturePost], focusId: 'f-1', focusPost: fixturePost }))
    expect(screen.queryByTestId('live-fixtures')).toBeNull()
  })

  it('a reply being written shows the quote preview above the composer, and Cancel drops it', async () => {
    const user = userEvent.setup()
    const thread = stubThread({ replyTo: ask })
    renderThread(thread)
    expect(screen.getByTestId('quote-preview')).toHaveTextContent('Replying to Zz Manager Probe')
    expect(screen.getByTestId('quote-preview')).toHaveTextContent('Please send me your list')
    await user.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(thread.setReplyTo).toHaveBeenCalledWith(null)
  })
})
