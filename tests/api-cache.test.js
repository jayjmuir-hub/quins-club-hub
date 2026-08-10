import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  API_CACHE_NAME,
  clearCachedApiResponses,
  syncApiCacheOwner,
} from '../src/lib/apiCache.js'

// Unit tests for src/lib/apiCache.js — the service worker's cached REST
// responses, and the question of whose they are.
//
// WHAT THESE GUARD. vite.config.js caches `GET /rest/v1/*` in Cache Storage,
// which is keyed by URL and scoped to the ORIGIN rather than to the person.
// listClubMembers() produces a byte-identical url for an admin on
// /admin/accounts and a coach on /approvals, so "whose cache is this" is the
// only thing between one person's offline read and another person's club-wide
// member list. Every assertion below is about that one question.
//
// No network and no service worker is reachable from this file: `caches` is
// stubbed per test, which is also why the absent-Cache-Storage case is pinned
// explicitly — jsdom has no `caches`, and if the module threw there instead of
// no-opping, every other test file in this repo that touches sign-out would
// fail with it.

const OWNER_KEY = 'quins.apiCacheOwner'

/** A Cache Storage stub that records what was deleted. */
function stubCaches({ throws = false } = {}) {
  const deleted = []
  globalThis.caches = {
    delete: vi.fn(async (name) => {
      if (throws) throw new Error('storage unavailable')
      deleted.push(name)
      // The real API resolves false when there was no such cache. Returning it
      // here keeps the "nothing to delete is still a clear cache" case honest.
      return true
    }),
  }
  return deleted
}

beforeEach(() => {
  window.localStorage.clear()
  delete globalThis.caches
})

afterEach(() => {
  delete globalThis.caches
  vi.restoreAllMocks()
})

describe('clearCachedApiResponses', () => {
  it('deletes the cache the service worker actually writes to', async () => {
    const deleted = stubCaches()

    await clearCachedApiResponses()

    // ⚠️ Pinning the literal, not just "some cache was deleted". The name is
    // duplicated between this module and vite.config.js because Workbox
    // stringifies that config into the generated worker and the two share no
    // scope. A typo there deletes nothing and reports success.
    expect(deleted).toEqual(['quins-supabase-rest-get'])
    expect(API_CACHE_NAME).toBe('quins-supabase-rest-get')
  })

  it('forgets who the cache belonged to', async () => {
    stubCaches()
    window.localStorage.setItem(OWNER_KEY, 'user-a')

    await clearCachedApiResponses()

    expect(window.localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it('reports a clear cache when Cache Storage does not exist at all', async () => {
    // jsdom, or any insecure context. Nothing was ever cached, so nothing can
    // have been left behind — and this must not throw, or sign-out breaks
    // everywhere it is called from.
    expect(globalThis.caches).toBeUndefined()

    await expect(clearCachedApiResponses()).resolves.toBe(true)
  })

  it('reports NOT clear when the delete throws', async () => {
    stubCaches({ throws: true })

    // The entries may still be there. Anything downstream that treats this as
    // success is the bug this return value exists to prevent.
    await expect(clearCachedApiResponses()).resolves.toBe(false)
  })
})

describe('syncApiCacheOwner', () => {
  it('keeps the cache when the same person loads the app again', async () => {
    const deleted = stubCaches()
    window.localStorage.setItem(OWNER_KEY, 'user-a')

    await syncApiCacheOwner('user-a')

    // The whole point of the feature: a cold start pitch-side still has the
    // roster this person loaded earlier. Purging here would delete it.
    expect(deleted).toEqual([])
    expect(window.localStorage.getItem(OWNER_KEY)).toBe('user-a')
  })

  it('purges and re-labels when a different person signs in', async () => {
    const deleted = stubCaches()
    window.localStorage.setItem(OWNER_KEY, 'user-a')

    await syncApiCacheOwner('user-b')

    expect(deleted).toEqual([API_CACHE_NAME])
    expect(window.localStorage.getItem(OWNER_KEY)).toBe('user-b')
  })

  it('purges an UNLABELLED cache rather than adopting it', async () => {
    // What a cache written by a build older than this module looks like. It may
    // hold anybody's rows, so it cannot be assumed to be this person's.
    const deleted = stubCaches()

    await syncApiCacheOwner('user-b')

    expect(deleted).toEqual([API_CACHE_NAME])
    expect(window.localStorage.getItem(OWNER_KEY)).toBe('user-b')
  })

  it('purges when nobody is signed in', async () => {
    const deleted = stubCaches()
    window.localStorage.setItem(OWNER_KEY, 'user-a')

    await syncApiCacheOwner(null)

    expect(deleted).toEqual([API_CACHE_NAME])
    expect(window.localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it('does NOT claim a cache it failed to clear', async () => {
    // ⚠️ THE ONE THAT MATTERS. A delete that throws may leave user-a's rows in
    // place. Labelling them "user-b" would tell the next load they are safe to
    // read, which is the exact disclosure this module exists to stop — so the
    // cache stays unlabelled and the next load tries again.
    stubCaches({ throws: true })
    window.localStorage.setItem(OWNER_KEY, 'user-a')

    await expect(syncApiCacheOwner('user-b')).resolves.toBe(false)

    expect(window.localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it('survives localStorage throwing outright', async () => {
    // Safari private mode and some locked-down browsers. Same convention as
    // readStoredViewAs in src/lib/memberships.jsx: an unreadable owner reads as
    // "not this person", which fails towards purging.
    const deleted = stubCaches()
    const getItem = vi
      .spyOn(window.localStorage.__proto__, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied')
      })
    const setItem = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied')
      })

    await expect(syncApiCacheOwner('user-b')).resolves.toBe(true)

    expect(deleted).toEqual([API_CACHE_NAME])
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
