import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { signChatPhotoUrl } from '../data/chatMedia.js'

// One chat photo in a bubble — round 2
// (claude/plans/2026-08-24-chat-round-2.md). Thumbnail in the stream, tap
// for a full-size overlay. URLs are short-lived signed URLs from the
// PRIVATE chat-media bucket; a signing failure renders as nothing at all,
// because an error box where a photo should be is worse than a gap and
// there is nothing a reader can do about it.

export default function ChatPhoto({ path, compact = false }) {
  const [url, setUrl] = useState(null)
  const [full, setFull] = useState(false)
  const closeRef = useRef(null)
  const openerRef = useRef(null)

  // ⚠️ ESCAPE CLOSES, FOCUS MOVES IN AND BACK OUT (2 Sep 2026 UX review,
  // desktop keyboard). The album viewer had both; this one had neither —
  // Escape did nothing and focus stayed on the thumbnail under the scrim.
  useEffect(() => {
    if (!full) return undefined
    openerRef.current = document.activeElement
    closeRef.current?.focus?.()
    const onKey = (e) => {
      if (e.key === 'Escape') setFull(false)
      if (e.key === 'Tab') {
        // One focusable control: keep Tab on it.
        e.preventDefault()
        closeRef.current?.focus?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openerRef.current?.focus?.()
    }
  }, [full])

  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) signChatPhotoUrl(path).then((signed) => live && setUrl(signed))
    return () => {
      live = false
    }
  }, [path])

  if (!path) return null
  // ⚠️ A PLACEHOLDER WHILE THE URL SIGNS (2 Sep 2026 UX review, pattern 6):
  // rendering nothing and then the image pushed the thread down as each
  // photo popped in. Same footprint as the thumbnail's ceiling.
  if (!url) {
    return (
      <div
        aria-hidden="true"
        data-testid="chat-photo-placeholder"
        className={`mt-1 ${compact ? 'h-40' : 'h-64'} w-full max-w-[280px] animate-pulse rounded-[10px] bg-surface-sunk`}
      />
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="mt-1 block overflow-hidden rounded-[10px]"
        aria-label="View photo full size"
        data-testid="chat-photo"
      >
        <img
          src={url}
          alt="Shared photo"
          loading="lazy"
          className={`${compact ? 'max-h-40' : 'max-h-64'} w-auto max-w-full object-cover`}
        />
      </button>
      {/*
        ⚠️ PORTALLED TO <body>, FOR THE SAME REASON ChatAlbum IS. This renders
        inside FloatingChatDock, which is `fixed … z-30` and therefore a
        STACKING CONTEXT: a `fixed inset-0 z-50` child of it is z-50 *within the
        dock*, so the sidebar (z-30) and masthead (z-40) paint over the backdrop
        and eat every click that lands on them. Found 1 Sep 2026 while fixing
        the album, which had the identical bug — one instance was reported, both
        were broken.
      */}
      {full && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          role="dialog"
          aria-label="Photo"
          data-testid="chat-photo-overlay"
          onClick={() => setFull(false)}
        >
          <img src={url} alt="Shared photo, full size" className="max-h-full max-w-full rounded-[12px] object-contain" />
          <button
            ref={closeRef}
            type="button"
            aria-label="Close photo"
            onClick={() => setFull(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
