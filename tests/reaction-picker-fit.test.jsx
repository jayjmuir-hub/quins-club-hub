import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The reaction picker hangs off the right of the screen on a phone (Jay,
// 27 Aug 2026: DM with himself, incoming left bubble, smiley on the right
// of the row). Same component on group/channel threads and the floating
// dock — ChatBubble is the ONE shell, MessageRow wraps it for channels.
// Invented names only.

vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: vi.fn(),
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
}))

import ChatBubble from '../src/components/ChatBubble.jsx'
import MessageRow from '../src/components/MessageRow.jsx'
import { REACTION_PICKER_WIDTH } from '../src/components/ReactionBar.jsx'

const PHONE = 375
const MARGIN = 8

const BUBBLE = {
  messageId: 'msg-zz-1',
  testId: 'bubble',
  createdAt: '2026-08-27T08:00:00Z',
  body: 'Zz on my way',
  selfId: 'me-1',
  onReact: () => {},
}

const ROW = {
  id: 'msg-zz-1',
  author_id: 'coach-1',
  author_role: 'coach',
  author: { full_name: 'Zz Coach Probe' },
  body: 'Training moved to 5pm',
  created_at: '2026-08-27T08:00:00Z',
  deleted_at: null,
  pinned: false,
  forwarded: false,
  attachment_path: null,
  replies: [],
}

function stubTrigger(el, { left, width = 24, top = 400 }) {
  const right = left + width
  el.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    right,
    top,
    bottom: top + 24,
    width,
    height: 24,
    toJSON() {},
  })
}

function assertFullyOnScreen(picker) {
  const left = Number.parseFloat(picker.style.left)
  expect(Number.isFinite(left)).toBe(true)
  expect(left).toBeGreaterThanOrEqual(MARGIN)
  expect(left + REACTION_PICKER_WIDTH).toBeLessThanOrEqual(PHONE - MARGIN)
}

describe('reaction picker stays on a phone screen', () => {
  let originalWidth

  beforeEach(() => {
    originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: PHONE, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  })

  it('incoming left ChatBubble: picker from the right-side smiley does not clip off the right', async () => {
    const user = userEvent.setup()
    render(<ChatBubble {...BUBBLE} mine={false} />)
    const trigger = screen.getByTestId('reaction-trigger')
    stubTrigger(trigger, { left: 330 })
    await user.click(within(trigger).getByRole('button', { name: 'Add reaction' }))
    assertFullyOnScreen(screen.getByTestId('reaction-picker'))
  })

  it('outgoing right ChatBubble: flipping left does not clip the left edge', async () => {
    const user = userEvent.setup()
    render(<ChatBubble {...BUBBLE} mine />)
    const trigger = screen.getByTestId('reaction-trigger')
    stubTrigger(trigger, { left: 12 })
    await user.click(within(trigger).getByRole('button', { name: 'Add reaction' }))
    assertFullyOnScreen(screen.getByTestId('reaction-picker'))
  })

  it('incoming left MessageRow (channel/group): same right-edge clip', async () => {
    const user = userEvent.setup()
    render(<MessageRow message={ROW} selfId="me-1" onReact={vi.fn()} />)
    const trigger = screen.getByTestId('reaction-trigger')
    stubTrigger(trigger, { left: 330 })
    await user.click(within(trigger).getByRole('button', { name: 'Add reaction' }))
    assertFullyOnScreen(screen.getByTestId('reaction-picker'))
  })

  it('outgoing right MessageRow (channel/group): same left-edge clip', async () => {
    const user = userEvent.setup()
    render(
      <MessageRow
        message={{ ...ROW, author_id: 'me-1', author_role: 'parent', author: { full_name: 'Zz Parent Probe' } }}
        selfId="me-1"
        onReact={vi.fn()}
      />,
    )
    const trigger = screen.getByTestId('reaction-trigger')
    stubTrigger(trigger, { left: 12 })
    await user.click(within(trigger).getByRole('button', { name: 'Add reaction' }))
    assertFullyOnScreen(screen.getByTestId('reaction-picker'))
  })

  it('paints against the viewport, not a padded chat row', async () => {
    const user = userEvent.setup()
    render(<ChatBubble {...BUBBLE} mine={false} />)
    const trigger = screen.getByTestId('reaction-trigger')
    stubTrigger(trigger, { left: 330 })
    await user.click(within(trigger).getByRole('button', { name: 'Add reaction' }))
    const picker = screen.getByTestId('reaction-picker')
    expect(picker.parentElement).toBe(document.body)
    expect(picker.className.split(/\s+/)).toContain('fixed')
  })
})
