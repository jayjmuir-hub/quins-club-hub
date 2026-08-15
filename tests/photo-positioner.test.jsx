import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import PhotoPositioner, {
  PhotoDropZone,
  clampFocus,
  focusToObjectPosition,
  isAcceptableImage,
  PHOTO_SHAPES,
  DEFAULT_FOCUS,
  safeZone,
  safeWindow,
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

const close = (a, b) => expect(a).toBeCloseTo(b, 4)

// ⚠️ THE GUIDE CIRCLE'S ARITHMETIC, WHICH IS THE ONE PART OF THIS FEATURE jsdom
// CAN ACTUALLY JUDGE. Everything about the overlay's appearance needs a browser;
// the geometry behind it is pure arithmetic over the photo's aspect ratio, and
// it is the half that can be wrong in a way nobody notices — a circle that is
// merely plausible looks exactly like a circle that is right.
describe('safeZone — what survives every shape', () => {
  // A 4:3 landscape photo. The lead tile is a 1:4 strip, so it keeps a narrow
  // vertical band: 0.2458 ÷ 1.3333. The half tile is 1.88:1, so it keeps
  // 1.3333 ÷ 1.8824 of the height. Those two are the binding constraints and
  // the square header face binds neither.
  it('takes the tightest constraint on each axis independently', () => {
    const { width, height } = safeZone(4 / 3)
    close(width, 175 / 712 / (4 / 3))
    close(height, 4 / 3 / (256 / 136))
  })

  // A portrait photo — which a head shot usually is — is cropped by different
  // shapes than a landscape one, so this is not the same test twice.
  it('binds differently on a portrait photo', () => {
    const { width, height } = safeZone(3 / 4)
    close(width, 175 / 712 / (3 / 4))
    close(height, 3 / 4 / (256 / 136))
  })

  // ⚠️ NEVER MORE THAN THE WHOLE PHOTO, whatever it is handed. A fraction above
  // 1 would draw a circle larger than the image and promise a region that does
  // not exist.
  it.each([1, 0.2, 5, 1 / 3])('never exceeds the photo itself (aspect %s)', (p) => {
    const { width, height } = safeZone(p)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(width).toBeLessThanOrEqual(1)
    expect(height).toBeLessThanOrEqual(1)
  })

  // The same fallback rule clampFocus follows: nothing usable means the centre,
  // and a NaN aspect out of a zero-height image must not produce a NaN circle.
  it.each([undefined, null, 0, -2, NaN])('falls back to a square photo (%s)', (bad) => {
    const { width, height } = safeZone(bad)
    expect(Number.isFinite(width)).toBe(true)
    expect(Number.isFinite(height)).toBe(true)
  })
})

describe('safeWindow — where the guide sits', () => {
  it('centres on the photo when the point is centred', () => {
    const { left, top, width, height } = safeWindow(4 / 3, { x: 50, y: 50 })
    close(left + width / 2, 0.5)
    close(top + height / 2, 0.5)
  })

  // ⚠️ THE OUTLINE STOPS SHORT OF THE EDGE WHILE THE POINT REACHES IT, AND THAT
  // IS THE BEHAVIOUR WORTH TESTING. `object-position: 0%` does not centre the
  // crop on the left edge, it BUTTS the window against it — so the visible
  // region can never straddle the edge, and an outline that followed the point
  // all the way would promise a region the tiles never show.
  it('butts against the edge rather than hanging over it', () => {
    const atOrigin = safeWindow(4 / 3, { x: 0, y: 0 })
    close(atOrigin.left, 0)
    close(atOrigin.top, 0)

    const atCorner = safeWindow(4 / 3, { x: 100, y: 100 })
    close(atCorner.left + atCorner.width, 1)
    close(atCorner.top + atCorner.height, 1)
  })

  // ⚠️ NEVER DRAWN OUTSIDE THE PHOTO, at any focal point or aspect ratio. An
  // outline running off the picture reads as "the safe area continues past the
  // edge", which is the opposite of what it is for — and it would be clipped by
  // the stage, so it would look deliberate.
  it('stays inside the photo', () => {
    for (const p of [4 / 3, 3 / 4, 1, 16 / 9, 9 / 16]) {
      for (const focus of [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 12, y: 87 }]) {
        const { left, top, width, height } = safeWindow(p, focus)
        expect(left).toBeGreaterThanOrEqual(-1e-9)
        expect(top).toBeGreaterThanOrEqual(-1e-9)
        expect(left + width).toBeLessThanOrEqual(1 + 1e-9)
        expect(top + height).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  // ⚠️ THE REGRESSION THAT FORCED THE REDESIGN, PINNED AS A TEST. The first
  // version drew the largest CIRCLE that fits — 18% wide on a 4:3 photo, floating
  // at mid-height — and a face at the top of the frame fell OUTSIDE it while the
  // Featured preview beside it plainly showed that face. Seen in Chromium, which
  // is the only place it could be seen. The window must actually contain the
  // point that produced it.
  it('contains the focal point that produced it', () => {
    for (const p of [4 / 3, 3 / 4, 16 / 9]) {
      for (const focus of [{ x: 50, y: 28 }, { x: 50, y: 50 }, { x: 20, y: 80 }, { x: 0, y: 0 }]) {
        const { left, top, width, height } = safeWindow(p, focus)
        expect(focus.x / 100).toBeGreaterThanOrEqual(left - 1e-9)
        expect(focus.x / 100).toBeLessThanOrEqual(left + width + 1e-9)
        expect(focus.y / 100).toBeGreaterThanOrEqual(top - 1e-9)
        expect(focus.y / 100).toBeLessThanOrEqual(top + height + 1e-9)
      }
    }
  })
})

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

describe('isAcceptableImage — HEIC and friends', () => {
  // ⚠️ HEIC IS `image/*` AND MUST STILL BE REFUSED — review finding, 15 Aug
  // 2026. Every iPhone shoots HEIC by default; browsers cannot RENDER it, so
  // accepting it produced a blank preview and a failure at save, two steps
  // removed from the mistake. The drop is the one moment the person is still
  // holding the file they need to swap.
  it('refuses HEIC even though it is an image', () => {
    const f = (type) => new File(['x'], 'a', { type })
    expect(isAcceptableImage(f('image/heic'))).toBe(false)
    expect(isAcceptableImage(f('image/heif'))).toBe(false)
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
  it('keeps a real, labelled file input that accepts images', () => {
    render(<PhotoDropZone onFile={vi.fn()} label="Add a photo" />)

    const input = screen.getByLabelText('Add a photo')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
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
    // ⚠️ IT WAS `w-full object-contain` UNTIL 15 Aug 2026, AND THE CHANGE IS A
    // CORRECTNESS FIX. Contain letterboxes, so a PORTRAIT photo — which a head
    // shot usually is — sat pillarboxed inside a wider interactive box, and the
    // drag maths measured that box: a tap on the grey strip beside the photo
    // produced a focal point past the edge of the image. Shrink-wrapping the box
    // to the image means there is no strip and the percentages are exact.
    expect(stageImg.className).toContain('max-w-full')
    expect(stageImg.className).toContain('max-h-[280px]')
    // ⚠️ A CLASS LIST IS A LIST, NOT A STRING. `toContain('w-full')` matches
    // inside `max-w-full` and passed against the very layout it was meant to
    // rule out; split on whitespace and check for the exact class.
    expect(stageImg.className.split(/\s+/)).not.toContain('w-full')
    expect(stageImg.className.split(/\s+/)).not.toContain('object-contain')
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

  // ⚠️ NOTHING IS DRAWN UNTIL THE IMAGE HAS DECODED, because the circle depends
  // entirely on the photo's own proportions. A circle drawn from a guess and
  // then corrected would jump the moment the photo appeared, under the finger.
  it('draws no guide outline until the photo has loaded', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)
    expect(screen.queryByTestId('photo-safe-zone')).not.toBeInTheDocument()
  })

  it('draws the guide outline once the photo reports its size', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    // jsdom never decodes an image, so `naturalWidth`/`naturalHeight` are 0 and
    // no load event fires on its own. Standing in a 4:3 photo is the only way to
    // reach the branch at all.
    const img = screen.getByTestId('photo-stage').querySelector('img')
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    fireEvent.load(img)

    const guide = screen.getByTestId('photo-safe-zone')
    const { left, top, width, height } = safeWindow(4 / 3, DEFAULT_FOCUS)
    expect(guide.style.left).toBe(`${left * 100}%`)
    expect(guide.style.top).toBe(`${top * 100}%`)
    expect(guide.style.width).toBe(`${width * 100}%`)
    expect(guide.style.height).toBe(`${height * 100}%`)
    // ⚠️ FULLY ROUNDED, WHICH IS THE HALF OF JAY'S REQUEST THAT SURVIVED. He
    // asked for a circle; the true region is a tall narrow window, so it is
    // drawn as that window with rounded ends rather than as a circle inscribed
    // in it, which under-promised badly.
    expect(guide.className).toContain('rounded-full')
  })

  // ⚠️ A ZERO-SIZED IMAGE IS WHAT A BROKEN ONE REPORTS, and dividing by it gives
  // a NaN outline — an element with `left: NaN%`, which renders as nothing and
  // would be silent. Guarded at the source.
  it('ignores a load event from an image with no dimensions', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    const img = screen.getByTestId('photo-stage').querySelector('img')
    Object.defineProperty(img, 'naturalWidth', { value: 0, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 0, configurable: true })
    fireEvent.load(img)

    expect(screen.queryByTestId('photo-safe-zone')).not.toBeInTheDocument()
  })

  it('is reachable by keyboard and says what it is', () => {
    render(<PhotoPositioner url={PNG} focus={DEFAULT_FOCUS} onFocusChange={vi.fn()} />)

    const stage = screen.getByTestId('photo-stage')
    expect(stage).toHaveAttribute('tabIndex', '0')
    expect(stage.getAttribute('aria-label')).toMatch(/arrow keys/i)
  })
})
