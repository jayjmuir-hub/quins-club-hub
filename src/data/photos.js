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

// Staff head shots — the SAME mechanics over a DIFFERENT bucket (13 Aug 2026,
// phase 4 of claude/plans/2026-08-13-squad-staff-on-home.md).
//
// ⚠️ A SEPARATE BUCKET IS A RULING, NOT A CONVENIENCE. `player-photos` holds
// photographs of CHILDREN behind policies written around squad membership.
// These are ADULTS, supplied by the adult about themselves, and the
// authorisation question is a different one — `staff photo write` is "your own
// prefix only", where a player photo may be uploaded by that child's coach.
// Keeping them apart means nothing written for staff can ever widen the bucket
// that holds children.
//
// ⚠️ THE KEY CONVENTION IS <profile_id>/<timestamp>.<ext>, and the first
// segment IS the identity — `private.staff_photo_owner()` reads it and every
// storage policy keys off it. A key in any other shape fails closed.
export const STAFF_PHOTO_BUCKET = 'staff-photos'

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

// ⚠️ THE CACHE KEY IS QUALIFIED BY BUCKET, and it has to be. Object keys in
// `player-photos` and `staff-photos` are both `<uuid>/<timestamp>.<ext>`, so a
// bare path is NOT unique across the two — and a profile id and a player id are
// both uuids. Keying on the path alone would let a staff photo be served from
// cache for a player key that happened to match, which is a face appearing
// under the wrong name.
function cacheKey(bucket, path) {
  return `${bucket}:${path}`
}

function cacheGet(bucket, path) {
  const key = cacheKey(bucket, path)
  const entry = signedUrlCache.get(key)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    signedUrlCache.delete(key)
    return null
  }
  return entry.url
}

function cacheSet(bucket, path, url) {
  signedUrlCache.set(cacheKey(bucket, path), {
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
export function forgetPhotoUrl(path, bucket = PHOTO_BUCKET) {
  if (path) signedUrlCache.delete(cacheKey(bucket, path))
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
/**
 * Records a photo path against a player the CALLER OWNS (their own child, or
 * themselves), via the set_own_player_photo RPC.
 *
 * Deliberately not a plain `update players set photo_path`. RLS grants access
 * to rows, not columns, so an owner-update policy on public.players would let
 * a parent write full_name, position, jersey_num and — fatally — team_id,
 * making "move my child into another squad" an RLS-approved write. The RPC
 * has a hard-coded column list, so photo_path is the only thing it can touch
 * whatever this function sends. See
 * db/migrations/20260804_self_service_profile.sql.
 *
 * Coaches and admins never come through here: they have a normal row-level
 * update and use upsertPlayer like they always did.
 */
export async function setOwnPlayerPhoto(playerId, photoPath) {
  if (!playerId) throw new Error('setOwnPlayerPhoto needs a player_id.')

  const { data, error } = await supabase.rpc('set_own_player_photo', {
    _player: playerId,
    _photo_path: photoPath ?? null,
  })

  if (error) throw error
  return data ?? null
}

export async function signPhotoUrl(path, bucket = PHOTO_BUCKET) {
  if (!path) return null

  const cached = cacheGet(bucket, path)
  if (cached) return cached

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error) return null

  const url = data?.signedUrl ?? null
  if (url) cacheSet(bucket, path, url)
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
export async function signPhotoUrls(paths, bucket = PHOTO_BUCKET) {
  const keys = (Array.isArray(paths) ? paths : []).filter(Boolean)
  if (keys.length === 0) return {}

  // Serve what is already cached and ask only for the rest. On a roster
  // revisit this is usually everything, and the network call is skipped.
  const urls = {}
  const missing = []
  for (const key of keys) {
    const cached = cacheGet(bucket, key)
    if (cached) urls[key] = cached
    else missing.push(key)
  }
  if (missing.length === 0) return urls

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS)

  if (error) return urls
  for (const entry of data ?? []) {
    // createSignedUrls reports per-key failures inside the array rather than
    // failing the batch, so check each one.
    if (entry?.path && entry?.signedUrl && !entry.error) {
      urls[entry.path] = entry.signedUrl
      cacheSet(bucket, entry.path, entry.signedUrl)
    }
  }
  return urls
}

// ══ STAFF HEAD SHOTS ═══════════════════════════════════════════════════════
//
// Same three moves as a player photo — upload, record the key, sign to view —
// against `staff-photos` and against the caller's OWN profile.

/**
 * Uploads the signed-in person's own head shot and returns its object key.
 *
 * ⚠️ THE KEY IS BUILT FROM THE CALLER'S OWN profile id, and the database
 * refuses anything else twice over: the `staff photo write` storage policy has
 * `with check (staff_photo_owner(name) = auth.uid())`, and `set_my_photo()`
 * raises 42501 if the key it is handed does not live under the caller's id. So
 * passing the wrong id here fails at the storage layer, not silently.
 *
 * Does NOT touch `profiles` — the caller records the key with setMyPhoto once
 * the upload has actually landed, so a failed upload never leaves a profile
 * pointing at an object that does not exist.
 */
export async function uploadStaffPhoto(profileId, file) {
  if (!profileId) throw new Error('uploadStaffPhoto needs a profile id.')
  if (!file) throw new Error('Choose a photo to upload.')

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('That file is not a photo. Use a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That photo is too large. The limit is 5 MB.')
  }

  const upload = await resizePhoto(file)
  const extension = EXTENSIONS[upload.type] ?? 'jpg'
  const key = `${profileId}/${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(STAFF_PHOTO_BUCKET)
    .upload(key, upload, { contentType: upload.type, upsert: false })

  if (error) throw error
  return key
}

/**
 * Records (or clears) the signed-in person's own photo key.
 *
 * ⚠️ AN RPC RATHER THAN AN UPDATE ON `profiles`, for the reason
 * setOwnPlayerPhoto records: RLS grants access to ROWS, not COLUMNS, so an
 * owner-update policy would also expose `email` — the mirror of the login
 * address. `public.set_my_photo` has a hard-coded SET list.
 */
export async function setMyPhoto(photoPath) {
  const { data, error } = await supabase.rpc('set_my_photo', {
    _photo_path: photoPath ?? null,
  })
  if (error) throw error
  return data ?? null
}

/** Signs one staff key. Null on "no photo" and on "could not sign" alike. */
export function signStaffPhotoUrl(path) {
  return signPhotoUrl(path, STAFF_PHOTO_BUCKET)
}

/**
 * Signs a whole card's worth in one call.
 *
 * ⚠️ BATCHED FOR THE SAME REASON THE ROSTER BATCHES: a parent in two squads
 * with three staff each would otherwise make six sequential round trips before
 * the first face appeared.
 */
export function signStaffPhotoUrls(paths) {
  return signPhotoUrls(paths, STAFF_PHOTO_BUCKET)
}

/**
 * Removes a staff photo object. Best-effort, like deletePlayerPhoto: once
 * `profiles.photo_path` no longer points at it the photo is gone as far as
 * every screen is concerned, and an orphan in a private bucket is untidy
 * rather than harmful.
 */
export async function deleteStaffPhoto(path) {
  if (!path) return false
  forgetPhotoUrl(path, STAFF_PHOTO_BUCKET)
  const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path])
  return !error
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

/**
 * Records a photo key and focal point against SOMEBODY ELSE'S profile.
 *
 * ⚠️ A DIFFERENT FUNCTION FROM `setMyPhoto`, WHICH STAYS SELF-ONLY. The
 * self-serve path is used by everybody and keeps the narrowest rule; this one
 * carries a reach that most callers should not have. `public.set_staff_photo`
 * enforces it — `private.may_set_staff_photo` — so this is not the boundary,
 * it is the call.
 *
 * ⚠️ WHO MAY DO IT IS A RULING THAT WAS REVERSED, TWICE, ON 15 Aug 2026. The
 * bucket was own-photo-only until Jay overruled it, and the first reversal was
 * admin-only until he widened it to match the player-photo rule. See
 * claude/decisions/2026-08-15-admin-may-set-staff-photos.md before narrowing
 * anything here.
 *
 * `uploadStaffPhoto` needs no sibling: it already takes a profile id and builds
 * the key from it. What blocked an admin was the STORAGE POLICY, not the client.
 */
export async function setStaffPhoto(profileId, photoPath, focus = null) {
  const { data, error } = await supabase.rpc('set_staff_photo', {
    _profile: profileId,
    _photo_path: photoPath ?? null,
    _focus_x: focus?.x ?? null,
    _focus_y: focus?.y ?? null,
  })
  if (error) throw error
  if (photoPath) forgetPhotoUrl(photoPath, STAFF_PHOTO_BUCKET)
  return data
}

/**
 * Records the signed-in person's own focal point.
 *
 * ⚠️ SEPARATE FROM `setMyPhoto`, AND THE DATABASE MODELS IT THE SAME WAY.
 * Repositioning a photo you already uploaded should not mean uploading it
 * again, and the upload path here is documented as immediate-and-irreversible
 * for reasons that have nothing to do with where a face is. Two actions, two
 * calls.
 */
export async function setMyPhotoFocus(focus) {
  const { data, error } = await supabase.rpc('set_my_photo_focus', {
    _focus_x: focus?.x ?? null,
    _focus_y: focus?.y ?? null,
  })
  if (error) throw error
  return data
}

/**
 * Records the focal point for a player a parent owns.
 *
 * ⚠️ AN RPC, WHERE THE COACH-SIDE FORM USES A PLAIN UPSERT, AND THE ASYMMETRY IS
 * THE EXISTING ONE RATHER THAN A NEW ONE. `PlayerForm` (coach, admin) writes
 * through `upsertPlayer`, governed by the players update policy;
 * `MyPlayerForm` (a parent) has no such reach and goes through
 * `set_own_player_photo`, scoped by `private.is_own_player`. The focal point
 * follows whichever path its photo already follows — inventing a third would
 * mean a third place for the rule to be wrong.
 */
export async function setOwnPlayerPhotoFocus(playerId, focus) {
  const { data, error } = await supabase.rpc('set_own_player_photo_focus', {
    _player: playerId,
    _focus_x: focus?.x ?? null,
    _focus_y: focus?.y ?? null,
  })
  if (error) throw error
  return data
}
