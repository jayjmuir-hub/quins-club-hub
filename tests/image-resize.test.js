import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resizePhoto } from '../src/lib/imageResize.js'

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
