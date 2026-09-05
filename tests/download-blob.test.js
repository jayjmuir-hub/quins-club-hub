import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isIosWebKit, saveBlobAsFile } from '../src/lib/downloadBlob.js'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

const stubbed = []
function define(name, value) {
  const had = Object.prototype.hasOwnProperty.call(window.navigator, name)
  const previous = had ? Object.getOwnPropertyDescriptor(window.navigator, name) : null
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true })
  stubbed.push([name, previous])
}
function restorePlatform() {
  while (stubbed.length) {
    const [name, previous] = stubbed.pop()
    if (previous) Object.defineProperty(window.navigator, name, previous)
    else delete window.navigator[name]
  }
}

function setUa({ ua, platform = 'Win32', touchPoints = 0, standalone = false }) {
  define('userAgent', ua)
  define('platform', platform)
  define('maxTouchPoints', touchPoints)
  define('standalone', standalone)
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q === '(display-mode: standalone)' ? standalone : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

let createdAnchors
let nativeCreate
beforeEach(() => {
  createdAnchors = []
  nativeCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const el = nativeCreate(tag, options)
    if (String(tag).toLowerCase() === 'a') {
      vi.spyOn(el, 'click').mockImplementation(() => {})
      createdAnchors.push(el)
    }
    return el
  })
})

afterEach(() => {
  restorePlatform()
  vi.restoreAllMocks()
})

describe('isIosWebKit', () => {
  it('is true for iPhone Safari and false for desktop Chrome', () => {
    setUa({ ua: IPHONE_SAFARI, platform: 'iPhone' })
    expect(isIosWebKit()).toBe(true)
    restorePlatform()
    setUa({ ua: DESKTOP_CHROME })
    expect(isIosWebKit()).toBe(false)
  })
})

describe('saveBlobAsFile', () => {
  it('clicks a temporary <a download> whose href is a blob URL, never the signed storage URL', async () => {
    setUa({ ua: DESKTOP_CHROME })
    const blob = new Blob(['sheet'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const openWindow = vi.fn()
    await saveBlobAsFile(blob, 'squad-list.xlsx', { openWindow })
    expect(createdAnchors).toHaveLength(1)
    const a = createdAnchors[0]
    expect(a.getAttribute('download')).toBe('squad-list.xlsx')
    expect(a.href).toMatch(/^blob:/)
    expect(a.href).not.toMatch(/token=|supabase\.co/)
    expect(a.click).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('iOS Safari / PWA: still uses a blob <a download>, with target=_blank so the tap is not a no-op when download is ignored', async () => {
    setUa({ ua: IPHONE_SAFARI, platform: 'iPhone' })
    const blob = new Blob(['%PDF'], { type: 'application/pdf' })
    const openWindow = vi.fn()
    await saveBlobAsFile(blob, 'notes.pdf', { openWindow })
    const a = createdAnchors[0]
    expect(a.href).toMatch(/^blob:/)
    expect(a.getAttribute('download')).toBe('notes.pdf')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.click).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('iOS installed PWA last resort: window.open the blob URL only, never the signed query string', async () => {
    setUa({ ua: IPHONE_SAFARI, platform: 'iPhone', standalone: true })
    const blob = new Blob(['a,b'], { type: 'text/csv' })
    const openWindow = vi.fn(() => ({ closed: false }))
    await saveBlobAsFile(blob, 'grid.csv', { openWindow })
    expect(openWindow).toHaveBeenCalledTimes(1)
    const opened = openWindow.mock.calls[0][0]
    expect(opened).toMatch(/^blob:/)
    expect(opened).not.toMatch(/token=/)
    expect(createdAnchors[0]?.href).toMatch(/^blob:/)
  })
})
