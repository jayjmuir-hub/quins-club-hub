import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Tests for public/push-sw.js — the two service-worker listeners that decide
// what a push notification LOOKS like and where tapping it TAKES you.
//
// ⚠️ THIS FILE HAD NO TESTS UNTIL 19 Aug 2026, AND THAT IS EXACTLY HOW ITS
// BUG SURVIVED BEING SHIPPED AND SMOKE-TESTED. Jay tapped the first real
// notification the club has ever received and landed on More → Notifications
// instead of on his report. The handler focused the already-open window and
// never navigated it — and the ONE test anybody runs by hand cannot see that,
// because you turn notifications on from that screen, so it is the screen you
// are already sitting on when the first notification arrives.
//
// ⚠️ LOADED WITH `new Function`, NOT IMPORTED. push-sw.js is a CLASSIC script
// (it is pulled in by `importScripts`, which cannot load an ES module), so it
// has no exports and cannot be imported. Evaluating it against a fake `self`
// is the only way to reach its listeners, and it has the happy side effect of
// testing the file that actually ships to `dist/` rather than a copy.

// Resolved from the repo root (vitest's cwd) rather than from import.meta.url,
// which is not a file: URL once the test has been through vite's transform.
const SOURCE = readFileSync(resolve(process.cwd(), 'public/push-sw.js'), 'utf8')

/** Evaluates push-sw.js against a fake `self` and returns both. */
function loadServiceWorker({ clients = [], openWindow = true } = {}) {
  const listeners = {}
  const self = {
    addEventListener(type, fn) {
      listeners[type] = fn
    },
    registration: { showNotification: vi.fn(() => Promise.resolve()) },
    clients: {
      matchAll: vi.fn(() => Promise.resolve(clients)),
      openWindow: openWindow ? vi.fn(() => Promise.resolve({})) : undefined,
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('self', SOURCE)(self)
  return { self, listeners }
}

/** A window the browser would hand back from clients.matchAll(). */
function fakeClient({ navigate, url = 'https://adhquins-clubhub.com/more' } = {}) {
  const client = {
    url,
    focus: vi.fn(function () {
      return Promise.resolve(this)
    }),
    postMessage: vi.fn(),
  }
  if (navigate !== null) {
    client.navigate = navigate ?? vi.fn(() => Promise.resolve(client))
  }
  return client
}

/** Fires an event at a listener and waits for whatever it passed to waitUntil. */
async function fire(listener, event) {
  const waited = []
  listener({ ...event, waitUntil: (promise) => waited.push(promise) })
  await Promise.all(waited)
}

describe('push-sw.js — the push event', () => {
  it('shows the notification the server sent, and carries its url through', async () => {
    const { self, listeners } = loadServiceWorker()

    await fire(listeners.push, {
      data: { json: () => ({ title: 'Your report QCH-0041', body: 'A reply', url: '/my-reports', tag: 'feedback-1' }) },
    })

    expect(self.registration.showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = self.registration.showNotification.mock.calls[0]
    expect(title).toBe('Your report QCH-0041')
    expect(options.body).toBe('A reply')
    expect(options.tag).toBe('feedback-1')
    // The url has to survive onto the notification, or notificationclick has
    // nothing to navigate to.
    expect(options.data.url).toBe('/my-reports')
  })

  it('still shows something when the payload is not the shape we send', async () => {
    const { self, listeners } = loadServiceWorker()

    await fire(listeners.push, {
      data: {
        json: () => {
          throw new Error('not json')
        },
      },
    })

    // An OS-level "this site sent a push and displayed nothing" warning is
    // worse than a vague notification.
    expect(self.registration.showNotification).toHaveBeenCalledTimes(1)
  })
})

describe('push-sw.js — tapping the notification', () => {
  // ⚠️ THE REGRESSION TEST FOR THE 19 Aug BUG. Against the original handler
  // this fails: it called focus() and returned, leaving the open window on
  // whatever screen it was already showing.
  it('navigates an ALREADY-OPEN window to the destination, not just focuses it', async () => {
    const client = fakeClient()
    const { listeners } = loadServiceWorker({ clients: [client] })
    const close = vi.fn()

    await fire(listeners.notificationclick, {
      notification: { close, data: { url: 'https://adhquins-clubhub.com/my-reports' } },
    })

    expect(close).toHaveBeenCalled()
    expect(client.navigate).toHaveBeenCalledWith('https://adhquins-clubhub.com/my-reports')
    expect(client.focus).toHaveBeenCalled()
  })

  it('opens a new window when nothing is open', async () => {
    const { self, listeners } = loadServiceWorker({ clients: [] })

    await fire(listeners.notificationclick, {
      notification: { close: vi.fn(), data: { url: 'https://adhquins-clubhub.com/notices' } },
    })

    expect(self.clients.openWindow).toHaveBeenCalledWith('https://adhquins-clubhub.com/notices')
  })

  // ⚠️ navigate() REJECTS ON A CLIENT THE WORKER DOES NOT CONTROL, which is a
  // real state on a first load. Falling back to a message the running app can
  // route on keeps the tap meaningful instead of dumping the person wherever
  // they already were.
  it('asks the running app to route itself when navigate() is refused', async () => {
    const client = fakeClient({ navigate: vi.fn(() => Promise.reject(new Error('not controlled'))) })
    const { listeners } = loadServiceWorker({ clients: [client] })

    await fire(listeners.notificationclick, {
      notification: { close: vi.fn(), data: { url: 'https://adhquins-clubhub.com/my-reports' } },
    })

    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'notification-navigate',
      url: 'https://adhquins-clubhub.com/my-reports',
    })
    expect(client.focus).toHaveBeenCalled()
  })

  it('falls back to a message when the browser has no navigate() at all', async () => {
    const client = fakeClient({ navigate: null })
    const { listeners } = loadServiceWorker({ clients: [client] })

    await fire(listeners.notificationclick, {
      notification: { close: vi.fn(), data: { url: 'https://adhquins-clubhub.com/schedule' } },
    })

    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'notification-navigate',
      url: 'https://adhquins-clubhub.com/schedule',
    })
    expect(client.focus).toHaveBeenCalled()
  })
})
