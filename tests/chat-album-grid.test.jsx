import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

    it('⚠️ both arrows always EXIST — disabled at the ends, never removed', async () => {
      // Jay, 1 Sep 2026, on the first real album: "there is no back button when
      // clicking through them, there is a forward button though." He had opened
      // the FIRST photo, where the old guard removed the control entirely, so
      // the lightbox read as one-way and broken. A disabled arrow says "you are
      // at the start" without the button vanishing.
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(2)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(2))

      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      const back = screen.getByLabelText('Previous photo')
      // ⚠️ toBeVisible, NOT just "is in the document". getByLabelText finds an
      // element even when it carries `hidden`, so an assertion that only looks
      // it up passes against the ORIGINAL BUG — proven by injecting exactly
      // that and watching all 17 tests stay green.
      expect(back).toBeVisible()
      expect(back).toBeDisabled()
      expect(screen.getByLabelText('Next photo')).toBeEnabled()
      // ⚠️ DISABLED MUST STILL BE VISIBLE. An invisible disabled arrow is the
      // original complaint again wearing a different hat, and `toBeDisabled()`
      // passes either way — this caught exactly that mistake once already.
      expect(back.className).not.toContain('disabled:opacity-0"')
      expect(back.className).toMatch(/disabled:opacity-[1-9]/)

      await user.click(screen.getByLabelText('Next photo'))
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('2 / 2')
      // ...and at the last photo it is the forward arrow that goes quiet.
      expect(screen.getByLabelText('Next photo')).toBeDisabled()
      expect(screen.getByLabelText('Previous photo')).toBeEnabled()
    })

    it('⚠️ a disabled arrow does not move the album', async () => {
      // pointer-events-none plus `disabled` — if either were missing, clicking
      // the dimmed control would still step and the clamp would be cosmetic.
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      await user.click(screen.getByLabelText('Previous photo')).catch(() => {})
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 3')
    })

    it('⚠️ the arrows are vertically centred, not left to the static position', () => {
      // They carried left-3/right-3 and NO top/bottom inside a
      // `grid place-items-center` parent, which left the block axis undefined
      // by intent. jsdom does no layout, so this pins the CLASS rather than the
      // geometry — the honest limit of what a unit test can see here.
      render(<ChatAlbum attachments={album(2)} />)
      return waitFor(() => {
        const tiles = screen.getAllByTestId('chat-album-tile')
        expect(tiles).toHaveLength(2)
      }).then(async () => {
        const user = userEvent.setup()
        await user.click(screen.getAllByTestId('chat-album-tile')[0])
        for (const label of ['Previous photo', 'Next photo']) {
          const cls = screen.getByLabelText(label).className
          expect(cls).toContain('top-1/2')
          expect(cls).toContain('-translate-y-1/2')
        }
      })
    })

    it('swipes left and right, and ignores a vertical drag', async () => {
      render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      const user = userEvent.setup()
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      const box = screen.getByTestId('chat-album-lightbox')

      const swipe = (fromX, toX, fromY = 100, toY = 100) => {
        fireEvent.touchStart(box, { changedTouches: [{ clientX: fromX, clientY: fromY }] })
        fireEvent.touchEnd(box, { changedTouches: [{ clientX: toX, clientY: toY }] })
      }

      swipe(300, 100) // leftwards -> forward
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('2 / 3')
      swipe(100, 300) // rightwards -> back
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 3')

      swipe(300, 280) // under the 40px threshold: a shaky tap, not a swipe
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 3')
      swipe(300, 100, 100, 400) // travels further vertically: a scroll attempt
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 3')
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

    it('⚠️ clicking the DISABLED back arrow does not close the album', async () => {
      // Jay, 1 Sep 2026: "the back button shows sometimes but doesn't work".
      // With `pointer-events-none` on the disabled state the click fell straight
      // through to the backdrop, which closed the whole album — so the dead
      // control was worse than dead, it was destructive.
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      const back = screen.getByLabelText('Previous photo')
      // ⚠️ ASSERTED AS A CLASS, NOT AS BEHAVIOUR, AND THAT IS A REAL LIMIT.
      // jsdom loads no Tailwind stylesheet, so `disabled:pointer-events-none`
      // computes to nothing here and clicking behaves identically with or
      // without it — injecting the class back left all 20 tests green. The class
      // list is the only thing this suite can actually see.
      expect(back.className.split(/\s+/)).not.toContain('disabled:pointer-events-none')
      await user.click(back)
      expect(screen.getByTestId('chat-album-lightbox')).toBeTruthy()
      expect(screen.getByTestId('chat-album-counter')).toHaveTextContent('1 / 3')
    })

    it('⚠️ clicking the photo does not close it — only the backdrop does', async () => {
      // Jay, 1 Sep 2026: "sometimes when the first pic opens and you click the
      // forward arrow the pictures close". A bare onClick={close} on the
      // backdrop fires for ANY bubbled click, so a tap that narrowly missed a
      // moving arrow dismissed the album. A miss should cost nothing.
      const user = userEvent.setup()
      const { container } = render(<ChatAlbum attachments={album(3)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(3))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])

      const shown = [...container.querySelectorAll('img')].find((i) => i.alt.includes('Shared photo 1 of 3'))
      await user.click(shown)
      expect(screen.getByTestId('chat-album-lightbox')).toBeTruthy()

      // ...but the backdrop itself still dismisses.
      await user.click(screen.getByTestId('chat-album-lightbox'))
      expect(screen.queryByTestId('chat-album-lightbox')).toBeNull()
    })

    it('⚠️ the stage geometry does not depend on the image', async () => {
      // Jay, 1 Sep 2026: "sometimes the buttons are in the middle and sometimes
      // the bottom, very buggy". The stage used to size itself to the photo, so
      // every control moved as images loaded and as portrait/landscape
      // alternated. jsdom does no layout, so this pins the CLASSES that make the
      // box independent of its contents — the honest limit of a unit test here.
      const user = userEvent.setup()
      render(<ChatAlbum attachments={album(2)} />)
      await waitFor(() => expect(screen.getAllByTestId('chat-album-tile')).toHaveLength(2))
      await user.click(screen.getAllByTestId('chat-album-tile')[0])
      const stage = screen.getByLabelText('Next photo').parentElement
      // ⚠️ EXACT CLASS TOKENS, NOT toContain. `max-h-full` CONTAINS the substring
      // `h-full`, so a substring check passes against the very regression this
      // pins — proven by injecting the old image-sized stage and watching all 20
      // stay green.
      const stageClasses = stage.className.split(/\s+/)
      expect(stageClasses).toContain('h-full')
      expect(stageClasses).toContain('w-full')
      expect(stageClasses).not.toContain('max-h-full')
      // and the arrows must sit ABOVE the photo, or a big picture covers them
      expect(screen.getByLabelText('Next photo').className.split(/\s+/)).toContain('z-10')
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
