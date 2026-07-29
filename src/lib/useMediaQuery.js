import { useEffect, useState } from 'react'

// Subscribes to a CSS media query from JS.
//
// Why this exists rather than switching layouts with Tailwind's `desktop:`
// prefix, which is how every other responsive decision in this app is made:
// the roster renders the SAME PLAYER NAMES in both the mobile card list and
// the desktop table. A CSS-only switch leaves both in the DOM and hides one
// visually, which is fine in a browser but means jsdom — where no CSS is
// applied — renders every player twice. `getByText('Tom Fletcher')` then
// matches two nodes and throws, and the existing roster suite is built on
// exactly those queries. Rendering one branch or the other keeps one DOM.
//
// Use this ONLY when both branches would emit the same content. For
// presentation-only differences (padding, columns, a hidden decoration) the
// Tailwind prefix remains correct and cheaper — it needs no JS, no listener
// and no re-render.
//
// Deliberately returns `false` when matchMedia is missing rather than
// throwing or polyfilling. jsdom does not implement it, so every existing
// test keeps rendering the mobile branch and its DOM is unchanged by this
// file's arrival. Tests that want the desktop branch stub window.matchMedia
// themselves, which also keeps that intent visible in the test rather than
// buried in shared setup.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const list = window.matchMedia(query)
    // Re-read on subscribe: the query can have changed between the initial
    // useState and this effect (a prop change, or a resize during mount).
    setMatches(list.matches)

    const onChange = (event) => setMatches(event.matches)

    // addListener/removeListener is the pre-2019 Safari spelling. Kept as a
    // fallback because it costs two lines and the alternative is the hook
    // silently never updating on an older iPad — which is a plausible device
    // for a parent at a pitch.
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    }
    list.addListener(onChange)
    return () => list.removeListener(onChange)
  }, [query])

  return matches
}

// The two breakpoints from tailwind.config.js, named so a screen asks for
// "am I on a desktop" rather than repeating a pixel value that then has two
// sources of truth. Keep these in step with theme.extend.screens.
export const DESKTOP_QUERY = '(min-width: 820px)'
export const WIDE_QUERY = '(min-width: 1280px)'
