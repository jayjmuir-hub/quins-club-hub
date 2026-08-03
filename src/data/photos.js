import { supabase } from '../lib/supabase'

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

  const extension = EXTENSIONS[file.type] ?? 'jpg'
  const key = `${playerId}/${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false })

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

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error) return null
  return data?.signedUrl ?? null
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

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(keys, SIGNED_URL_TTL_SECONDS)

  if (error) return {}

  const urls = {}
  for (const entry of data ?? []) {
    // createSignedUrls reports per-key failures inside the array rather than
    // failing the batch, so check each one.
    if (entry?.path && entry?.signedUrl && !entry.error) {
      urls[entry.path] = entry.signedUrl
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
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  return !error
}
