import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { documentTitleFor } from './screenTitle.js'

// The three things a page navigation does for free and a single-page app
// forgets — UX review item 7 (2 Sep 2026):
//
//   1. the tab title changes (src/lib/screenTitle.js);
//   2. focus moves to the new screen, so a keyboard or screen-reader user is
//      not left on a nav link that is now off-screen, and the new screen is
//      announced. <main id="main-content" tabIndex={-1}> already exists for
//      the skip link (src/components/AppShell.jsx), so this focuses that;
//   3. the scroll goes back to the top, because the previous screen's scroll
//      position is not a fact about the new one.
//
// ⚠️ ON PATHNAME CHANGE ONLY, NOT SEARCH. `?open=add-player` and
// `?filter=unread` are the same screen with a sheet or a filter on it; a
// focus jump and a scroll reset there would pull the person away from the
// control they just used.
//
// ⚠️ NOT ON THE FIRST RENDER. Focusing <main> on load would steal focus from
// the login form's email field and from the browser's own address bar, and
// the browser already scrolled to the top by itself. The title is still set.
//
// ⚠️ CONVERSATIONS ARE PINNED TO THE BOTTOM, NOT THE TOP (src/lib/
// useStayPinnedToBottom.js), and their composer takes focus itself. The
// caller says which paths those are, so this hook does not have to know the
// chat routes. A scroll to 0 there would fight the pin and land above the
// newest message.
//
// ⚠️ `preventScroll` ON THE FOCUS. Focusing <main> scrolls it into view by
// default — which on a screen with a sticky masthead can land a few pixels
// down. The explicit scrollTo is the one that decides where the page sits.

/**
 * @param {{ pinnedToBottom?: (pathname: string) => boolean }} [options]
 */
export default function useScreenChrome({ pinnedToBottom = () => false } = {}) {
  const { pathname } = useLocation()
  const first = useRef(true)
  // ⚠️ HELD IN A REF, NOT IN THE DEPS. A caller passing an inline function
  // would otherwise re-run this on every render of its parent — and a sheet
  // opening via ?open= re-renders the app without changing the pathname,
  // which is exactly the case that must NOT move focus.
  const pinned = useRef(pinnedToBottom)
  pinned.current = pinnedToBottom

  useEffect(() => {
    document.title = documentTitleFor(pathname)

    if (first.current) {
      first.current = false
      return
    }

    const main = document.getElementById('main-content')
    if (main && typeof main.focus === 'function') {
      try {
        main.focus({ preventScroll: true })
      } catch {
        main.focus()
      }
    }
    if (!pinned.current(pathname)) window.scrollTo(0, 0)
  }, [pathname])
}
