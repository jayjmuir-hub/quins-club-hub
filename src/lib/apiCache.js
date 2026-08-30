// The Supabase REST responses the service worker holds for offline reading,
// and the two moments they have to be thrown away.
//
// WHY THIS EXISTS. vite.config.js registers a Workbox NetworkFirst route over
// `GET /rest/v1/*` so a screen somebody has already opened still renders
// pitch-side with no signal. That cache lives in Cache Storage, which is scoped
// to the ORIGIN and not to the person, and its entries are keyed by URL alone —
// and several of this app's reads produce the SAME url for every caller:
//
//     /rest/v1/memberships?select=*,profiles(...),teams(name),players(full_name)
//     /rest/v1/profiles?select=id,full_name,email,created_at&order=...
//     /rest/v1/teams?select=*
//
// The first is listClubMembers(): every member's name, email and phone. An
// admin runs it on /admin/accounts and a coach runs the byte-identical request
// on /approvals — so without this module an admin's response sits on the disk
// of a shared club laptop, and NetworkFirst hands it to the next person to open
// that screen without a signal. Rows `memb read` would never have returned to
// them.
//
// ⚠️ SIGN-OUT ALONE IS NOT ENOUGH, which is why there are two entry points. A
// browser closed without signing out leaves the cache behind and the next
// person signs in on top of it. So the cache records WHOSE it is, and
// syncApiCacheOwner() checks that on load, before any screen can read.
//
// ⚠️ AND PURGING ON EVERY LOAD WOULD BE WRONG. That is the obvious "safe"
// version and it quietly deletes the feature: a cold start pitch-side would
// find an empty cache, which is the exact case the runtime caching exists for.
// Only a CHANGE of owner purges.
//
// Nothing here is an access-control boundary — RLS is, and it is what decides
// every live request. This is about what stays on the disk afterwards.

// ⚠️ MUST MATCH `cacheName` in vite.config.js's runtimeCaching entry. There is
// no shared module between this file and the Vite config — Workbox stringifies
// that config into the generated service worker, which does not share this
// file's module scope — so the two names are kept in step by hand. A typo here
// deletes nothing and reports success.
export const API_CACHE_NAME = 'quins-supabase-rest-get'

// Whose responses are in the cache. localStorage, not sessionStorage: the cache
// outlives the tab, so the record of its owner has to as well.
const OWNER_KEY = 'quins.apiCacheOwner'

function readOwner() {
  try {
    return window.localStorage.getItem(OWNER_KEY)
  } catch {
    // Safari private mode and some locked-down browsers throw on access at all
    // — the same convention as readStoredViewAs in src/lib/memberships.jsx. An
    // unreadable owner reads as "not this person", which fails towards purging.
    return null
  }
}

function writeOwner(userId) {
  try {
    if (userId) window.localStorage.setItem(OWNER_KEY, userId)
    else window.localStorage.removeItem(OWNER_KEY)
  } catch {
    // Same reasoning. A cache we cannot label is one we will purge again on the
    // next load: wasteful, never unsafe.
  }
}

/**
 * Deletes every cached REST response and forgets who they belonged to.
 *
 * Resolves rather than throwing in every failure case. Cache Storage is absent
 * in jsdom and unavailable in an insecure context, and a sign-out must not fail
 * because a cache could not be opened — the sign-out is the part that matters.
 *
 * @returns {Promise<boolean>} whether the cache is now known to hold nothing.
 *   ⚠️ NOT "whether a cache was deleted" — the two differ in the case that
 *   matters. A delete that finds no cache resolves false and is a perfectly
 *   clear end state; a delete that THROWS may have left every entry in place.
 *   syncApiCacheOwner reads this to decide whether the cache is safe to claim,
 *   so the distinction has to be "is it empty", not "did I do something".
 */
export async function clearCachedApiResponses() {
  // Cleared FIRST, so a delete that throws half way leaves the cache unlabelled
  // and the next load purges it again. The reverse order could leave a stale
  // owner label sitting over surviving entries.
  writeOwner(null)

  // No Cache Storage at all — jsdom, or any insecure context — means nothing
  // was ever cached here, so there is nothing that can be left behind.
  if (typeof caches === 'undefined') return true
  try {
    await caches.delete(API_CACHE_NAME)
    return true
  } catch {
    return false
  }
}

/**
 * Records `userId` as the cache's owner, purging first when the cache currently
 * belongs to somebody else — or to nobody, which is what a cache written by a
 * build older than this module looks like.
 *
 * ⚠️ AWAIT THIS BEFORE THE FIRST READ. AuthProvider does, inside the same
 * promise chain that clears `loading`, so RequireAuth is still showing its
 * loading state while this runs and no screen has issued a query yet. Calling
 * it without awaiting leaves a window in which an offline read could still be
 * served from the previous person's cache.
 *
 * A no-op for the overwhelmingly common case — same person, same browser — so
 * it costs one localStorage read on a normal load.
 *
 * @returns {Promise<boolean>} whether the cache is now clear and claimed.
 */
// ⚠️ ONE-TIME SWEEP FOR ENTRIES THAT PREDATE THE 30 Aug 2026 EXCLUSIONS
// (Grok item 6, peer-review catch on #562). pwa-cache-rules.js stops NEW
// writes of the five child-PII tables, but a Workbox runtime cache keeps its
// EXISTING entries until eviction — and apiCache purges on owner-change only,
// so a family device that never switches user would keep children's chat and
// DOB on disk indefinitely. This deletes any already-cached response for
// those tables, once per device (localStorage marker), then costs one
// localStorage read forever after.
const CHILD_PII_PURGE_KEY = 'quins.apiCache.childPiiPurged.v1'
const CHILD_PII_PATHS = new Set([
  '/rest/v1/messages',
  '/rest/v1/player_private',
  '/rest/v1/player_contacts',
  '/rest/v1/player_parents',
  '/rest/v1/poll_votes',
])

async function purgeChildPiiResponsesOnce() {
  try {
    if (window.localStorage.getItem(CHILD_PII_PURGE_KEY)) return
  } catch {
    // Unreadable storage: fall through and sweep — wasteful, never unsafe.
  }
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(API_CACHE_NAME)
      for (const request of await cache.keys()) {
        if (CHILD_PII_PATHS.has(new URL(request.url).pathname)) await cache.delete(request)
      }
    } catch {
      // A sweep that could not run leaves the marker unwritten, so the next
      // load tries again — same convention as clearCachedApiResponses.
      return
    }
  }
  try {
    window.localStorage.setItem(CHILD_PII_PURGE_KEY, '1')
  } catch {
    // Next load sweeps again over an already-clean cache. Harmless.
  }
}

export async function syncApiCacheOwner(userId) {
  await purgeChildPiiResponsesOnce()
  const owner = readOwner()
  if (owner && owner === userId) return false

  const cleared = await clearCachedApiResponses()
  // ⚠️ ONLY CLAIM A CACHE WE KNOW IS EMPTY. If the delete threw, the previous
  // person's entries may still be sitting there, and writing this uid over them
  // would tell the NEXT load they are this person's and safe to read — turning
  // a transient storage error into exactly the disclosure this module exists to
  // stop. Left unlabelled instead, so the next load tries the purge again.
  if (cleared) writeOwner(userId)
  return cleared
}
