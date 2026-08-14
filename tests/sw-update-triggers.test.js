import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// When an installed PWA notices a deploy.
//
// Jay, 14 Aug 2026: "changes are immediately showing up on the desktop site but
// not the app". ⚠️ MEASURED BEFORE CHANGING ANYTHING, because the two obvious
// suspects were both innocent: production serves `sw.js` as
// `public, must-revalidate, max-age=0`, and the deployed worker does contain
// skipWaiting and clientsClaim. Nothing was stale and nothing failed to take
// over — the registration simply had one trigger, an hourly timer, and a
// browser tab looks instant only because every page load re-checks the script.
//
// ⚠️ THIS TESTS THE REGISTRATION MODULE, NOT THE BUILT WORKER.
// tests/pwa-build.test.js already asserts what the generated sw.js contains;
// this is about WHEN the app asks the browser to look for a new one.

const registerSWMock = vi.fn()
vi.mock('virtual:pwa-register', () => ({ registerSW: (...args) => registerSWMock(...args) }))

/** Runs the module's onRegisteredSW against a fake registration. */
async function boot({ visible = true, online = true } = {}) {
  vi.resetModules()
  registerSWMock.mockReset()

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  })
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

  await import('../src/sw-register.js')
  const options = registerSWMock.mock.calls[0][0]
  const registration = { update: vi.fn().mockResolvedValue(undefined) }
  options.onRegisteredSW('/sw.js', registration)
  return registration
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-14T18:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('update triggers', () => {
  it('checks when the app comes back to the foreground', async () => {
    // ⚠️ THE ONE THAT FIXES THE REPORT. An installed PWA never navigates — you
    // switch away and back — so this is the only signal it has that resembles a
    // page load, and it is the exact moment somebody looks at the screen.
    const registration = await boot()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('checks when the device comes back online', async () => {
    const registration = await boot()
    window.dispatchEvent(new Event('online'))
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('still checks on the hourly timer, for an app left open and visible', async () => {
    // Neither listener above ever fires for a screen nobody touches, so the
    // timer stays as the backstop rather than being replaced.
    const registration = await boot()
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('does not fire more than once a minute however often you switch apps', async () => {
    // ⚠️ WITHOUT THE FLOOR THIS IS A REQUEST PER FLICK between apps on a phone.
    const registration = await boot()
    for (let i = 0; i < 10; i += 1) document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(61 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('does not check while hidden', async () => {
    const registration = await boot({ visible: false })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).not.toHaveBeenCalled()
  })

  it('does not check while offline', async () => {
    // update() would reject anyway; not asking is cheaper and quieter.
    const registration = await boot({ online: false })
    window.dispatchEvent(new Event('online'))
    expect(registration.update).not.toHaveBeenCalled()
  })
})
