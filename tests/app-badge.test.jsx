import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The app-icon unread badge (Jay: "add a new chat message count to the app
// icon"). Three claims: the helper is a silent no-op without the API, the
// dock-badge recount paints the REAL count, and sign-out clears the icon.

import { setAppBadge } from '../src/lib/appBadge.js'

const originalSet = navigator.setAppBadge
const originalClear = navigator.clearAppBadge

afterEach(() => {
  if (originalSet === undefined) delete navigator.setAppBadge
  else navigator.setAppBadge = originalSet
  if (originalClear === undefined) delete navigator.clearAppBadge
  else navigator.clearAppBadge = originalClear
})

describe('setAppBadge helper', () => {
  it('paints a positive count and clears at zero', () => {
    const set = vi.fn(async () => {})
    const clear = vi.fn(async () => {})
    Object.defineProperty(navigator, 'setAppBadge', { value: set, configurable: true })
    Object.defineProperty(navigator, 'clearAppBadge', { value: clear, configurable: true })
    setAppBadge(7)
    expect(set).toHaveBeenCalledWith(7)
    setAppBadge(0)
    expect(clear).toHaveBeenCalled()
  })

  it('is a silent no-op in a plain browser tab (no Badging API)', () => {
    delete navigator.setAppBadge
    delete navigator.clearAppBadge
    expect(() => setAppBadge(3)).not.toThrow()
    expect(() => setAppBadge(0)).not.toThrow()
  })
})

describe('the recount paints the real count', () => {
  it('useDockBadges hands the unread number to the icon, and sign-out clears it', async () => {
    vi.resetModules()
    const set = vi.fn(async () => {})
    const clear = vi.fn(async () => {})
    Object.defineProperty(navigator, 'setAppBadge', { value: set, configurable: true })
    Object.defineProperty(navigator, 'clearAppBadge', { value: clear, configurable: true })
    vi.doMock('../src/data/messages.js', () => ({
      countUnreadMessages: async () => 5,
      subscribeMessages: () => () => {},
    }))
    vi.doMock('../src/data/members.js', () => ({ countAdminWaiting: async () => 0 }))
    const { renderHook, waitFor } = await import('@testing-library/react')
    const { MemoryRouter } = await import('react-router-dom')
    const { default: useDockBadges } = await import('../src/lib/useDockBadges.js')
    const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>
    const first = renderHook(() => useDockBadges({ userId: 'me-1', admin: false }), { wrapper })
    await waitFor(() => expect(set).toHaveBeenCalledWith(5))
    first.unmount()
    renderHook(() => useDockBadges({ userId: null, admin: false }), { wrapper })
    await waitFor(() => expect(clear).toHaveBeenCalled())
    vi.doUnmock('../src/data/messages.js')
    vi.doUnmock('../src/data/members.js')
  })
})

describe('the push handler marks the icon', () => {
  it('push-sw.js calls setAppBadge (no argument — the worker cannot know the count)', async () => {
    // The same read-the-classic-script stance as tests/push-sw.test.js: the
    // file has no module exports, so the SOURCE is the assertion surface.
    const fs = await import('node:fs')
    const src = fs.readFileSync('public/push-sw.js', 'utf8')
    expect(src).toMatch(/setAppBadge === 'function'/)
    expect(src).toMatch(/self\.navigator\.setAppBadge\(\)/)
  })
})
