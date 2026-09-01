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

  // ⚠️ SWIPE, BECAUSE THE ARROWS ARE NOT HOW ANYONE MOVES THROUGH PHOTOS ON A
  // PHONE. Added 1 Sep 2026 alongside the always-present arrows: the first real
  // album was read on a phone, where two 44px targets either side of a
  // full-bleed image are the whole navigation. A horizontal drag is what a
  // parent will actually try first.
  //
  // ⚠️ THRESHOLD, AND A VERTICAL GUARD. Under ~40px is a tap with a shaky
  // thumb, not a swipe. And a drag that travels further vertically than
  // horizontally is a scroll attempt — stepping the album on that would make
  // the lightbox feel like it fires at random.
  const [touchStart, setTouchStart] = useState(null)

  function onTouchStart(e) {
    const t = e.changedTouches?.[0]
    setTouchStart(t ? { x: t.clientX, y: t.clientY } : null)
  }

  function onTouchEnd(e) {
    const t = e.changedTouches?.[0]
    if (!touchStart || !t) return
    const dx = t.clientX - touchStart.x
    const dy = t.clientY - touchStart.y
    setTouchStart(null)
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return
    step(dx < 0 ? 1 : -1)
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-label={`Photo ${openAt + 1} of ${photos.length}`}
          data-testid="chat-album-lightbox"
          // ⚠️ CLOSE ONLY ON THE BACKDROP ITSELF, never on a bubbled click.
          // Jay, 1 Sep 2026: "sometimes when the first pic opens and you click
          // the forward arrow the pictures close". A bare onClick={close} here
          // fires for ANY click that reaches this element — so a tap that
          // narrowly missed a moving arrow, or one that fell through the
          // disabled arrow's `pointer-events-none`, dismissed the whole album
          // instead of doing nothing. Comparing target to currentTarget makes
          // a miss cost nothing, which is what a miss should cost.
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/*
            ⚠️ THE STAGE HAS FIXED GEOMETRY, AND THAT IS THE WHOLE POINT.
            Jay, 1 Sep 2026: "sometimes the buttons are in the middle and
            sometimes the bottom, very buggy". The previous version sized this
            wrapper TO THE IMAGE (`max-h-full max-w-full` with no height), so its
            box — and every control positioned against it — moved as each photo
            loaded and as portrait/landscape alternated. Controls that move
            between renders are also controls you miss when you click.

            `h-full w-full` makes the stage independent of what is inside it, and
            `max-w-3xl` keeps the arrows beside the picture on a wide desktop
            rather than out at the viewport edges (the 1 Sep desktop report).
            The image floats inside it and can be any size it likes.
          */}
          <div
            className="relative flex h-full w-full max-w-3xl items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) close()
            }}
          >
            {urls[openAt] && (
              <img
                src={urls[openAt]}
                alt={`Shared photo ${openAt + 1} of ${photos.length}`}
                className="max-h-full max-w-full rounded-[12px] object-contain"
              />
            )}

            {/*
              ⚠️ BOTH ARROWS ALWAYS RENDER, DIMMED AND DISABLED AT THE ENDS.
              Jay, 1 Sep 2026: "there is no back button when clicking through
              them, there is a forward button though" — he had opened the FIRST
              photo, where an `openAt > 0` guard removed the control entirely, so
              the lightbox read as one-way and broken rather than "you are at the
              start". A control that vanishes IS the complaint.

              ⚠️ NO `pointer-events-none` ON THE DISABLED STATE. It was there,
              and it meant a click on the dimmed back arrow passed straight
              through to the backdrop and CLOSED the album — "the back button
              shows sometimes but doesn't work". A disabled <button> already
              refuses its own click; letting it swallow the event is the fix.

              ⚠️ z-10 because the image is a sibling: without it the arrows sit
              UNDER a large photo and are unclickable exactly when the photo is
              big enough to reach them.
            */}
            <button
              type="button"
              aria-label="Previous photo"
              disabled={openAt === 0}
              onClick={(e) => {
                e.stopPropagation()
                step(-1)
              }}
              className="absolute left-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-30"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={openAt >= photos.length - 1}
              onClick={(e) => {
                e.stopPropagation()
                step(1)
              }}
              className="absolute right-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-30"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Counter and close belong to the BACKDROP, not the stage — they are
              about the album, not about this photo, and pinning them here keeps
              them still while the picture changes. */}
          <span
            className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm"
            data-testid="chat-album-counter"
          >
            {openAt + 1} / {photos.length}
          </span>
          <button
            type="button"
            aria-label="Close photo"
            onClick={(e) => {
              e.stopPropagation()
              close()
            }}
            className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </>
  )
}
