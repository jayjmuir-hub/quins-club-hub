import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Plan 3 of the chat photo albums work — the GRID.
// claude/plans/2026-08-31-chat-photo-albums.md.
//
// The composer could send ten photos as one message from #605; every one of
// them arrived and exactly one rendered, because the bubble read the
// trigger-derived `attachment_path` (the FIRST photo) instead of the
// `attachments` array. These tests pin the difference.

vi.mock('../src/data/chatMedia.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // Signing is a network call; the album's job is layout and navigation.
    // The real isAudioAttachment is kept, because the audio filter is one of
    // the behaviours under test and mocking it would test nothing.
    signChatPhotoUrl: vi.fn(async (path) => `signed:${path}`),
  }
})

import ChatAlbum from '../src/components/ChatAlbum.jsx'
import { attachmentPreviewLabel } from '../src/data/chatMedia.js'

const photo = (n) => ({ file: `p1/${n}.jpg`, type: 'image/jpeg', size: 100, name: `${n}.jpg` })
const album = (n) => Array.from({ length: n }, (_, i) => photo(i + 1))

beforeEach(() => vi.clearAllMocks())

describe('ChatAlbum', () => {
  it('CONTROL: a single photo still renders one tile', async () => {
    // If this ever renders zero, every "renders N" below is meaningless.
    render(<ChatAlbum attachments={album(1)} />)
    await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(1))
  })

  it('⚠️ renders every photo of a small album — the bug was one', async () => {
    const { container } = render(<ChatAlbum attachments={album(3)} />)
    await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
    // And each tile gets its OWN signed url, not the first one repeated —
    // which is exactly the bug this plan fixes.
    //
    // ⚠️ QUERIED BY TAG, NOT BY ROLE. The tiles carry alt="" on purpose: the
    // enclosing button already announces "View photo 2 of 3", and a duplicate
    // label on the image would make a screen reader say it twice. An empty alt
    // makes the image PRESENTATIONAL, so getAllByRole('img') finds none of
    // them — the first version of this test failed for that reason.
    const sources = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(sources).toHaveLength(3)
    expect(new Set(sources).size).toBe(3)
  })

  it('caps at four tiles and counts the rest', async () => {
    render(<ChatAlbum attachments={album(10)} />)
    await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(4))
    expect(screen.getByTestId('chat-album-more')).toHaveTextContent('+6')
    // The full count survives on the container, so the album knows it is ten
    // even though it draws four.
    expect(screen.getByTestId('chat-album')).toHaveAttribute('data-count', '10')
  })

  it('shows no "+N" badge when everything fits', async () => {
    render(<ChatAlbum attachments={album(4)} />)
    await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(4))
    expect(screen.queryByTestId('chat-album-more')).toBeNull()
  })

  it('⚠️ a voice note is filtered out, not drawn as a blank tile', async () => {
    const mixed = [photo(1), { file: 'p1/note.webm', type: 'audio/webm', size: 10, name: 'n.webm' }]
    render(<ChatAlbum attachments={mixed} />)
    await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(1))
  })

  it('renders nothing at all for an empty list', () => {
    const { container } = render(<ChatAlbum attachments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('the lightbox', () => {
    it('opens on the tile that was tapped, not always the first', async () => {
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(4)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(4))
      await user.click(screen.getAllByTestId('chat-album-tile')[2])
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('3 / 4')
    })

    it('steps forward and back', async () => {
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(4)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(4))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      await user.click(screen.getByLabelText('Next photo'))
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('2 / 4')
      await user.click(screen.getByLabelText('Previous photo'))
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 4')
    })

    it('⚠️ clamps at both ends rather than wrapping', async () => {
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(2)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(2))
      // At the first photo there is no "previous" to press at all...
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      expect(screen.queryByLabelText('Previous photo')).toBeNull()
      // ...and at the last there is no "next".
      await user.click(screen.getByLabelText('Next photo'))
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('2 / 2')
      expect(screen.queryByLabelText('Next photo')).toBeNull()
    })

    it('closes on the backdrop and on Escape', async () => {
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      await user.click(screen.getByTestId('chat-album-lightbox'))
      expect(screen.queryByTestId('chat-album-lightbox')).toBeNull()

      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      await user.keyboard('{Escape}')
      expect(screen.queryByTestId('chat-album-lightbox')).toBeNull()
    })

    it('⚠️ an arrow press does not dismiss the lightbox', async () => {
      // The backdrop closes on click and the arrows sit inside it, so without
      // stopPropagation the first tap on "next" would close the album instead
      // of moving through it.
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      await user.click(screen.getByLabelText('Next photo'))
      expect(screen.getByTestId('chat-album-lightbox')).toBeTruthy()
    })
  })
})

describe('attachmentPreviewLabel', () => {
  it('CONTROL: keeps its old single-argument behaviour', () => {
    // Four screens and eleven test files call it with a path alone.
    expect(attachmentPreviewLabel('p1/x.jpg')).toBe('📷 Photo')
    expect(attachmentPreviewLabel('p1/x.webm')).toBe('🎤 Voice message')
  })

  it('counts an album', () => {
    expect(attachmentPreviewLabel('p1/x.jpg', 10)).toBe('📷 10 photos')
    expect(attachmentPreviewLabel('p1/x.jpg', 2)).toBe('📷 2 photos')
  })

  it('a single photo is not "1 photos"', () => {
    expect(attachmentPreviewLabel('p1/x.jpg', 1)).toBe('📷 Photo')
    expect(attachmentPreviewLabel('p1/x.jpg', 0)).toBe('📷 Photo')
  })
})
