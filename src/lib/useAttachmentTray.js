import { useCallback, useEffect, useRef, useState } from 'react'
import { isAcceptableImage } from './imageResize.js'

// The composer's attachment tray — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md).
//
// ══ WHY THIS IS A SHARED HOOK AND NOT TWO COPIES ══════════════════════════
//
// `pickPhoto` was BYTE-IDENTICAL in src/lib/useDmThread.js and
// src/lib/useChannelThread.js. Adding paste, drop and multi-select by copying
// would have left two divergent copies of something four times harder, and
// the one that drifted would be the one nobody tested.
//
// ══ ONE GATE, THREE DOORS ═════════════════════════════════════════════════
//
// The attach button, Ctrl+V and drag-and-drop all funnel into `add`. That
// matters more than it looks: ⚠️ `accept` on an <input> filters the PICKER
// ONLY. A dropped or pasted file bypasses it completely, so isAcceptableImage
// is the only thing standing between a PDF and an upload on two of the three
// doors. Same reasoning as PhotoPositioner's drop zone, which is where that
// gate was written.
//
// ══ WHAT THIS DELIBERATELY DOES NOT DO ════════════════════════════════════
//
// No uploading, no resizing, no sending. It holds Files and previews. The
// upload gate (type, resize, 5 MB) is preparePhotoUpload's job at send time,
// and duplicating any of it here would be a second rule free to disagree
// with the first.

export const MAX_ATTACHMENTS = 10

const NOT_A_PHOTO = 'That file is not a photo. Use a JPEG, PNG or WebP image.'
const TOO_MANY = `You can send up to ${MAX_ATTACHMENTS} photos at once.`

/** A preview is decoration: a failure to make one must never cost the photo. */
function previewFor(file) {
  try {
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

function releaseAll(items) {
  items.forEach((item) => {
    if (item.previewUrl) {
      try {
        URL.revokeObjectURL(item.previewUrl)
      } catch {
        // Nothing useful to do; the page is going away regardless.
      }
    }
  })
}

export function useAttachmentTray() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const nextId = useRef(0)

  // ⚠️ Held in a ref as well as state so the unmount cleanup can see the
  // CURRENT items. An effect with [] deps closes over the first render's
  // empty array, so a cleanup reading state would release nothing and leak
  // one object URL per photo ever attached in a long chat session.
  const liveItems = useRef(items)
  liveItems.current = items

  const add = useCallback((files) => {
    const incoming = Array.from(files ?? [])
    // An empty add is a no-op and must NOT clear a standing error — the user
    // has not done anything to deserve the message disappearing.
    if (incoming.length === 0) return

    const good = incoming.filter(isAcceptableImage)

    setItems((current) => {
      const room = Math.max(0, MAX_ATTACHMENTS - current.length)
      const taken = good.slice(0, room)

      // ⚠️ Order matters: "not a photo" beats "too many". Someone who drops a
      // PDF alongside eleven photos has two problems, and the type one is the
      // one they can act on.
      if (good.length < incoming.length) setError(NOT_A_PHOTO)
      else if (taken.length < good.length) setError(TOO_MANY)
      else setError(null)

      if (taken.length === 0) return current
      return [
        ...current,
        ...taken.map((file) => ({
          id: nextId.current++,
          file,
          previewUrl: previewFor(file),
        })),
      ]
    })
  }, [])

  const remove = useCallback((id) => {
    setItems((current) => {
      const gone = current.find((item) => item.id === id)
      if (gone) releaseAll([gone])
      return current.filter((item) => item.id !== id)
    })
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setItems((current) => {
      releaseAll(current)
      return []
    })
    setError(null)
  }, [])

  useEffect(() => () => releaseAll(liveItems.current), [])

  return { items, add, remove, clear, error, setError }
}
