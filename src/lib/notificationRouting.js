import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// The app half of "tapping a notification takes you to the right screen".
//
// `public/push-sw.js` navigates the open window itself wherever it can. This
// exists for the case where it CANNOT: `client.navigate()` rejects on a window
// the service worker does not control — a real state on a first load, not a
// theoretical one — and some browsers do not expose it at all. The worker then
// posts `{ type: 'notification-navigate', url }` instead, and this routes.
//
// ⚠️ SO THIS IS A FALLBACK, NOT THE MAIN PATH, AND THE ORDER MATTERS. Doing it
// the other way round — always postMessage, never navigate — reads as nicer
// (a client-side route rather than a full page load) and is worse: a person
// running a stale cached bundle without this listener would tap a notification
// and silently go nowhere. navigate() works whether or not the page has caught
// up with the service worker; this does not.
//
// claude/plans/2026-08-19-notifications-v2.md.

/**
 * Listens for the service worker's navigate message and routes the app.
 * Mount ONCE, inside the router. Safe when there is no service worker at all
 * (jsdom, an unsupported browser) — it simply never fires.
 */
export function useNotificationRouting() {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined

    // ⚠️ HELD IN A LOCAL, NOT RE-READ FROM `navigator` ON CLEANUP. Removing the
    // listener from whatever `navigator.serviceWorker` happens to be LATER is
    // not the same thing as removing it from the object it was added to, and
    // if that property has changed in between, the cleanup throws instead of
    // cleaning up.
    const worker = navigator.serviceWorker

    function onMessage(event) {
      const data = event?.data
      if (!data || data.type !== 'notification-navigate' || !data.url) return

      // ⚠️ SAME-ORIGIN ONLY, AND THE PATH IS TAKEN FROM A PARSED URL RATHER
      // THAN USED WHOLE. The worker sends an absolute URL, and handing an
      // absolute one to react-router's navigate() would be treated as a path.
      // The origin check is the safety half: a message is an input, and
      // `safeNext()` already applies the same reasoning to redirect targets.
      let target
      try {
        const parsed = new URL(data.url, window.location.origin)
        if (parsed.origin !== window.location.origin) return
        target = `${parsed.pathname}${parsed.search}${parsed.hash}`
      } catch {
        return
      }

      navigate(target)
    }

    worker.addEventListener('message', onMessage)
    return () => worker.removeEventListener('message', onMessage)
  }, [navigate])
}
