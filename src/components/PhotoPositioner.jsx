import { useCallback, useRef, useState } from 'react'
// ⚠️ IMPORTED AS WELL AS RE-EXPORTED FURTHER DOWN. A bare `export … from` does
// NOT bring the names into this module's scope, and this file calls all three.
import { DEFAULT_FOCUS, clampFocus, focusToObjectPosition } from '../lib/photoFocus.js'

// Choosing a photo, and saying which part of it matters.
//
// Jay, 15 Aug 2026: "when people upload a pic, they need a drag and drop in box
// and also a viewer preview thing they can move the photo around in to see how
// it will actually show on the site, what parts of the photo will really show
// up".
//
// ⚠️ IT STORES A FOCAL POINT, NOT A CROP, AND THAT IS THE WHOLE DESIGN. The
// same photograph is rendered at THREE very different shapes: the squad-contact
// lead tile, which at a six-person squad is 175x712 — a 1:4 strip; the half
// tiles at roughly 1.9:1 landscape; and a 28px circle in a collapsed squad
// header. A crop that frames someone's face in the tall tile is a sliver of
// forehead in the landscape one. There is no single crop that is right for all
// three, so asking a person to draw one would be asking them to be wrong twice.
//
// A focal point has no such problem. The person says "my face is HERE", once,
// and every shape renders `object-position` from it — including shapes that do
// not exist yet. Nobody re-uploads when a layout changes.
//
// ⚠️ THE PREVIEWS ARE THE FEATURE, NOT DECORATION. "What parts of the photo
// will really show up" is answerable only by showing the real aspect ratios, so
// the strip below the stage renders the actual shapes at small scale and they
// move as the point moves.

/**
 * The shapes a staff or player photo is really rendered at.
 *
 * ⚠️ THESE ARE MEASURED, NOT CHOSEN. Taken from SquadStaffCard on 15 Aug 2026 at
 * a 390px viewport: the lead tile of a six-person squad, a half tile, and the
 * face in a collapsed squad header. If the tile layout changes, re-measure —
 * a preview that lies is worse than no preview.
 */
export const PHOTO_SHAPES = [
  { key: 'lead', label: 'Featured', ratio: 175 / 712, width: 34 },
  { key: 'tile', label: 'Tile', ratio: 256 / 136, width: 96 },
  { key: 'face', label: 'Header', ratio: 1, width: 40, round: true },
]

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
 * ⚠️ IMAGE TYPES ONLY, AND CHECKED RATHER THAN TRUSTED. A drop target accepts
 * anything the OS will hand it — a folder, a PDF, a 40MB video. The file input
 * has `accept`, which drag-and-drop bypasses entirely, so the same rule has to
 * live in code or the two routes disagree.
 */
export function isAcceptableImage(file) {
  return Boolean(file) && typeof file.type === 'string' && file.type.startsWith('image/')
}

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
        // being broken, and the commonest wrong drop — a HEIC straight off a
        // phone, or a folder — is an easy mistake to make.
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
        accept="image/*"
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
          That is not an image. Choose a JPEG or PNG.
        </p>
      )}
    </div>
  )
}

/**
 * The positioning stage: the whole photo, and a point on it.
 *
 * ⚠️ THE WHOLE PHOTO IS SHOWN, UNCROPPED, WHICH IS THE POINT. The person needs
 * to see what they are choosing FROM. The previews show what they are choosing
 * FOR, and the two together answer "what will really show up".
 */
export function PhotoPositioner({ url, focus, onFocusChange, disabled = false }) {
  const stageRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const point = clampFocus(focus ?? DEFAULT_FOCUS)

  const setFromEvent = useCallback(
    (event) => {
      const box = stageRef.current?.getBoundingClientRect()
      if (!box || box.width === 0 || box.height === 0) return
      onFocusChange(
        clampFocus({
          x: ((event.clientX - box.left) / box.width) * 100,
          y: ((event.clientY - box.top) / box.height) * 100,
        }),
      )
    },
    [onFocusChange],
  )

  // ⚠️ POINTER EVENTS, NOT MOUSE EVENTS. One code path covers mouse, touch and
  // pen, and `setPointerCapture` is what keeps a drag alive when the finger
  // leaves the image — without it, dragging to the very edge (exactly what
  // someone does to put a face in a corner) drops the gesture.
  const onPointerDown = (event) => {
    if (disabled) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
    setFromEvent(event)
  }

  // ⚠️ ARROW KEYS TOO. A drag-only control is unusable without a pointer, and
  // this one has a genuinely simple keyboard equivalent — nudge the point.
  const onKeyDown = (event) => {
    if (disabled) return
    const step = event.shiftKey ? 10 : 2
    const moves = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onFocusChange(clampFocus({ x: point.x + move.x, y: point.y + move.y }))
  }

  return (
    <div>
      <div
        ref={stageRef}
        data-testid="photo-stage"
        role="application"
        aria-label="Position the photo. Drag, or use the arrow keys."
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && setFromEvent(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        className="relative w-full touch-none select-none overflow-hidden rounded-card bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <img src={url} alt="" className="block max-h-[280px] w-full object-contain" />

        {/* The point itself. Two rings so it stays visible on a light photo and
            a dark one without knowing which it is. */}
        <span
          aria-hidden="true"
          data-testid="photo-focus-point"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          className="pointer-events-none absolute -ml-3 -mt-3 h-6 w-6 rounded-full border-2 border-white ring-2 ring-black/40"
        />
      </div>

      <p className="mt-1.5 text-[12.5px] text-ink-faint">
        Drag to say where the face is. Everything below updates as you move it.
      </p>

      <div className="mt-2.5 flex flex-wrap items-end gap-3">
        {PHOTO_SHAPES.map((shape) => (
          <figure key={shape.key} data-testid={`photo-preview-${shape.key}`} className="m-0">
            <div
              style={{
                width: shape.width,
                height: Math.round(shape.width / shape.ratio),
              }}
              className={`overflow-hidden bg-surface-sunk ${shape.round ? 'rounded-full' : 'rounded-[8px]'}`}
            >
              <img
                src={url}
                alt=""
                style={{ objectPosition: focusToObjectPosition(point) }}
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="mt-1 text-center text-[10.5px] font-semibold uppercase tracking-[.06em] text-ink-faint">
              {shape.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

export default PhotoPositioner
