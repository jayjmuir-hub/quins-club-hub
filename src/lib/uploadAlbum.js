import { removeChatPhoto, uploadChatPhoto } from '../data/chatMedia.js'

// The composer's upload step — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 4.
//
// ══ ALL OR NOTHING, AND WHY THAT IS NOT PEDANTRY ══════════════════════════
//
// A partial album is worse than a failed one in two separate ways. The
// member sees a message carrying four of their seven photos and has no way
// to tell which three are missing or to add them to it. And the three that
// DID reach storage are orphans: no message points at them, so the storage
// read policy refuses everyone, and nobody but a future reaper will ever
// know they are there. So a failure takes back everything it put in.
//
// ══ WHY SEQUENTIAL ════════════════════════════════════════════════════════
//
// ⚠️ Ten uploads is the same road as the 28 Aug 2026 slow-site incident —
// UAE fixed line to Supabase Tokyo, intermittent 15-second hangs — so ten
// photos is a genuinely slow operation for the people this app is for.
// Bounded parallelism (three at a time) would help and is the obvious next
// move if anyone complains; it is not here yet because a truthful "3 of 10"
// counter is the thing that makes the wait bearable, and a counter over
// out-of-order concurrent uploads is a second piece of correctness to get
// right for a gain nobody has yet measured. Sequential first, honestly.

/**
 * Uploads a tray-full of photos and returns the `attachments` array to write.
 *
 * ⚠️ `name`, `type` and `size` come from the ORIGINAL File, never the
 * uploaded one. preparePhotoUpload re-encodes to JPEG and the key is
 * `<profile_id>/<uuid>.jpg`, so the member's own filename survives nowhere
 * else — and a document in chat later is useless without it. That is the
 * entire reason for the 1 Sep metadata reshape.
 *
 * `onProgress` is called with a human sentence before each upload starts, so
 * the Send button can count rather than spin.
 */
export async function uploadAlbum(selfId, items, onProgress) {
  const uploaded = []
  try {
    for (const item of items) {
      onProgress?.(`Sending ${uploaded.length + 1} of ${items.length}…`)
      const key = await uploadChatPhoto(selfId, item.file)
      uploaded.push({
        file: key,
        type: item.file.type,
        size: item.file.size,
        name: item.file.name,
      })
    }
    return uploaded
  } catch (err) {
    // allSettled, not all: a cleanup that itself fails must not replace the
    // error the member actually needs to see. removeChatPhoto already
    // swallows its own failures for the same reason.
    await Promise.allSettled(uploaded.map((a) => removeChatPhoto(a.file)))
    throw err
  }
}
