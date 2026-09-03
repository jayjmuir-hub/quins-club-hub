import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import useClearNotificationTray, {
  clearNotificationTray,
} from '../src/lib/useClearNotificationTray.js'

// Jay, 3 Sep 2026: "30 notifications on my app icon, i open it and there is
// nothing for me to check". The pile was the tray, which nothing ever closed.

function Harness() {
  useClearNotificationTray()
  return null
}

function fakeServiceWorker(notifications) {
  const registration = { getNotifications: vi.fn(async () => notifications) }
  return { ready: Promise.resolve(registration), registration }
}

const ORIGINAL = navigator.serviceWorker
afterEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', { value: ORIGINAL, configurable: true })
})

describe('clearing the notification tray', () => {
  it('closes every open notification when the app mounts', async () => {
    const a = { close: vi.fn() }
    const b = { close: vi.fn() }
    const sw = fakeServiceWorker([a, b])
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })

    render(<Harness />)

    await waitFor(() => expect(a.close).toHaveBeenCalledTimes(1))
    expect(b.close).toHaveBeenCalledTimes(1)
    expect(sw.registration.getNotifications).toHaveBeenCalledTimes(1)
  })

  it('closes them again when the app comes back to the foreground', async () => {
    const n = { close: vi.fn() }
    const sw = fakeServiceWorker([n])
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })

    render(<Harness />)
    await waitFor(() => expect(n.close).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(n.close).toHaveBeenCalledTimes(2))
  })

  it('⚠️ does nothing, and does not throw, while the app is HIDDEN', async () => {
    // A phone that switches AWAY from the app also fires visibilitychange.
    // Closing the tray then would erase a notification the person is about to
    // read somewhere else.
    const n = { close: vi.fn() }
    const sw = fakeServiceWorker([n])
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })

    render(<Harness />)
    await waitFor(() => expect(n.close).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(n.close).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('CONTROL: a browser with no service worker is left alone, silently', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    expect(() => clearNotificationTray()).not.toThrow()
    expect(() => render(<Harness />)).not.toThrow()
  })

  it('CONTROL: a registration without getNotifications is left alone, silently', async () => {
    const sw = { ready: Promise.resolve({}) }
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
    expect(() => clearNotificationTray()).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
