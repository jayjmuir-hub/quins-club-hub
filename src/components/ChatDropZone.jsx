import { useRef, useState } from 'react'
import { isAcceptableImage } from '../lib/imageResize.js'

// The DROP door — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 3.
//
// ⚠️ THE WHOLE CONVERSATION IS THE TARGET, not the composer bar — Jay's
// ruling. Dropping a photo somewhere in the middle of a long thread is the
// natural thing to do, and a bar-sized target at the bottom of a scrolled
// page is a target you have to aim at.
//
// ⚠️ IT WRAPS IN A `flex flex-1 flex-col` DIV ON PURPOSE. Both screens are
// `flex flex-1 flex-col`, and the message stream inside claims flex-1 to make
// the wallpaper fill the surplus (see DmThread's long comment). An extra
// layer that is not itself a flex column with flex-1 breaks that chain and
// the wallpaper shrinks back to a patch behind the bubbles.
//
// ══ THREE TRAPS, ALL OF WHICH HAVE A TEST ═════════════════════════════════
//
// 1. Without preventDefault on DRAGOVER the element is not a drop target at
//    all: the drop event never fires, the browser navigates to the photo,
//    and everything typed into the composer goes with it.
// 2. DRAGLEAVE FIRES ON EVERY CHILD BOUNDARY, so a boolean flag drops the
//    overlay the moment the cursor crosses a bubble — which is most of the
//    pane. Counted enter/leave pairs instead.
// 3. Only FILES. Dragging a selected word across a conversation is an
//    everyday accident, and a pane that lights up for it lights up
//    constantly for nothing.
//
// ⚠️ Untested by anything here, and worth a look on a real phone: the app
// chrome is `z-40` and AUTO-HIDES ON SCROLL (.glass-island / .glass-dock in
// src/index.css, src/lib/useAutoHideOnScroll.js), so the bars can slide
// mid-drag if the drag scrolls the page. The overlay deliberately sits BELOW
// the chrome at z-30: its job is to say "drop here", not to seize the
// screen, and covering the bars would make them flicker underneath it.
function carriesFiles(dataTransfer) {
  // `types` is the only thing readable during a drag — the browser withholds
  // `files` until the drop, for the obvious privacy reason.
  return Array.from(dataTransfer?.types ?? []).includes('Files')
}

export default function ChatDropZone({ onFiles, children }) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  return (
    <div
      data-testid="chat-drop-pane"
      className="relative flex flex-1 flex-col"
      onDragEnter={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        // ⚠️ EVERY dropped file goes to the tray, including the ones that are
        // not images: the tray's gate is what refuses them, WITH A MESSAGE.
        // Filtering here instead would make a dropped PDF vanish in silence.
        onFiles(Array.from(e.dataTransfer.files ?? []))
      }}
    >
      {children}
      {dragging && (
        <div
          data-testid="chat-drop-overlay"
          aria-hidden="true"
          // pointer-events-none is load-bearing: an overlay that could be
          // hovered would fire its own dragleave over the pane beneath and
          // reintroduce the flicker the counter exists to stop.
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[12px] border-2 border-dashed border-brand bg-brand/15"
        >
          <p className="rounded-pill bg-surface px-4 py-2 text-[14px] font-extrabold text-brand-ink shadow-card">
            Drop photos to attach
          </p>
        </div>
      )}
    </div>
  )
}
