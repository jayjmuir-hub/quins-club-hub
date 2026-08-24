import { useEffect, useState } from 'react'
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

  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) signChatPhotoUrl(path).then((signed) => live && setUrl(signed))
    return () => {
      live = false
    }
  }, [path])

  if (!path || !url) return null
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
      {full && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          role="dialog"
          aria-label="Photo"
          data-testid="chat-photo-overlay"
          onClick={() => setFull(false)}
        >
          <img src={url} alt="Shared photo, full size" className="max-h-full max-w-full rounded-[12px] object-contain" />
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setFull(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </>
  )
}
