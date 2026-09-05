import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.jsx'

/**
 * "Discard your changes?" — the inline two-step the event form introduced in
 * #631, as one component so every sheet asks the same way. Never a native
 * confirm() (RESTORE.md). `danger` is the CONFIRM of the pair: the arming tap
 * was the close itself. Button defaults type="button", so neither of these
 * submits a form they sit inside.
 *
 * ⚠️ PINNED OVER THE OPEN SHEET, NOT IN THE SCROLLED BODY. Until 5 Sep 2026
 * this sat in document flow as the first child of Sheet's overflow-y-auto
 * panel. A dirty form scrolled to the bottom (Jay, profile Edit) left Discard
 * / Keep editing under the sticky title, off-screen, and the sheet felt stuck.
 * The card is portalled onto the dialog panel as `fixed inset-0`. The panel
 * wears `glass-panel` (`backdrop-filter`), so that `fixed` covers the panel's
 * visible box, not the page, and it does not scroll with the form. Sheet's
 * panel is also `relative` so an `absolute` overlay would pin the same way.
 */
export default function DiscardConfirm({ onDiscard, onKeep, id = 'discard' }) {
  const markerRef = useRef(null)
  const boxRef = useRef(null)
  const [host, setHost] = useState(null)

  useLayoutEffect(() => {
    setHost(markerRef.current?.closest('[role="dialog"]') ?? null)
  }, [])

  useEffect(() => {
    boxRef.current?.focus()
  }, [host])

  const ask = (
    <div
      ref={boxRef}
      role="alertdialog"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="discard-confirm"
      className="fixed inset-0 z-20 grid place-items-center bg-[rgba(24,10,20,0.45)] p-4 outline-none"
    >
      <div className="w-full rounded-[11px] border border-line bg-surface-mute px-3 py-2.5 shadow-card">
        <p id={`${id}-title`} className="text-sm font-bold text-ink">
          Discard your changes?
        </p>
        <p id={`${id}-body`} className="mt-0.5 text-[12.5px] text-ink-muted">
          Nothing has been saved yet.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="danger" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="ghost" onClick={onKeep}>
            Keep editing
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <span ref={markerRef} hidden />
      {host ? createPortal(ask, host) : ask}
    </>
  )
}
