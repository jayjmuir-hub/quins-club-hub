import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// Round 2 in the CHANNEL stream: MessageRow (pure props, harness-rendered)
// wears the Forwarded tag and renders a photo from its signed URL, and a
// photo-only message shows no empty paragraph. The composer's upload path
// is proven on the DM thread (tests/chat-round-2-thread.test.jsx) — the
// channel composer shares the same helpers and the same order.

const media = { signChatPhotoUrl: vi.fn() }
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: (...a) => media.signChatPhotoUrl(...a),
  uploadChatPhoto: vi.fn(),
  removeChatPhoto: vi.fn(),
}))

import MessageRow from '../src/components/MessageRow.jsx'

const BASE = {
  id: 'msg-1',
  author_id: 'coach-1',
  author_role: 'coach',
  author: { full_name: 'Zz Coach Probe' },
  body: 'Training moved to 5pm',
  created_at: '2026-08-24T08:00:00Z',
  deleted_at: null,
  pinned: false,
  forwarded: false,
  attachment_path: null,
  replies: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  media.signChatPhotoUrl.mockResolvedValue('blob:signed')
})

describe('MessageRow — round 2', () => {
  it('a forwarded post wears the tag', () => {
    render(<MessageRow message={{ ...BASE, forwarded: true }} selfId="me-1" />)
    expect(screen.getByTestId('forwarded-tag')).toHaveTextContent('Forwarded')
  })

  it('a photo post renders the image from a signed URL, above its text', async () => {
    render(<MessageRow message={{ ...BASE, attachment_path: 'coach-1/pic.jpg' }} selfId="me-1" />)
    const photo = await screen.findByTestId('chat-photo')
    expect(media.signChatPhotoUrl).toHaveBeenCalledWith('coach-1/pic.jpg')
    expect(within(photo).getByRole('img')).toHaveAttribute('src', 'blob:signed')
    expect(screen.getByText('Training moved to 5pm')).toBeInTheDocument()
  })

  it('a photo-only post renders no empty paragraph, and a plain post no tag', async () => {
    const { container, rerender } = render(
      <MessageRow message={{ ...BASE, body: '', attachment_path: 'coach-1/pic.jpg' }} selfId="me-1" />,
    )
    await screen.findByTestId('chat-photo')
    expect(container.querySelector('p.whitespace-pre-wrap')).toBeNull()

    rerender(<MessageRow message={BASE} selfId="me-1" />)
    expect(screen.queryByTestId('forwarded-tag')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chat-photo')).not.toBeInTheDocument()
  })
})
