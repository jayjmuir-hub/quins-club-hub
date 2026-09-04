import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// FileCard and the bubble branch that must NOT render a PDF as an <img>.

vi.mock('../src/data/chatMedia.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    signChatPhotoUrl: vi.fn(async (path) => `signed:${path}`),
  }
})

import FileCard from '../src/components/FileCard.jsx'
import ChatBubble from '../src/components/ChatBubble.jsx'
import { signChatPhotoUrl } from '../src/data/chatMedia.js'

beforeEach(() => vi.clearAllMocks())

const FILE = {
  file: 'p1/uuid.xlsx',
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 20480,
  name: 'squad-list.xlsx',
}

describe('FileCard', () => {
  it('shows the original filename and a human size, not an image', async () => {
    render(<FileCard path={FILE.file} name={FILE.name} size={FILE.size} />)
    await waitFor(() => expect(screen.getByTestId('chat-file')).toBeTruthy())
    expect(screen.getByTestId('chat-file')).toHaveTextContent('squad-list.xlsx')
    expect(screen.getByTestId('chat-file')).toHaveTextContent('20 kB')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('tap opens the signed URL', async () => {
    const user = userEvent.setup()
    render(<FileCard path={FILE.file} name={FILE.name} size={FILE.size} />)
    const link = await screen.findByTestId('chat-file')
    expect(link).toHaveAttribute('href', 'signed:p1/uuid.xlsx')
    expect(link).toHaveAttribute('target', '_blank')
    expect(signChatPhotoUrl).toHaveBeenCalledWith('p1/uuid.xlsx')
    await user.click(link)
  })
})

describe('ChatBubble — a file is not a broken photo', () => {
  it('renders FileCard for a pdf path and never an img', async () => {
    render(
      <ChatBubble
        mine={false}
        messageId="m1"
        body=""
        photoPath="p1/uuid.pdf"
        attachments={[{ file: 'p1/uuid.pdf', type: 'application/pdf', size: 4096, name: 'notes.pdf' }]}
        createdAt="2026-09-04T10:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('chat-file')).toBeTruthy())
    expect(screen.getByTestId('chat-file')).toHaveTextContent('notes.pdf')
    expect(screen.queryByTestId('chat-photo')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('still renders a photo when the path is a jpeg', async () => {
    render(
      <ChatBubble
        mine
        messageId="m2"
        body=""
        photoPath="p1/pic.jpg"
        createdAt="2026-09-04T10:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('chat-photo')).toBeTruthy())
    expect(screen.queryByTestId('chat-file')).toBeNull()
  })
})
