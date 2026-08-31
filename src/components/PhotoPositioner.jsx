import { useCallback, useRef, useState } from 'react'
import { ACCEPTED_IMAGE_TYPES, isAcceptableImage } from '../lib/imageResize.js'
// ⚠️ IMPORTED AS WELL AS RE-EXPORTED FURTHER DOWN. A bare `export … from` does
// NOT bring the names into this module's scope, and this file calls all three.
import { DEFAULT_FOCUS, clampFocus, focusToObjectPosition } from '../lib/photoFocus.js'

// Choosing a photo, and saying which part of it matters.
//
// Jay, 26 Aug 2026: "do we need all those different size looks now? can't we
// have a simple one size view and slide the photo around in the focus circle
// to see what will be visible?" — and he was right twice over. The original
// 15 Aug design previewed THREE shapes (a 1:4 lead strip, a 1.9:1 tile, a
// circle) because SquadStaffCard really rendered photos at all three. That
// layout was later replaced, and by 26 Aug every real surface was 1:1 —
// circles (StaffAvatar) or rounded squares (PlayerAvatar) — so the strip was
// previewing shapes that existed nowhere, which is exactly the "preview that
// lies" its own comment forbade. One circle is now the truth.
//
// ⚠️ IT STILL STORES A FOCAL POINT, NOT A CROP. The person slides the photo
// until the right part fills the circle; what is stored is the same two
// percentages as before, and every avatar renders `object-position` from
// them — including shapes that do not exist yet. No schema change, no
// renderer change, and nobody re-uploads when a layout changes.
//
// ⚠️ TOMBSTONE: `PHOTO_SHAPES`, `safeZone` and `safeWindow` lived here from
// 15 to 26 Aug 2026 — the measured shape list, the every-shape intersection
// and its rounded-window overlay (which itself replaced a wrong inscribed
// circle; see git history for both designs and their reasoning). They died
// with the multi-shape world. If a genuinely non-square photo surface ever
// returns, resurrect them from history rather than re-deriving the maths.
// (claude/plans/2026-08-26-photo-pipeline-and-positioner.md)

// ⚠️ MOVED TO `src/lib/photoFocus.js` ON 15 Aug 2026 AND RE-EXPORTED, NOT
// COPIED. `SquadStaffCard` and `PlayerAvatar` need `focusToObjectPosition` to
// draw a face, and importing it from here would pull this whole file — drop
// zone, drag maths, preview strip — into the bundle of every screen that shows a
// photograph. The re-export keeps the four existing import sites working and,
// more to the point, keeps the picker's PREVIEW and the real tiles provably on
// the same function: that is the only reason a preview can be trusted to
// predict what the tile will do.
export { DEFAULT_FOCUS, clampFocus, focusToObjectPosition } from '../lib/photoFocus.js'

/**
 * ⚠️ THE EXACT TYPES THE UPLOADERS ACCEPT, NOT `image/*` — REVIEW FINDING,
 * 15 Aug 2026. The first version passed anything `image/*`, but both
 * `uploadStaffPhoto` and `uploadPlayerPhoto` refuse everything outside this
 * list. So a dropped HEIC — the DEFAULT format of every iPhone — was accepted
 * here, previewed as a BLANK rectangle (browsers cannot render HEIC), and then
 * failed at save with an error two steps removed from the mistake. The whole
 * point of this check is that the drop route and the input route agree; it was
 * agreeing with the wrong thing.
 *
 * ⚠️ KEPT IN STEP WITH `ALLOWED_TYPES` IN src/data/photos.js BY EYE, not by
 * import: this component must stay importable without the Supabase client,
 * which photos.js drags in at module scope.
 */
// HEIC/HEIF added 26 Aug 2026: iPhones shoot HEIC by default, Safari can
// decode it, and preparePhotoUpload re-encodes it to JPEG on the way up —
// or refuses it plainly on a device that cannot decode it.
// ⚠️ MOVED to src/lib/imageResize.js, beside the single list of accepted
// types, because the list lived here AND there and the two had to agree with
// nothing making them. Re-exported so every existing importer — including
// tests/photo-positioner.test.jsx — keeps working unchanged.
//
// ⚠️ IMPORTED **AND** RE-EXPORTED, and it must be both. A bare
// `export { X } from '...'` re-exports the name without binding it in THIS
// module's scope, so the component below — which uses ACCEPTED_IMAGE_TYPES
// for its `accept` attribute — died with "ACCEPTED_IMAGE_TYPES is not
// defined". Caught by tests/photo-positioner.test.jsx, which is exactly the
// regression that test exists for.
export { ACCEPTED_IMAGE_TYPES, isAcceptableImage }

function UploadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

/**
 * The drop zone. Rendered when there is no photo yet.
 *
 * ⚠️ IT IS A REAL <button> WRAPPING A HIDDEN <input type="file">, not a div with
 * an onClick. Drag-and-drop is a mouse affordance and a phone has no drag — and
 * this app is opened on a phone. The tap target has to be the primary route and
 * the drop target the enhancement, never the other way round.
 */
export function PhotoDropZone({ onFile, disabled = false, label = 'Add a photo' }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState(false)

  const take = useCallback(
    (file) => {
      if (isAcceptableImage(file)) {
        setRejected(false)
        onFile(file)
      } else if (file) {
        // ⚠️ SAID OUT LOUD. A drop that silently does nothing reads as the app
        // being broken, and a wrong drop — a PDF, a folder — is an easy
        // mistake to make. (HEIC used to be the commonest case here; it is
        // accepted now and re-encoded to JPEG on upload.)
        setRejected(true)
      }
    },
    [onFile],
  )

  return (
    <div>
      <button
        type="button"
        data-testid="photo-drop-zone"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer?.files?.[0])
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 ${
          over ? 'border-brand bg-brand/5' : 'border-line-strong bg-surface-mute'
        }`}
      >
        <UploadIcon className="h-7 w-7 text-ink-faint" aria-hidden="true" />
        <span className="text-[14px] font-bold text-ink">{label}</span>
        <span className="text-[12.5px] text-ink-faint">
          Tap to choose, or drag one in
        </span>
      </button>

      {/* ⚠️ A REAL, FOCUSABLE INPUT — visually hidden, not `display:none`, and not
          replaced by a div. It is what makes this operable by keyboard and by a
          screen reader, and `accept` is what stops the file PICKER offering a
          video. The drop path cannot use `accept`, which is why
          isAcceptableImage exists. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          take(e.target.files?.[0])
          // Allows choosing the SAME file again after removing it; without this
          // the input's value is unchanged and no change event fires.
          e.target.value = ''
        }}
      />

      {rejected && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger">
          That photo is in a format the site cannot use. Choose a JPEG, PNG or WebP.
        </p>
      )}
    </div>
  )
}

/**
 * The positioning stage: one circle, and the photo sliding under it.
 *
 * ⚠️ WHAT THE CIRCLE SHOWS IS WHAT EVERY AVATAR SHOWS. The viewport is 1:1
 * with `object-cover` and `object-position` from the stored focus — the SAME
 * rendering every StaffAvatar circle and PlayerAvatar square uses, which is
 * the only reason this preview can be trusted. (The rounded squares keep a
 * whisker more at the corners than the circle shows; the circle is the
 * conservative shell of both.)
 *
 * ⚠️ THE DRAG MOVES THE PHOTO, NOT A MARKER. Dragging left slides the photo
 * left, so the viewer sees more of its right side — focus x INCREASES. Under
 * `object-cover` only the photo's long axis overflows a square, so only that
 * axis moves; a square photo (every photo uploaded before 26 Aug 2026) does
 * not move at all, which is the truth rather than a bug.
 */
export function PhotoPositioner({ url, focus, onFocusChange, disabled = false }) {
  const stageRef = useRef(null)
  const frameRef = useRef(0)
  // The drag's fixed point: pointer position and focus at pointerdown. Each
  // move is measured from HERE, not from the previous move — total-delta
  // arithmetic cannot accumulate rounding drift and does not depend on the
  // parent having re-rendered between frames.
  const dragRef = useRef(null)
  // ⚠️ THE PHOTO'S OWN ASPECT RATIO, READ OFF THE DECODED IMAGE. The drag
  // maths cannot run without it — how far the photo can slide is exactly how
  // much of it overflows the circle, which depends on its proportions. Null
  // until the image loads; until then the stage is inert.
  const [aspect, setAspect] = useState(null)
  // A photo the browser cannot decode — a HEIC on a non-Apple machine. Said
  // out loud HERE, while the person is still holding the file, with the same
  // advice the upload gate gives; a blank circle and a failure at save is the
  // 15 Aug review finding all over again.
  const [unreadable, setUnreadable] = useState(false)
  const point = clampFocus(focus ?? DEFAULT_FOCUS)

  // How many pixels of photo hang outside the square viewport, per axis.
  // `object-cover` in a 1:1 box: a landscape photo overflows horizontally by
  // side·(aspect−1), a portrait one vertically by side·(1/aspect−1); the
  // other axis fits exactly and cannot move.
  const overflowFor = useCallback(
    (box) => ({
      x: aspect > 1 ? box.width * (aspect - 1) : 0,
      y: aspect && aspect < 1 ? box.height * (1 / aspect - 1) : 0,
    }),
    [aspect],
  )

  const moveTo = useCallback(
    (clientX, clientY) => {
      const start = dragRef.current
      const box = stageRef.current?.getBoundingClientRect()
      if (!start || !box || box.width === 0 || box.height === 0) return
      const overflow = overflowFor(box)
      // Dragging the photo left (negative Δpx) reveals more of its right
      // side: focus INCREASES — hence the minus. An axis with no overflow
      // divides into zero movement rather than NaN.
      onFocusChange(
        clampFocus({
          x: overflow.x > 0 ? start.focus.x - ((clientX - start.x) / overflow.x) * 100 : start.focus.x,
          y: overflow.y > 0 ? start.focus.y - ((clientY - start.y) / overflow.y) * 100 : start.focus.y,
        }),
      )
    },
    [onFocusChange, overflowFor],
  )

  // ⚠️ POINTER EVENTS, NOT MOUSE EVENTS. One code path covers mouse, touch and
  // pen, and `setPointerCapture` is what keeps a drag alive when the finger
  // leaves the circle — without it, sliding a face right to the edge (exactly
  // the common gesture) drops halfway.
  const onPointerDown = (event) => {
    if (disabled || !aspect) return
    // A square photo fills the square viewport exactly: nothing to slide, so
    // no drag starts and no focus write happens.
    if (aspect === 1) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, focus: point }
  }

  // ⚠️ ARROW KEYS TOO. A drag-only control is unusable without a pointer. Same
  // metaphor as the drag — the arrows move the PHOTO, so ArrowLeft slides it
  // left and focus x increases. Only the overflowing axis responds: nudging
  // the locked axis would change the stored number while the picture visibly
  // stood still.
  const onKeyDown = (event) => {
    if (disabled || !aspect) return
    const step = event.shiftKey ? 10 : 2
    const moves = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    if ((move.x !== 0 && aspect <= 1) || (move.y !== 0 && aspect >= 1)) return
    onFocusChange(clampFocus({ x: point.x + move.x, y: point.y + move.y }))
  }

  if (unreadable) {
    return (
      <p role="alert" className="rounded-card bg-surface-mute px-4 py-6 text-center text-[13px] font-semibold text-danger">
        That photo could not be read. Try saving it as a JPEG first.
      </p>
    )
  }

  return (
    <div>
      <div className="flex justify-center rounded-card bg-surface-sunk py-4">
        {/* ⚠️ THE VIEWPORT IS THE CIRCLE. What is inside it is exactly what
            every avatar shows — same object-cover, same object-position, same
            focus value. A fixed 240px square (h-60/w-60): percentages of it
            are exact whatever the photo's shape, which is what keeps the drag
            maths honest (its predecessor's pillarbox bug came from measuring
            a box that was not the photo). */}
        <div
          ref={stageRef}
          data-testid="photo-stage"
          role="application"
          aria-label="Slide the photo to choose what shows in the circle. Drag, or use the arrow keys."
          tabIndex={disabled ? -1 : 0}
          onPointerDown={onPointerDown}
          // ⚠️ ONE UPDATE PER FRAME, NOT PER EVENT — review finding, 15 Aug
          // 2026, still true with one preview: pointer events fire faster
          // than the display refreshes. clientX/Y are captured before the
          // frame callback.
          onPointerMove={(e) => {
            if (!dragRef.current || frameRef.current) return
            const { clientX, clientY } = e
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = 0
              moveTo(clientX, clientY)
            })
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
          onKeyDown={onKeyDown}
          className="relative h-60 w-60 touch-none select-none overflow-hidden rounded-full ring-1 ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ objectPosition: focusToObjectPosition(point) }}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w > 0 && h > 0) setAspect(w / h)
            }}
            onError={() => setUnreadable(true)}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* ⚠️ "SLIDE THE PHOTO", NOT "DRAG THE POINT" — the metaphor in words as
          well as in the gesture. And no promise about other shapes: the circle
          IS what every avatar shows. */}
      <p className="mt-1.5 text-center text-[12.5px] text-ink-faint">
        {aspect === 1
          ? 'This photo fills the circle exactly — nothing to adjust.'
          : 'Slide the photo until the right part fills the circle. Every photo spot in the app shows this same view.'}
      </p>
    </div>
  )
}

export default PhotoPositioner
