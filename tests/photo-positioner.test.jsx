import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import PhotoPositioner, {
  PhotoDropZone,
  clampFocus,
  focusToObjectPosition,
  isAcceptableImage,
  PHOTO_SHAPES,
  DEFAULT_FOCUS,
} from '../src/components/PhotoPositioner.jsx'

// The photo picker: a drop zone, and a focal point.
//
// ⚠️ jsdom GIVES EVERY ELEMENT A ZERO-SIZED BOX, so the drag maths cannot be
// exercised here by dragging — `getBoundingClientRect()` returns all zeros and
// every pointer position collapses to the same answer. What IS testable is the
// arithmetic, the guards, and the wiring, so those are what these assert. The
// dragging itself is verified in Chromium; see the plan.

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function imageFile(type = 'image/jpeg', name = 'face.jpg') {
  return new File(['x'], name, { type })
}

describe('clampFocus', () => {
  it('keeps a point inside the box', () => {
    expect(clampFocus({ x: -20, y: 140 })).toEqual({ x: 0, y: 100 })
  })

  it('rounds, because sub-pixel focus is noise', () => {
    expect(clampFocus({ x: 33.4, y: 66.6 })).toEqual({ x: 33, y: 67 })
  })

  // ⚠️ THE CENTRE IS THE FALLBACK FOR ANYTHING UNUSABLE, so a null column, a
  // missing row or a NaN out of bad arithmetic all render as an uncropped
  // centre rather than pinning every photo to a corner.
  it.each([undefined, null, {}, { x: NaN, y: undefined }, { x: 'left', y: 'top' }])(
    'falls back to the centre for %j',
    (value) => {
      expect(clampFocus(value)).toEqual(DEFAULT_FOCUS)
    },
  )
})

describe('focusToObjectPosition', () => {
  it('produces a CSS object-position', () => {
    expect(focusToObjectPosition({ x: 30, y: 20 })).toBe('30% 20%')
  })

  // ⚠️ THE SANITISER IS THE SECURITY PROPERTY. This value is user-controlled and
  // is written into a style attribute, so it must not be possible to smuggle
  // anything else through it. Two integers is the whole grammar.
  it('cannot pass anything but two percentages through', () => {
    expect(focusToObjectPosition({ x: '50%;background:url(x)', y: 10 })).toBe('50% 10%')
    expect(focusToObjectPosition(null)).toBe('50% 50%')
  })
})

describe('isAcceptableImage', () => {
  // ⚠️ DRAG-AND-DROP BYPASSES `accept` ENTIRELY. The file input can refuse a
  // video by attribute; a drop target is handed whatever the OS gives it, so
  // without this the two routes into the same field disagree.
  it('takes images and refuses everything else', () => {
    expect(isAcceptableImage(imageFile('image/jpeg'))).toBe(true)
    expect(isAcceptableImage(imageFile('image/png', 'a.png'))).toBe(true)
    expect(isAcceptableImage(imageFile('application/pdf', 'a.pdf'))).toBe(false)
    expect(isAcceptableImage(imageFile('video/mp4', 'a.mp4'))).toBe(false)
    expect(isAcceptableImage(null)).toBe(false)
    expect(isAcceptableImage({})).toBe(false)
  })
})

describe('PhotoDropZone', () => {
  it('hands a dropped image to its caller', () => {
    const onFile = vi.fn()
    render(<PhotoDropZone onFile={onFile} />)

    const zone = screen.getByTestId('photo-drop-zone')
    const file = imageFile()
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
  })

  // ⚠️ A DROP THAT SILENTLY DOES NOTHING READS AS A BROKEN APP, and the
  // commonest wrong drop — a PDF, a folder, a video — is an easy mistake.
  it('says so when the drop is not an image, and passes nothing on', () => {
    const onFile = vi.fn()
    render(<PhotoDropZone onFile={onFile} />)

    fireEvent.drop(screen.getByTestId('photo-drop-zone'), {
      dataTransfer: { files: [imageFile('application/pdf', 'team.pdf')] },
    })

    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/not an image/i)
  })

  // ⚠️ THE TAP TARGET IS THE PRIMARY ROUTE. This app is opened on a phone, and a
  // phone has no drag — so a real focusable file input has to exist, with
  // `accept`, whatever the drop zone does.
  it('keeps a real, labelled file input that accepts images', () => {
    render(<PhotoDropZone onFile={vi.fn()} label="Add a photo" />)

    const input = screen.getByLabelText('Add a photo')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
  })

  it('takes a chosen file from the input too', () => {
    const onFile = vi.fn()
    render(<PhotoDropZone onFile={onFile} label="Add a photo" />)

    const file = imageFile()
    fireEvent.change(screen.getByLabelText('Add a photo'), { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
  })
})

describe('PhotoPositioner', () => {
  it('renders a preview for every shape the photo is really used at', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    for (const shape of PHOTO_SHAPES) {
      expect(screen.getByTestId(`photo-preview-${shape.key}`)).toBeInTheDocument()
    }
  })

  // ⚠️ THE PREVIEWS MUST MOVE WITH THE POINT, or they are decoration rather than
  // the answer to "what will really show up".
  it('positions every preview from the focal point', () => {
    render(<PhotoPositioner url={PNG} focus={{ x: 20, y: 80 }} onFocusChange={vi.fn()} />)

    for (const shape of PHOTO_SHAPES) {
      const img = screen.getByTestId(`photo-preview-${shape.key}`).querySelector('img')
      expect(img).toHaveStyle({ objectPosition: '20% 80%' })
    }
  })

  it('shows the whole photo on the stage, so there is something to choose from', () => {
    const { container } = render(
      <PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />,
    )

    const stageImg = screen.getByTestId('photo-stage').querySelector('img')
    expect(stageImg.className).toContain('object-contain')
    expect(container.querySelectorAll('img').length).toBe(1 + PHOTO_SHAPES.length)
  })

  // ⚠️ ARROW KEYS, BECAUSE A DRAG-ONLY CONTROL IS UNUSABLE WITHOUT A POINTER.
  // jsdom cannot exercise the drag — every box is zero-sized — but it can prove
  // the keyboard path, which is the one most likely to be dropped in a rewrite.
  it('nudges the point with the arrow keys, and further with shift', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)

    const stage = screen.getByTestId('photo-stage')
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 52, y: 50 })

    fireEvent.keyDown(stage, { key: 'ArrowUp', shiftKey: true })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 40 })
  })

  it('will not nudge past the edge', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 0, y: 100 }} onFocusChange={onFocusChange} />)

    fireEvent.keyDown(screen.getByTestId('photo-stage'), { key: 'ArrowLeft' })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 0, y: 100 })
  })

  it('is reachable by keyboard and says what it is', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    const stage = screen.getByTestId('photo-stage')
    expect(stage).toHaveAttribute('tabIndex', '0')
    expect(stage.getAttribute('aria-label')).toMatch(/arrow keys/i)
  })
})
