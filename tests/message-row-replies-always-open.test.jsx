import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// 4 Sep 2026, Jay: "people shouldn't have to click the 1 reply or whatever
// number to see it, like me people will be confused." Replies under a channel
// post were folded behind an 11px "N replies" toggle from the first squad-chat
// build (23 Aug, #326); a reply to the second-to-last post in the Age Group
// Managers channel was promised by the chat list and invisible in the chat.
// Threads stay — a reply still sits under the post it answers — but they are
// open all the time. The toggle is gone. What still opens on demand is the
// inline reply COMPOSER, via the Reply menu item or the announce-only
// affordance, because a text box under every post would be noise.

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

import MessageRow from '../src/components/MessageRow.jsx'

const OTHER = 'zz-manager-probe'
function msg(id, body, extra = {}) {
  return {
    id,
    author_id: OTHER,
    author_role: 'manager',
    author: { full_name: 'Zz Manager Probe' },
    body,
    created_at: '2026-09-03T16:45:00Z',
    deleted_at: null,
    pinned: false,
    forwarded: false,
    attachment_path: null,
    replies: [],
    ...extra,
  }
}
const withReply = msg('p-1', 'Please send me your list', {
  replies: [msg('r-1', 'Including those who need training?', { parent_id: 'p-1' })],
})

function renderRow(props) {
  return render(
    <MemoryRouter>
      <MessageRow message={withReply} selfId="me-1" {...props} />
    </MemoryRouter>,
  )
}

describe('MessageRow — replies are always on screen', () => {
  it('shows a reply under its post with no tap, and there is no "1 reply" toggle to find', () => {
    renderRow({ onReply: vi.fn() })
    expect(screen.getByText('Including those who need training?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^\d+ repl/ })).toBeNull()
  })

  it('CONTROL: the reply composer is NOT open by default — Reply in the menu opens it', async () => {
    const user = userEvent.setup()
    renderRow({ onReply: vi.fn() })
    expect(screen.queryByLabelText('Reply')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reply' }))
    expect(screen.getByLabelText('Reply')).toBeInTheDocument()
    // The reply itself never went anywhere.
    expect(screen.getByText('Including those who need training?')).toBeInTheDocument()
  })

  it('CONTROL: a deleted post shows no thread', () => {
    render(
      <MemoryRouter>
        <MessageRow message={{ ...withReply, deleted_at: '2026-09-04T01:00:00Z' }} selfId="me-1" onReply={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Including those who need training?')).toBeNull()
  })

  it('announce-only: the Reply affordance shows under an ANSWERED post too — the thread is the only door', async () => {
    const user = userEvent.setup()
    renderRow({ onReply: vi.fn(), announceOnly: true })
    const affordance = screen.getByTestId('reply-affordance')
    await user.click(affordance)
    expect(screen.getByLabelText('Reply')).toBeInTheDocument()
    expect(screen.queryByTestId('reply-affordance')).toBeNull()
  })

  it('forceOpen (the ?thread= deep link) opens the composer on arrival', () => {
    renderRow({ onReply: vi.fn(), forceOpen: true })
    expect(screen.getByLabelText('Reply')).toBeInTheDocument()
  })
})
