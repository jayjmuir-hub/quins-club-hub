import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// src/lib/shareImage.js — the WhatsApp share sheet for a photographed card.
// Session-plan Share adds the deep link to the payload and, when the browser
// cannot file-share, copies that link then still downloads the PNG.
// Spec: claude/specs/2026-08-27-session-plan-share.md

const toBlob = vi.fn((cb) => cb(new Blob(['fake-png'], { type: 'image/png' })))

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ toBlob })),
}))

import { shareElementAsImage } from '../src/lib/shareImage.js'

const LINK = 'https://adhquins-clubhub.com/schedule?event=e-train-1'
const TEXT = `Tuesday training · Tue 25 Aug\n${LINK}`

beforeEach(() => {
  vi.clearAllMocks()
  toBlob.mockImplementation((cb) => cb(new Blob(['fake-png'], { type: 'image/png' })))
})

afterEach(() => {
  delete navigator.canShare
  delete navigator.share
  delete navigator.clipboard
})

describe('shareElementAsImage — files plus a deep link', () => {
  it('hands the OS an image file and the session-plan link when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => true),
    })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })

    const element = document.createElement('div')
    element.textContent = '15 min · Grid passing'
    const outcome = await shareElementAsImage(element, {
      filename: 'session-plan-e-train-1.png',
      title: 'Tuesday training',
      text: TEXT,
      url: LINK,
    })

    expect(outcome).toBe('shared')
    expect(navigator.canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    )
    expect(share).toHaveBeenCalledTimes(1)
    const payload = share.mock.calls[0][0]
    expect(payload.files).toHaveLength(1)
    expect(payload.files[0]).toBeInstanceOf(File)
    expect(payload.files[0].type).toBe('image/png')
    expect(payload.files[0].name).toBe('session-plan-e-train-1.png')
    expect(payload.title).toBe('Tuesday training')
    expect(payload.text).toContain(LINK)
    expect(payload.text).toMatch(/Tuesday training/)
  })

  it('copies the link and still downloads the image when files cannot be shared', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => false),
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const node = realCreate(tag)
      if (tag === 'a') node.click = click
      return node
    })

    const element = document.createElement('div')
    const outcome = await shareElementAsImage(element, {
      filename: 'session-plan-e-train-1.png',
      title: 'Tuesday training',
      text: TEXT,
      url: LINK,
    })

    expect(outcome).toBe('downloaded')
    expect(writeText).toHaveBeenCalledWith(TEXT)
    expect(click).toHaveBeenCalled()
    expect(navigator.share).toBeUndefined()
  })
})
