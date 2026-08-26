import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { preparePhotoUpload, resizePhoto, resizePhotoFit } from '../src/lib/imageResize.js'

// Tests for src/lib/imageResize.js.
//
// jsdom has no canvas and no createImageBitmap, so both are stubbed. That
// limits what can be asserted honestly: this file proves the CONTROL FLOW —
// that the source is centre-cropped square, that the output is re-encoded as
// JPEG, and (the part that matters most) that every failure path returns the
// ORIGINAL file rather than throwing. It does not prove the pixels are right;
// only a real browser can show that, and the form's own preview is where a
// wrong crop would be seen.

const originalCreateImageBitmap = globalThis.createImageBitmap

function stubCanvas({ toBlobResult = new Blob(['x'], { type: 'image/jpeg' }) } = {}) {
  const drawImage = vi.fn()
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toBlob: vi.fn((callback) => callback(toBlobResult)),
  }
  vi.spyOn(document, 'createElement').mockImplementation((tag) =>
    tag === 'canvas' ? canvas : document.createElement.wrappedMethod?.(tag) ?? {},
  )
  return { canvas, drawImage }
}

beforeEach(() => {
  globalThis.createImageBitmap = vi.fn(() =>
    Promise.resolve({ width: 4000, height: 3000 }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.createImageBitmap = originalCreateImageBitmap
})

describe('resizePhoto', () => {
  it('re-encodes to a 600px square JPEG', async () => {
    const { canvas } = stubCanvas()
    const file = new File(['original'], 'huge.png', { type: 'image/png' })

    const result = await resizePhoto(file)

    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(600)
    // Always JPEG: uploadPlayerPhoto derives the object key's extension from
    // the MIME type, so the re-encode and the key must agree.
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', expect.any(Number))
    expect(result.type).toBe('image/jpeg')
  })

  it('centre-crops a landscape photo to a square', async () => {
    const { drawImage } = stubCanvas()
    await resizePhoto(new File(['x'], 'wide.jpg', { type: 'image/jpeg' }))

    // 4000x3000 → take the middle 3000x3000: x offset 500, y offset 0.
    const [, sx, sy, sWidth, sHeight] = drawImage.mock.calls[0]
    expect(sWidth).toBe(3000)
    expect(sHeight).toBe(3000)
    expect(sx).toBe(500)
    expect(sy).toBe(0)
  })

  it('centre-crops a portrait photo to a square', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width: 3000, height: 4000 }))
    const { drawImage } = stubCanvas()
    await resizePhoto(new File(['x'], 'tall.jpg', { type: 'image/jpeg' }))

    const [, sx, sy, sWidth, sHeight] = drawImage.mock.calls[0]
    expect(sWidth).toBe(3000)
    expect(sHeight).toBe(3000)
    expect(sx).toBe(0)
    expect(sy).toBe(500)
  })

  // The failure paths all matter equally: a coach must always be able to save
  // a photo, and losing the resize only costs bandwidth.
  it('returns the original when the image cannot be decoded', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.reject(new Error('bad image')))
    // No object-URL fallback available in this environment either.
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = undefined

    const file = new File(['x'], 'broken.jpg', { type: 'image/jpeg' })
    expect(await resizePhoto(file)).toBe(file)

    URL.createObjectURL = originalCreateObjectURL
  })

  it('returns the original when the canvas refuses to encode', async () => {
    stubCanvas({ toBlobResult: null })
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    expect(await resizePhoto(file)).toBe(file)
  })

  it('returns the original when there is no file', async () => {
    expect(await resizePhoto(null)).toBeNull()
  })
})

// The keep-the-shape mode (claude/plans/2026-08-26-photo-pipeline-and-positioner.md):
// chat photos and profile photos are no longer squares, so this preserves the
// aspect ratio and caps the longest edge instead of centre-cropping.
describe('resizePhotoFit', () => {
  it('downscales a landscape photo keeping its shape, longest edge 1600', async () => {
    const { canvas, drawImage } = stubCanvas()
    const result = await resizePhotoFit(new File(['x'], 'wide.jpg', { type: 'image/jpeg' }))

    // 4000x3000 → 1600x1200, whole source drawn: nothing cropped.
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    const [, sx, sy, sWidth, sHeight] = drawImage.mock.calls[0]
    expect([sx, sy, sWidth, sHeight]).toEqual([0, 0, 4000, 3000])
    expect(result.type).toBe('image/jpeg')
  })

  it('downscales a portrait photo keeping its shape', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width: 3000, height: 4000 }))
    const { canvas } = stubCanvas()
    await resizePhotoFit(new File(['x'], 'tall.jpg', { type: 'image/jpeg' }))
    expect(canvas.width).toBe(1200)
    expect(canvas.height).toBe(1600)
  })

  it('never upscales a photo already smaller than the cap', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width: 800, height: 600 }))
    const { canvas } = stubCanvas()
    await resizePhotoFit(new File(['x'], 'small.jpg', { type: 'image/jpeg' }))
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
  })

  // ⚠️ THE CONTRACT DIFFERENCE FROM resizePhoto, AND IT IS DELIBERATE.
  // resizePhoto falls back to the ORIGINAL, which is safe for JPEG/PNG/WebP
  // (displayable anyway) and wrong for HEIC (half the club's phones cannot
  // render it). This returns null so the CALLER decides — a test passing a
  // fall-back-to-original implementation here would defeat the HEIC refusal.
  it('returns null, not the original, when the image cannot be decoded', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.reject(new Error('bad image')))
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = undefined

    const file = new File(['x'], 'broken.heic', { type: 'image/heic' })
    expect(await resizePhotoFit(file)).toBeNull()

    URL.createObjectURL = originalCreateObjectURL
  })

  it('returns null when the canvas refuses to encode', async () => {
    stubCanvas({ toBlobResult: null })
    expect(await resizePhotoFit(new File(['x'], 'p.jpg', { type: 'image/jpeg' }))).toBeNull()
  })
})

// The shared upload gate: type first, RESIZE SECOND, size LAST — so the 5 MB
// check judges what would actually be uploaded, not the camera original.
describe('preparePhotoUpload', () => {
  const MB = 1024 * 1024

  it('accepts a camera original bigger than 5 MB, because the resize shrinks it', async () => {
    // ⚠️ THE WHATSAPP GAP. The old order checked size BEFORE resizing, so the
    // 5–8 MB files modern phones produce were refused while the resizer one
    // line later would have made them ~200 KB.
    stubCanvas()
    const big = new File([new ArrayBuffer(10)], 'camera.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 7 * MB })

    const result = await preparePhotoUpload(big)
    expect(result.type).toBe('image/jpeg')
  })

  it('accepts a HEIC that decodes, as a JPEG', async () => {
    stubCanvas()
    const heic = new File(['x'], 'photo.heic', { type: 'image/heic' })
    const result = await preparePhotoUpload(heic)
    expect(result.type).toBe('image/jpeg')
  })

  it('refuses a HEIC that cannot be decoded, with advice rather than a lie', async () => {
    globalThis.createImageBitmap = vi.fn(() => Promise.reject(new Error('no decoder')))
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = undefined

    const heic = new File(['x'], 'photo.heic', { type: 'image/heic' })
    await expect(preparePhotoUpload(heic)).rejects.toThrow(/could not read that photo/i)

    URL.createObjectURL = originalCreateObjectURL
  })

  it('falls back to a displayable original when the resize fails and it fits', async () => {
    stubCanvas({ toBlobResult: null })
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    expect(await preparePhotoUpload(file)).toBe(file)
  })

  it('still refuses an un-resizable original over 5 MB', async () => {
    stubCanvas({ toBlobResult: null })
    const big = new File([new ArrayBuffer(10)], 'p.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 6 * MB })
    await expect(preparePhotoUpload(big)).rejects.toThrow(/too large/i)
  })

  it('refuses a non-image before doing any work', async () => {
    await expect(preparePhotoUpload(new File(['x'], 'x.pdf', { type: 'application/pdf' }))).rejects.toThrow(
      /not a photo/i,
    )
  })

  it('refuses a missing file', async () => {
    await expect(preparePhotoUpload(null)).rejects.toThrow(/choose a photo/i)
  })
})
