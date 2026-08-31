import { useEffect, useState } from 'react'
import { signChatPhotoUrl, isAudioAttachment } from '../data/chatMedia.js'

// Several photos in one bubble — plan 3 of the chat photo albums work
// (claude/plans/2026-08-31-chat-photo-albums.md). The composer has been able
// to SEND ten photos as one message since #605; until this component they all
// arrived and exactly one of them rendered, because the bubble read the
// trigger-derived `attachment_path` (the FIRST photo) rather than the
// `attachments` array that carries them all.
//
// ⚠️ THIS RENDERS `attachments`, WHICH IS THE TRUTH. `attachment_path` and
// `attachment_paths` are both derived by trigger and must never be written
// directly — a disagreement in `attachment_paths` is an invisible permission
// bug, because that is the column the storage read policy consults.
//
// ⚠️ A SIGNING FAILURE RENDERS AS NOTHING, tile by tile, matching ChatPhoto's
// standing decision: an error box where a photo should be is worse than a gap
// and there is nothing a reader can do about it. One dead tile therefore does
// not take the album down with it.

/** At most four tiles; a fifth and beyond are counted on the last one. */
const MAX_TILES = 4

export default function ChatAlbum({ attachments = [], compact = false }) {
  // ⚠️ AUDIO IS FILTERED OUT RATHER THAN TILED. uploadAlbum only ever writes
  // photos, so this cannot happen today — but `attachments` is the shape a
  // DOCUMENT will arrive in too (the 1 Sep metadata reshape exists for that),
  // and a voice note laid out as an image tile would render as a blank square.
  const photos = attachments.filter((a) => a?.file && !isAudioAttachment(a.file))
  const [urls, setUrls] = useState([])
  const [openAt, setOpenAt] = useState(null)

  const keys = photos.map((a) => a.file).join('\n')
  const count = photos.length

  useEffect(() => {
    let live = true
    setUrls([])
    if (!keys) return undefined
    const paths = keys.split('\n')
    Promise.all(
      // allSettled semantics by hand: one unsignable key must not blank the
      // whole album, so each rejection becomes a null tile.
      paths.map((p) => signChatPhotoUrl(p).catch(() => null)),
    ).then((signed) => {
      if (live) setUrls(signed)
    })
    return () => {
      live = false
    }
  }, [keys])

  // ⚠️ NO useCallback HERE. The React Compiler is on in this project and
  // memoizes these itself; a manual useCallback whose inferred dependencies
  // differ from the written ones makes it skip optimising the whole component
  // (react-hooks/preserve-manual-memoization), which is worse than nothing.
  const close = () => setOpenAt(null)
  const step = (delta) => {
    setOpenAt((at) => {
      if (at === null) return at
      const next = at + delta
      // Deliberately clamped rather than wrapped: at the last photo a
      // right-swipe should feel like the end of the album, not loop the reader
      // back to the start with no signal that they have seen it all.
      if (next < 0 || next >= count) return at
      return next
    })
  }

  useEffect(() => {
    if (openAt === null) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenAt(null)
      if (e.key === 'ArrowRight') {
        setOpenAt((at) => (at === null || at + 1 >= count ? at : at + 1))
      }
      if (e.key === 'ArrowLeft') {
        setOpenAt((at) => (at === null || at - 1 < 0 ? at : at - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAt, count])

  if (!photos.length) return null

  const tiles = photos.slice(0, MAX_TILES)
  const overflow = photos.length - tiles.length

  return (
    <>
      <div
        className={`mt-1 grid gap-0.5 overflow-hidden rounded-[10px] ${
          tiles.length === 2 ? 'grid-cols-2' : tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
        }`}
        data-testid="chat-album"
        data-count={photos.length}
      >
        {tiles.map((photo, i) => {
          const url = urls[i]
          const last = i === tiles.length - 1
          return (
            <button
              key={photo.file}
              type="button"
              onClick={() => setOpenAt(i)}
              className="relative block overflow-hidden bg-black/5"
              aria-label={`View photo ${i + 1} of ${photos.length}`}
              data-testid="chat-album-tile"
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className={`${compact ? 'h-20' : 'h-28'} w-full object-cover`}
                />
              ) : (
                // A reserved box rather than nothing: without it the grid
                // reflows as each signed URL lands, and ten photos make the
                // whole thread jump four times.
                <div className={`${compact ? 'h-20' : 'h-28'} w-full`} />
              )}
              {last && overflow > 0 && (
                <span
                  className="absolute inset-0 grid place-items-center bg-black/55 text-[17px] font-extrabold text-white"
                  data-testid="chat-album-more"
                >
                  +{overflow}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {openAt !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
          role="dialog"
          aria-label={`Photo ${openAt + 1} of ${photos.length}`}
          data-testid="chat-album-lightbox"
          onClick={close}
        >
          {urls[openAt] && (
            <img
              src={urls[openAt]}
              alt={`Shared photo ${openAt + 1} of ${photos.length}`}
              className="max-h-full max-w-full rounded-[12px] object-contain"
            />
          )}
          <span
            className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold text-white"
            data-testid="chat-album-counter"
          >
            {openAt + 1} / {photos.length}
          </span>
          {openAt > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              // stopPropagation on every control: the backdrop closes on click,
              // and without this the arrows would dismiss the lightbox instead
              // of moving through it.
              onClick={(e) => {
                e.stopPropagation()
                step(-1)
              }}
              className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          )}
          {openAt < photos.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation()
                step(1)
              }}
              className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          <button
            type="button"
            aria-label="Close photo"
            onClick={(e) => {
              e.stopPropagation()
              close()
            }}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </>
  )
}
