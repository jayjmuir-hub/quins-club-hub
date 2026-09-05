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
// control they just used. A fragment IS a different landing (`#notifications`
// is not the top of Settings), so hash is in the effect deps: skip the
// top-reset and focus the target instead of <main>.
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

// ⚠️ HASH DEEP-LINKS OWN THE LANDING, SAME CLASS AS PINNED CHAT.
// `/settings#notifications` (Home nudge, account menu) and
// `/settings#your-calendar` are a pathname change, so without this
// exception item 7 would focus <main> and scrollTo(0, 0). On a phone
// that reset wins: iOS ignores preventScroll on <main> and jumps the
// focused element into view after More's hash scroll has already run,
// which is how Jay landed at the top of Settings (QUI-5). Skip the
// top-reset when the URL asked for a fragment; focus the target so even
// a browser that ignores preventScroll still reveals the section.

/**
 * @param {{ pinnedToBottom?: (pathname: string) => boolean }} [options]
 */
export default function useScreenChrome({ pinnedToBottom = () => false } = {}) {
  const { pathname, hash } = useLocation()
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

    const fragment = hash.startsWith('#') ? hash.slice(1) : hash
    if (fragment) {
      const target = document.getElementById(fragment)
      if (target && typeof target.focus === 'function') {
        try {
          target.focus({ preventScroll: true })
        } catch {
          target.focus()
        }
      }
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
  }, [pathname, hash])
}
