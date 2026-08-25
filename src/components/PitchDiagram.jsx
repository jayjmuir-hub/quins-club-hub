import { useRef, useState } from 'react'
import { nearestSlot } from '../lib/rosterFormats.js'

// The pitch, drawn once for two customers — phase 2 of
// claude/plans/2026-08-25-roster-builder-three-views.md:
//
//   * the INTERACTIVE view on the Lineup screen (tap to fill, tap two to
//     swap, and — since phase 2 — drag a filled circle onto another to move
//     or swap it), and
//   * the SHARE facsimile's pitch-style sheet, which is the same drawing with
//     every handler absent.
//
// `interactive` decides which one you get. When false there are no buttons,
// no tabIndex and no pointer handlers — html2canvas photographs a plain SVG.
//
// == DRAG, ON THE PITCH ==
// Pointer events on the FILLED circles only, exactly the useDragReorder
// reasoning (claude/decisions/2026-08-25-drag-reopened.md): touch-action is
// pinned to the circle so the page still scrolls from the turf, capture means
// no global listeners, and release calls the same onMove the tap path's swap
// uses — one state transition, two gestures.
//
// ⚠️ A TAP IS A DRAG THAT NEVER MOVED. Filled circles route through the
// pointer handlers, and release decides: travelled under the wobble
// threshold → onCircle (select/swap, as before); further → onMove to the
// nearest circle within reach, or nothing if released on open grass. Without
// the threshold every slightly-shaky tap on a phone becomes a zero-distance
// "drag" and selection dies.
//
// ⚠️ THE TURF IS PAINTED, NOT THEMED — a pitch is green in dark mode too, the
// same reasoning as the share facsimile's force-light. As SVG fills rather
// than Tailwind arbitrary values, where tests/theme.test.js rightly bans raw
// hex.

const TURF = '#2F7D3D'
const CIRCLE_INK = '#8E1526'
const HIGHLIGHT = '#FAC775'

// How far (in viewBox units) a release may sit from a circle's centre and
// still land on it. Circles are r=5.2 and at least ~9 apart in every preset,
// so 7 catches a sloppy drop without ever being ambiguous between two slots.
const DROP_REACH = 7

// Pointer travel (viewBox units) under which a gesture is a TAP.
const WOBBLE = 2

/** "Mika Featherwell" -> "Mika F." — the circles have no room for more. */
function shortName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0]} ${parts[1][0]}.`
}

export default function PitchDiagram({
  format,
  slotted,
  playersById,
  interactive = false,
  selectedSlot = null,
  pendingSlot = null,
  onCircle = null,
  onMove = null,
}) {
  const svgRef = useRef(null)
  // { index, x, y, target } while a circle is mid-drag, else null.
  const [drag, setDrag] = useState(null)
  const gesture = useRef(null)

  if (!format) return null

  function toViewBox(domEvent) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((domEvent.clientX - rect.left) / rect.width) * 100,
      y: ((domEvent.clientY - rect.top) / rect.height) * 106,
    }
  }

  function circleHandlers(index, filled) {
    if (!interactive) return {}
    if (!filled) {
      // Empty circles cannot be dragged and drop targets need no handlers of
      // their own — the drag reads coordinates, not elements. A plain click.
      return {
        onClick: () => onCircle?.(index),
      }
    }
    return {
      onPointerDown(domEvent) {
        if (domEvent.button != null && domEvent.button !== 0) return
        const at = toViewBox(domEvent)
        gesture.current = { index, startX: at.x, startY: at.y, moved: false }
        domEvent.currentTarget.setPointerCapture?.(domEvent.pointerId)
        domEvent.preventDefault()
      },
      onPointerMove(domEvent) {
        const g = gesture.current
        if (!g) return
        const at = toViewBox(domEvent)
        if (Math.hypot(at.x - g.startX, at.y - g.startY) > WOBBLE) g.moved = true
        if (!g.moved) return
        const target = nearestSlot(format.pitch, at.x, at.y, DROP_REACH)
        // Kept on the ref as well as in state — state renders the cue, the
        // ref is what release reads. Firing onMove from inside a setState
        // updater would run the side effect twice under StrictMode, the same
        // trap useDragReorder.js documents.
        g.target = target === index ? null : target
        setDrag({ index, x: at.x, y: at.y, target: g.target })
      },
      onPointerUp() {
        const g = gesture.current
        gesture.current = null
        setDrag(null)
        if (!g) return
        if (!g.moved) {
          onCircle?.(index)
          return
        }
        if (g.target != null && g.target !== index) onMove?.(index, g.target)
      },
      onPointerCancel() {
        gesture.current = null
        setDrag(null)
      },
      style: { touchAction: 'none' },
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 106"
      role={interactive ? 'group' : 'img'}
      aria-label="Pitch — the starting team by position"
      className="block w-full"
    >
      <rect x="0" y="0" width="100" height="106" fill={TURF} />
      <rect x="3" y="3" width="94" height="100" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.7" />
      <line x1="3" y1="24" x2="97" y2="24" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.5" />
      <line x1="3" y1="63" x2="97" y2="63" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.5" strokeDasharray="2 1.6" />
      {format.pitch.map((point, index) => {
        const playerId = slotted[index] ?? null
        const player = playerId ? playersById.get(playerId) : null
        const isPending = pendingSlot === index
        const isSelected = selectedSlot === index
        const isDragged = drag?.index === index
        const isDropTarget = drag?.target === index
        const cx = isDragged ? drag.x : point.x
        const cy = isDragged ? drag.y : point.y
        const highlighted = isSelected || isPending || isDropTarget
        const a11y = interactive
          ? {
              role: 'button',
              tabIndex: 0,
              onKeyDown(domEvent) {
                if (domEvent.key === 'Enter' || domEvent.key === ' ') {
                  domEvent.preventDefault()
                  onCircle?.(index)
                }
              },
            }
          : {}
        return (
          <g
            key={index}
            aria-label={
              player ? `Shirt ${index + 1}: ${player.full_name}` : `Shirt ${index + 1}: empty`
            }
            className={interactive ? 'cursor-pointer' : undefined}
            {...a11y}
            {...circleHandlers(index, Boolean(player))}
          >
            <circle
              cx={cx}
              cy={cy}
              r="5.2"
              fill={player ? '#ffffff' : 'transparent'}
              fillOpacity={isDragged ? 0.85 : 1}
              stroke={highlighted ? HIGHLIGHT : '#ffffff'}
              strokeWidth={highlighted ? 1.4 : 0.8}
              strokeDasharray={player ? undefined : '1.6 1.4'}
            />
            <text
              x={cx}
              y={cy + 1.1}
              textAnchor="middle"
              fontSize="3.6"
              fontWeight="700"
              fill={player ? CIRCLE_INK : '#ffffff'}
            >
              {index + 1}
            </text>
            {player && (
              <text
                x={cx}
                y={cy + 8.6}
                textAnchor="middle"
                fontSize="2.9"
                fontWeight="600"
                fill="#ffffff"
              >
                {shortName(player.full_name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
