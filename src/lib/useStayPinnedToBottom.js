import { useEffect, useRef } from 'react'

// Keep the window pinned to the newest message — the WhatsApp contract.
// One hook because Chat.jsx and the DM thread carried identical copies and
// a third would have followed.
//
// The history that shaped it (all 25 Aug 2026, Jay's phone):
// 1. A one-shot scroll when the DATA arrives lands SHORT — photos render
//    as nothing until their signed URL lands, then grow the page below
//    the viewport (#395).
// 2. #395's ResizeObserver re-pin held in desktop Chromium and failed on
//    the phone ("still not snapping to the last read message"). The
//    mechanism: Android's scroll anchoring fires adjustment scroll events
//    when content ABOVE the viewport loads; if the page has also grown
//    below, the old handler computed "far from bottom", flipped the gate
//    false, and every later re-pin was silently skipped.
//
// So stickiness is now INTENT, not position: only a scroll that moves UP
// unsticks; reaching the bottom re-sticks; growth-induced events (scrollY
// unchanged or increased, but suddenly far from the end) change nothing.
// And the re-pin has three redundant triggers, because the phone showed
// that any single one can be starved: a ResizeObserver on the body, a
// capture-phase image `load` listener (the growth is almost always a
// photo), and a short ticker after each messages change (signing plus a
// 4G download can outlive any one event).

const STICK_THRESHOLD_PX = 160
const PIN_WINDOW_MS = 6000
const PIN_TICK_MS = 300

export default function useStayPinnedToBottom(messages) {
  const stuckRef = useRef(true)
  const lastYRef = useRef(0)

  function pin() {
    if (stuckRef.current) window.scrollTo(0, document.documentElement.scrollHeight)
  }

  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - STICK_THRESHOLD_PX
      const wentUp = window.scrollY < lastYRef.current
      lastYRef.current = window.scrollY
      if (atBottom) stuckRef.current = true
      else if (wentUp) stuckRef.current = false
    }
    function onMediaLoad(domEvent) {
      if (domEvent.target?.tagName === 'IMG') pin()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    lastYRef.current = window.scrollY
    onScroll()
    // `load` does not bubble; capture phase sees every image in the page.
    document.addEventListener('load', onMediaLoad, true)
    let observer
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(pin)
      observer.observe(document.body)
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('load', onMediaLoad, true)
      observer?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!messages?.length) return undefined
    pin()
    // The ticker outlives the burst of growth that follows a load: photo
    // signing (~1s) plus the download on club-pitch 4G.
    const until = Date.now() + PIN_WINDOW_MS
    const timer = setInterval(() => {
      if (Date.now() > until) clearInterval(timer)
      else pin()
    }, PIN_TICK_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])
}
