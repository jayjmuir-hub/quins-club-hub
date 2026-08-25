import { useRef, useState } from 'react'

// Pointer-events drag-to-reorder for a vertical list. No dependency — this
// file IS the answer to the 14 Aug "a pointer-events library is ~30KB"
// objection (claude/decisions/2026-08-25-drag-reopened.md).
//
// ⚠️ DRAG IS A GESTURE OVER THE SAME STATE THE TAP PATH USES, never a second
// copy of it. The hook owns nothing but the in-flight gesture; on release it
// calls `onMove(from, to)` exactly once and the caller mutates the one list.
//
// ⚠️ `touch-action: none` GOES ON THE HANDLE, NOT THE ROW. On the row it would
// eat the scroll gesture for the whole list — the screen is used pitch-side on
// a phone, and a list you cannot scroll because every row is a drag surface is
// the classic way mobile drag goes wrong.
//
// ⚠️ setPointerCapture MEANS NO GLOBAL LISTENERS. Move/up/cancel arrive on the
// handle itself even when the finger leaves it, so there is nothing to add to
// window and nothing to forget to remove.

/**
 * Where a row grabbed at `y` should land, given the vertical midpoints of the
 * other rows IN ORDER. Pure, and the whole of the maths — the hook is wiring.
 *
 *   midpoints  y-centres of each row EXCLUDING the dragged one
 *   y          current pointer y
 *
 * Returns an index in [0, midpoints.length]: the position among the remaining
 * rows the dragged row should be inserted at.
 */
export function targetIndex(midpoints, y) {
  let index = 0
  for (const mid of midpoints) {
    if (y > mid) index += 1
    else break
  }
  return index
}

/**
 * useDragReorder(count, onMove)
 *
 *   count   how many rows the list currently has
 *   onMove  (from, to) => void — commit a reorder; called once, on release
 *
 * Returns:
 *   handleProps(index)  spread onto the drag HANDLE of row `index`
 *   rowRef(index)       ref callback for the row element (measured on grab)
 *   dragIndex           the row being dragged, or null
 *   overIndex           where it would land, or null (for the insertion cue)
 *   dragOffset          px translateY for the dragged row's visual
 */
export function useDragReorder(count, onMove) {
  const rows = useRef([])
  const gesture = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [dragOffset, setDragOffset] = useState(0)

  function rowRef(index) {
    return (element) => {
      rows.current[index] = element
    }
  }

  function reset() {
    gesture.current = null
    setDragIndex(null)
    setOverIndex(null)
    setDragOffset(0)
  }

  function handleProps(index) {
    return {
      // Announced as a button; keyboard users reorder through the tap path,
      // which stays the required route (the decision record's third row).
      onPointerDown(domEvent) {
        // A right-click or a second touch is not a drag.
        if (domEvent.button != null && domEvent.button !== 0) return
        const midpoints = []
        for (let i = 0; i < count; i += 1) {
          if (i === index) continue
          const el = rows.current[i]
          if (!el) return // an unmeasured row means bail, not guess
          const rect = el.getBoundingClientRect()
          midpoints.push(rect.top + rect.height / 2)
        }
        gesture.current = { index, startY: domEvent.clientY, midpoints }
        setDragIndex(index)
        setOverIndex(index)
        domEvent.currentTarget.setPointerCapture?.(domEvent.pointerId)
        domEvent.preventDefault()
      },
      onPointerMove(domEvent) {
        const g = gesture.current
        if (!g) return
        // Kept on the ref as well as in state: state renders the cue, the ref
        // is what release reads. Reading state from inside a setState updater
        // to fire onMove would run the side effect twice under StrictMode.
        g.over = targetIndex(g.midpoints, domEvent.clientY)
        setDragOffset(domEvent.clientY - g.startY)
        setOverIndex(g.over)
      },
      onPointerUp() {
        const g = gesture.current
        if (!g) return
        // g.over is an index among the OTHER rows, which is exactly the final
        // index in the full list once `from` is removed — no adjustment.
        if (g.over != null && g.over !== g.index) onMove(g.index, g.over)
        reset()
      },
      onPointerCancel: reset,
      style: { touchAction: 'none' },
    }
  }

  return { handleProps, rowRef, dragIndex, overIndex, dragOffset }
}
