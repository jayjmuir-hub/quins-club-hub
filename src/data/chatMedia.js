import { supabase } from '../lib/supabase'
import { resizePhoto } from '../lib/imageResize.js'
import { signPhotoUrl } from './photos.js'

// Chat photos — round 2 (claude/plans/2026-08-24-chat-round-2.md), under the
// ruling in claude/decisions/2026-08-24-chat-photos-open.md: anyone may
// attach a photo anywhere they can already write, and the safety valve is
// the machinery chat already has, not consent collection.
//
// ⚠️ A SEPARATE BUCKET, for the player-photos reason in reverse: chat photos
// are ad-hoc member uploads whose audience is "whoever can read the
// message", and the storage read policy defers to messages RLS. Nothing
// written for chat can ever widen the buckets that hold children's roster
// photographs.
//
// ⚠️ THE KEY CONVENTION IS <profile_id>/<uuid>.<ext> — the first segment IS
// the uploader, `private.chat_media_owner()` reads it, and every storage
// policy keys off it. Upload happens BEFORE the message row exists
// (WhatsApp order — no broken-image moment), so the folder is the only
// authorisation the write policy has.
export const CHAT_MEDIA_BUCKET = 'chat-media'

// Matches the bucket's allowed_mime_types; checked here too so the user gets
// "that's not a photo" instead of an opaque storage error. HEIC off an
// iPhone arrives as whatever the browser hands us — resizePhoto re-encodes
// what it can; a type it cannot decode fails this list with the plain
// message rather than uploading something the bucket will refuse.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // the bucket's file_size_limit
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * Uploads one chat photo into the caller's own folder and returns the object
 * key, for the message's attachment_path. Downscaled before upload
 * (src/lib/imageResize.js) — a 4 MB camera photo becomes tens of KB.
 */
export async function uploadChatPhoto(profileId, file) {
  if (!profileId) throw new Error('uploadChatPhoto needs a profile id.')
  if (!file) throw new Error('Choose a photo first.')
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('That file is not a photo. Use a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That photo is too large. The limit is 5 MB.')
  }

  const upload = await resizePhoto(file)
  const extension = EXTENSIONS[upload.type] ?? 'jpg'
  const key = `${profileId}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(key, upload, { contentType: upload.type, upsert: false })
  if (error) throw error
  return key
}

/**
 * A temporary viewable URL for a chat photo, or null — same contract and
 * same cache as player photos (signPhotoUrl is bucket-qualified). Null
 * renders as no image; there is nothing useful a reader can do about a
 * signing failure, and an error box in a bubble is worse than a gap.
 */
export function signChatPhotoUrl(path) {
  return signPhotoUrl(path, CHAT_MEDIA_BUCKET)
}

/**
 * Best-effort removal of a photo the CALLER uploaded, after its message is
 * deleted. The storage policy is own-folder-only, so removing somebody
 * else's photo message leaves their object behind — readable by nobody but
 * them once no live message points at it (the read policy follows the
 * message). Never throws: the message deletion already succeeded, and a
 * cleanup failure must not undo the user's action in their eyes.
 */
export async function removeChatPhoto(path) {
  if (!path) return
  try {
    await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path])
  } catch {
    // the orphan is invisible to everyone but its owner; retention is Phase 4
  }
}
