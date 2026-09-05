import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// FileCard: blob download (never a signed href), type pill, shared chrome.
// FileCard and the bubble branch that must NOT render a PDF as an <img>.

vi.mock('../src/data/chatMedia.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    signChatPhotoUrl: vi.fn(async (path) => `https://signed.example/storage/v1/object/sign/chat-media/${path}?token=secret-token-abc`),
  }
})

import FileCard, { PendingFileChip } from '../src/components/FileCard.jsx'
import ChatBubble from '../src/components/ChatBubble.jsx'
import { signChatPhotoUrl } from '../src/data/chatMedia.js'

beforeEach(() => vi.clearAllMocks())

const FILE = {
  file: 'p1/uuid.xlsx',
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 20480,
  name: 'squad-list.xlsx',
}

const LONG_NAME = 'u9-saturday-training-and-match-fixture-list.xlsx'

describe('FileCard', () => {
  it('shows the original filename and a human size, not an image', async () => {
    render(<FileCard path={FILE.file} name={FILE.name} size={FILE.size} type={FILE.type} />)
    await waitFor(() => expect(screen.getByTestId('chat-file')).toBeTruthy())
    expect(screen.getByTestId('chat-file')).toHaveTextContent('squad-list.xlsx')
    expect(screen.getByTestId('chat-file')).toHaveTextContent('20 kB')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('does not render the signed storage URL as an href on the card or Download control', async () => {
    render(<FileCard path={FILE.file} name={FILE.name} size={FILE.size} type={FILE.type} />)
    const card = await screen.findByTestId('chat-file')
    expect(card.tagName).not.toBe('A')
    expect(card.querySelector('a')).toBeNull()
    expect(card.outerHTML).not.toContain('token=secret-token-abc')
    expect(card.outerHTML).not.toContain('signed.example')
    const download = screen.getByRole('button', { name: /download/i })
    expect(download.tagName).toBe('BUTTON')
    expect(download.getAttribute('href')).toBeNull()
  })

  it('shows a type pill and the full original filename in the card chrome', async () => {
    render(
      <FileCard
        path="p1/uuid.xlsx"
        name={LONG_NAME}
        size={FILE.size}
        type={FILE.type}
      />,
    )
    const card = await screen.findByTestId('chat-file')
    expect(screen.getByTestId('file-type-pill')).toHaveTextContent('XLSX')
    expect(screen.getByTestId('file-name')).toHaveTextContent(LONG_NAME)
    expect(card).toHaveTextContent('Download')
  })

  it('Download fetches the signed URL into a blob object URL — the user never sees the query string', async () => {
    const signed = 'https://signed.example/storage/v1/object/sign/chat-media/p1/uuid.xlsx?token=secret-token-abc'
    const blob = new Blob(['sheet'], { type: FILE.type })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => blob,
    })
    const created = []
    const nativeCreate = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = nativeCreate(tag, options)
      if (String(tag).toLowerCase() === 'a') {
        vi.spyOn(el, 'click').mockImplementation(() => {})
        created.push(el)
      }
      return el
    })

    const user = userEvent.setup()
    render(<FileCard path={FILE.file} name={FILE.name} size={FILE.size} type={FILE.type} />)
    await user.click(await screen.findByRole('button', { name: /download/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(signChatPhotoUrl).toHaveBeenCalledWith('p1/uuid.xlsx')
    expect(fetchMock).toHaveBeenCalledWith(signed)
    expect(created[0].href).toMatch(/^blob:/)
    expect(created[0].href).not.toContain('token=')
    expect(created[0].getAttribute('download')).toBe('squad-list.xlsx')
    expect(document.body.innerHTML).not.toContain('token=secret-token-abc')

    createSpy.mockRestore()
    fetchMock.mockRestore()
  })
})

describe('PendingFileChip — same type chrome as the sent card', () => {
  it('shows the filename and a type pill for a waiting Excel file', () => {
    const file = new File(['x'], 'grid.xlsx', { type: FILE.type })
    render(<PendingFileChip file={file} error={null} onRemove={() => {}} />)
    expect(screen.getByTestId('pending-file')).toHaveTextContent('grid.xlsx')
    expect(screen.getByTestId('file-type-pill')).toHaveTextContent('XLSX')
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
    expect(screen.getByTestId('file-type-pill')).toHaveTextContent('PDF')
    expect(screen.queryByTestId('chat-photo')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('chat-file').tagName).not.toBe('A')
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

describe('one FileCard on every chat surface — no second paste', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')

  it('chat-file markup lives only in FileCard.jsx; consumers import it', () => {
    const fileCard = readFileSync(join(root, 'src/components/FileCard.jsx'), 'utf8')
    expect(fileCard).toContain('data-testid="chat-file"')

    const consumers = [
      'src/components/ChatBubble.jsx',
      'src/screens/WelfareReports.jsx',
    ]
    for (const rel of consumers) {
      const src = readFileSync(join(root, rel), 'utf8')
      expect(src, rel).toMatch(/import FileCard from ['"].*FileCard\.jsx['"]/)
      expect(src, rel).not.toContain('data-testid="chat-file"')
    }

    const threads = ['src/components/DmThread.jsx', 'src/components/ChannelThread.jsx', 'src/components/MessageRow.jsx']
    for (const rel of threads) {
      const src = readFileSync(join(root, rel), 'utf8')
      expect(src, rel).not.toContain('data-testid="chat-file"')
      expect(src, rel).not.toMatch(/<a[^>]+href=\{[^}]*sign/)
    }
  })
})
