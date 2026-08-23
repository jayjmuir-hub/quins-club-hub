import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Unit tests for src/lib/push.js. Same approach as tests/data.test.js: the
// Supabase client is fully mocked, no network is touched. The Push API
// itself (navigator.serviceWorker, Notification, PushManager) does not exist
// in jsdom, so every test that needs it builds a minimal fake and restores
// the globals afterwards — this file owns those globals for its own
// duration and must not leak them into other test files.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('../src/lib/installPrompt.js', () => ({
  isInstalled: vi.fn(() => false),
  isIosSafari: vi.fn(() => false),
}))

import { supabase } from '../src/lib/supabase.js'
import { isInstalled, isIosSafari } from '../src/lib/installPrompt.js'
import {
  isPushSupported,
  needsHomeScreenInstall,
  pushPermissionState,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  forgetDeviceRegistration,
  reattachOnSignIn,
} from '../src/lib/push.js'

function createQueryBuilder({ data = null, error = null } = {}) {
  const calls = { upsert: [], delete: [], eq: [] }
  const builder = {}
  const chain = (name) =>
    vi.fn((...args) => {
      calls[name].push(args)
      return builder
    })
  builder.upsert = chain('upsert')
  builder.delete = chain('delete')
  builder.eq = chain('eq')
  builder.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject)
  return { builder, calls }
}

// ⚠️ SAVED AND RESTORED, NOT DELETED AFTER. jsdom's `navigator` and `window`
// are shared across this file's tests, and other test files run in the same
// worker never expect Notification/serviceWorker/PushManager to exist —
// leaving them behind would make THIS file's mocks bleed into unrelated ones.
let originalNotification
let originalServiceWorker
let originalPushManager

beforeEach(() => {
  originalNotification = global.Notification
  originalServiceWorker = navigator.serviceWorker
  originalPushManager = global.PushManager
  isInstalled.mockReturnValue(false)
  isIosSafari.mockReturnValue(false)
})

afterEach(() => {
  global.Notification = originalNotification
  if (originalServiceWorker === undefined) delete navigator.serviceWorker
  else Object.defineProperty(navigator, 'serviceWorker', { value: originalServiceWorker, configurable: true })
  global.PushManager = originalPushManager
  vi.restoreAllMocks()
})

function makeSubscription({ endpoint = 'https://push.example.invalid/ep1', p256dh = 'zz-p256dh', auth = 'zz-auth' } = {}) {
  return {
    toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  }
}

function installFakePushApis({ subscription = null, subscribeResult = null, permission = 'granted' } = {}) {
  global.Notification = { permission, requestPermission: vi.fn(() => Promise.resolve(permission)) }
  global.PushManager = function () {}
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(subscription)),
    subscribe: vi.fn(() => Promise.resolve(subscribeResult ?? makeSubscription())),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  })
  return pushManager
}

describe('isPushSupported', () => {
  it('is false when the Push API pieces are missing (the jsdom default)', () => {
    delete navigator.serviceWorker
    delete global.PushManager
    delete global.Notification
    expect(isPushSupported()).toBe(false)
  })

  it('is true once serviceWorker, PushManager and Notification all exist', () => {
    installFakePushApis()
    expect(isPushSupported()).toBe(true)
  })
})

describe('needsHomeScreenInstall', () => {
  // ⚠️ INDEPENDENT OF isPushSupported() ON PURPOSE, AND THIS IS THE ASSERTION
  // THAT MATTERS MOST IN THIS FILE. An earlier version required support to be
  // true first, which made the iPhone-specific message unreachable — the one
  // real device this function exists for is exactly the one whose feature
  // detection cannot be trusted to answer "supported" consistently. These two
  // tests fix the regression: the answer must not depend on whatever
  // isPushSupported() would say, in either direction.
  it('is true for iOS Safari not on the Home Screen, EVEN with no Push API detected', () => {
    delete navigator.serviceWorker
    delete global.PushManager
    delete global.Notification
    isIosSafari.mockReturnValue(true)
    isInstalled.mockReturnValue(false)
    expect(needsHomeScreenInstall()).toBe(true)
  })

  it('is true for iOS Safari not on the Home Screen, EVEN with the Push API present', () => {
    installFakePushApis()
    isIosSafari.mockReturnValue(true)
    isInstalled.mockReturnValue(false)
    expect(needsHomeScreenInstall()).toBe(true)
  })

  it('is false for iOS Safari that IS already installed', () => {
    installFakePushApis()
    isIosSafari.mockReturnValue(true)
    isInstalled.mockReturnValue(true)
    expect(needsHomeScreenInstall()).toBe(false)
  })

  it('is false on Android/desktop regardless of install state', () => {
    installFakePushApis()
    isIosSafari.mockReturnValue(false)
    expect(needsHomeScreenInstall()).toBe(false)
  })
})

describe('pushPermissionState', () => {
  it('is null when Notification does not exist', () => {
    delete global.Notification
    expect(pushPermissionState()).toBeNull()
  })

  it('reads Notification.permission when it does', () => {
    global.Notification = { permission: 'denied' }
    expect(pushPermissionState()).toBe('denied')
  })
})

describe('isSubscribed', () => {
  it('is false when unsupported, without touching the Push API at all', async () => {
    delete navigator.serviceWorker
    delete global.PushManager
    delete global.Notification
    expect(await isSubscribed()).toBe(false)
  })

  it('reflects whether pushManager.getSubscription() returns a subscription', async () => {
    installFakePushApis({ subscription: null })
    expect(await isSubscribed()).toBe(false)

    installFakePushApis({ subscription: makeSubscription() })
    expect(await isSubscribed()).toBe(true)
  })
})

describe('subscribeToPush', () => {
  it('refuses without a profile id', async () => {
    await expect(subscribeToPush(null)).rejects.toThrow(/profile id/)
  })

  it('⚠️ tells an iOS Safari, not-installed caller to add to Home Screen first — not "unsupported"', async () => {
    // ⚠️ THE PUSH API IS PRESENT HERE ON PURPOSE — this is what a real
    // non-installed iPhone actually reports, and it is the exact case the
    // priority-ordering fix above exists for: without it, this branch is
    // dead code, because isPushSupported() being true skips it entirely.
    installFakePushApis()
    isIosSafari.mockReturnValue(true)
    isInstalled.mockReturnValue(false)

    await expect(subscribeToPush('profile-1')).rejects.toThrow(/Home Screen/)
  })

  it('throws a specific message when permission is denied', async () => {
    installFakePushApis({ permission: 'denied' })
    await expect(subscribeToPush('profile-1')).rejects.toThrow(/blocked/)
  })

  // ⚠️ AN RPC, NOT AN UPSERT, SINCE 23 Aug 2026 — and profile_id is NOT sent.
  // The function takes auth.uid() from the session. The upsert this replaced
  // failed the first time a phone changed hands (RLS refused to update the
  // previous person's row); db/tests/push-subscription-takeover.sql proves
  // the server half, this proves the client calls it with the right shape.
  it('registers endpoint and keys through register_push_subscription, without a profile id', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    const subscription = makeSubscription({ endpoint: 'https://push.example.invalid/real', p256dh: 'PK', auth: 'AK' })
    installFakePushApis({ subscription: null, subscribeResult: subscription })

    await subscribeToPush('profile-1')

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('register_push_subscription', {
      _endpoint: 'https://push.example.invalid/real',
      _p256dh: 'PK',
      _auth: 'AK',
    })
    expect(supabase.from).not.toHaveBeenCalledWith('push_subscriptions')
  })

  it('reuses an existing browser subscription rather than creating a second one', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    const existing = makeSubscription()
    const pushManager = installFakePushApis({ subscription: existing })

    await subscribeToPush('profile-1')

    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('surfaces a database error from the registration', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'not signed in' } })
    installFakePushApis({ subscription: null })

    await expect(subscribeToPush('profile-1')).rejects.toThrow(/not signed in/)
  })
})

describe('unsubscribeFromPush', () => {
  it('does nothing when unsupported', async () => {
    delete navigator.serviceWorker
    delete global.PushManager
    delete global.Notification
    await expect(unsubscribeFromPush()).resolves.toBeUndefined()
  })

  it('does nothing when there is no subscription on this device', async () => {
    const { builder, calls } = createQueryBuilder()
    supabase.from.mockReturnValue(builder)
    installFakePushApis({ subscription: null })

    await unsubscribeFromPush()

    expect(calls.delete).toHaveLength(0)
  })

  it('unsubscribes the browser AND deletes the matching row by endpoint', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{}], error: null })
    supabase.from.mockReturnValue(builder)
    const subscription = makeSubscription({ endpoint: 'https://push.example.invalid/gone' })
    installFakePushApis({ subscription })

    await unsubscribeFromPush()

    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(calls.delete).toHaveLength(1)
    expect(calls.eq[0]).toEqual(['endpoint', 'https://push.example.invalid/gone'])
  })

  it('still removes the row even if the browser-side unsubscribe throws', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{}], error: null })
    supabase.from.mockReturnValue(builder)
    const subscription = makeSubscription()
    subscription.unsubscribe = vi.fn(() => Promise.reject(new Error('already gone')))
    installFakePushApis({ subscription })

    await expect(unsubscribeFromPush()).resolves.toBeUndefined()
    expect(calls.delete).toHaveLength(1)
  })
})

// ══ 23 Aug 2026 — sign-out keeps the phone subscribed ═══════════════════════
// Jay: "I don't want it to change if I sign out and sign back in." Sign-out
// drops the ROW (the server stops sending to this device) but leaves the
// browser subscription in place; sign-in puts the row back for whoever it is.
describe('forgetDeviceRegistration', () => {
  it('deletes the row by endpoint and does NOT unsubscribe the browser', async () => {
    const { builder, calls } = createQueryBuilder()
    supabase.from.mockReturnValue(builder)
    const subscription = makeSubscription({ endpoint: 'https://push.example.invalid/keep-me' })
    installFakePushApis({ subscription })

    await forgetDeviceRegistration()

    expect(supabase.from).toHaveBeenCalledWith('push_subscriptions')
    expect(calls.delete).toHaveLength(1)
    expect(calls.eq[0]).toEqual(['endpoint', 'https://push.example.invalid/keep-me'])
    // ⚠️ THE POINT: the phone keeps its subscription for the next sign-in.
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('does nothing without a subscription or without push support', async () => {
    const { builder, calls } = createQueryBuilder()
    supabase.from.mockReturnValue(builder)
    installFakePushApis({ subscription: null })
    await forgetDeviceRegistration()
    expect(calls.delete).toHaveLength(0)

    delete global.Notification
    await expect(forgetDeviceRegistration()).resolves.toBeUndefined()
  })
})

describe('reattachOnSignIn', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
    supabase.from.mockReset()
  })

  it('re-registers an existing, permitted subscription for the signed-in person', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    installFakePushApis({
      subscription: makeSubscription({ endpoint: 'https://push.example.invalid/ep9', p256dh: 'P', auth: 'A' }),
      permission: 'granted',
    })

    expect(await reattachOnSignIn()).toBe(true)

    expect(supabase.rpc).toHaveBeenCalledWith('register_push_subscription', {
      _endpoint: 'https://push.example.invalid/ep9',
      _p256dh: 'P',
      _auth: 'A',
    })
  })

  it('asks nothing when permission was never granted — that is the nudge\'s job', async () => {
    const pushManager = installFakePushApis({ subscription: makeSubscription(), permission: 'default' })
    expect(await reattachOnSignIn()).toBe(false)
    expect(global.Notification.requestPermission).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('does nothing when the phone holds no subscription', async () => {
    installFakePushApis({ subscription: null, permission: 'granted' })
    expect(await reattachOnSignIn()).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  // Runs inside the sign-in path; a throw here would break signing in.
  it('never throws — a refused RPC or a missing API is a quiet false', async () => {
    supabase.rpc.mockRejectedValue(new Error('network'))
    installFakePushApis({ subscription: makeSubscription(), permission: 'granted' })
    expect(await reattachOnSignIn()).toBe(false)

    delete global.Notification
    expect(await reattachOnSignIn()).toBe(false)
  })
})
