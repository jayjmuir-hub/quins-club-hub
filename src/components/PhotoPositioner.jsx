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
 * The part of the photo that survives EVERY shape, as fractions of the photo's
 * own width and height.
 *
 * ⚠️ THE THREE SHAPES DISAGREE VIOLENTLY, WHICH IS THE WHOLE REASON THIS EXISTS.
 * The lead tile is a 1:4 strip and the half tile is 1.9:1 landscape — one keeps
 * a narrow vertical band of a photo and the other a wide horizontal one. What
 * they have in common is smaller than either, and it is the only region a person
 * can be *told* will show up. Anything else is a promise one of the shapes will
 * break.
 *
 * ⚠️ THE INTERSECTION IS JUST THE NARROWEST WINDOW, AND THAT IS PROVED RATHER
 * THAN ASSUMED. Every shape's window is positioned by the SAME focal point, so
 * for windows of width `a < b` the narrower one is contained in the wider:
 * its left edge is `f(1-a) ≥ f(1-b)`, and the gap at the right is
 * `(b-a)(1-f) ≥ 0`. So the windows nest and taking the minimum of each axis is
 * exact — no rectangle intersection is needed.
 *
 * @param photoAspect the photo's own width ÷ height
 */
export function safeZone(photoAspect) {
  const p = Number.isFinite(photoAspect) && photoAspect > 0 ? photoAspect : 1
  let width = 1
  let height = 1
  for (const { ratio } of PHOTO_SHAPES) {
    // `object-cover` scales to fill, so the axis that overflows is the one that
    // gets cropped: a photo WIDER than its box loses width, a taller one height.
    width = Math.min(width, p > ratio ? ratio / p : 1)
    height = Math.min(height, p < ratio ? p / ratio : 1)
  }
  return { width, height }
}

/**
 * Where the safe zone sits on the photo for a given focal point — left, top,
 * width and height, all as fractions of the photo's own box.
 *
 * ⚠️ THE REGION ITSELF, NOT A CIRCLE INSCRIBED IN IT, AND THAT REVERSAL WAS
 * FORCED BY LOOKING AT IT. The first version drew the largest CIRCLE that fits,
 * which is the shape Jay asked for and is badly wrong in the commonest case: on
 * a 4:3 photo the safe zone is 18% wide and 71% tall, so the inscribed circle is
 * an 18% blob floating at mid-height — and a face placed near the top sat
 * OUTSIDE it while the Featured preview beside it plainly showed that face. An
 * overlay that contradicts the preview two inches below it is worse than none.
 * The zone is drawn with fully rounded ends instead, so it still reads as a ring
 * around a face without claiming a region smaller than the truth.
 *
 * ⚠️ POSITIONED BY THE WINDOW, NOT BY THE POINT, AND THE DIFFERENCE SHOWS AT THE
 * EDGES. `object-position: 0% 50%` does not centre the crop on the left edge —
 * it BUTTS the window against it. So dragging the point into a corner moves the
 * point while the zone stops, which is exactly what the real tiles do and is the
 * most useful thing this overlay teaches.
 */
export function safeWindow(photoAspect, focus) {
  const { width, height } = safeZone(photoAspect)
  const { x, y } = clampFocus(focus ?? DEFAULT_FOCUS)
  return {
    left: (x / 100) * (1 - width),
    top: (y / 100) * (1 - height),
    width,
    height,
  }
}

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
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function isAcceptableImage(file) {
  return Boolean(file) && ACCEPTED_IMAGE_TYPES.includes(file.type)
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
 * The positioning stage: the whole photo, and a point on it.
 *
 * ⚠️ THE WHOLE PHOTO IS SHOWN, UNCROPPED, WHICH IS THE POINT. The person needs
 * to see what they are choosing FROM. The previews show what they are choosing
 * FOR, and the two together answer "what will really show up".
 */
export function PhotoPositioner({ url, focus, onFocusChange, disabled = false }) {
  const stageRef = useRef(null)
  const frameRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  // ⚠️ THE PHOTO'S OWN ASPECT RATIO, READ OFF THE DECODED IMAGE. The guide
  // circle cannot be drawn without it — how much of a photo a shape keeps
  // depends entirely on how that photo's proportions compare to the shape's.
  // Null until the image loads, and the overlay simply does not render until
  // then; a circle drawn from a guess would be a circle in the wrong place.
  const [aspect, setAspect] = useState(null)
  const point = clampFocus(focus ?? DEFAULT_FOCUS)
  const zone = aspect ? safeWindow(aspect, point) : null

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
      {/* ⚠️ THE INTERACTIVE BOX IS NOW THE PHOTO ITSELF, NOT A FULL-WIDTH FRAME
          AROUND IT, AND THAT IS A CORRECTNESS FIX AS WELL AS AN OVERLAY ONE.
          It was `w-full object-contain`, so a PORTRAIT photo — which a head shot
          usually is — was pillarboxed inside a wider box, and the drag maths
          measured that box: a tap on the empty grey strip beside the photo
          produced a focal point past the edge of the image, and every position
          in between was skewed. Shrink-wrapping the box to the image makes the
          percentages exact, and it is what lets the overlay be positioned in
          plain percentages with no measuring. */}
      <div className="flex justify-center rounded-card bg-surface-sunk">
        <div
          ref={stageRef}
          data-testid="photo-stage"
          role="application"
          aria-label="Position the photo. Drag, or use the arrow keys."
          tabIndex={disabled ? -1 : 0}
          onPointerDown={onPointerDown}
          // ⚠️ ONE UPDATE PER FRAME, NOT PER EVENT — review finding, 15 Aug
          // 2026. Pointer events fire faster than the display refreshes, and
          // every update re-renders the stage plus all three previews; on the
          // mid-range Android this app is built for, an un-throttled drag is
          // visibly janky. clientX/Y are captured before the frame callback.
          onPointerMove={(e) => {
            if (!dragging || frameRef.current) return
            const { clientX, clientY } = e
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = 0
              setFromEvent({ clientX, clientY })
            })
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={onKeyDown}
          className="relative touch-none select-none overflow-hidden rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <img
            src={url}
            alt=""
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w > 0 && h > 0) setAspect(w / h)
            }}
            className="block h-auto max-h-[280px] w-auto max-w-full"
          />

          {/* ⚠️ THE ANSWER TO "WHICH PARTS OF THE PIC WILL ACTUALLY APPEAR" —
              Jay, 15 Aug 2026. The three previews below show what each shape
              keeps, but reading three small crops and inferring a rule from them
              is work; this states the rule directly on the photo being dragged.

              ⚠️ IT IS A SPOTLIGHT, NOT A MASK, AND THE DIM IS DELIBERATELY LIGHT.
              What is outside the circle is not invisible — it appears in SOME
              shapes and not others, which is precisely the thing that cannot be
              drawn as a single crop. A heavy dim would claim it is cut, which is
              false; keeping the rest of the photo clearly legible says "this
              might show" while the ring says "this definitely will".

              The huge spread `box-shadow` is what dims everything outside a
              round hole in one element. It is clipped by the stage's
              `overflow-hidden`. */}
          {zone && (
            <span
              aria-hidden="true"
              data-testid="photo-safe-zone"
              style={{
                left: `${zone.left * 100}%`,
                top: `${zone.top * 100}%`,
                width: `${zone.width * 100}%`,
                height: `${zone.height * 100}%`,
              }}
              className="pointer-events-none absolute rounded-full border-2 border-dashed border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,.3)] ring-1 ring-black/50"
            />
          )}

          {/* The point itself. Two rings so it stays visible on a light photo and
              a dark one without knowing which it is.

              ⚠️ 12px AND SOLID, NOT A 24px HOLLOW RING, SINCE THE GUIDE CIRCLE
              LANDED — measured in Chromium, 15 Aug 2026. The safe circle on a
              4:3 photo is 66px, so a 24px ring of the same shape sat inside it
              at over a third its size and the two read as one confused
              diagram. A small filled dot is unmistakably "the point I am
              dragging" and leaves the ring to mean the region. */}
          <span
            aria-hidden="true"
            data-testid="photo-focus-point"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            className="pointer-events-none absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-black/50"
          />
        </div>
      </div>

      {/* ⚠️ "EVERY SHAPE", NOT "THE PHOTO WILL BE CROPPED TO THIS". The circle is
          the part that survives ALL THREE shapes, so it is a floor and not a
          frame — and saying it the other way round would have people shrinking
          a face to fit a circle it does not need to fit. */}
      <p className="mt-1.5 text-[12.5px] text-ink-faint">
        Drag to say where the face is. Whatever sits inside the dashed outline
        shows up everywhere — on the big tile, the small ones and the little
        round one.
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
