import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAttachmentTray, MAX_ATTACHMENTS } from '../src/lib/useAttachmentTray.js'

// jsdom has no object-URL implementation. The hook must not depend on one —
// a missing preview is a cosmetic loss, never a reason a photo cannot be sent.
beforeAll(() => {
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:zz')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
})

const img = (name) => new File(['x'], name, { type: 'image/jpeg' })
const many = (n, prefix) => Array.from({ length: n }, (_, i) => img(`${prefix}${i}.jpg`))

describe('useAttachmentTray', () => {
  it('accepts several images in one go', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg'), img('b.jpg')]))
    expect(result.current.items).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  // ⚠️ `accept` on an <input> filters the PICKER only. A dropped or pasted
  // file bypasses it entirely, so this gate is the only thing standing
  // between a PDF and the composer.
  it('refuses a non-image, says so, and keeps what was already there', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg')]))
    act(() => result.current.add([new File(['x'], 'notes.pdf', { type: 'application/pdf' })]))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.error).toMatch(/not a photo/i)
  })

  // The cap has to hold across SEPARATE adds — six dropped then six pasted is
  // the realistic way to reach eleven, and a per-call cap would let it through.
  it('caps at ten across separate adds, not just within one', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add(many(6, 'a')))
    act(() => result.current.add(many(6, 'b')))
    expect(result.current.items).toHaveLength(MAX_ATTACHMENTS)
    expect(result.current.error).toMatch(/10 photos/i)
  })

  it('removes one by id and leaves the rest in order', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg'), img('b.jpg'), img('c.jpg')]))
    const middle = result.current.items[1].id
    act(() => result.current.remove(middle))
    expect(result.current.items.map((i) => i.file.name)).toEqual(['a.jpg', 'c.jpg'])
  })

  it('clear empties the tray', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg'), img('b.jpg')]))
    act(() => result.current.clear())
    expect(result.current.items).toHaveLength(0)
  })

  // A failed preview must not cost you the photo — the File is what gets
  // uploaded, the preview is decoration.
  it('still accepts a file when the preview cannot be made', () => {
    const original = URL.createObjectURL
    URL.createObjectURL = () => { throw new Error('no blob urls here') }
    try {
      const { result } = renderHook(() => useAttachmentTray())
      act(() => result.current.add([img('a.jpg')]))
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].previewUrl).toBeNull()
    } finally {
      URL.createObjectURL = original
    }
  })

  it('ignores an empty add without clearing an existing error', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([new File(['x'], 'notes.pdf', { type: 'application/pdf' })]))
    expect(result.current.error).toMatch(/not a photo/i)
    act(() => result.current.add([]))
    expect(result.current.error).toMatch(/not a photo/i)
  })
})
