import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'

// WhatsApp-style composer (Jay, 5 Sep 2026): one + menu for attach/poll,
// icon Send, @ only when typed in a group. DmThread and ChannelThread share
// ComposerBar — the dock mounts those same two views, so this file is the
// real mobile composer path, not a fork.

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => ({ memberships: [], teams: [], realMemberships: [] }),
}))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: async () => 'blob:signed',
  isAudioAttachment: () => false,
  isFileAttachment: () => false,
  messageAttachmentLabel: () => '📷 Photo',
  chatFileAccept: () => 'application/pdf',
  attachmentPreviewLabel: () => '📷 Photo',
  uploadChatPhoto: vi.fn(),
  uploadChatFile: vi.fn(),
  removeChatPhoto: vi.fn(),
}))
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/profileIcons.js', () => ({
  listClubIconMap: async () => new Map(),
  listMemberIcons: async () => [],
}))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/components/VoiceComposer.jsx', () => ({
  default: ({ disabled }) => (
    <button type="button" aria-label="Record a voice message" data-testid="voice-button" disabled={disabled} />
  ),
}))

import ChannelThread from '../src/components/ChannelThread.jsx'
import DmThread from '../src/components/DmThread.jsx'

const ME = 'me-1'
const PEOPLE = [
  { profile_id: 'p-2', full_name: 'Mira Vantel', role: 'parent' },
  { profile_id: 'p-3', full_name: 'Tomas Orrin', role: 'parent' },
]

function channelStub(overrides = {}) {
  const messages = overrides.messages ?? []
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
    tray: { items: [], add: vi.fn(), remove: vi.fn(), clear: vi.fn(), error: null },
    polls: new Map(),
    draft: '',
    setDraft: vi.fn(),
    setDraftMentions: vi.fn(),
    draftRef: { current: null },
    fileRef: { current: null },
    docFileRef: { current: null },
    pendingFile: { file: null, error: null, pick: vi.fn(), clear: vi.fn() },
    pickFile: vi.fn(),
    composerOpen: true,
    sending: false,
    progress: null,
    send: vi.fn((e) => e?.preventDefault?.()),
    sendVoice: vi.fn(),
    sendPoll: vi.fn(),
    postingPoll: false,
    allowPolls: true,
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

function dmStub(overrides = {}) {
  return {
    selfId: ME,
    conversation: { id: 'c1', kind: 'dm', profile_a: ME, profile_b: 'other-1' },
    messages: [],
    reactions: new Map(),
    stars: new Set(),
    receipts: new Map(),
    error: null,
    background: 'none',
    isGroup: false,
    participant: true,
    reviewing: false,
    recipientIds: ['other-1'],
    nameFor: (_id, fallback) => fallback,
    otherName: 'Zz Manager Probe',
    newFromRef: { current: null },
    blocked: false,
    selecting: false,
    forwarding: false,
    reporting: null,
    replyTo: null,
    setReplyTo: vi.fn(),
    tray: { items: [], add: vi.fn(), remove: vi.fn(), clear: vi.fn(), error: null },
    pendingFile: { file: null, error: null, pick: vi.fn(), clear: vi.fn() },
    mentionables: [],
    fileRef: { current: null },
    docFileRef: { current: null },
    pickPhoto: vi.fn(),
    pickFile: vi.fn(),
    draft: '',
    setDraft: vi.fn(),
    setDraftMentions: vi.fn(),
    draftRef: { current: null },
    sending: false,
    progress: null,
    send: vi.fn((e) => e?.preventDefault?.()),
    sendVoice: vi.fn(),
    setError: vi.fn(),
    postingPoll: false,
    sendPoll: vi.fn(),
    polls: new Map(),
    vote: vi.fn(),
    ...overrides,
  }
}

function renderChannel(thread) {
  return render(
    <MemoryRouter>
      <ChannelThread thread={thread} />
    </MemoryRouter>,
  )
}

function renderDm(thread) {
  return render(
    <MemoryRouter>
      <DmThread thread={thread} />
    </MemoryRouter>,
  )
}

function LiveChannel({ mentionables = PEOPLE, allowPolls = true }) {
  const [draft, setDraft] = useState('')
  const draftRef = useRef(null)
  const thread = channelStub({
    draft,
    setDraft,
    draftRef,
    mentionables,
    allowPolls,
    messages: [],
    visible: [],
  })
  return (
    <MemoryRouter>
      <ChannelThread thread={thread} />
    </MemoryRouter>
  )
}

function LiveGroupDm({ mentionables = PEOPLE }) {
  const [draft, setDraft] = useState('')
  const draftRef = useRef(null)
  const thread = dmStub({
    isGroup: true,
    conversation: { id: 'g1', kind: 'group', title: 'Zz Test Group' },
    otherName: 'Zz Test Group',
    mentionables,
    draft,
    setDraft,
    draftRef,
  })
  return (
    <MemoryRouter>
      <DmThread thread={thread} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

function assertDeclutteredBar(composer) {
  expect(within(composer).queryByTestId('photo-button')).toBeNull()
  expect(within(composer).queryByTestId('file-button')).toBeNull()
  expect(within(composer).queryByTestId('poll-button')).toBeNull()
  expect(within(composer).queryByRole('button', { name: 'Mention someone' })).toBeNull()
  expect(within(composer).getByTestId('attach-menu')).toBeInTheDocument()
}

describe('channel composer bar', () => {
  it('idle: + / textarea / emoji / mic — attach and poll live in the + menu', async () => {
    const user = userEvent.setup()
    renderChannel(channelStub())
    const composer = screen.getByTestId('composer')
    assertDeclutteredBar(composer)
    expect(screen.getByTestId('voice-button')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()

    await user.click(screen.getByTestId('attach-menu'))
    expect(screen.getByTestId('attach-menu-photo')).toHaveAccessibleName(/photo or file|attach a photo|photo/i)
    expect(screen.getByTestId('attach-menu-file')).toBeInTheDocument()
    expect(screen.getByTestId('attach-menu-poll')).toBeInTheDocument()
    const photo = screen.getByTestId('photo-input')
    const spy = vi.spyOn(photo, 'click')
    await user.click(screen.getByTestId('attach-menu-photo'))
    expect(spy).toHaveBeenCalled()
  })

  it('draft swaps the mic for an icon Send with accessible name Send', async () => {
    renderChannel(channelStub({ draft: 'kick-off moved' }))
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send.querySelector('svg')).toBeTruthy()
    expect(send.textContent).not.toMatch(/Send/)
    expect(screen.queryByTestId('voice-button')).toBeNull()
  })

  it('poll is behind +, not on the bar, and opens the existing sheet', async () => {
    const user = userEvent.setup()
    renderChannel(channelStub())
    expect(screen.queryByTestId('poll-composer')).toBeNull()
    await user.click(screen.getByTestId('attach-menu'))
    await user.click(screen.getByTestId('attach-menu-poll'))
    expect(screen.getByTestId('poll-composer')).toBeInTheDocument()
  })

  it('the + menu dismisses on Escape', async () => {
    const user = userEvent.setup()
    renderChannel(channelStub())
    await user.click(screen.getByTestId('attach-menu'))
    expect(screen.getByTestId('attach-menu-photo')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('attach-menu-photo')).toBeNull()
  })

  it('role channels hide Create poll in the + menu', async () => {
    const user = userEvent.setup()
    renderChannel(channelStub({ allowPolls: false }))
    await user.click(screen.getByTestId('attach-menu'))
    expect(screen.getByTestId('attach-menu-photo')).toBeInTheDocument()
    expect(screen.queryByTestId('attach-menu-poll')).toBeNull()
  })

  it('typing @ in a channel with mentionables opens the existing picker', async () => {
    const user = userEvent.setup()
    render(<LiveChannel />)
    const box = screen.getByLabelText('Message')
    expect(screen.queryByRole('listbox', { name: 'People in this channel' })).toBeNull()
    await user.type(box, '@')
    const list = screen.getByRole('listbox', { name: 'People in this channel' })
    expect(within(list).getByRole('option', { name: /Mira Vantel/ })).toBeInTheDocument()
    await user.click(within(list).getByRole('option', { name: /Mira Vantel/ }))
    expect(box).toHaveValue('@Mira Vantel ')
    expect(screen.queryByRole('button', { name: 'Mention someone' })).toBeNull()
  })
})

describe('DM composer bar', () => {
  it('1:1: + menu for photo/file/poll, no @ UI even after typing @', async () => {
    const user = userEvent.setup()
    renderDm(dmStub({ draft: '@' }))
    const composer = screen.getByTestId('dm-composer')
    assertDeclutteredBar(composer)
    expect(screen.queryByRole('listbox', { name: 'People in this channel' })).toBeNull()
    await user.click(screen.getByTestId('attach-menu'))
    expect(screen.getByTestId('attach-menu-photo')).toBeInTheDocument()
    expect(screen.getByTestId('attach-menu-file')).toBeInTheDocument()
    expect(screen.getByTestId('attach-menu-poll')).toBeInTheDocument()
  })

  it('group: typing @ surfaces mentions; the @ button is gone', async () => {
    const user = userEvent.setup()
    render(<LiveGroupDm />)
    expect(screen.queryByRole('button', { name: 'Mention someone' })).toBeNull()
    await user.type(screen.getByLabelText('Message'), '@To')
    const list = screen.getByRole('listbox', { name: 'People in this channel' })
    expect(within(list).getByRole('option', { name: /Tomas Orrin/ })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: /Mira Vantel/ })).toBeNull()
  })

  it('icon Send keeps accessible name Send when there is a draft', () => {
    renderDm(dmStub({ draft: 'on my way' }))
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send.querySelector('svg')).toBeTruthy()
    expect(screen.getByTestId('dm-composer').querySelector('button[aria-label="Send"] svg')).toBeTruthy()
  })
})
