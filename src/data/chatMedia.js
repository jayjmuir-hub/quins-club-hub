import { supabase } from '../lib/supabase'
import { preparePhotoUpload } from '../lib/imageResize.js'
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

// The type/size/HEIC contract lives in preparePhotoUpload
// (src/lib/imageResize.js) — type first, resize second, size LAST, so a 7 MB
// camera original is shrunk rather than refused. What it resolves with is
// always inside the bucket's allowed_mime_types: JPEG when the re-encode ran
// (including a decoded HEIC), or the untouched JPEG/PNG/WebP original when
// the resize failed on a type that is safe to store as-is.
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Voice notes (claude/plans/2026-08-28-voice-messages.md) ride the SAME bucket
// and the SAME extension-agnostic storage policies as photos — an attachment is
// audio or image purely by its key's extension, which is the one thing the
// bubble and the chat-list preview need to tell them apart.
const AUDIO_EXTENSIONS = new Set(['webm', 'm4a', 'mp4', 'aac', 'mp3', 'ogg'])

/** True when an attachment_path is a voice note rather than a photo. */
export function isAudioAttachment(path) {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

/**
 * The one-line stand-in shown for a message with an attachment and no words —
 * in pins, quotes and reply previews. WhatsApp's "🎤 Voice message" / "📷 Photo".
 */
export function attachmentPreviewLabel(path, count = 0) {
  // ⚠️ `count` IS OPTIONAL ON PURPOSE. Eleven test files and four screens call
  // this with a path alone; a required second argument would have been a
  // sweeping edit for no gain, and a caller that does not know the count still
  // gets exactly what it got before.
  //
  // ⚠️ MIRRORED BY messageBody() IN supabase/functions/push-send/index.ts. A
  // Vite bundle and a Deno function share no build — the standing arrangement
  // locationFor() has with venueLine() in the calendar function. A parent
  // reading "10 photos" here and "Photo" on their lock screen is the drift
  // both comments exist to prevent. Change both or neither.
  if (count > 1) return `📷 ${count} photos`
  return isAudioAttachment(path) ? '🎤 Voice message' : '📷 Photo'
}

/**
 * Uploads one chat photo into the caller's own folder and returns the object
 * key, for the message's attachment_path. Downscaled before upload
 * (src/lib/imageResize.js) — a 4 MB camera photo becomes ~200 KB, keeping
 * its shape (claude/plans/2026-08-26-photo-pipeline-and-positioner.md).
 */
export async function uploadChatPhoto(profileId, file) {
  if (!profileId) throw new Error('uploadChatPhoto needs a profile id.')

  const upload = await preparePhotoUpload(file)
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

/**
 * Uploads one recorded voice note into the caller's own folder and returns the
 * object key, for the message's attachment_path. `ext` is decided by the
 * container MediaRecorder produced (webm on Chrome/Android, mp4 on iOS Safari —
 * see src/lib/voiceRecorder.js). No resize: audio is small, and the recorder's
 * five-minute cap plus the bucket's 10 MB ceiling bound it.
 */
export async function uploadChatVoice(profileId, blob, ext) {
  if (!profileId) throw new Error('uploadChatVoice needs a profile id.')
  const key = `${profileId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(key, blob, { contentType: blob.type || undefined, upsert: false })
  if (error) throw error
  return key
}

// A voice note lives in the same private bucket, so signing and removal are the
// photo helpers exactly — aliased for callers that read as audio, not photos.
export const signChatVoiceUrl = signChatPhotoUrl
export const removeChatVoice = removeChatPhoto
