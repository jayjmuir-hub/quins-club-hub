import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import PhotoPositioner, {
  PhotoDropZone,
  clampFocus,
  focusToObjectPosition,
  isAcceptableImage,
  DEFAULT_FOCUS,
} from '../src/components/PhotoPositioner.jsx'

// The photo picker: a drop zone, and ONE circle you slide the photo under.
//
// ⚠️ THE THREE-SHAPE PREVIEW STRIP AND THE SAFE-ZONE OVERLAY ARE GONE — 26 Aug
// 2026 (claude/plans/2026-08-26-photo-pipeline-and-positioner.md). The shapes
// were measured from a SquadStaffCard layout that no longer exists; every real
// surface today is 1:1, so one circular view is the truth and the old strip
// had become the lie its own comment warned about. safeZone/safeWindow and
// their tests went with it.
//
// ⚠️ jsdom GIVES EVERY ELEMENT A ZERO-SIZED BOX, so the drag maths is
// exercised here by MOCKING getBoundingClientRect on the stage — the geometry
// is then plain arithmetic jsdom can judge. The real feel of the drag is
// verified in Chromium via the harness scenario, as before.

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

  // ⚠️ REVERSED ON 26 Aug 2026 — HEIC IS NOW ACCEPTED. The 15 Aug refusal
  // existed because the uploaders refused HEIC, and the two routes had to
  // agree. They still agree, in the other direction: preparePhotoUpload
  // re-encodes a decodable HEIC to JPEG and refuses an undecodable one with
  // plain advice, so the drop may take it. iPhones shoot HEIC by default —
  // this is the common case, not the odd one.
  it('accepts HEIC now that the upload gate can digest it', () => {
    const f = (type) => new File(['x'], 'a', { type })
    expect(isAcceptableImage(f('image/heic'))).toBe(true)
    expect(isAcceptableImage(f('image/heif'))).toBe(true)
    expect(isAcceptableImage(f('image/webp'))).toBe(true)
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
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/i)
  })

  // ⚠️ THE TAP TARGET IS THE PRIMARY ROUTE. This app is opened on a phone, and a
  // phone has no drag — so a real focusable file input has to exist, with
  // `accept`, whatever the drop zone does.
  it('keeps a real, labelled file input that accepts images, HEIC included', () => {
    render(<PhotoDropZone onFile={vi.fn()} label="Add a photo" />)

    const input = screen.getByLabelText('Add a photo')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/heic,image/heif')
  })

  it('takes a chosen file from the input too', () => {
    const onFile = vi.fn()
    render(<PhotoDropZone onFile={onFile} label="Add a photo" />)

    const file = imageFile()
    fireEvent.change(screen.getByLabelText('Add a photo'), { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
  })
})

// ── The one-circle stage ────────────────────────────────────────────────────

// Load the stage's image at a given natural size. jsdom never decodes, so the
// dimensions are defined by hand and the load event fired.
function loadStageImage(width, height) {
  const img = screen.getByTestId('photo-stage').querySelector('img')
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(img)
  return img
}

// The stage is a square viewport; jsdom's boxes are zero-sized, so the drag
// maths needs the rect supplied. 240 matches the real rendered size.
const STAGE = 240

function mockStageRect() {
  const stage = screen.getByTestId('photo-stage')
  stage.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: STAGE,
    height: STAGE,
    right: STAGE,
    bottom: STAGE,
    x: 0,
    y: 0,
  })
  return stage
}

beforeEach(() => {
  // Run animation frames synchronously so a pointermove's effect is visible
  // in the same tick the event fires.
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    callback()
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhotoPositioner — one circle, slide the photo', () => {
  it('renders ONE image, in a circular viewport, positioned from the focus', () => {
    const { container } = render(
      <PhotoPositioner url={PNG} focus={{ x: 20, y: 80 }} onFocusChange={vi.fn()} />,
    )

    // ⚠️ ONE image. The old three-shape preview strip rendered four; the strip
    // previewed tile shapes that no longer exist anywhere in the app.
    expect(container.querySelectorAll('img').length).toBe(1)

    const stage = screen.getByTestId('photo-stage')
    expect(stage.className.split(/\s+/)).toContain('rounded-full')

    const img = stage.querySelector('img')
    // The same object-position path every real avatar renders with — that is
    // what makes this preview honest.
    expect(img).toHaveStyle({ objectPosition: '20% 80%' })
    expect(img.className.split(/\s+/)).toContain('object-cover')
  })

  // ⚠️ THE CONTRACT CHANGE, AND THE TEST THAT DISCRIMINATES AGAINST THE OLD
  // MARKER-DRAG. Dragging now moves the PHOTO under the circle: dragging LEFT
  // slides the photo left, so the viewer sees more of its RIGHT side — focus x
  // INCREASES. The old stage set focus from the pointer's absolute position,
  // which for this gesture would produce x≈42, not 75.
  it('slides a landscape photo horizontally: drag left, focus goes right', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(800, 600) // aspect 4:3 → overflow = 240·(4/3 − 1) = 80px
    const stage = mockStageRect()

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 100, clientY: 120 })

    // Δpx −20 over 80px of overflow → focus x: 50 + 25 = 75.
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 75, y: 50 })
  })

  it('locks the axis with no overflow: vertical drag on a landscape photo does nothing', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(800, 600)
    const stage = mockStageRect()

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 120, clientY: 60 })

    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 })
  })

  it('slides a portrait photo vertically', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(600, 800) // aspect 3:4 → vertical overflow = 240·(4/3 − 1) = 80px
    const stage = mockStageRect()

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 120, clientY: 160 })

    // Photo dragged DOWN 40px → focus y decreases by 40/80·100 = 50 → 0.
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 0 })
  })

  // ⚠️ TRUTHFUL, NOT BROKEN. A square photo fills a square viewport exactly —
  // there is nothing to choose, so nothing moves. (Photos uploaded before 26
  // Aug 2026 are all squares; they behave like this until re-uploaded.)
  it('does not move at all for a square photo', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(600, 600)
    const stage = mockStageRect()

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 60, clientY: 60 })

    expect(onFocusChange).not.toHaveBeenCalled()
  })

  it('ignores a drag before the photo has reported its size', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    const stage = mockStageRect()

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 120, clientY: 120 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 60, clientY: 120 })

    expect(onFocusChange).not.toHaveBeenCalled()
  })

  // ⚠️ ARROW KEYS, BECAUSE A DRAG-ONLY CONTROL IS UNUSABLE WITHOUT A POINTER.
  // Same metaphor as the drag: the arrows move the PHOTO. ArrowLeft slides it
  // left, revealing more of the right — focus x increases.
  it('nudges the photo with the arrow keys, further with shift, on the live axis only', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 50, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(800, 600)

    const stage = screen.getByTestId('photo-stage')
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 52, y: 50 })

    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 40, y: 50 })

    // The vertical axis has no overflow on a landscape photo: a nudge there
    // would change the stored number while the picture visibly stood still.
    onFocusChange.mockClear()
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    expect(onFocusChange).not.toHaveBeenCalled()
  })

  it('will not nudge past the edge', () => {
    const onFocusChange = vi.fn()
    render(<PhotoPositioner url={PNG} focus={{ x: 100, y: 50 }} onFocusChange={onFocusChange} />)
    loadStageImage(800, 600)

    fireEvent.keyDown(screen.getByTestId('photo-stage'), { key: 'ArrowLeft' })
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 100, y: 50 })
  })

  // ⚠️ A PHOTO THE BROWSER CANNOT DECODE — a HEIC dropped on a non-Apple
  // machine — must say so HERE, while the person is still holding the file,
  // with the same advice the upload gate gives. A blank circle and a failure
  // at save is the 15 Aug review finding all over again.
  it('says a photo could not be read, instead of showing an empty circle', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    const img = screen.getByTestId('photo-stage').querySelector('img')
    fireEvent.error(img)

    expect(screen.getByRole('alert')).toHaveTextContent(/could not (be read|read that photo)/i)
  })

  it('is reachable by keyboard and says what it is', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    const stage = screen.getByTestId('photo-stage')
    expect(stage).toHaveAttribute('tabIndex', '0')
    expect(stage.getAttribute('aria-label')).toMatch(/arrow keys/i)
  })
})
