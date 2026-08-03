import { supabase } from '../lib/supabase'
import { resizePhoto } from '../lib/imageResize.js'

// Head-shot photos for players, held in the PRIVATE Supabase Storage bucket
// `player-photos`.
//
// WHY PRIVATE, AND WHAT THAT COSTS: these are photographs of children. A
// public bucket would hand out a permanent, unauthenticated URL per photo —
// once seen, forwarded or cached, that URL keeps working forever with no
// login and no way to revoke it short of deleting the file. So the bucket is
// private and every view goes through a short-lived SIGNED url, authorised at
// request time by the same RLS helpers the rest of the app uses (see
// db/migrations/20260803_player_parents_and_photos.sql).
//
// The cost is that a signed URL EXPIRES. That is why players.photo_path
// stores the object key and never a URL: a stored URL is a stored thing that
// stops working. Screens hold the key and sign it when they render.
//
// Object key convention, which the storage policies depend on:
//     <player_id>/<timestamp>.<ext>
// The first path segment IS the player id — that is how a storage policy,
// which sees only a filename, works out whose squad a photo belongs to and
// whether the caller may edit it. Never write a key in any other shape.

export const PHOTO_BUCKET = 'player-photos'

// Matches the bucket's allowed_mime_types. Checked client-side too so the
// user gets "that's not an image" instead of an opaque storage error.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB, same as the bucket's file_size_limit

// One hour. Long enough that a roster left open on a phone doesn't go blank
// mid-scroll, short enough that a URL copied out of devtools is not a durable
// handle on a child's photograph.
const SIGNED_URL_TTL_SECONDS = 3600

// SIGNED-URL CACHE. Signing is cheap but not free, and — the real reason —
// a *different* URL for the same object defeats the browser's own image
// cache: the query string changes, so it is a new resource and the bytes are
// fetched again. Re-signing on every render therefore re-downloads every face
// on every visit to the roster. Caching the URL for a little less than its
// lifetime means a second visit is a straight cache hit.
//
// Module-level and unbounded, which is safe here for two reasons: entries are
// keyed by object path so the ceiling is the number of players the user can
// see (hundreds, not millions), and the map dies with the page. A signed URL
// is not a secret this app is protecting from its own user — they were shown
// the photo — so holding it in memory adds no exposure.
const signedUrlCache = new Map()

// Re-sign a minute early rather than at the exact expiry, so a URL cannot be
// handed to an <img> a few hundred milliseconds before it dies.
const CACHE_SAFETY_MARGIN_MS = 60 * 1000

function cacheGet(path) {
  const entry = signedUrlCache.get(path)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    signedUrlCache.delete(path)
    return null
  }
  return entry.url
}

function cacheSet(path, url) {
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - CACHE_SAFETY_MARGIN_MS,
  })
}

/**
 * Empties the whole cache. Called on sign-out: the next person to use this
 * browser must not inherit working URLs to the previous user's squad photos
 * from memory. (They expire on their own within the hour, but "within the
 * hour" is not an access-control answer.)
 */
export function clearPhotoUrlCache() {
  signedUrlCache.clear()
}

/**
 * Drops a path from the cache. Called after a photo is replaced or removed so
 * the old URL cannot be served from memory for the rest of the session.
 */
export function forgetPhotoUrl(path) {
  if (path) signedUrlCache.delete(path)
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Uploads a head shot and returns its object key. Does NOT touch the players
 * table — the caller writes the returned key to players.photo_path, because
 * only the caller knows whether it is also saving other player fields in the
 * same breath and can report a single coherent outcome.
 *
 * The key is timestamped rather than fixed per player. A fixed key would be
 * cached by the browser and by any CDN in front of storage, so replacing a
 * photo would keep showing the old one until the cache expired — a new key
 * per upload sidesteps cache invalidation entirely. The old object is left
 * for the caller to delete once the new key is safely recorded, so a failure
 * mid-swap loses nothing.
 */
export async function uploadPlayerPhoto(playerId, file) {
  if (!playerId) throw new Error('uploadPlayerPhoto needs a player_id.')
  if (!file) throw new Error('Choose a photo to upload.')

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('That file is not a photo. Use a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That photo is too large. The limit is 5 MB.')
  }

  // Downscale BEFORE upload (see src/lib/imageResize.js). This is where
  // almost all of the bandwidth saving in this feature comes from: a 4 MB
  // camera photo becomes ~40 KB, both on the way up and on every subsequent
  // read. resizePhoto returns the original untouched if it cannot do the
  // work, so this can only improve on the input, never block it.
  const upload = await resizePhoto(file)

  const extension = EXTENSIONS[upload.type] ?? 'jpg'
  const key = `${playerId}/${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(key, upload, { contentType: upload.type, upsert: false })

  if (error) throw error
  return key
}

/**
 * Signs one object key into a temporary viewable URL, or returns null.
 *
 * Null covers both "this player has no photo" and "storage declined to sign
 * it", and the screens treat them identically — a missing head shot falls
 * back to the initials tile, which is what a player without a photo already
 * looks like. There is nothing useful a coach can do about a signing failure
 * mid-scroll, and an error box where a face should be is worse than a
 * monogram.
 */
export async function signPhotoUrl(path) {
  if (!path) return null

  const cached = cacheGet(path)
  if (cached) return cached

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error) return null

  const url = data?.signedUrl ?? null
  if (url) cacheSet(path, url)
  return url
}

/**
 * Signs many keys in one call and returns a path → URL object.
 *
 * The roster renders a whole squad at once; signing one at a time would be
 * ~30 sequential round trips before the first face appears. Keys that fail to
 * sign are simply absent from the result, so a caller looking one up gets
 * undefined and falls back to initials — the same outcome as a player with no
 * photo, per signPhotoUrl above.
 */
export async function signPhotoUrls(paths) {
  const keys = (Array.isArray(paths) ? paths : []).filter(Boolean)
  if (keys.length === 0) return {}

  // Serve what is already cached and ask only for the rest. On a roster
  // revisit this is usually everything, and the network call is skipped.
  const urls = {}
  const missing = []
  for (const key of keys) {
    const cached = cacheGet(key)
    if (cached) urls[key] = cached
    else missing.push(key)
  }
  if (missing.length === 0) return urls

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS)

  if (error) return urls
  for (const entry of data ?? []) {
    // createSignedUrls reports per-key failures inside the array rather than
    // failing the batch, so check each one.
    if (entry?.path && entry?.signedUrl && !entry.error) {
      urls[entry.path] = entry.signedUrl
      cacheSet(entry.path, entry.signedUrl)
    }
  }
  return urls
}

/**
 * Removes a photo object. Best-effort: resolves false rather than throwing.
 *
 * This is only ever called to tidy up an object the players row no longer
 * points at (a replaced or cleared head shot). Once photo_path is updated the
 * photo is gone as far as every screen is concerned, so a failure here leaves
 * an orphaned file in a private bucket — untidy, not harmful — and must not
 * turn a successful save into a visible error.
 */
export async function deletePlayerPhoto(path) {
  if (!path) return false
  forgetPhotoUrl(path)
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  return !error
}
